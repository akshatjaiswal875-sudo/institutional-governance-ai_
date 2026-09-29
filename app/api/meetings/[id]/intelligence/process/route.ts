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
    supabase = auth.supabase; profile = auth.profile;
    const body = await request.json();
    recordingId = typeof body.recordingId === "string" ? body.recordingId.trim() : "";
    if (!recordingId) return NextResponse.json({ error: "Recording is required." }, { status: 400 });
    const [{ data: meeting }, { data: recording }] = await Promise.all([
      supabase.from("meetings").select("id,title,status").eq("id", params.id).maybeSingle(),
      supabase.from("meeting_recordings").select("*").eq("id", recordingId).eq("meeting_id", params.id).maybeSingle(),
    ]);
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    if (!recording) return NextResponse.json({ error: "Recording not found." }, { status: 404 });

    await supabase.from("meeting_recordings").update({ status: "processing", error_message: null, updated_at: new Date().toISOString() }).eq("id", recording.id);
    const download = await supabase.storage.from("meeting-media").download(recording.storage_path);
    if (download.error) throw download.error;
    await supabase.from("meeting_recordings").update({ status: "transcribing", updated_at: new Date().toISOString() }).eq("id", recording.id);
    const transcript = await transcribe(new File([download.data], recording.original_filename, { type: recording.mime_type }));
    if (!transcript.trim()) throw new Error("Local Whisper returned an empty transcript.");

    const { data: existingTranscript } = await supabase.from("meeting_transcripts").select("id").eq("recording_id", recording.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    let transcriptId: string;
    if (existingTranscript) {
      const { data, error } = await supabase.from("meeting_transcripts").update({ meeting_id: params.id, transcript, status: "completed", updated_at: new Date().toISOString() }).eq("id", existingTranscript.id).select("id").single();
      if (error) throw error; transcriptId = data.id;
    } else {
      const { data, error } = await supabase.from("meeting_transcripts").insert({ meeting_id: params.id, recording_id: recording.id, transcript, status: "completed" }).select("id").single();
      if (error) throw error; transcriptId = data.id;
    }

    await supabase.from("meeting_recordings").update({ status: "analyzing", updated_at: new Date().toISOString() }).eq("id", recording.id);
    const [summary, extracted] = await Promise.all([summarizeTranscript(transcript), extractActions(transcript)]);
    const analysisPayload = {
      meeting_id: params.id,
      transcript_id: transcriptId,
      summary: summary.executive_summary,
      key_points: summary.key_points,
      suggested_minutes: summary.suggested_minutes || summary.executive_summary,
      extracted_decisions: extracted.map((item) => ({ decision_text: item.decision_text, action_item: item.action_item })),
      extracted_action_items: extracted.map((item) => ({ task: item.action_item, assignee_email: item.assignee_email, deadline: item.due_date, priority: "Medium", status: "Pending" })),
      model_name: process.env.HUGGINGFACE_SUMMARY_MODEL ?? process.env.HUGGINGFACE_MODEL ?? "openai/gpt-oss-120b:fastest",
      status: "draft",
      updated_at: new Date().toISOString(),
    };
    const { data: existingAnalysis } = await supabase.from("meeting_ai_analysis").select("id").eq("transcript_id", transcriptId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    let analysisId: string;
    if (existingAnalysis) {
      const { data, error } = await supabase.from("meeting_ai_analysis").update(analysisPayload).eq("id", existingAnalysis.id).select("id").single();
      if (error) throw error; analysisId = data.id;
    } else {
      const { data, error } = await supabase.from("meeting_ai_analysis").insert(analysisPayload).select("id").single();
      if (error) throw error; analysisId = data.id;
    }

    // Optional semantic indexing must never turn a successful analysis into a failed recording.
    await replaceMeetingEmbeddings(supabase, params.id, meeting.title, transcript);
    await supabase.from("meeting_recordings").update({ status: "completed", error_message: null, updated_at: new Date().toISOString() }).eq("id", recording.id);
    if (["Draft", "Rejected"].includes(meeting.status)) await supabase.from("meetings").update({ status: "Transcribed" }).eq("id", params.id);
    await recordAudit(supabase, profile.id, "AI_ANALYSIS_COMPLETED", "meeting_ai_analysis", analysisId, { meeting_id: params.id, recording_id: recording.id });
    return NextResponse.json({ data: { recording_id: recording.id, transcript_id: transcriptId, analysis_id: analysisId } });
  } catch (error) {
    if (supabase && recordingId) await supabase.from("meeting_recordings").update({ status: "failed", error_message: error instanceof Error ? error.message.slice(0, 500) : "Processing failed", updated_at: new Date().toISOString() }).eq("id", recordingId);
    if (supabase && profile && recordingId) await recordAudit(supabase, profile.id, "AI_ANALYSIS_FAILED", "meeting_recordings", recordingId, { meeting_id: params.id, error: error instanceof Error ? error.message.slice(0, 300) : "Processing failed" });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Meeting intelligence processing failed." }, { status: 500 });
  }
}
