import { summarizeWithHuggingFace, extractActionsWithHuggingFace, answerWithHuggingFace } from '@/lib/ai/huggingface';
import { transcribeLocalAudio } from '@/lib/ai/whisper';
import type { AISummary, AIActionItem } from '@/types/domain';

export async function summarizeTranscript(transcript: string): Promise<AISummary> {
  const result = await summarizeWithHuggingFace(transcript);
  return {
    executive_summary: result.executive_summary ?? '',
    key_points: Array.isArray(result.key_points) ? result.key_points : [],
    risks: Array.isArray(result.risks) ? result.risks : [],
    next_steps: Array.isArray(result.next_steps) ? result.next_steps : [],
    suggested_minutes: result.suggested_minutes ?? result.executive_summary ?? '',
  };
}

export async function extractActions(transcript: string): Promise<AIActionItem[]> {
  const result = await extractActionsWithHuggingFace(transcript);
  return Array.isArray(result)
    ? result.map((item) => ({
        decision_text: typeof item.decision_text === 'string' ? item.decision_text : '',
        action_item: typeof item.action_item === 'string' ? item.action_item : '',
        assignee_email: typeof item.assignee_email === 'string' ? item.assignee_email : null,
        due_date: typeof item.due_date === 'string' ? item.due_date : null,
      })).filter((item) => item.decision_text || item.action_item)
    : [];
}

export async function embed(text: string) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    input: text,
  });
  const vector = response.data?.[0]?.embedding;
  if (!vector || vector.length === 0) throw new Error('OpenAI embedding response was empty.');
  return vector;
}

export async function answerMeetingQuestion(context: string, question: string) {
  return answerWithHuggingFace(context, question);
}

export async function transcribe(file: File) {
  return transcribeLocalAudio(file);
}

