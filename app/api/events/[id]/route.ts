import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const { data: previous, error: lookupError } = await supabase
      .from("events")
      .select("id,title,start_time,end_time,description,location,organizer_id,status")
      .eq("id", params.id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!previous) return NextResponse.json({ error: "Event not found." }, { status: 404 });

    const title = typeof body.title === "string" ? body.title.trim() : previous.title;
    const startTime = typeof body.startTime === "string" ? body.startTime : previous.start_time;
    const endTime = typeof body.endTime === "string" ? body.endTime : previous.end_time;
    if (!title || !Number.isFinite(Date.parse(startTime)) || !Number.isFinite(Date.parse(endTime)) || Date.parse(endTime) <= Date.parse(startTime)) {
      return NextResponse.json({ error: "A title and valid start/end times are required. End time must be later than start time." }, { status: 400 });
    }

    const requestedStatus = typeof body.status === "string" ? body.status : previous.status;
    if (!EVENT_STATUSES.includes(requestedStatus as typeof EVENT_STATUSES[number])) {
      return NextResponse.json({ error: "Invalid event status." }, { status: 400 });
    }
    if (requestedStatus !== previous.status && !canSetStatus(profile.role, requestedStatus)) {
      return NextResponse.json({ error: "You are not allowed to change this event status." }, { status: 403 });
    }

    const { data, error } = await supabase.from("events").update({
      title,
      start_time: startTime,
      end_time: endTime,
      location: typeof body.location === "string" ? body.location.trim() || null : body.location === null ? null : previous.location,
      description: typeof body.description === "string" ? body.description.trim() || null : body.description === null ? null : previous.description,
      organizer_id: previous.organizer_id,
      status: requestedStatus,
    }).eq("id", params.id).select("*").single();
    if (error) throw error;

    const wasPublished = previous.status === "Published";
    const becamePublished = requestedStatus === "Published" && !wasPublished;
    const changedPublishedEvent = wasPublished && (
      previous.title !== data.title ||
      previous.start_time !== data.start_time ||
      previous.end_time !== data.end_time ||
      previous.location !== data.location ||
      previous.description !== data.description
    );
    if (becamePublished || changedPublishedEvent) {
      const admin = createAdminClient();
      const { data: recipients, error: recipientsError } = await admin.from("users").select("id").neq("id", profile.id);
      if (recipientsError) console.error("[events] recipient lookup failed", recipientsError);
      else if (recipients?.length) {
        const message = becamePublished
          ? `${data.title} has been published to the institutional calendar.`
          : `${data.title} has been updated. Check the institutional calendar for details.`;
        const { error: notificationError } = await admin.from("notifications").insert(recipients.map(recipient => ({
          user_id: recipient.id, type: "event", title: becamePublished ? "New institutional event" : "Institutional event updated",
          message, target_table: "events", target_id: data.id,
        })));
        if (notificationError) console.error("[events] update notifications failed", notificationError);
      }
    }
    await recordAudit(supabase, profile.id, requestedStatus === "Published" ? "FINAL_PUBLISH_EVENT" : "UPDATE_EVENT", "events", params.id, { role: profile.role, status: requestedStatus });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update event.";
    console.error("[events] update failed", error);
    const status = message === "FORBIDDEN" ? 403 : message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: status === 403 ? "You are not allowed to edit events." : status === 401 ? "Authentication required." : "Unable to update event." }, { status });
  }
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
