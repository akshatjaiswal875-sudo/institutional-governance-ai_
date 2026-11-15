import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { transcribe, summarizeTranscript, extractActions } from "@/lib/ai/pipeline";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser();
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings").select("id,created_by,title").eq("id", params.id).maybeSingle();
    if (meetingError) throw meetingError;
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    if (meeting.created_by !== profile.id) return NextResponse.json({ error: "Only the meeting creator can process recordings." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const recordingId = typeof body.recordingId === "string" ? body.recordingId : "";
    if (!recordingId) return NextResponse.json({ error: "Recording ID is required." }, { status: 400 });
    const { data: recording, error: recordingError } = await supabase
      .from("meeting_recordings").select("*").eq("id", recordingId).eq("meeting_id", params.id).maybeSingle();
    if (recordingError) throw recordingError;
    if (!recording) return NextResponse.json({ error: "Recording not found." }, { status: 404 });

    const { data: blob, error: downloadError } = await supabase.storage.from("meeting-media").download(recording.storage_path);
    if (downloadError) throw downloadError;
    const file = new File([await blob.arrayBuffer()], recording.original_filename, { type: recording.mime_type || "application/octet-stream" });
    const transcriptText = await transcribe(file);
    if (!transcriptText.trim()) throw new Error("No speech was detected in this recording.");

    const [summary, extracted] = await Promise.all([
      summarizeTranscript(transcriptText),
      extractActions(transcriptText),
    ]);
    const { data: transcript, error: transcriptInsertError } = await supabase
      .from("meeting_transcripts")
      .insert({ meeting_id: params.id, recording_id: recordingId, transcript: transcriptText, status: "completed" })
      .select("id").single();
    if (transcriptInsertError) throw transcriptInsertError;

    const decisions = extracted.map(item => ({
      decision_text: item.decision_text,
      action_item: item.action_item,
      assignee_email: item.assignee_email,
      due_date: item.due_date,
    }));
    const actions = extracted.filter(item => item.action_item).map(item => ({
      task: item.action_item,
      assignee_email: item.assignee_email,
      deadline: item.due_date,
      priority: "Medium",
    }));
    const { data: analysis, error: analysisError } = await supabase
      .from("meeting_ai_analysis")
      .insert({
        meeting_id: params.id,
        transcript_id: transcript.id,
        summary: summary.executive_summary || "No summary could be generated.",
        key_points: summary.key_points ?? [],
        suggested_minutes: summary.suggested_minutes || summary.executive_summary || "",
        extracted_decisions: decisions,
        extracted_action_items: actions,
        model_name: process.env.GEMINI_MODEL || process.env.HUGGINGFACE_MODEL || "automatic-provider",
        status: "pending_review",
      })
      .select("id,status").single();
    if (analysisError) throw analysisError;

    await supabase.from("meeting_recordings").update({ status: "completed", error_message: null }).eq("id", recordingId);
    await recordAudit(supabase, profile.id, "MEETING_RECORDING_PROCESSED", "meeting_recordings", recordingId, { meeting_id: params.id, transcript_id: transcript.id, analysis_id: analysis.id });
    return NextResponse.json({ data: { transcriptId: transcript.id, analysisId: analysis.id, status: analysis.status } });
  } catch (error) {
    console.error("[meeting-intelligence/process]", error);
    const message = error instanceof Error ? error.message : "Unable to process recording.";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "Recording processing failed. Check the configured transcription and AI providers." : message }, { status });
  }
}
