import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { transcribe, summarizeTranscript, extractActions } from "@/lib/ai/pipeline";
import { recordAudit } from "@/lib/audit";
import { replaceMeetingEmbeddings } from "@/lib/ai/meeting-embeddings";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let supabase: Awaited<ReturnType<typeof requireUser>>["supabase"] | null = null;
  let profile: Awaited<ReturnType<typeof requireUser>>["profile"] | null = null;
  let recordingId = "";
  try {
    const auth = await requireUser(["Super Admin", "Meeting Secretary"]);
    supabase = auth.supabase;
    profile = auth.profile;
    const body = await request.json();
    recordingId = typeof body.recordingId === "string" ? body.recordingId.trim() : "";
    if (!recordingId) return NextResponse.json({ error: "Recording is required." }, { status: 400 });

    const [{ data: meeting }, { data: recording }] = await Promise.all([
      supabase.from("meetings").select("id,title").eq("id", params.id).maybeSingle(),
      supabase.from("meeting_recordings").select("*").eq("id", recordingId).eq("meeting_id", params.id).maybeSingle(),
    ]);
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    if (!recording) return NextResponse.json({ error: "Recording not found." }, { status: 404 });

    await supabase.from("meeting_recordings").update({ status: "processing", error_message: null, updated_at: new Date().toISOString() }).eq("id", recording.id);
    await recordAudit(supabase, profile.id, "TRANSCRIPTION_STARTED", "meeting_recordings", recording.id, { meeting_id: params.id });

    const download = await supabase.storage.from("meeting-media").download(recording.storage_path);
    if (download.error) throw download.error;
    await supabase.from("meeting_recordings").update({ status: "transcribing", updated_at: new Date().toISOString() }).eq("id", recording.id);

    const file = new File([download.data], recording.original_filename, { type: recording.mime_type });
    const transcript = await transcribe(file);
    if (!transcript.trim()) throw new Error("Local Whisper returned an empty transcript.");

    const { data: transcriptRow, error: transcriptError } = await supabase
      .from("meeting_transcripts")
      .upsert({ meeting_id: params.id, recording_id: recording.id, transcript, status: "completed", updated_at: new Date().toISOString() }, { onConflict: "recording_id" })
      .select("id")
      .single();
    if (transcriptError) throw transcriptError;
    await recordAudit(supabase, profile.id, "TRANSCRIPTION_COMPLETED", "meeting_transcripts", transcriptRow.id, { meeting_id: params.id });

    await supabase.from("meeting_recordings").update({ status: "analyzing", updated_at: new Date().toISOString() }).eq("id", recording.id);
    await recordAudit(supabase, profile.id, "AI_ANALYSIS_STARTED", "meeting_transcripts", transcriptRow.id, { meeting_id: params.id });
    const [summary, extracted] = await Promise.all([summarizeTranscript(transcript), extractActions(transcript)]);

    const analysisPayload = {
      meeting_id: params.id,
      transcript_id: transcriptRow.id,
      summary: summary.executive_summary,
      key_points: summary.key_points,
      suggested_minutes: summary.suggested_minutes ?? summary.executive_summary,
      extracted_decisions: extracted.map((item) => ({ decision_text: item.decision_text, action_item: item.action_item })),
      extracted_action_items: extracted.map((item) => ({ task: item.action_item, assignee_email: item.assignee_email, deadline: item.due_date, priority: "Medium" })),
      model_name: process.env.HUGGINGFACE_SUMMARY_MODEL ?? process.env.HUGGINGFACE_MODEL ?? "mistralai/Mistral-7B-Instruct-v0.2",
      status: "draft",
      updated_at: new Date().toISOString(),
    };
    const { data: analysis, error: analysisError } = await supabase
      .from("meeting_ai_analysis")
      .upsert(analysisPayload, { onConflict: "transcript_id" })
      .select("id")
      .single();
    if (analysisError) throw analysisError;

    await replaceMeetingEmbeddings(supabase, params.id, meeting.title, transcript);
    await supabase.from("meeting_recordings").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", recording.id);
    await recordAudit(supabase, profile.id, "AI_ANALYSIS_COMPLETED", "meeting_ai_analysis", analysis.id, { meeting_id: params.id, recording_id: recording.id });
    return NextResponse.json({ data: { recording_id: recording.id, transcript_id: transcriptRow.id, analysis_id: analysis.id } });
  } catch (error) {
    if (supabase && recordingId) {
      await supabase.from("meeting_recordings").update({ status: "failed", error_message: error instanceof Error ? error.message.slice(0, 500) : "Processing failed", updated_at: new Date().toISOString() }).eq("id", recordingId);
    }
    if (supabase && profile && recordingId) {
      await recordAudit(supabase, profile.id, "AI_ANALYSIS_FAILED", "meeting_recordings", recordingId, { meeting_id: params.id, error: error instanceof Error ? error.message.slice(0, 300) : "Processing failed" });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Meeting intelligence processing failed." }, { status: 500 });
  }
}
