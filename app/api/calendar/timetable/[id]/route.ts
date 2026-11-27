import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, profile } = await requireUser();
    const email = String(profile.email || user.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Your account has no institutional email address." }, { status: 403 });
    const { id } = await context.params;
    if (!validId(id)) return NextResponse.json({ error: "Invalid timetable entry." }, { status: 400 });

    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const room = typeof body.room === "string" ? body.room.trim().slice(0, 100) : null;
    if (!title || title.length > 160) return NextResponse.json({ error: "Enter a title between 1 and 160 characters." }, { status: 400 });

    const admin = createAdminClient();
    const { data: existing, error: lookupError } = await admin
      .from("institutional_timetable_entries")
      .select("id,is_recurring_weekly")
      .eq("id", id)
      .ilike("faculty_email", email)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) return NextResponse.json({ error: "This timetable entry was not found in your own schedule." }, { status: 404 });

    let update: Record<string, unknown>;
    if (existing.is_recurring_weekly) {
      const weekday = Number(body.weekday);
      const start = String(body.start_time ?? "");
      const end = String(body.end_time ?? "");
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || end <= start) {
        return NextResponse.json({ error: "Choose a valid weekday and a time range where the end is after the start." }, { status: 400 });
      }
      update = { title, room, weekday, start_time: start, end_time: end };
    } else {
      const startsAt = new Date(String(body.starts_at ?? ""));
      const endsAt = new Date(String(body.ends_at ?? ""));
      if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
        return NextResponse.json({ error: "Choose a valid date and a time range where the end is after the start." }, { status: 400 });
      }
      update = { title, room, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() };
    }

    const { data, error } = await admin.from("institutional_timetable_entries")
      .update(update).eq("id", id).ilike("faculty_email", email).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "The timetable entry could not be updated." }, { status: 409 });
    return NextResponse.json({ updated: true, id: data.id });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "PROFILE_NOT_FOUND") return NextResponse.json({ error: "Your institutional profile is missing." }, { status: 403 });
    console.error("[calendar/timetable/:id] PATCH failed", error);
    return NextResponse.json({ error: "Unable to update timetable entry." }, { status: 500 });
  }
}
