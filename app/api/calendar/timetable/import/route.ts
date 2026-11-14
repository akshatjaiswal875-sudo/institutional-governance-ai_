import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const IST = "+05:30";

function key(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\\s_-]+/g, "");
}
function find(row: Record<string, unknown>, names: string[]) {
  const wanted = new Set(names.map(key));
  const entry = Object.entries(row).find(([name]) => wanted.has(key(name)));
  return entry?.[1];
}
function dateText(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2,"0")}-${String(parsed.d).padStart(2,"0")}`;
  }
  const raw = String(value ?? "").trim();
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2,"0")}-${match[1].padStart(2,"0")}`;
  return null;
}
function timeText(value: unknown): string | null {
  if (typeof value === "number") {
    const minutes = Math.round((value % 1) * 1440);
    return `${String(Math.floor(minutes / 60)).padStart(2,"0")}:${String(minutes % 60).padStart(2,"0")}`;
  }
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\\d{1,2}):([0-5]\\d)(?:\\s*(AM|PM))?$/i);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2]);
  if (match[3]?.toUpperCase() === "PM" && hour < 12) hour += 12;
  if (match[3]?.toUpperCase() === "AM" && hour === 12) hour = 0;
  if (hour > 23) return null;
  return `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(["Super Admin"]);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Upload an .xlsx, .xls, or .csv timetable file." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Timetable file must be 10 MB or smaller." }, { status: 413 });
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(extension ?? "")) return NextResponse.json({ error: "Supported formats: .xlsx, .xls, .csv." }, { status: 415 });

    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) return NextResponse.json({ error: "The workbook has no worksheet." }, { status: 400 });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
    if (!rows.length) return NextResponse.json({ error: "The first worksheet contains no timetable rows." }, { status: 400 });

    const valid: Array<Record<string, unknown>> = [];
    const errors: string[] = [];
    rows.forEach((row, index) => {
      const date = dateText(find(row, ["date", "lecture date", "event date"]));
      const start = timeText(find(row, ["start time", "start", "from", "time from"]));
      const end = timeText(find(row, ["end time", "end", "to", "time to"]));
      const title = String(find(row, ["title", "subject", "lecture", "event", "activity"]) ?? "").trim();
      if (!date || !start || !end || !title) { errors.push(`Row ${index + 2}: date, start time, end time and subject/title are required.`); return; }
      const startsAt = new Date(`${date}T${start}:00${IST}`);
      const endsAt = new Date(`${date}T${end}:00${IST}`);
      if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) { errors.push(`Row ${index + 2}: invalid date/time range.`); return; }
      valid.push({
        title,
        event_type: String(find(row, ["type", "event type", "category"]) ?? "lecture").trim().toLowerCase() || "lecture",
        starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
        department: String(find(row, ["department", "branch", "course"]) ?? "").trim() || null,
        faculty_email: String(find(row, ["faculty email", "email", "faculty"]) ?? "").trim().toLowerCase() || null,
        room: String(find(row, ["room", "venue", "classroom"]) ?? "").trim() || null,
        source_filename: file.name, created_by: user.id,
      });
    });
    if (!valid.length) return NextResponse.json({ error: "No valid timetable rows were found.", rowErrors: errors.slice(0, 20) }, { status: 422 });
    const admin = createAdminClient();
    const { data, error } = await admin.from("institutional_timetable_entries").insert(valid).select("id");
    if (error) throw error;
    return NextResponse.json({ imported: data?.length ?? 0, skipped: errors.length, rowErrors: errors.slice(0, 20), source: file.name }, { status: 201 });
  } catch (error) {
    console.error("[calendar/timetable/import]", error);
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "Only Super Admin can upload institutional timetables." }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to import timetable." }, { status: 500 });
  }
}
