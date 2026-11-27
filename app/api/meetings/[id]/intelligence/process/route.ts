import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { startWhisperJob, getWhisperJob } from "@/lib/ai/whisper";
import { summarizeTranscript, extractActions } from "@/lib/ai/pipeline";
import { recordAudit } from "@/lib/audit";
import { canManageMeeting } from "@/lib/meeting-permissions";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: { id: string } };

async function getAuthorizedContext(meetingId: string) {
  const { supabase, profile } = await requireUser();
  const { data: meeting, error } = await supabase
    .from("meetings").select("id,created_by,title").eq("id", meetingId).maybeSingle();
  if (error) throw error;
  if (!meeting) throw new Error("MEETING_NOT_FOUND");
  if (!canManageMeeting({ userId: profile.id, creatorId: meeting.created_by, role: profile.role })) {
    throw new Error("FORBIDDEN");
  }
  return { supabase, profile, meeting };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  let supabase: Awaited<ReturnType<typeof requireUser>>["supabase"] | undefined;
  let recordingId = "";
  try {
    const context = await getAuthorizedContext(params.id);
    supabase = context.supabase;
    const body = await request.json().catch(() => ({}));
    recordingId = typeof body.recordingId === "string" ? body.recordingId : "";
    if (!recordingId) return NextResponse.json({ error: "Recording ID is required." }, { status: 400 });

    const { data: recording, error } = await supabase
      .from("meeting_recordings").select("*").eq("id", recordingId).eq("meeting_id", params.id).maybeSingle();
    if (error) throw error;
    if (!recording) return NextResponse.json({ error: "Recording not found." }, { status: 404 });

    if (recording.status === "transcribing" && recording.processing_job_id) {
      return NextResponse.json({ data: { jobId: recording.processing_job_id, status: "running" } }, { status: 202 });
    }

    const { data: blob, error: downloadError } = await supabase.storage.from("meeting-media").download(recording.storage_path);
    if (downloadError) throw downloadError;
    const file = new File([await blob.arrayBuffer()], recording.original_filename, {
      type: recording.mime_type || "application/octet-stream",
    });
    const job = await startWhisperJob(file);
    const { error: updateError } = await supabase.from("meeting_recordings").update({
      status: "transcribing",
      processing_job_id: job.job_id,
      error_message: null,
    }).eq("id", recordingId);
    if (updateError) throw updateError;

    return NextResponse.json({ data: { jobId: job.job_id, status: job.status } }, { status: 202 });
  } catch (error) {
    console.error("[meeting-intelligence/start]", error);
    const message = error instanceof Error ? error.message : "Unable to start transcription.";
    if (supabase && recordingId) {
      await supabase.from("meeting_recordings").update({
        status: "failed",
        processing_job_id: null,
        error_message: message.slice(0, 500),
      }).eq("id", recordingId);
    }
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : message === "MEETING_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: status === 500 ? message : message }, { status });
  }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  let supabase: Awaited<ReturnType<typeof requireUser>>["supabase"] | undefined;
  let recordingId = "";
  try {
    const context = await getAuthorizedContext(params.id);
    supabase = context.supabase;
    recordingId = request.nextUrl.searchParams.get("recordingId") || "";
    const jobId = request.nextUrl.searchParams.get("jobId") || "";
    if (!recordingId || !jobId) {
      return NextResponse.json({ error: "recordingId and jobId are required." }, { status: 400 });
    }

    const { data: recording, error } = await supabase
      .from("meeting_recordings").select("*").eq("id", recordingId).eq("meeting_id", params.id).maybeSingle();
    if (error) throw error;
    if (!recording) return NextResponse.json({ error: "Recording not found." }, { status: 404 });
    if (recording.status === "completed") return NextResponse.json({ data: { status: "completed" } });
    if (recording.status === "analyzing") return NextResponse.json({ data: { status: "analyzing" } });
    if (recording.processing_job_id !== jobId) {
      return NextResponse.json({ error: "This transcription job is no longer attached to the recording. Please retry." }, { status: 409 });
    }

    const job = await getWhisperJob(jobId);
    if (job.status === "queued" || job.status === "running") {
      return NextResponse.json({ data: { status: job.status } });
    }
    if (job.status === "failed" || !job.transcript?.trim()) {
      const reason = job.error || "Whisper could not detect speech in this recording.";
      await supabase.from("meeting_recordings").update({
        status: "failed",
        processing_job_id: null,
        error_message: reason.slice(0, 500),
      }).eq("id", recordingId).eq("processing_job_id", jobId);
      return NextResponse.json({ error: reason }, { status: 500 });
    }

    // Claim finalization once so overlapping poll requests cannot create duplicate transcripts.
    const { data: claimed, error: claimError } = await supabase.from("meeting_recordings")
      .update({ status: "analyzing", processing_job_id: null, error_message: null })
      .eq("id", recordingId).eq("processing_job_id", jobId).select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return NextResponse.json({ data: { status: "analyzing" } });

    const transcriptText = job.transcript.trim();
    const [summary, extracted] = await Promise.all([
      summarizeTranscript(transcriptText),
      extractActions(transcriptText),
    ]);
    const { data: transcript, error: transcriptError } = await supabase.from("meeting_transcripts")
      .insert({ meeting_id: params.id, recording_id: recordingId, transcript: transcriptText, status: "completed" })
      .select("id").single();
    if (transcriptError) throw transcriptError;

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
    const { data: analysis, error: analysisError } = await supabase.from("meeting_ai_analysis").insert({
      meeting_id: params.id,
      transcript_id: transcript.id,
      summary: summary.executive_summary || "No summary could be generated.",
      key_points: summary.key_points ?? [],
      suggested_minutes: summary.suggested_minutes || summary.executive_summary || "",
      extracted_decisions: decisions,
      extracted_action_items: actions,
      model_name: process.env.GEMINI_MODEL || process.env.HUGGINGFACE_MODEL || "automatic-provider",
      status: "pending_review",
    }).select("id,status").single();
    if (analysisError) throw analysisError;

    await supabase.from("meeting_recordings").update({
      status: "completed",
      processing_job_id: null,
      error_message: null,
    }).eq("id", recordingId);
    await recordAudit(supabase, context.profile.id, "MEETING_RECORDING_PROCESSED", "meeting_recordings", recordingId, {
      meeting_id: params.id, transcript_id: transcript.id, analysis_id: analysis.id,
    });
    return NextResponse.json({ data: { status: "completed", transcriptId: transcript.id, analysisId: analysis.id } });
  } catch (error) {
    console.error("[meeting-intelligence/poll]", error);
    const message = error instanceof Error ? error.message : "Unable to complete recording analysis.";
    if (supabase && recordingId) {
      await supabase.from("meeting_recordings").update({
        status: "failed",
        processing_job_id: null,
        error_message: message.slice(0, 500),
      }).eq("id", recordingId).eq("status", "analyzing");
    }
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : message === "MEETING_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
