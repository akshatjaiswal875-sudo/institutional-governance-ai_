import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

const ALLOWED_TYPES = new Set(['policy', 'event', 'meeting', 'suggestion']);

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser();
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
    const types = (req.nextUrl.searchParams.get('types') ?? 'policy,event,meeting,suggestion')
      .split(',').map((v) => v.trim().toLowerCase()).filter((v) => ALLOWED_TYPES.has(v));
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') ?? '5'), 1), 5);

    if (!q) return NextResponse.json({ data: [] });

    const { data, error } = await supabase.rpc('global_governance_search', {
      query_text: q,
      entity_types: types,
      per_type_limit: limit,
    });
    if (error) throw error;

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Search failed' }, { status: 500 });
  }
}
