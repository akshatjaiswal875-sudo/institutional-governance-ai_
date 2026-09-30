import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { fail } from '@/lib/response';

// Meeting AI processing is intentionally paused.
// This endpoint must not transcribe, summarize, extract actions, or create AI-generated MoMs.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    return fail(`AI meeting processing is temporarily paused for meeting ${params.id}. Hybrid search remains available.`, 503);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Authentication failed', 401);
  }
}
