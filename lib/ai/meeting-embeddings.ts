import { embed } from "@/lib/ai/pipeline";
import { chunkText } from "@/lib/chunk";

export async function replaceMeetingEmbeddings(
  supabase: { from: (table: string) => any },
  meetingId: string,
  meetingTitle: string,
  transcript: string,
) {
  const chunks = chunkText(`${meetingTitle}\n${transcript}`);
  if (!chunks.length) return 0;

  // Semantic embeddings are optional. They must be explicitly enabled so an
  // old/exhausted OPENAI_API_KEY cannot break the free HF meeting pipeline.
  // Keyword search is the default free search path.
  if (process.env.ENABLE_OPENAI_EMBEDDINGS !== "true") return 0;
  if (!process.env.OPENAI_API_KEY?.trim()) return 0;

  try {
    const vectors: number[][] = [];
    for (const chunk of chunks) vectors.push(await embed(chunk));

    const { error: deleteError } = await supabase.from("embeddings").delete().eq("parent_type", "meeting").eq("parent_id", meetingId);
    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase.from("embeddings").insert(chunks.map((chunk, index) => ({
      parent_type: "meeting",
      parent_id: meetingId,
      chunk_content: chunk,
      embedding: vectors[index],
      metadata: { meeting_title: meetingTitle, source: "meeting_transcript", embedding_model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small", embedding_dimensions: vectors[index]?.length ?? 0 },
    })));
    if (insertError) throw insertError;
    return chunks.length;
  } catch (error) {
    // Never turn a completed transcript/AI analysis into a failed recording
    // because an optional paid embedding provider is unavailable.
    console.warn("Optional OpenAI embeddings skipped:", error instanceof Error ? error.message : error);
    return 0;
  }
}
