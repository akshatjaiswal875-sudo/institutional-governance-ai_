import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const IST = "+05:30";
const DAYS: Record<string, number> = {
  monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, friday: 5, fri: 5, saturday: 6, sat: 6, sunday: 7, sun: 7,
};

function key(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
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
    return parsed.y + "-" + String(parsed.m).padStart(2, "0") + "-" + String(parsed.d).padStart(2, "0");
  }
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) return match[3] + "-" + match[2].padStart(2, "0") + "-" + match[1].padStart(2, "0");
  return null;
}
function timeText(value: unknown): string | null {
  if (typeof value === "number") {
    const minutes = Math.round((value % 1) * 1440);
    return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
  }
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2})[:.]([0-5]\d)(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3]?.toUpperCase() === "PM" && hour < 12) hour += 12;
  if (match[3]?.toUpperCase() === "AM" && hour === 12) hour = 0;
  if (hour > 23) return null;
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}
function weeklyPeriod(value: unknown, afterLunch: boolean): { start: string; end: string } | null {
  const raw = String(value ?? "").trim();
  const tokens = [...raw.matchAll(/(\d{1,2})[.:]([0-5]\d)/g)];
  if (tokens.length < 2) return null;
  const convert = (hourValue: string, minuteValue: string) => {
    let hour = Number(hourValue);
    if (afterLunch && hour >= 1 && hour <= 6) hour += 12;
    if (hour > 23) return null;
    return String(hour).padStart(2, "0") + ":" + String(Number(minuteValue)).padStart(2, "0");
  };
  const start = convert(tokens[0][1], tokens[0][2]);
  let end = convert(tokens[1][1], tokens[1][2]);
  if (!start || !end) return null;
  if (end <= start && !afterLunch) {
    const endHour = Number(end.slice(0, 2));
    const startHour = Number(start.slice(0, 2));
    if (startHour >= 9 && endHour >= 1 && endHour <= 6) end = String(endHour + 12).padStart(2, "0") + end.slice(2);
  }
  if (end <= start) return null;
  return { start, end };
}
function parseWeeklyMatrix(matrix: unknown[][], email: string, filename: string) {
  const errors: string[] = [];
  const valid: Array<Record<string, unknown>> = [];
  const timeRowIndex = matrix.findIndex(row => row.some(cell => key(cell) === "time"));
  if (timeRowIndex < 0) return { valid, errors, recognized: false };
  const dayHeaderIndex = matrix.findIndex((row, index) => index > timeRowIndex && row.some(cell => key(cell) === "day"));
  if (dayHeaderIndex < 0) return { valid, errors, recognized: false };
  const timeRow = matrix[timeRowIndex] ?? [];
  const dayHeader = matrix[dayHeaderIndex] ?? [];
  const dayColumn = dayHeader.findIndex(cell => key(cell) === "day");
  const firstPeriodColumn = Math.max(dayColumn + 1, 2);
  const lunchColumn = timeRow.findIndex(cell => key(cell).includes("lunch"));
  for (let rowIndex = dayHeaderIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const dayName = key(row[dayColumn]);
    const weekday = DAYS[dayName];
    if (!weekday) continue;
    for (let col = firstPeriodColumn; col < Math.max(timeRow.length, row.length); col += 1) {
      if (col === lunchColumn) continue;
      const rawCell = String(row[col] ?? "").trim();
      if (!rawCell || /^(free|off|—|-|n\/a)$/i.test(rawCell)) continue;
      const period = weeklyPeriod(timeRow[col], lunchColumn >= 0 && col > lunchColumn);
      if (!period) {
        errors.push("Row " + (rowIndex + 1) + ", period " + String(dayHeader[col] ?? col) + ": time range could not be read.");
        continue;
      }
      const title = rawCell.split(/\r?\n/).map(part => part.trim()).filter(Boolean).join(" — ");
      valid.push({
        title,
        event_type: /\blab\b/i.test(title) ? "lab" : "lecture",
        starts_at: null,
        ends_at: null,
        is_recurring_weekly: true,
        weekday,
        start_time: period.start,
        end_time: period.end,
        department: null,
        faculty_email: email,
        room: null,
        source_filename: filename,
      });
    }
  }
  return { valid, errors, recognized: true };
}

