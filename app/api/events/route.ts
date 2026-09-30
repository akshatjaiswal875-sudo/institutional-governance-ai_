import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";

const EVENT_CREATORS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin"] as const;
const EVENT_STATUSES = ["Draft", "Under Review", "Approved", "Published", "Upcoming", "Ongoing", "Completed", "Cancelled"] as const;
const EVENT_LEADERS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin"] as const;

function canSetStatus(role: string, status: string) {
  if (["Director", "Super Admin"].includes(role)) return true;
  if (role === "Principal") return ["Draft", "Under Review", "Approved", "Upcoming", "Ongoing", "Completed", "Cancelled"].includes(status);
  if (["HOD", "Coordinator"].includes(role)) return ["Draft", "Under Review", "Upcoming", "Ongoing", "Completed", "Cancelled"].includes(status);
  return false;
}

export async function GET() {
  try {
    const { user, profile } = await requireUser();
    const admin = createAdminClient();
    const base = admin
      .from("events")
      .select("id,title,start_time,end_time,description,location,organizer_id,status")
      .order("start_time", { ascending: true });

    const { data, error } = EVENT_LEADERS.includes(profile.role as typeof EVENT_LEADERS[number])
      ? await base
      : await base.eq("status", "Published");

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load events.";
    const status = message === "UNAUTHORIZED" || message === "PROFILE_NOT_FOUND" ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? "Unauthorized." : "Unable to load events." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser([...EVENT_CREATORS]);
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const startTime = typeof body.startTime === "string" ? body.startTime : "";
    const endTime = typeof body.endTime === "string" ? body.endTime : "";
    if (!title || !startTime || !endTime) return NextResponse.json({ error: "Title, start time, and end time are required." }, { status: 400 });
    const requestedStatus = typeof body.status === "string" ? body.status : "Draft";
    if (!EVENT_STATUSES.includes(requestedStatus as typeof EVENT_STATUSES[number])) return NextResponse.json({ error: "Invalid event status." }, { status: 400 });
    if (!canSetStatus(profile.role, requestedStatus)) return NextResponse.json({ error: "You are not allowed to set this event status." }, { status: 403 });
    const { data, error } = await supabase.from("events").insert({ title, start_time: startTime, end_time: endTime, description: typeof body.description === "string" ? body.description.trim() || null : null, location: typeof body.location === "string" ? body.location.trim() || null : null, organizer_id: profile.id, status: requestedStatus }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await recordAudit(supabase, profile.id, "CREATE_EVENT", "events", data.id, { title, status: requestedStatus, creator_role: profile.role });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create event.";
    const status = message === "UNAUTHORIZED" || message === "PROFILE_NOT_FOUND" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: status === 401 ? "Unauthorized." : status === 403 ? "Forbidden." : "Unable to create event." }, { status });
  }
}
