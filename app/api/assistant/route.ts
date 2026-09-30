import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { fail } from '@/lib/response';

// AI assistant generation is intentionally paused.
// Hybrid/keyword search remains available through /api/search.
export async function POST(_req: NextRequest) {
  try {
    await requireUser();
    return fail('AI assistant is temporarily paused. Hybrid search remains available.', 503);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Authentication failed', 401);
  }
}
