import { NextResponse } from "next/server";
import { replaceMeetingEmbeddings } from "@/lib/ai/meeting-embeddings";
import { requireUser } from "@/lib/auth";
import { canManageMeeting } from "@/lib/meeting-permissions";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser();
    const [{ data: meeting, error: meetingError }, { data: transcript, error: transcriptError }] = await Promise.all([
      supabase.from("meetings").select("id,title").eq("id", params.id).maybeSingle(),
      supabase.from("meeting_transcripts").select("transcript").eq("meeting_id", params.id).eq("status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (meetingError || transcriptError) throw meetingError ?? transcriptError;
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    const { data: owner } = await supabase.from("meetings").select("created_by").eq("id", params.id).maybeSingle();
    if (!owner || !canManageMeeting({ userId: profile.id, creatorId: owner.created_by, role: profile.role })) return NextResponse.json({ error: "Only the meeting creator can re-index this meeting." }, { status: 403 });
    if (!transcript?.transcript) return NextResponse.json({ error: "No completed transcript is available to index." }, { status: 400 });
    const chunkCount = await replaceMeetingEmbeddings(supabase, meeting.id, meeting.title, transcript.transcript);
    return NextResponse.json({ data: { meeting_id: meeting.id, chunk_count: chunkCount } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You do not have permission to re-index meetings." }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to re-index meeting." }, { status: 500 });
  }
}
