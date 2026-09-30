import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { answerMeetingQuestion } from '@/lib/ai/pipeline';
import { fail, ok } from '@/lib/response';

const schema = z.object({ message: z.string().trim().min(1).max(4000) });

const IRRELEVANT_MESSAGE = 'Irrelevant question. Please ask a valid question regarding meetings, policies and events.';

const NATURAL_RESPONSES: Array<{ pattern: RegExp; answer: string }> = [
  { pattern: /^(hi|hello|hey|hiya|good morning|good afternoon|good evening)[!. ]*$/i, answer: 'Hello! I can help you with your institutional meetings, policies, and events. What would you like to know?' },
  { pattern: /^(how are you|how are you doing)[?! .]*$/i, answer: "I'm doing well and ready to help with your institution's meetings, policies, and events." },
  { pattern: /^(thanks|thank you|thx|appreciate it)[!. ]*$/i, answer: "You're welcome! Ask me anything about your institution's meetings, policies, or events." },
  { pattern: /^(who are you|what are you|what can you do)[?! .]*$/i, answer: 'I am the Governance AI Assistant. I can answer questions about institutional meetings, policies, and events using the records available to you.' },
];

const DOMAIN_TERMS = /\b(meeting|meetings|meet|agenda|minutes?|decision|decisions|action\s*items?|participant|participants|attendee|attendees|schedule|scheduled|calendar|policy|policies|event|events|institutional|governance)\b/i;

function naturalResponse(message: string): string | null {
  const normalized = message.trim();
  return NATURAL_RESPONSES.find((item) => item.pattern.test(normalized))?.answer ?? null;
}

function isGovernanceQuestion(message: string): boolean {
  return DOMAIN_TERMS.test(message);
}

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
  if (text) parts.push(label + ': ' + text);
}

function extractSearchTerms(message: string): string[] {
  const stopWords = new Set([
    'tell','me','about','the','this','that','what','which','when','where','who','how','why','was','were','is','are','give','show','please','can','could','would','should','from','with','for','and','meeting','meetings','meet','information','details','summary','summarize','latest','recent','recently','my','pending','action','items','policy','policies','event','events','institutional','governance','calendar','schedule','scheduled',
  ]);
  const matches = message.match(/[A-Za-z0-9][A-Za-z0-9_-]{2,}/g) ?? [];
  return unique(matches.map((term) => term.toLowerCase())).filter((term) => !stopWords.has(term)).slice(0, 6);
}

function cleanIlikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (value) => '\\' + value);
}

