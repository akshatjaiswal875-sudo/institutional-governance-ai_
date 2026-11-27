import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireUser();
    const [{ data: recordings, error: recordingsError }, { data: transcripts, error: transcriptsError }, { data: analyses, error: analysesError }] = await Promise.all([
      supabase.from("meeting_recordings").select("id,meeting_id,original_filename,mime_type,file_size,status,error_message,processing_job_id,created_at,updated_at").eq("meeting_id", params.id).order("created_at", { ascending: false }),
      supabase.from("meeting_transcripts").select("*").eq("meeting_id", params.id).order("created_at", { ascending: false }),
      supabase.from("meeting_ai_analysis").select("*").eq("meeting_id", params.id).order("created_at", { ascending: false }),
    ]);
    if (recordingsError || transcriptsError || analysesError) throw recordingsError ?? transcriptsError ?? analysesError;
    return NextResponse.json({ data: { recordings: recordings ?? [], transcripts: transcripts ?? [], analyses: analyses ?? [] } });
  } catch { return NextResponse.json({ error: "Unable to load meeting intelligence." }, { status: 401 }); }
}
