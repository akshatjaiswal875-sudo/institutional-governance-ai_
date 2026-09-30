import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const MEETING_CREATORS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin", "Meeting Secretary"] as const;

export async function GET() {
  try { const { supabase } = await requireUser(); const { data, error } = await supabase.from("meetings").select("*").order("date", { ascending: false }); if (error) throw error; return NextResponse.json({ data: data ?? [] }); }
  catch { return NextResponse.json({ error: "Unable to load meetings." }, { status: 401 }); }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, profile } = await requireUser([...MEETING_CREATORS]);
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const date = typeof body.date === "string" ? body.date : "";
    const location = typeof body.location === "string" && body.location.trim() ? body.location.trim() : null;
    const type = body.type === "online" ? "online" : "offline";
    if (!title || !date) return NextResponse.json({ error: "Meeting title and date are required." }, { status: 400 });
    const { data, error } = await supabase.from("meetings").insert({ title, date, location, type, created_by: user.id, status: "Draft" as const }).select("id").single();
    if (error) return NextResponse.json({ error: error.message, details: error.details, hint: error.hint, code: error.code }, { status: 403 });
    await recordAudit(supabase, profile.id, "CREATE_MEETING", "meetings", data.id, { title, status: "Draft", creator_role: profile.role });
    return NextResponse.json({ data });
  } catch { return NextResponse.json({ error: "Unable to create meeting." }, { status: 401 }); }
}
