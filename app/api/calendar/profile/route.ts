import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM time.");
const availabilitySchema = z.object({
  day_of_week: z.number().int().min(1).max(7),
  start_time: timeSchema,
  end_time: timeSchema,
  available: z.boolean().default(true),
}).refine((row) => row.end_time > row.start_time, {
  message: "End time must be after start time.",
  path: ["end_time"],
});
const exceptionSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(240).optional().nullable(),
}).refine((row) => Date.parse(row.ends_at) > Date.parse(row.starts_at), {
  message: "End date/time must be after start date/time.",
  path: ["ends_at"],
});
const preferencesSchema = z.object({
  timezone: z.string().trim().min(1).max(80).default("Asia/Kolkata"),
  preferred_start_time: timeSchema.nullable().optional(),
  preferred_end_time: timeSchema.nullable().optional(),
  default_duration_minutes: z.number().int().min(15).max(480).default(60),
  buffer_minutes: z.number().int().min(0).max(180).default(15),
  max_meetings_per_day: z.number().int().min(1).max(20).default(5),
}).refine((value) => !value.preferred_start_time || !value.preferred_end_time || value.preferred_end_time > value.preferred_start_time, {
  message: "Preferred end time must be after preferred start time.",
  path: ["preferred_end_time"],
});
const profileSchema = z.object({
  availability: z.array(availabilitySchema).max(42),
  preferences: preferencesSchema,
  unavailability: z.array(exceptionSchema).max(100),
}).superRefine((value, ctx) => {
  const grouped = new Map<number, Array<{ start: number; end: number; index: number }>>();
  value.availability.forEach((row, index) => {
    const start = Number(row.start_time.slice(0, 2)) * 60 + Number(row.start_time.slice(3));
    const end = Number(row.end_time.slice(0, 2)) * 60 + Number(row.end_time.slice(3));
    const rows = grouped.get(row.day_of_week) ?? [];
    if (rows.some((other) => start < other.end && end > other.start)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Availability windows on the same day cannot overlap.", path: ["availability", index] });
    }
    rows.push({ start, end, index });
    grouped.set(row.day_of_week, rows);
  });
  try { new Intl.DateTimeFormat("en-US", { timeZone: value.preferences.timezone }); }
  catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid IANA timezone, such as Asia/Kolkata.", path: ["preferences", "timezone"] }); }
});

function fail(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (error instanceof Error && error.message === "PROFILE_NOT_FOUND") return NextResponse.json({ error: "Your account profile could not be found." }, { status: 403 });
  return NextResponse.json({ error: "Unable to load or save your scheduling profile." }, { status: 500 });
}

export async function GET() {
  try {
    const { supabase, profile } = await requireUser();
    const [availabilityResult, preferencesResult, unavailabilityResult] = await Promise.all([
      supabase.from("user_availability").select("day_of_week,start_time,end_time,available").eq("user_id", profile.id).order("day_of_week").order("start_time"),
      supabase.from("user_scheduling_preferences").select("timezone,preferred_start_time,preferred_end_time,default_duration_minutes,buffer_minutes,max_meetings_per_day").eq("user_id", profile.id).maybeSingle(),
      supabase.from("user_unavailability").select("id,starts_at,ends_at,reason").eq("user_id", profile.id).gte("ends_at", new Date().toISOString()).order("starts_at"),
    ]);
    const error = availabilityResult.error ?? preferencesResult.error ?? unavailabilityResult.error;
    if (error) throw error;
    return NextResponse.json({ data: {
      availability: availabilityResult.data ?? [],
      preferences: preferencesResult.data ?? {
        timezone: "Asia/Kolkata", preferred_start_time: null, preferred_end_time: null,
        default_duration_minutes: 60, buffer_minutes: 15, max_meetings_per_day: 5,
      },
      unavailability: unavailabilityResult.data ?? [],
    } });
  } catch (error) { return fail(error); }
}

export async function PUT(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    const raw = await request.json();
    const parsed = profileSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: "Please correct the highlighted scheduling profile fields.", details: parsed.error.flatten() }, { status: 400 });
    const { availability, preferences, unavailability } = parsed.data;
    const { data, error } = await supabase.rpc("save_my_scheduling_profile", {
      p_availability: availability,
      p_preferences: preferences,
      p_unavailability: unavailability,
    });
    if (error) {
      console.error("[calendar/profile] save failed", { userId: profile.id, code: error.code, message: error.message });
      return NextResponse.json({ error: "Your scheduling profile could not be saved. Confirm migration 014 has been applied." }, { status: 500 });
    }
    return NextResponse.json({ data: { saved: true, counts: data } });
  } catch (error) { return fail(error); }
}
