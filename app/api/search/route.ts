import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser();
    const q = req.nextUrl.searchParams.get('q')?.trim();

    if (!q) return ok([]);

    const { data, error } = await supabase.rpc('keyword_search', {
      query_text: q,
      match_count: 20,
    });

    if (error) throw error;

    return ok(data ?? []);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Search failed', 500);
  }
}
