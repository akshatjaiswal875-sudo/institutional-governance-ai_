import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { answerMeetingQuestion } from '@/lib/ai/pipeline';
import { fail, ok } from '@/lib/response';

const schema = z.object({ message: z.string().min(1).max(4000) });

type SearchRow = {
  parent_type: string;
  parent_id: string;
  chunk_content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const { supabase } = await requireUser();

    // Use the same permission-filtered keyword search that powers the free
    // Search page. This removes the OpenAI embedding dependency and avoids
    // giving the assistant a second, less predictable access path.
    const { data, error } = await supabase.rpc('keyword_search', {
      query_text: body.message,
      match_count: 8,
    });
    if (error) throw error;

    const rows = (data ?? []) as SearchRow[];
    const context = rows
      .map((x) => `[${x.parent_type}:${x.parent_id}] ${x.chunk_content}`)
      .join('\n\n');
    const answer = await answerMeetingQuestion(context || 'No relevant meeting information was found.', body.message);

    return ok({
      answer: answer || 'No relevant meeting information was found.',
      sources: rows.map((x) => ({ ...x.metadata, parent_type: x.parent_type, parent_id: x.parent_id })),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Assistant failed', 500);
  }
}