function addSource(sources: AssistantSource[], sourceKeys: Set<string>, parent_type: string, parent_id: string, metadata: Record<string, unknown> = {}): void {
  const key = parent_type + ':' + parent_id;
  if (sourceKeys.has(key)) return;
  sourceKeys.add(key);
  sources.push({ parent_type, parent_id, ...metadata });
}

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const natural = naturalResponse(body.message);
    if (natural) return ok({ answer: natural, sources: [] });

    if (!isGovernanceQuestion(body.message)) {
      return ok({ answer: IRRELEVANT_MESSAGE, sources: [] });
    }

    const { supabase } = await requireUser();
    const rows: SearchRow[] = [];
    const sourceKeys = new Set<string>();
    const sources: AssistantSource[] = [];

    try {
      const { data, error } = await supabase.rpc('keyword_search', { query_text: body.message, match_count: 12 });
      if (!error) {
        for (const row of (data ?? []) as SearchRow[]) {
          rows.push(row);
          addSource(sources, sourceKeys, row.parent_type, row.parent_id, row.metadata);
        }
      } else {
        console.warn('[assistant] keyword_search unavailable; using direct retrieval:', error.message);
      }
    } catch (error) {
      console.warn('[assistant] keyword_search failed; using direct retrieval:', error);
    }

    const contextParts: string[] = rows.map((row) => `[${row.parent_type}:${row.parent_id}] ${row.chunk_content}`);
    const searchTerms = extractSearchTerms(body.message);
    let directMeetings: Array<Record<string, unknown>> = [];

    if (searchTerms.length) {
      const titleResults = await Promise.all(searchTerms.map(async (term) => {
        const { data, error } = await supabase.from('meetings').select('id,title,date,location,type,status,created_by,assigned_approver_id').ilike('title', `%${cleanIlikeTerm(term)}%`).limit(8);
        if (error) throw error;
        return data ?? [];
      }));
      const byId = new Map<string, Record<string, unknown>>();
      for (const meeting of titleResults.flat()) if (meeting?.id) byId.set(String(meeting.id), meeting as Record<string, unknown>);
      directMeetings = Array.from(byId.values()).slice(0, 12);
      for (const meeting of directMeetings) {
        const id = String(meeting.id);
        contextParts.push(`[meeting:${id}:title-match] ${JSON.stringify(meeting)}`);
        addSource(sources, sourceKeys, 'meeting', id, { title: meeting.title, retrieval: 'title-match' });
      }
    }

    if (!directMeetings.length && /\b(latest|recent|last|upcoming|next)\b/i.test(body.message)) {
      const { data, error } = await supabase.from('meetings').select('id,title,date,location,type,status,created_by,assigned_approver_id').order('date', { ascending: false }).limit(5);
      if (error) throw error;
      directMeetings = (data ?? []) as Array<Record<string, unknown>>;
      for (const meeting of directMeetings) {
        const id = String(meeting.id);
        contextParts.push(`[meeting:${id}:recent] ${JSON.stringify(meeting)}`);
        addSource(sources, sourceKeys, 'meeting', id, { title: meeting.title, retrieval: 'recent' });
      }
    }

    // Direct case-insensitive lookup makes policy/event questions reliable even when the vector index has no match.
    if (searchTerms.length) {
      const [policyResults, eventResults] = await Promise.all([
        Promise.all(searchTerms.map(async (term) => {
          const { data, error } = await supabase.from('policies').select('id,title,content,version,status,effective_date,updated_at').or(`title.ilike.%${cleanIlikeTerm(term)}%,content.ilike.%${cleanIlikeTerm(term)}%`).limit(6);
          if (error) throw error;
          return data ?? [];
        })),
        Promise.all(searchTerms.map(async (term) => {
          const { data, error } = await supabase.from('events').select('id,title,start_time,end_time,description,location').or(`title.ilike.%${cleanIlikeTerm(term)}%,description.ilike.%${cleanIlikeTerm(term)}%,location.ilike.%${cleanIlikeTerm(term)}%`).limit(6);
          if (error) throw error;
          return data ?? [];
        })),
      ]);

      const policies = new Map<string, Record<string, unknown>>();
      for (const policy of policyResults.flat()) if (policy?.id) policies.set(String(policy.id), policy as Record<string, unknown>);
      for (const policy of policies.values()) {
        contextParts.push(`[policy:${policy.id}:direct-match] ${JSON.stringify(policy)}`);
        addSource(sources, sourceKeys, 'policy', String(policy.id), { title: policy.title, retrieval: 'direct-match' });
      }

      const events = new Map<string, Record<string, unknown>>();
      for (const event of eventResults.flat()) if (event?.id) events.set(String(event.id), event as Record<string, unknown>);
      for (const event of events.values()) {
        contextParts.push(`[event:${event.id}:direct-match] ${JSON.stringify(event)}`);
        addSource(sources, sourceKeys, 'event', String(event.id), { title: event.title, retrieval: 'direct-match' });
      }
    }

    const meetingIds = unique<string>(
      directMeetings.map((meeting) => meeting.id).filter((id): id is string => typeof id === 'string')
        .concat(rows.filter((row) => row.parent_type === 'meeting').map((row) => row.parent_id))
        .concat(rows.map((row) => row.metadata?.meeting_id).filter((id): id is string => typeof id === 'string')),
    ).slice(0, 12);

    if (meetingIds.length) {
      const [meetings, transcripts, analyses, decisions, minutes, actionItems] = await Promise.all([
        supabase.from('meetings').select('id,title,date,location,type,status,created_by,assigned_approver_id').in('id', meetingIds),
        supabase.from('meeting_transcripts').select('id,meeting_id,recording_id,transcript,status,created_at').in('meeting_id', meetingIds).order('created_at', { ascending: false }).limit(24),
        supabase.from('meeting_ai_analysis').select('id,meeting_id,transcript_id,summary,key_points,suggested_minutes,extracted_decisions,extracted_action_items,model_name,status,created_at').in('meeting_id', meetingIds).order('created_at', { ascending: false }).limit(24),
        supabase.from('decisions').select('id,meeting_id,minute_id,decision_text,action_item,assignee_id,due_date,status').in('meeting_id', meetingIds).limit(100),
        supabase.from('minutes').select('id,meeting_id,raw_transcript,summary,version,is_approved,created_at,updated_at').in('meeting_id', meetingIds).order('created_at', { ascending: false }).limit(24),
        supabase.from('action_items').select('id,meeting_id,decision_id,task,assignee_id,due_date,priority,status,created_by,created_at,updated_at').in('meeting_id', meetingIds).limit(100),
      ]);
      if (meetings.error) throw meetings.error;
      if (transcripts.error) throw transcripts.error;
      if (analyses.error) throw analyses.error;
      if (decisions.error) throw decisions.error;
      if (minutes.error) throw minutes.error;
      if (actionItems.error) throw actionItems.error;
      for (const meeting of meetings.data ?? []) { contextParts.push(`[meeting:${meeting.id}:details] ${JSON.stringify(meeting)}`); addSource(sources, sourceKeys, 'meeting', meeting.id, { title: meeting.title, retrieval: 'details' }); }
      for (const transcript of transcripts.data ?? []) { contextParts.push(`[meeting_transcript:${transcript.id}] meeting_id=${transcript.meeting_id}\n${transcript.transcript}`); addSource(sources, sourceKeys, 'meeting_transcript', transcript.id, { meeting_id: transcript.meeting_id, status: transcript.status }); }
      for (const analysis of analyses.data ?? []) { contextParts.push(`[meeting_ai_analysis:${analysis.id}] meeting_id=${analysis.meeting_id}\nsummary=${analysis.summary}\nkey_points=${JSON.stringify(analysis.key_points)}\nsuggested_minutes=${analysis.suggested_minutes ?? ''}\nextracted_decisions=${JSON.stringify(analysis.extracted_decisions)}\nextracted_action_items=${JSON.stringify(analysis.extracted_action_items)}`); addSource(sources, sourceKeys, 'meeting_ai_analysis', analysis.id, { meeting_id: analysis.meeting_id, status: analysis.status }); }
      for (const decision of decisions.data ?? []) { contextParts.push(`[decision:${decision.id}] meeting_id=${decision.meeting_id} decision=${decision.decision_text} action_item=${decision.action_item ?? ''} assignee_id=${decision.assignee_id ?? ''} due_date=${decision.due_date ?? ''} status=${decision.status}`); addSource(sources, sourceKeys, 'decision', decision.id, { meeting_id: decision.meeting_id }); }
      for (const item of actionItems.data ?? []) { contextParts.push(`[action_item:${item.id}] meeting_id=${item.meeting_id} decision_id=${item.decision_id ?? ''} task=${item.task} assignee_id=${item.assignee_id ?? ''} due_date=${item.due_date ?? ''} priority=${item.priority} status=${item.status}`); addSource(sources, sourceKeys, 'action_item', item.id, { meeting_id: item.meeting_id, status: item.status }); }
      for (const minute of minutes.data ?? []) { addSection(contextParts, `[minutes:${minute.id}] meeting_id=${minute.meeting_id}`, minute.summary); addSection(contextParts, `[minutes:${minute.id}:raw]`, minute.raw_transcript); addSource(sources, sourceKeys, 'minutes', minute.id, { meeting_id: minute.meeting_id, version: minute.version, is_approved: minute.is_approved }); }
    }

    // Keep vector-retrieved policy/event records in context as well.
    const policyIds = unique(rows.filter((row) => row.parent_type === 'policy').map((row) => row.parent_id)).slice(0, 12);
    if (policyIds.length) {
      const { data, error } = await supabase.from('policies').select('id,title,content,version,status,effective_date,updated_at').in('id', policyIds);
      if (error) throw error;
      for (const policy of data ?? []) { contextParts.push(`[policy:${policy.id}] ${JSON.stringify(policy)}`); addSource(sources, sourceKeys, 'policy', policy.id, { title: policy.title, version: policy.version, status: policy.status }); }
    }

    const eventIds = unique(rows.filter((row) => row.parent_type === 'event').map((row) => row.parent_id)).slice(0, 12);
    if (eventIds.length) {
      const { data, error } = await supabase.from('events').select('id,title,start_time,end_time,description,location').in('id', eventIds);
      if (error) throw error;
      for (const event of data ?? []) { contextParts.push(`[event:${event.id}] ${JSON.stringify(event)}`); addSource(sources, sourceKeys, 'event', event.id, { title: event.title }); }
    }

    const context = contextParts.join('\n\n').slice(0, 115000);
    if (!context.trim()) return ok({ answer: 'I could not find a matching meeting, policy, or event record. Please try a more specific question.', sources: [] });

    const answer = await answerMeetingQuestion(context, body.message);
    return ok({ answer: answer || 'I could not find a matching meeting, policy, or event record. Please try a more specific question.', sources: sources.slice(0, 50) });
  } catch (error) {
    console.error('[assistant]', error);
    return fail(error instanceof Error ? error.message : 'Assistant failed', 500);
  }
}
