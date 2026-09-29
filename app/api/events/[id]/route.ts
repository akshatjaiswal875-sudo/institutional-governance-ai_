import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    // Event detail is rendered inside the authenticated application, but the
    // read must use the same server-only service-role path as /api/events.
    // This avoids failures caused by missing authenticated table grants/RLS
    // evaluation while keeping the service-role key entirely server-side.
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("events")
      .select("id,title,start_time,end_time,description,location,organizer_id,status")
      .eq("id", params.id)
      .maybeSingle();

    if (error) {
      console.error("GET /api/events/[id] failed:", {
        eventId: params.id,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json({ error: "Unable to load event." }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/events/[id] unexpected error:", error);
    return NextResponse.json({ error: "Unable to load event." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser(["Super Admin", "Meeting Secretary"]);
    const body = await request.json();
    const { data, error } = await supabase
      .from("events")
      .update({
        title: body.title,
        start_time: body.startTime,
        end_time: body.endTime,
        location: body.location ?? null,
        description: body.description ?? null,
        organizer_id: body.organizerId ?? profile.id,
        status: body.status ?? "Upcoming",
      })
      .eq("id", params.id)
      .select("*")
      .single();
    if (error) throw error;
    await recordAudit(supabase, profile.id, "UPDATE_EVENT", "events", params.id);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Unable to update event." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser(["Super Admin", "Meeting Secretary"]);
    const { error } = await supabase.from("events").delete().eq("id", params.id);
    if (error) throw error;
    await recordAudit(supabase, profile.id, "DELETE_EVENT", "events", params.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unable to delete event." }, { status: 400 });
  }
}
