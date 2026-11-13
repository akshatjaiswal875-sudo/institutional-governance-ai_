import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { extractActions, summarizeTranscript, transcribe } from "@/lib/ai/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

const PROCESSORS = ["Director", "Principal", "HOD", "Coordinator", "Super Admin", "Meeting Secretary"] as const;
const MAX_TRANSCRIPT_LENGTH = 120_000;

type RouteContext = { params: { id: string } };

export async function POST(request: NextRequest, { params }: RouteContext) {
  let admin: ReturnType<typeof createAdminClient> | null = null;
  let recordingId = "";
  let actorId = "";
  try {
    const { profile } = await requireUser([...PROCESSORS]);
    actorId = profile.id;
    const body = await request.json().catch(() => ({}));
    recordingId = typeof body.recordingId === "string" ? body.recordingId : "";
    if (!recordingId) return NextResponse.json({ error: "recordingId is required." }, { status: 400 });

    admin = createAdminClient();
    const [{ data: meeting, error: meetingError }, { data: recording, error: recordingError }] = await Promise.all([
      admin.from("meetings").select("id,title").eq("id", params.id).maybeSingle(),
      admin.from("meeting_recordings").select("id,meeting_id,storage_path,original_filename,mime_type,file_size,status").eq("id", recordingId).eq("meeting_id", params.id).maybeSingle(),
    ]);
    if (meetingError) throw meetingError;
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    if (recordingError) throw recordingError;
    if (!recording) return NextResponse.json({ error: "Recording not found for this meeting." }, { status: 404 });
    if (recording.status === "processing" || recording.status === "transcribing" || recording.status === "analyzing") {
      return NextResponse.json({ error: "This recording is already being processed." }, { status: 409 });
    }
    if (recording.status === "completed") {
      return NextResponse.json({ error: "This recording has already been processed. Replace it or upload another recording to run a new analysis." }, { status: 409 });
    }

    // Claim the recording with a conditional update so two requests cannot process it at once.
    const { data: claimed, error: startError } = await admin.from("meeting_recordings")
      .update({ status: "transcribing", error_message: null, updated_at: new Date().toISOString() })
      .eq("id", recordingId)
      .eq("status", recording.status)
      .select("id")
      .maybeSingle();
    if (startError) throw startError;
    if (!claimed) return NextResponse.json({ error: "This recording is already being processed. Refresh and try again." }, { status: 409 });

    // Remove an earlier partial attempt before retrying a failed recording.
    const { error: previousTranscriptError } = await admin.from("meeting_transcripts").delete().eq("recording_id", recordingId);
    if (previousTranscriptError) throw previousTranscriptError;

    const { data: storedFile, error: downloadError } = await admin.storage.from("meeting-media").download(recording.storage_path);
    if (downloadError || !storedFile) throw downloadError ?? new Error("The uploaded recording could not be downloaded.");
    const inputFile = new File([storedFile], recording.original_filename || "meeting-recording", { type: recording.mime_type || "application/octet-stream" });
    const transcript = (await transcribe(inputFile)).trim();
    if (!transcript) throw new Error("Transcription returned an empty result.");
    const boundedTranscript = transcript.length > MAX_TRANSCRIPT_LENGTH ? transcript.slice(0, MAX_TRANSCRIPT_LENGTH) : transcript;

    const { data: transcriptRow, error: transcriptInsertError } = await admin.from("meeting_transcripts").insert({
      meeting_id: params.id, recording_id: recordingId, transcript: boundedTranscript, status: "completed",
    }).select("id").single();
    if (transcriptInsertError) throw transcriptInsertError;

    const { error: analyzingError } = await admin.from("meeting_recordings").update({ status: "analyzing", updated_at: new Date().toISOString() }).eq("id", recordingId);
    if (analyzingError) throw analyzingError;

    const [summary, extracted] = await Promise.all([
      summarizeTranscript(boundedTranscript),
      extractActions(boundedTranscript),
    ]);
    const decisions = extracted.filter((item) => item.decision_text?.trim()).map((item) => ({
      decision_text: item.decision_text.trim(),
      action_item: item.action_item?.trim() || null,
      assignee_email: item.assignee_email || null,
      due_date: item.due_date || null,
    }));
    const actionItems = extracted.filter((item) => (item.action_item || item.decision_text)?.trim()).map((item) => ({
      task: (item.action_item || item.decision_text).trim(),
      assignee_email: item.assignee_email || "",
      deadline: item.due_date || "",
      priority: "Medium",
    }));

    const { data: analysis, error: analysisError } = await admin.from("meeting_ai_analysis").insert({
      meeting_id: params.id,
      transcript_id: transcriptRow.id,
      summary: summary.executive_summary || "No executive summary could be generated.",
      key_points: summary.key_points,
      suggested_minutes: summary.suggested_minutes || summary.executive_summary || "",
      extracted_decisions: decisions,
      extracted_action_items: actionItems,
      model_name: process.env.HUGGINGFACE_SUMMARY_MODEL || process.env.HUGGINGFACE_MODEL || "configured AI provider",
      status: "draft",
    }).select("id,status,summary,key_points,suggested_minutes,extracted_decisions,extracted_action_items,created_at").single();
    if (analysisError) throw analysisError;

    // Embeddings are an optional search enhancement. They must not block the transcript
    // and human-review workflow when semantic indexing has not been configured.
    if (process.env.ENABLE_OPENAI_EMBEDDINGS === "true") {
      try {
        const { embed } = await import("@/lib/ai/pipeline");
        const chunks = boundedTranscript.match(/[\s\S]{1,3000}/g) ?? [];
        const vectors = await Promise.all(chunks.map((chunk) => embed(chunk)));
        if (vectors.length) {
          const { error: embeddingError } = await admin.from("embeddings").insert(vectors.map((vector, index) => ({
            parent_type: "meeting", parent_id: params.id, chunk_content: chunks[index],
            embedding: vector, metadata: { transcript_id: transcriptRow.id, recording_id: recordingId, chunk_index: index },
          })));
          if (embeddingError) console.error("[meeting-intelligence] embedding insert failed", embeddingError);
        }
      } catch (embeddingError) {
        console.error("[meeting-intelligence] optional embedding generation failed", embeddingError);
      }
    }

    const { error: completeError } = await admin.from("meeting_recordings").update({ status: "completed", error_message: null, updated_at: new Date().toISOString() }).eq("id", recordingId);
    if (completeError) throw completeError;
    await recordAudit(admin, actorId, "MEETING_AI_PROCESSED", "meeting_recordings", recordingId, {
      meeting_id: params.id, transcript_id: transcriptRow.id, analysis_id: analysis.id,
      transcript_characters: boundedTranscript.length, decision_count: decisions.length, action_count: actionItems.length,
    });
    return NextResponse.json({ data: { recordingId, transcriptId: transcriptRow.id, analysis } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process meeting recording.";
    console.error("[meeting-intelligence-process]", error);
    if (admin && recordingId) {
      await admin.from("meeting_recordings").update({ status: "failed", error_message: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", recordingId);
    }
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? `Meeting processing failed: ${message}` : message }, { status });
  }
}
