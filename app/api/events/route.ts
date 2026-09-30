import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const EVENT_CREATORS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin"] as const;

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("events").select("id,title,start_time,end_time,description,location,organizer_id,status").order("start_time", { ascending: true });
    if (error) { console.error("GET /api/events failed:", error); return NextResponse.json({ error: "Unable to load events." }, { status: 500 }); }
    return NextResponse.json({ data: data ?? [] }, { status: 200 });
  } catch (error) { console.error("GET /api/events unexpected error:", error); return NextResponse.json({ error: "Unable to load events." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser([...EVENT_CREATORS]);
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const startTime = typeof body.startTime === "string" ? body.startTime : "";
    const endTime = typeof body.endTime === "string" ? body.endTime : "";
    if (!title || !startTime || !endTime) return NextResponse.json({ error: "Title, start time, and end time are required." }, { status: 400 });
    const requestedStatus = typeof body.status === "string" ? body.status : "Upcoming";
    const status = requestedStatus === "Published" && !["Director", "Super Admin"].includes(profile.role) ? "Draft" : requestedStatus;
    const { data, error } = await supabase.from("events").insert({ title, start_time: startTime, end_time: endTime, description: typeof body.description === "string" ? body.description.trim() || null : null, location: typeof body.location === "string" ? body.location.trim() || null : null, organizer_id: profile.id, status }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await recordAudit(supabase, profile.id, "CREATE_EVENT", "events", data.id, { title, status });
    return NextResponse.json({ data }, { status: 201 });
  } catch { return NextResponse.json({ error: "Unable to create event." }, { status: 401 }); }
}
