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

type AssistantSource = Record<string, unknown> & {
  parent_type: string;
  parent_id: string;
};

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function addSource(
  sources: AssistantSource[],
  sourceKeys: Set<string>,
  parent_type: string,
  parent_id: string,
  metadata: Record<string, unknown> = {},
): void {
  const key = `${parent_type}:${parent_id}`;
  if (sourceKeys.has(key)) return;
  sourceKeys.add(key);
  sources.push({ parent_type, parent_id, ...metadata });
}

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const { supabase } = await requireUser();

    const rows: SearchRow[] = [];
    const sourceKeys = new Set<string>();
    const sources: AssistantSource[] = [];

    try {
      const { data, error } = await supabase.rpc('keyword_search', {
        query_text: body.message,
        match_count: 12,
      });

      if (!error) {
        for (const row of ((data ?? []) as SearchRow[])) {
          rows.push(row);
          addSource(
            sources,
            sourceKeys,
            row.parent_type,
            row.parent_id,
            row.metadata,
          );
        }
      } else {
        console.warn(
          '[assistant] keyword_search unavailable; using direct retrieval:',
          error.message,
        );
      }
    } catch (error) {
      console.warn(
        '[assistant] keyword_search failed; using direct retrieval:',
        error,
      );
    }

    const context = rows
      .map((row) => row.chunk_content)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n\n');

    const answer = await answerMeetingQuestion(context, body.message);
    return ok({ answer, sources });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : 'Assistant request failed',
    );
  }
}
