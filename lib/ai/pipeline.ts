import { summarizeWithHuggingFace, extractActionsWithHuggingFace, answerWithHuggingFace } from '@/lib/ai/huggingface';
import { transcribeLocalAudio } from '@/lib/ai/whisper';
import type { AISummary, AIActionItem } from '@/types/domain';
import OpenAI from 'openai';

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

export async function embed(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing.');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
  const response = await client.embeddings.create({ model, input: text });
  const vector = response.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length !== 1536) {
    throw new Error(`OpenAI embedding returned ${Array.isArray(vector) ? vector.length : 0} dimensions; expected 1536.`);
  }
  return vector;
}

export async function answerMeetingQuestion(context: string, question: string) {
  return answerWithHuggingFace(context, question);
}

export async function transcribe(file: File) {
  return transcribeLocalAudio(file);
}