export async function POST(request: Request) {
  try {
    const { user, profile } = await requireUser();
    const form = await request.formData();
    const file = form.get("file");
    const requestedFacultyEmail = String(form.get("facultyEmail") ?? "").trim().toLowerCase();
    const ownEmail = String(profile.email || user.email || "").trim().toLowerCase();
    const isInstitutionAdmin = ["Super Admin", "Director"].includes(String(profile.role));
    const isHod = String(profile.role) === "HOD";
    const admin = createAdminClient();
    let targetEmail = ownEmail;
    let targetDepartment = profile.department ?? null;

    if (requestedFacultyEmail && requestedFacultyEmail !== ownEmail) {
      if (!isInstitutionAdmin && !isHod) {
        return NextResponse.json({ error: "Only a Director, Super Admin, or HOD can upload a timetable for another faculty member." }, { status: 403 });
      }
      const { data: target, error: targetError } = await admin
        .from("users")
        .select("id,email,role,department")
        .ilike("email", requestedFacultyEmail)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target?.email) return NextResponse.json({ error: "No institutional user was found with that faculty email." }, { status: 404 });
      if (isHod && !isInstitutionAdmin && String(target.department ?? "").trim().toLowerCase() !== String(profile.department ?? "").trim().toLowerCase()) {
        return NextResponse.json({ error: "An HOD can upload timetables only for faculty in their own department." }, { status: 403 });
      }
      targetEmail = String(target.email).trim().toLowerCase();
      targetDepartment = target.department ?? null;
    }
    if (!(file instanceof File)) return NextResponse.json({ error: "Upload an .xlsx, .xls, or .csv timetable file." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Timetable file must be 10 MB or smaller." }, { status: 413 });
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(extension ?? "")) return NextResponse.json({ error: "Supported formats: .xlsx, .xls, .csv." }, { status: 415 });

    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) return NextResponse.json({ error: "The workbook has no worksheet." }, { status: 400 });
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "", raw: true });
    if (!matrix.length) return NextResponse.json({ error: "The first worksheet contains no timetable rows." }, { status: 400 });

    const weekly = parseWeeklyMatrix(matrix, targetEmail, file.name);
    let valid = weekly.valid;
    const errors = weekly.errors;
    let mode: "weekly" | "dated" = "weekly";

    if (!weekly.recognized) {
      mode = "dated";
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      valid = [];
      rows.forEach((row, index) => {
        const date = dateText(find(row, ["date", "lecture date", "event date"]));
        const start = timeText(find(row, ["start time", "start", "from", "time from"]));
        const end = timeText(find(row, ["end time", "end", "to", "time to"]));
        const title = String(find(row, ["title", "subject", "lecture", "event", "activity"]) ?? "").trim();
        if (!date || !start || !end || !title) { errors.push("Row " + (index + 2) + ": date, start time, end time and subject/title are required."); return; }
        const startsAt = new Date(date + "T" + start + ":00" + IST);
        const endsAt = new Date(date + "T" + end + ":00" + IST);
        if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) { errors.push("Row " + (index + 2) + ": invalid date/time range."); return; }
        valid.push({
          title,
          event_type: String(find(row, ["type", "event type", "category"]) ?? "lecture").trim().toLowerCase() || "lecture",
          starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
          is_recurring_weekly: false, weekday: null, start_time: null, end_time: null,
          department: String(find(row, ["department", "branch", "course"]) ?? "").trim() || null,
          faculty_email: targetEmail || null,
          room: String(find(row, ["room", "venue", "classroom"]) ?? "").trim() || null,
          source_filename: file.name,
        });
      });
    }

    if (!valid.length) return NextResponse.json({
      error: weekly.recognized ? "No class periods were found in the weekly timetable. Check the Day and Time header rows." : "No valid timetable rows were found.",
      rowErrors: errors.slice(0, 20),
    }, { status: 422 });

    const rowsToInsert = valid.map(row => ({ ...row, department: row.department ?? targetDepartment, faculty_email: targetEmail || null, created_by: user.id }));
    const { data, error } = await admin.from("institutional_timetable_entries").insert(rowsToInsert).select("id");
    if (error) throw error;
    return NextResponse.json({
      imported: data?.length ?? 0,
      skipped: errors.length,
      rowErrors: errors.slice(0, 20),
      source: file.name,
      format: mode,
      owner: targetEmail,
      message: mode === "weekly" ? "Weekly recurring timetable imported for ${targetEmail}. It will be used for this faculty account in future scheduling searches." : "Dated timetable imported.",
    }, { status: 201 });
  } catch (error) {
    console.error("[calendar/timetable/import]", error);
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "PROFILE_NOT_FOUND") return NextResponse.json({ error: "Your institutional profile is missing. Contact the administrator." }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to import timetable." }, { status: 500 });
  }
}
