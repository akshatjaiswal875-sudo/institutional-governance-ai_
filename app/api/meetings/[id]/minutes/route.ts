import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const MINUTES_MANAGERS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin", "Meeting Secretary", "Faculty / Officer"] as const;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser([...MINUTES_MANAGERS]);
    const body = await request.json();
    const rawTranscript = typeof body.rawTranscript === "string" ? body.rawTranscript.trim() : "";
    const summary = typeof body.summary === "string" ? body.summary.trim() : null;
    if (!rawTranscript) return NextResponse.json({ error: "Minutes or transcript are required." }, { status: 400 });

    const { data: meeting } = await supabase.from("meetings").select("id").eq("id", params.id).maybeSingle();
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });

    const { data: latest } = await supabase.from("minutes").select("version").eq("meeting_id", params.id).order("version", { ascending: false }).limit(1).maybeSingle();
    const version = (latest?.version ?? 0) + 1;
    const { data, error } = await supabase.from("minutes").insert({ meeting_id: params.id, raw_transcript: rawTranscript, summary: summary || null, version, is_approved: false }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await recordAudit(supabase, profile.id, "ADD_MINUTES", "minutes", data.id, { meeting_id: params.id, version });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You do not have permission to add minutes." }, { status: 403 });
    return NextResponse.json({ error: "Unable to save minutes." }, { status: 500 });
  }
}
