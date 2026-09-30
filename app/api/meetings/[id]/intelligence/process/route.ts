import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { fail } from '@/lib/response';

// Meeting intelligence is intentionally paused.
// No transcription, summary, MoM, decision extraction, or action extraction runs here.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    return fail(`AI meeting intelligence is temporarily paused for meeting ${params.id}. Hybrid search remains available.`, 503);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Authentication failed', 401);
  }
}
