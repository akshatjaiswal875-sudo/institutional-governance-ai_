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

type AssistantSource = Record<string, unknown> & { parent_type: string; parent_id: string };

function unique<T>(values: T[]): T[] { return Array.from(new Set(values)); }
function addSection(parts: string[], label: string, value: unknown): void {
  if (value === null || value === undefined) return;
  const text = typeof value === 'string' ? value.trim() : JSON.stringify(value);
  if (text) parts.push(`${label}: ${text}`);
}
function extractSearchTerms(message: string): string[] {
  const stopWords = new Set([
    'tell','me','about','the','this','that','what','which','when','where','who','how','why','was','were','is','are','give','show','please','can','could','would','should','from','with','for','and','meeting','meetings','information','details','summary','summarize','latest','recent','recently','my','pending','action','items',
  ]);
  const matches: string[] = message.match(/[A-Za-z0-9][A-Za-z0-9_-]{2,}/g) ?? [];
  return unique<string>(matches).filter((term: string) => !stopWords.has(term.toLowerCase())).slice(0, 6);
}
function cleanIlikeTerm(term: string): string { return term.replace(/[\\%_]/g, (value: string) => `\\${value}`); }
function addSource(sources: AssistantSource[], sourceKeys: Set<string>, parent_type: string, parent_id: string, metadata: Record<string, unknown> = {}): void {
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
      const { data, error } = await supabase.rpc('keyword_search', { query_text: body.message, match_count: 12 });
      if (!error) for (const row of ((data ?? []) as SearchRow[])) { rows.push(row); addSource(sources, sourceKeys, row.parent_type, row.parent_id, row.metadata); }
      else console.warn('[assistant] keyword_search unavailable; using direct retrieval:', error.message);
    } catch (error) { console.warn('[assistant] keyword_search failed; using direct retrieval:', error); }
    const answer = await answerMeetingQuestion(body.message, rows);
    return ok({ answer, sources });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Assistant request failed');
  }
}
