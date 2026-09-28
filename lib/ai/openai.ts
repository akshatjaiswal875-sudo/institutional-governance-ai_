import OpenAI from 'openai';

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Set it in your deployment environment before running AI features.');
  }

  return new OpenAI({ apiKey });
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** i, 8000)));
    }
  }

  throw last instanceof Error ? last : new Error('AI request failed');
}

export const client = {
  get(): OpenAI {
    return getOpenAIClient();
  },
};
