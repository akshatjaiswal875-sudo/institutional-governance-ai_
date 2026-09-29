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

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function addSection(parts: string[], label: string, value: unknown) {
  if (value === null || value === undefined) return;
  const text = typeof value === 'string' ? value.trim() : JSON.stringify(value);
  if (text) parts.push(`${label}: ${text}`);
}

function extractSearchTerms(message: string) {
  const stopWords = new Set([
    'tell', 'me', 'about', 'the', 'this', 'that', 'what', 'which', 'when',
    'where', 'who', 'how', 'why', 'was', 'were', 'is', 'are', 'give', 'show',
    'please', 'can', 'could', 'would', 'should', 'from', 'with', 'for', 'and',
    'meeting', 'meetings', 'information', 'details', 'summary', 'summarize',
    'latest', 'recent', 'recently', 'my', 'pending', 'action', 'items',
  ]);

  return unique(
    (message.match(/[A-Za-z0-9][A-Za-z0-9_-]{2,}/g) ?? [])
      .filter((term) => !stopWords.has(term.toLowerCase()))
      .slice(0, 6),
  );
}

function cleanIlikeTerm(term: string) {
  return term.replace(/[\\%_]/g, (value) => `\\${value}`);
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
          sourceKeys.add(`${row.parent_type}:${row.parent_id}`);
          sources.push({ ...row.metadata, parent_type: row.parent_type, parent_id: row.parent_id });
        }
      } else {
        console.warn('[assistant] keyword_search unavailable; using direct retrieval:', error.message);
      }
    } catch (error) {
      console.warn('[assistant] keyword_search failed; using direct retrieval:', error);
    }

    const contextParts: string[] = [];
    for (const row of rows) {
      contextParts.push(`[${row.parent_type}:${row.parent_id}] ${row.chunk_content}`);
    }

    const searchTerms = extractSearchTerms(body.message);
    let directMeetings: any[] = [];

    if (searchTerms.length) {
      const titleResults = await Promise.all(
        searchTerms.map(async (term) => {
          const { data, error } = await supabase
            .from('meetings')
            .select('id,title,date,location,type,status,created_by,assigned_approver_id')
            .ilike('title', `%${cleanIlikeTerm(term)}%`)
            .limit(8);
          if (error) throw error;
          return data ?? [];
        }),
      );

      const byId = new Map<string, any>();
      for (const meeting of titleResults.flat()) byId.set(meeting.id, meeting);
      directMeetings = [...byId.values()].slice(0, 12);

      for (const meeting of directMeetings) {
        const key = `meeting:${meeting.id}`;
        if (!sourceKeys.has(key)) {
          sourceKeys.add(key);
          contextParts.push(`[${key}:title-match] ${JSON.stringify(meeting)}`);
          sources.push({ parent_type: 'meeting', parent_id: meeting.id, title: meeting.title, retrieval: 'title-match' });
        }
      }
    }

    if (!directMeetings.length && /\b(latest|recent|last)\b/i.test(body.message)) {
      const { data, error } = await supabase
        .from('meetings')
        .select('id,title,date,location,type,status,created_by,assigned_approver_id')
        .order('date', { ascending: false })
        .limit(5);
      if (error) throw error;
      directMeetings = data ?? [];
      for (const meeting of directMeetings) {
        const key = `meeting:${meeting.id}`;
        if (!sourceKeys.has(key)) {
          sourceKeys.add(key);
          contextParts.push(`[${key}:recent] ${JSON.stringify(meeting)}`);
          sources.push({ parent_type: 'meeting', parent_id: meeting.id, title: meeting.title, retrieval: 'recent' });
        }
      }
    }

    const meetingIds = unique(
      directMeetings
        .map((meeting) => meeting.id)
        .concat(rows.filter((row) => row.parent_type === 'meeting').map((row) => row.parent_id))
        .concat(rows.map((row) => row.metadata?.meeting_id).filter((id): id is string => typeof id === 'string')),
    );

    if (meetingIds.length) {
      const [meetings, transcripts, analyses, decisions, minutes, actionItems] = await Promise.all([
        supabase.from('meetings').select('id,title,date,location,type,status,created_by,assigned_approver_id').in('id', meetingIds),
        supabase.from('meeting_transcripts').select('id,meeting_id,recording_id,transcript,status,created_at').in('meeting_id', meetingIds).order('created_at', { ascending: false }),
        supabase.from('meeting_ai_analysis').select('id,meeting_id,transcript_id,summary,key_points,suggested_minutes,extracted_decisions,extracted_action_items,model_name,status,created_at').in('meeting_id', meetingIds).order('created_at', { ascending: false }),
        supabase.from('decisions').select('id,meeting_id,minute_id,decision_text,action_item,assignee_id,due_date,status').in('meeting_id', meetingIds),
        supabase.from('minutes').select('id,meeting_id,raw_transcript,summary,version,is_approved,created_at,updated_at').in('meeting_id', meetingIds).order('created_at', { ascending: false }),
        supabase.from('action_items').select('id,meeting_id,decision_id,task,assignee_id,due_date,priority,status,created_by,created_at,updated_at').in('meeting_id', meetingIds),
      ]);

      if (meetings.error) throw meetings.error;
      if (transcripts.error) throw transcripts.error;
      if (analyses.error) throw analyses.error;
      if (decisions.error) throw decisions.error;
      if (minutes.error) throw minutes.error;
      if (actionItems.error) throw actionItems.error;

      for (const meeting of meetings.data ?? []) {
        const key = `meeting:${meeting.id}`;
        contextParts.push(`[${key}:details] ${JSON.stringify(meeting)}`);
      }

      for (const transcript of transcripts.data ?? []) {
        contextParts.push(`[meeting_transcript:${transcript.id}] meeting_id=${transcript.meeting_id}\n${transcript.transcript}`);
      }

      for (const analysis of analyses.data ?? []) {
        contextParts.push(`[meeting_ai_analysis:${analysis.id}] meeting_id=${analysis.meeting_id}\nsummary=${analysis.summary}\nkey_points=${JSON.stringify(analysis.key_points)}\nsuggested_minutes=${analysis.suggested_minutes ?? ''}\nextracted_decisions=${JSON.stringify(analysis.extracted_decisions)}\nextracted_action_items=${JSON.stringify(analysis.extracted_action_items)}`);
      }

      for (const decision of decisions.data ?? []) {
        contextParts.push(`[decision:${decision.id}] meeting_id=${decision.meeting_id} decision=${decision.decision_text} action_item=${decision.action_item ?? ''} assignee_id=${decision.assignee_id ?? ''} due_date=${decision.due_date ?? ''} status=${decision.status}`);
      }

      for (const item of actionItems.data ?? []) {
        contextParts.push(`[action_item:${item.id}] meeting_id=${item.meeting_id} decision_id=${item.decision_id ?? ''} task=${item.task} assignee_id=${item.assignee_id ?? ''} due_date=${item.due_date ?? ''} priority=${item.priority} status=${item.status}`);
      }

      for (const minute of minutes.data ?? []) {
        addSection(contextParts, `[minutes:${minute.id}] meeting_id=${minute.meeting_id}`, minute.summary);
        addSection(contextParts, `[minutes:${minute.id}:raw]`, minute.raw_transcript);
      }
    }

    const policyIds = unique(rows.filter((row) => row.parent_type === 'policy').map((row) => row.parent_id));
    if (policyIds.length) {
      const { data: policies, error: policyError } = await supabase
        .from('policies')
        .select('id,title,content,version,status,effective_date,updated_at')
        .in('id', policyIds);
      if (policyError) throw policyError;
      for (const policy of policies ?? []) contextParts.push(`[policy:${policy.id}] ${JSON.stringify(policy)}`);
    }

    const eventIds = unique(rows.filter((row) => row.parent_type === 'event').map((row) => row.parent_id));
    if (eventIds.length) {
      const { data: events, error: eventError } = await supabase
        .from('events')
        .select('id,title,start_time,end_time,description,location')
        .in('id', eventIds);
      if (eventError) throw eventError;
      for (const event of events ?? []) contextParts.push(`[event:${event.id}] ${JSON.stringify(event)}`);
    }

    const context = contextParts.join('\n\n').slice(0, 115_000);
    const answer = await answerMeetingQuestion(
      context || 'No relevant institutional records were found.',
      body.message,
    );

    return ok({
      answer: answer || 'No relevant institutional records were found.',
      sources,
    });
  } catch (e) {
    console.error('[assistant]', e);
    return fail(e instanceof Error ? e.message : 'Assistant failed', 500);
  }
}
