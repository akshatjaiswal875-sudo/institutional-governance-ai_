import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function GET() {
  try {
    await requireUser();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("events")
      .select("id,title,start_time,end_time,description,location,organizer_id,status")
      .order("start_time", { ascending: true });

    if (error) {
      console.error("GET /api/events failed:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json({ error: "Unable to load events." }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    console.error("GET /api/events unexpected error:", error);
    return NextResponse.json({ error: "Unable to load events." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser(["Super Admin", "Meeting Secretary"]);
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const startTime = typeof body.startTime === "string" ? body.startTime : "";
    const endTime = typeof body.endTime === "string" ? body.endTime : "";
    if (!title || !startTime || !endTime) return NextResponse.json({ error: "Title, start time, and end time are required." }, { status: 400 });
    const { data, error } = await supabase.from("events").insert({
      title,
      start_time: startTime,
      end_time: endTime,
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      location: typeof body.location === "string" ? body.location.trim() || null : null,
      organizer_id: profile.id,
      status: body.status ?? "Upcoming",
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await recordAudit(supabase, profile.id, "CREATE_EVENT", "events", data.id, { title });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You do not have permission to create events." }, { status: 403 });
    return NextResponse.json({ error: "Unable to create event." }, { status: 500 });
  }
}
