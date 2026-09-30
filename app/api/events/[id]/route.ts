import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const EVENT_MANAGERS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin"] as const;
const EVENT_STATUSES = ["Draft", "Under Review", "Approved", "Published", "Upcoming", "Ongoing", "Completed", "Cancelled"] as const;

function canSetStatus(role: string, status: string) {
  if (["Director", "Super Admin"].includes(role)) return true;
  if (role === "Principal") return ["Draft", "Under Review", "Approved", "Upcoming", "Ongoing", "Completed", "Cancelled"].includes(status);
  if (["HOD", "Coordinator"].includes(role)) return ["Draft", "Under Review", "Upcoming", "Ongoing", "Completed", "Cancelled"].includes(status);
  return false;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.from("events").select("id,title,start_time,end_time,description,location,organizer_id,status").eq("id", params.id).maybeSingle();
    if (error) return NextResponse.json({ error: "Unable to load event." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    return NextResponse.json({ data });
  } catch { return NextResponse.json({ error: "Unable to load event." }, { status: 401 }); }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser([...EVENT_MANAGERS]);
    const body = await request.json();
    const requestedStatus = typeof body.status === "string" ? body.status : "Draft";
    if (!EVENT_STATUSES.includes(requestedStatus as typeof EVENT_STATUSES[number])) return NextResponse.json({ error: "Invalid event status." }, { status: 400 });
    if (!canSetStatus(profile.role, requestedStatus)) return NextResponse.json({ error: "You are not allowed to set this event status." }, { status: 403 });
    const { data, error } = await supabase.from("events").update({ title: body.title, start_time: body.startTime, end_time: body.endTime, location: body.location ?? null, description: body.description ?? null, organizer_id: body.organizerId ?? profile.id, status: requestedStatus }).eq("id", params.id).select("*").single();
    if (error) throw error;
    await recordAudit(supabase, profile.id, requestedStatus === "Published" ? "FINAL_PUBLISH_EVENT" : "UPDATE_EVENT", "events", params.id, { role: profile.role, status: requestedStatus });
    return NextResponse.json({ data });
  } catch { return NextResponse.json({ error: "Unable to update event." }, { status: 400 }); }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser(["Director", "Super Admin"]);
    const { error } = await supabase.from("events").delete().eq("id", params.id);
    if (error) throw error;
    await recordAudit(supabase, profile.id, "DELETE_EVENT", "events", params.id);
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: "Unable to delete event." }, { status: 400 }); }
}
