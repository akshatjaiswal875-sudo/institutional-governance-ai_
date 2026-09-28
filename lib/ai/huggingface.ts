type HuggingFaceResult = {
  generated_text?: string;
  answer?: string;
  summary?: string;
  text?: string;
  error?: string;
  choices?: Array<{
    message?: { content?: string };
    text?: string;
  }>;
};

async function callHuggingFace(prompt: string, model: string) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    throw new Error("HUGGINGFACE_API_KEY is missing.");
  }

  const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 500,
        temperature: 0.2,
        return_full_text: false,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Hugging Face request failed (${response.status}): ${body || response.statusText}`);
  }

  const payload = (await response.json()) as HuggingFaceResult | HuggingFaceResult[];

  if (Array.isArray(payload)) {
    const item = payload[0];
    return item?.generated_text ?? item?.answer ?? item?.summary ?? item?.text ?? item?.choices?.[0]?.message?.content ?? item?.choices?.[0]?.text ?? "";
  }

  return payload.generated_text ?? payload.answer ?? payload.summary ?? payload.text ?? payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text ?? "";
}

function extractJson<T>(value: string): T | null {
  const trimmed = value.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  const jsonLike = trimmed.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(jsonLike) as T;
  } catch {
    return null;
  }
}

export async function summarizeWithHuggingFace(transcript: string) {
  const model = process.env.HUGGINGFACE_SUMMARY_MODEL || process.env.HUGGINGFACE_MODEL || "mistralai/Mistral-7B-Instruct-v0.2";
  const prompt = `Return valid JSON only with keys: executive_summary, key_points, risks, next_steps, suggested_minutes. Use only directly supported facts from the transcript. If a value is unknown, use empty arrays or empty strings. Transcript:\n${transcript}`;
  const raw = await callHuggingFace(prompt, model);
  const parsed = extractJson<{
    executive_summary?: string;
    key_points?: string[];
    risks?: string[];
    next_steps?: string[];
    suggested_minutes?: string;
  }>(raw);

  return {
    executive_summary: parsed?.executive_summary ?? "",
    key_points: Array.isArray(parsed?.key_points) ? parsed.key_points.filter((value): value is string => typeof value === "string") : [],
    risks: Array.isArray(parsed?.risks) ? parsed.risks.filter((value): value is string => typeof value === "string") : [],
    next_steps: Array.isArray(parsed?.next_steps) ? parsed.next_steps.filter((value): value is string => typeof value === "string") : [],
    suggested_minutes: parsed?.suggested_minutes ?? parsed?.executive_summary ?? "",
  };
}

export async function extractActionsWithHuggingFace(transcript: string) {
  const model = process.env.HUGGINGFACE_SUMMARY_MODEL || process.env.HUGGINGFACE_MODEL || "mistralai/Mistral-7B-Instruct-v0.2";
  const prompt = `Return valid JSON only with a top-level "items" array. Each item must include: decision_text, action_item, assignee_email, due_date. Use null for unknown values. Never invent missing assignees or dates. Transcript:\n${transcript}`;
  const raw = await callHuggingFace(prompt, model);
  const parsed = extractJson<{ items?: Array<{ decision_text?: string; action_item?: string; assignee_email?: string | null; due_date?: string | null }> }>(raw);

  return Array.isArray(parsed?.items) ? parsed.items : [];
}

export async function answerWithHuggingFace(context: string, question: string) {
  const model = process.env.HUGGINGFACE_ANSWER_MODEL || process.env.HUGGINGFACE_MODEL || "mistralai/Mistral-7B-Instruct-v0.2";
  const prompt = `Answer only from the provided institutional context. If the context is insufficient, say: "No relevant meeting information was found." Use source identifiers like [meeting:ID] when available.\n\nContext:\n${context}\n\nQuestion:\n${question}`;
  const response = await callHuggingFace(prompt, model);
  return response || "No relevant meeting information was found.";
}
