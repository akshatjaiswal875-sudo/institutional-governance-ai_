import { NextResponse } from "next/server";
import { replaceMeetingEmbeddings } from "@/lib/ai/meeting-embeddings";
import { requireUser } from "@/lib/auth";

const AI_PROCESSORS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin", "Meeting Secretary"] as const;

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireUser([...AI_PROCESSORS]);
    const [{ data: meeting, error: meetingError }, { data: transcript, error: transcriptError }] = await Promise.all([
      supabase.from("meetings").select("id,title").eq("id", params.id).maybeSingle(),
      supabase.from("meeting_transcripts").select("transcript").eq("meeting_id", params.id).eq("status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (meetingError || transcriptError) throw meetingError ?? transcriptError;
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    if (!transcript?.transcript) return NextResponse.json({ error: "No completed transcript is available to index." }, { status: 400 });
    const chunkCount = await replaceMeetingEmbeddings(supabase, meeting.id, meeting.title, transcript.transcript);
    return NextResponse.json({ data: { meeting_id: meeting.id, chunk_count: chunkCount } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You do not have permission to re-index meetings." }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to re-index meeting." }, { status: 500 });
  }
}
