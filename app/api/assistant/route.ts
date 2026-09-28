import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { embed, answerMeetingQuestion } from '@/lib/ai/pipeline';
import { fail, ok } from '@/lib/response';

const schema = z.object({ message: z.string().min(1).max(4000) });

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const { supabase } = await requireUser();
    const vector = await embed(body.message);
    const { data, error } = await supabase.rpc('hybrid_search', {
      query_text: body.message,
      query_embedding: vector,
      match_count: 8,
    });

    if (error) throw error;

    const context = (data ?? [])
      .map((x: { chunk_content: string; metadata: Record<string, unknown>; parent_type: string }) => `[${x.parent_type}] ${x.chunk_content}`)
      .join('\n\n');

    const answer = await answerMeetingQuestion(context || 'No relevant meeting information was found.', body.message);

    return ok({
      answer: answer || 'No relevant meeting information was found.',
      sources: (data ?? []).map((x: { metadata: Record<string, unknown> }) => x.metadata),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Assistant failed', 500);
  }
}

