import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { embed } from "@/lib/ai/pipeline";
import { chunkText } from "@/lib/chunk";

export const runtime = "nodejs";
export const maxDuration = 60;

type IndexRecord = {
  id: string;
  parent_type: "meeting" | "policy" | "event";
  title: string;
  content: string;
  metadata: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireUser();
    if (profile.role !== "Super Admin") {
      return NextResponse.json({ error: "Only Super Admin can rebuild the institutional search index." }, { status: 403 });
    }
    if (process.env.ENABLE_OPENAI_EMBEDDINGS !== "true" || !process.env.OPENAI_API_KEY?.trim()) {
      return NextResponse.json({ error: "Semantic indexing is not configured. Enable embeddings and configure the server-side embedding API key first." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const type = ["meeting", "policy", "event"].includes(body.type) ? body.type : "meeting";
    const limit = Math.max(1, Math.min(Number(body.limit) || 10, 20));
    const offset = Math.max(0, Number(body.offset) || 0);
    const admin = createAdminClient();
    const records: IndexRecord[] = [];

    if (type === "all" || type === "meeting") {
      const { data: meetings, error } = await admin.from("meetings")
        .select("id,title,date,location,status")
        .order("date", { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      const ids = (meetings ?? []).map((m: any) => m.id);
      const { data: transcripts, error: transcriptError } = ids.length
        ? await admin.from("meeting_transcripts").select("meeting_id,transcript,created_at").in("meeting_id", ids).order("created_at", { ascending: false })
        : { data: [], error: null };
      if (transcriptError) throw transcriptError;
      for (const meeting of meetings ?? []) {
        const transcript = (transcripts ?? []).find((t: any) => t.meeting_id === meeting.id)?.transcript ?? "";
        records.push({
          id: meeting.id, parent_type: "meeting", title: meeting.title,
          content: [meeting.title, meeting.date, meeting.location, meeting.status, transcript].filter(Boolean).join("\n"),
          metadata: { source: "meeting_and_transcript", title: meeting.title, status: meeting.status, date: meeting.date },
        });
      }
    }

    if (type === "all" || type === "policy") {
      const { data, error } = await admin.from("policies").select("id,title,content,version,status,effective_date")
        .eq("status", "Approved").order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      for (const policy of data ?? []) records.push({
        id: policy.id, parent_type: "policy", title: policy.title,
        content: [policy.title, policy.content, policy.version, policy.effective_date].filter(Boolean).join("\n"),
        metadata: { source: "approved_policy", title: policy.title, status: policy.status, version: policy.version },
      });
    }

    if (type === "all" || type === "event") {
      const { data, error } = await admin.from("events").select("id,title,description,location,start_time,end_time")
        .order("start_time", { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      for (const event of data ?? []) records.push({
        id: event.id, parent_type: "event", title: event.title,
        content: [event.title, event.description, event.location, event.start_time, event.end_time].filter(Boolean).join("\n"),
        metadata: { source: "event", title: event.title, location: event.location, start_time: event.start_time },
      });
    }

    let indexedRecords = 0;
    let indexedChunks = 0;
    for (const record of records) {
      const chunks = chunkText(record.content).slice(0, 12);
      if (!chunks.length) continue;
      const vectors: number[][] = [];
      for (const chunk of chunks) vectors.push(await embed(chunk));
      const { error: deleteError } = await admin.from("embeddings").delete()
        .eq("parent_type", record.parent_type).eq("parent_id", record.id);
      if (deleteError) throw deleteError;
      const { error: insertError } = await admin.from("embeddings").insert(chunks.map((chunk, index) => ({
        parent_type: record.parent_type,
        parent_id: record.id,
        chunk_content: chunk,
        embedding: vectors[index],
        metadata: { ...record.metadata, embedding_model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small", embedding_dimensions: 1536 },
      })));
      if (insertError) throw insertError;
      indexedRecords += 1;
      indexedChunks += chunks.length;
    }

    return NextResponse.json({ data: { indexedRecords, indexedChunks, nextOffset: offset + limit, hasMore: records.length === limit, type } });
  } catch (error) {
    console.error("[assistant/reindex]", error);
    const message = error instanceof Error ? error.message : "Unable to rebuild search index.";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
