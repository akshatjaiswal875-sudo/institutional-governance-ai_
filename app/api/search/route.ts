import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

const ALLOWED_TYPES = new Set(['policy', 'event', 'meeting', 'suggestion']);

type SearchRow = {
  kind: string;
  id: string;
  custom_id: string | null;
  title: string;
  status: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser();
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
    const types = (req.nextUrl.searchParams.get('types') ?? 'policy,event,meeting,suggestion')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => ALLOWED_TYPES.has(value));
    const parsedLimit = Number(req.nextUrl.searchParams.get('limit') ?? '5');
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 5) : 5;

    if (!q || types.length === 0) return NextResponse.json({ data: [] });

    const { data, error } = await supabase.rpc('global_governance_search', {
      query_text: q,
      entity_types: types,
      per_type_limit: limit,
    });
    if (error) throw error;

    const rows = (data ?? []) as SearchRow[];
    const normalized = rows.map((row) => ({
      parent_type: row.kind,
      parent_id: row.id,
      chunk_content: row.title,
      metadata: {
        title: row.title,
        customId: row.custom_id,
        status: row.status,
      },
      similarity: 1,
    }));

    return NextResponse.json({ data: normalized });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 },
    );
  }
}
