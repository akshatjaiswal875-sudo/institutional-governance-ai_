import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { transcribe, summarizeTranscript, extractActions } from '@/lib/ai/pipeline';
import { replaceMeetingEmbeddings } from '@/lib/ai/meeting-embeddings';
import { fail, ok } from '@/lib/response';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireUser(['Meeting Secretary', 'Super Admin']);
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return fail('File is required', 400);

    const { data: meeting, error: meetingError } = await supabase.from('meetings').select('*').eq('id', params.id).single();
    if (meetingError || !meeting) return fail('Meeting not found', 404);

    const path = `meetings/${params.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const upload = await supabase.storage.from('meeting-media').upload(path, file, { upsert: false });
    if (upload.error) throw upload.error;

    const transcript = await transcribe(file);
    if (!transcript.trim()) throw new Error('Transcription returned no text.');
    const summary = await summarizeTranscript(transcript);
    const actions = await extractActions(transcript);

    const { data: minute, error: minuteError } = await supabase.from('minutes').insert({
      meeting_id: params.id,
      raw_transcript: transcript,
      summary: summary.executive_summary,
      version: 1,
      is_approved: false,
    }).select('id').single();
    if (minuteError) throw minuteError;

    for (const action of actions) {
      const { error } = await supabase.from('decisions').insert({
        meeting_id: params.id,
        minute_id: minute.id,
        decision_text: action.decision_text || action.action_item,
        action_item: action.action_item || null,
        assignee_id: null,
        due_date: action.due_date || null,
        status: 'Pending',
      });
      if (error) throw error;
    }

    // Semantic embeddings are optional. Keyword search remains available when
    // no paid embedding provider is configured.
    await replaceMeetingEmbeddings(supabase, params.id, meeting.title, transcript);
    await supabase.from('meetings').update({ status: 'Pending Approval' }).eq('id', params.id);
    await supabase.from('audit_logs').insert({ user_id: profile.id, action: 'AI_PROCESS_MEETING', target_table: 'meetings', target_id: params.id, changes: { file: path } });
    return ok({ meeting_id: params.id, minute_id: minute.id });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Processing failed', 500);
  }
}
