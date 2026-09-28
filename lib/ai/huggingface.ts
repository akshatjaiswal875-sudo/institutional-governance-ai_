type HuggingFaceResult = {
  generated_text?: string;
  answer?: string;
  summary?: string;
  text?: string;
  error?: string;
  choices?: Array<{ message?: { content?: string }; text?: string }>;
};

const MAX_TRANSCRIPT_CHARS = 120_000;
const DEFAULT_ANALYSIS_MODEL = "google/gemma-2-2b-it";

function resolveAnalysisModel(configured?: string) {
  const model = configured?.trim();
  // The old Mistral model was called through the legacy Inference API and can
  // return provider/model errors. Use a model available through the current
  // Hugging Face chat-completion router instead.
  if (!model || model === "mistralai/Mistral-7B-Instruct-v0.2") return DEFAULT_ANALYSIS_MODEL;
  return model;
}

async function callHuggingFace(prompt: string, model: string) {
  const apiKey = process.env.HUGGINGFACE_API_KEY?.trim();
  if (!apiKey) throw new Error("HUGGINGFACE_API_KEY is missing.");
  const selectedModel = resolveAnalysisModel(model);

  let lastError = "Hugging Face request failed.";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    try {
      const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 700,
          temperature: 0.2,
          stream: false,
        }),
        signal: controller.signal,
      });

      const bodyText = await response.text();
      if (!response.ok) {
        let detail = `Hugging Face request failed (${response.status}).`;
        try {
          const parsed = JSON.parse(bodyText) as { error?: string; message?: string };
          const providerError = parsed.error || parsed.message;
          if (providerError) detail += ` ${providerError}`;
        } catch {
          // Keep the stable HTTP error when the provider returns non-JSON.
        }
        lastError = detail;
        if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) throw new Error(lastError);
        await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
        continue;
      }

      let payload: HuggingFaceResult;
      try {
        payload = JSON.parse(bodyText) as HuggingFaceResult;
      } catch {
        throw new Error("Hugging Face returned an invalid response.");
      }
      if (payload.error) throw new Error(`Hugging Face error: ${payload.error}`);
      const content = payload.choices?.[0]?.message?.content
        ?? payload.choices?.[0]?.text
        ?? payload.generated_text
        ?? payload.answer
        ?? payload.summary
        ?? payload.text
        ?? "";
      if (!content.trim()) throw new Error("Hugging Face returned an empty analysis response.");
      return content;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") lastError = "Hugging Face request timed out.";
      else if (error instanceof Error) lastError = error.message;
      if (attempt === 3) throw new Error(lastError);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(lastError);
}

function transcriptInput(transcript: string) {
  const normalized = transcript.trim();
  if (!normalized) throw new Error("Cannot analyze an empty transcript.");
  if (normalized.length <= MAX_TRANSCRIPT_CHARS) return normalized;
  return normalized.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[Transcript truncated for AI analysis.]";
}

function extractJson<T>(value: string): T | null {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T; } catch { return null; }
}

export async function summarizeWithHuggingFace(transcript: string) {
  const model = resolveAnalysisModel(process.env.HUGGINGFACE_SUMMARY_MODEL || process.env.HUGGINGFACE_MODEL);
  const prompt = `Return valid JSON only with keys: executive_summary, key_points, risks, next_steps, suggested_minutes. Use only directly supported facts from the transcript. If a value is unknown, use empty arrays or empty strings. Transcript:\n${transcriptInput(transcript)}`;
  const raw = await callHuggingFace(prompt, model);
  const parsed = extractJson<{ executive_summary?: string; key_points?: string[]; risks?: string[]; next_steps?: string[]; suggested_minutes?: string }>(raw);
  if (!parsed) throw new Error("Hugging Face returned malformed summary JSON.");
  return {
    executive_summary: typeof parsed.executive_summary === "string" ? parsed.executive_summary : "",
    key_points: Array.isArray(parsed.key_points) ? parsed.key_points.filter((value): value is string => typeof value === "string") : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks.filter((value): value is string => typeof value === "string") : [],
    next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps.filter((value): value is string => typeof value === "string") : [],
    suggested_minutes: typeof parsed.suggested_minutes === "string" ? parsed.suggested_minutes : "",
  };
}

export async function extractActionsWithHuggingFace(transcript: string) {
  const model = resolveAnalysisModel(process.env.HUGGINGFACE_SUMMARY_MODEL || process.env.HUGGINGFACE_MODEL);
  const prompt = `Return valid JSON only with a top-level "items" array. Each item must include: decision_text, action_item, assignee_email, due_date. Use null for unknown values. Never invent missing assignees or dates. Transcript:\n${transcriptInput(transcript)}`;
  const raw = await callHuggingFace(prompt, model);
  const parsed = extractJson<{ items?: Array<{ decision_text?: string; action_item?: string; assignee_email?: string | null; due_date?: string | null }> }>(raw);
  if (!parsed || !Array.isArray(parsed.items)) throw new Error("Hugging Face returned malformed action-item JSON.");
  return parsed.items;
}

export async function answerWithHuggingFace(context: string, question: string) {
  const model = resolveAnalysisModel(process.env.HUGGINGFACE_ANSWER_MODEL || process.env.HUGGINGFACE_MODEL);
  const safeContext = context.slice(0, MAX_TRANSCRIPT_CHARS);
  const prompt = `Answer only from the provided institutional context. If the context is insufficient, say: "No relevant meeting information was found." Never invent meeting facts. Use source identifiers like [meeting:ID] when available.\n\nContext:\n${safeContext}\n\nQuestion:\n${question}`;
  const response = await callHuggingFace(prompt, model);
  return response.trim() || "No relevant meeting information was found.";
}
