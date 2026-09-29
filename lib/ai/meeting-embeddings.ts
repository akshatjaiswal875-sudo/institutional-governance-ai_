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

  // Embeddings are an optional enhancement. Meeting transcription and AI
  // analysis must not fail just because the optional semantic-search provider
  // is unavailable (the application has a free keyword-search path).
  if (!process.env.OPENAI_API_KEY?.trim()) return 0;

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
}
