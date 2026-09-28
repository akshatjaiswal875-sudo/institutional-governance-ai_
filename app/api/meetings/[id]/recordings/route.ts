import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

const maxFileSize = 100 * 1024 * 1024;
const allowedPrefixes = ["audio/", "video/"];

function isValidRecording(file: File) {
  return allowedPrefixes.some((prefix) => file.type.startsWith(prefix)) && file.size > 0 && file.size <= maxFileSize;
}

async function getMeetingRecording(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], meetingId: string, recordingId: string) {
  const { data, error } = await supabase
    .from("meeting_recordings")
    .select("*")
    .eq("id", recordingId)
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireUser();
    const recordingId = request.nextUrl.searchParams.get("recordingId");
    if (recordingId) {
      const recording = await getMeetingRecording(supabase, params.id, recordingId);
      if (!recording) return NextResponse.json({ error: "Recording not found." }, { status: 404 });
      const { data, error } = await supabase.storage.from("meeting-media").createSignedUrl(recording.storage_path, 300);
      if (error) throw error;
      return NextResponse.json({ data: { url: data.signedUrl, expires_in: 300 } });
    }

    const { data, error } = await supabase
      .from("meeting_recordings")
      .select("id,meeting_id,original_filename,mime_type,file_size,status,error_message,created_at,updated_at")
      .eq("meeting_id", params.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    const message = error instanceof Error && error.message === "UNAUTHORIZED" ? "Authentication required." : "Unable to load recordings.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser(["Super Admin", "Meeting Secretary"]);
    const { data: meeting } = await supabase.from("meetings").select("id,created_by").eq("id", params.id).maybeSingle();
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Recording file is required." }, { status: 400 });
    if (!isValidRecording(file)) return NextResponse.json({ error: "Upload a non-empty audio/video recording of 100 MB or smaller." }, { status: 400 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "recording";
    const storagePath = `meetings/${params.id}/${crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from("meeting-media").upload(storagePath, file, { upsert: false, contentType: file.type });
    if (upload.error) throw upload.error;

    const { data, error } = await supabase
      .from("meeting_recordings")
      .insert({ meeting_id: params.id, storage_path: storagePath, original_filename: file.name, mime_type: file.type, file_size: file.size, status: "uploaded", created_by: profile.id })
      .select("id,meeting_id,original_filename,mime_type,file_size,status,created_at,updated_at")
      .single();
    if (error) {
      await supabase.storage.from("meeting-media").remove([storagePath]);
      throw error;
    }
    await recordAudit(supabase, profile.id, "RECORDING_UPLOADED", "meeting_recordings", data.id, { meeting_id: params.id, original_filename: file.name, file_size: file.size });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to upload recording." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser(["Super Admin", "Meeting Secretary"]);
    const recordingId = request.nextUrl.searchParams.get("recordingId");
    if (!recordingId) return NextResponse.json({ error: "recordingId is required." }, { status: 400 });

    // Keep authorization on the authenticated client. Use the service-role client only
    // for the server-side cleanup because Storage/RLS can otherwise block a legitimate
    // deletion after the route has already authorized the staff member.
    const recording = await getMeetingRecording(supabase, params.id, recordingId);
    if (!recording) return NextResponse.json({ error: "Recording not found." }, { status: 404 });

    const admin = createAdminClient();

    const { data: transcript, error: transcriptLookupError } = await admin
      .from("meeting_transcripts")
      .select("id")
      .eq("recording_id", recording.id)
      .maybeSingle();
    if (transcriptLookupError) throw transcriptLookupError;

    if (transcript) {
      const { error } = await admin.from("meeting_ai_analysis").delete().eq("transcript_id", transcript.id);
      if (error) throw error;

      const { error: transcriptDeleteError } = await admin
        .from("meeting_transcripts")
        .delete()
        .eq("recording_id", recording.id);
      if (transcriptDeleteError) throw transcriptDeleteError;
    }

    // Embeddings for this meeting are generated from its transcript, so invalidate
    // them when the source recording is removed.
    const { error: embeddingDeleteError } = await admin
      .from("embeddings")
      .delete()
      .eq("parent_type", "meeting")
      .eq("parent_id", params.id);
    if (embeddingDeleteError) throw embeddingDeleteError;

    const { error: storageDeleteError } = await admin
      .storage
      .from("meeting-media")
      .remove([recording.storage_path]);
    if (storageDeleteError) throw storageDeleteError;

    const { error: recordingDeleteError } = await admin
      .from("meeting_recordings")
      .delete()
      .eq("id", recording.id)
      .eq("meeting_id", params.id);
    if (recordingDeleteError) throw recordingDeleteError;

    await recordAudit(admin, profile.id, "RECORDING_DELETED", "meeting_recordings", recording.id, {
      meeting_id: params.id,
      storage_path: recording.storage_path,
    });

    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete recording.";
    console.error("[recording-delete]", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser(["Super Admin", "Meeting Secretary"]);
    const form = await request.formData();
    const file = form.get("file");
    const oldRecordingId = String(form.get("recordingId") || "");
    if (!(file instanceof File) || !isValidRecording(file)) return NextResponse.json({ error: "A valid audio/video recording of 100 MB or smaller is required." }, { status: 400 });
    if (!oldRecordingId) return NextResponse.json({ error: "recordingId is required." }, { status: 400 });
    const oldRecording = await getMeetingRecording(supabase, params.id, oldRecordingId);
    if (!oldRecording) return NextResponse.json({ error: "Recording not found." }, { status: 404 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "recording";
    const storagePath = `meetings/${params.id}/${crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from("meeting-media").upload(storagePath, file, { upsert: false, contentType: file.type });
    if (upload.error) throw upload.error;

    const { data: replacement, error } = await supabase
      .from("meeting_recordings")
      .insert({ meeting_id: params.id, storage_path: storagePath, original_filename: file.name, mime_type: file.type, file_size: file.size, status: "uploaded", created_by: profile.id })
      .select("id,meeting_id,original_filename,mime_type,file_size,status,created_at,updated_at")
      .single();
    if (error) {
      await supabase.storage.from("meeting-media").remove([storagePath]);
      throw error;
    }

    await recordAudit(supabase, profile.id, "RECORDING_REPLACED", "meeting_recordings", replacement.id, { meeting_id: params.id, replaced_recording_id: oldRecording.id });

    const oldTranscript = await supabase.from("meeting_transcripts").select("id").eq("recording_id", oldRecording.id).maybeSingle();
    if (oldTranscript.data) await supabase.from("meeting_ai_analysis").delete().eq("transcript_id", oldTranscript.data.id);
    await supabase.from("meeting_transcripts").delete().eq("recording_id", oldRecording.id);
    await supabase.from("embeddings").delete().eq("parent_type", "meeting").eq("parent_id", params.id);
    await supabase.storage.from("meeting-media").remove([oldRecording.storage_path]);
    await supabase.from("meeting_recordings").delete().eq("id", oldRecording.id);

    return NextResponse.json({ data: replacement }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to replace recording." }, { status: 400 });
  }
}
