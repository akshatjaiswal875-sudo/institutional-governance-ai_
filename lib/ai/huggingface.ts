type HuggingFaceResult = {
  generated_text?: string;
  answer?: string;
  summary?: string;
  text?: string;
  error?: unknown;
  message?: unknown;
  choices?: Array<{ message?: { content?: string }; text?: string }>;
};

const MAX_TRANSCRIPT_CHARS = 120_000;
const DEFAULT_ANALYSIS_MODEL = "google/gemma-2-2b-it";
const FALLBACK_ANALYSIS_MODELS = [
  "google/gemma-2-2b-it",
  "Qwen/Qwen2.5-1.5B-Instruct",
  "Qwen/Qwen2.5-7B-Instruct",
];

function resolveAnalysisModel(configured?: string) {
  const model = configured?.trim();
  if (!model || model === "mistralai/Mistral-7B-Instruct-v0.2") return DEFAULT_ANALYSIS_MODEL;
  return model;
}

function formatProviderError(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message.trim();
    if (obj.error && obj.error !== value) {
      const nested = formatProviderError(obj.error);
      if (nested) return nested;
    }
    try { return JSON.stringify(value); } catch { return "Provider returned an object error."; }
  }
  return String(value ?? "Unknown provider error");
}

function isUnsupportedModelError(status: number, detail: string) {
  const text = detail.toLowerCase();
  return status === 400 && (
    text.includes("not supported by any provider") ||
    text.includes("no provider") ||
    text.includes("provider you have enabled") ||
    text.includes("model is not available") ||
    text.includes("not deployed")
  );
}

async function callHuggingFace(prompt: string, model: string) {
  const apiKey = process.env.HUGGINGFACE_API_KEY?.trim();
  if (!apiKey) throw new Error("HUGGINGFACE_API_KEY is missing.");
  const configuredModel = resolveAnalysisModel(model);
  const candidates = [configuredModel, ...FALLBACK_ANALYSIS_MODELS.filter((candidate) => candidate !== configuredModel)];
  let lastError = "Hugging Face request failed.";

  for (const selectedModel of candidates) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55_000);
      try {
        const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: selectedModel, messages: [{ role: "user", content: prompt }], max_tokens: 700, temperature: 0.2, stream: false }),
          signal: controller.signal,
        });
        const bodyText = await response.text();
        let payload: HuggingFaceResult | null = null;
        try { payload = JSON.parse(bodyText) as HuggingFaceResult; } catch { /* non-JSON response */ }
        if (!response.ok) {
          const detail = payload ? formatProviderError(payload.error ?? payload.message) : bodyText.trim() || `HTTP ${response.status}`;
          lastError = `Hugging Face request failed (${response.status}): ${detail}`;
          if (isUnsupportedModelError(response.status, detail)) break;
          if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
          continue;
        }
        if (!payload) throw new Error("Hugging Face returned an invalid response.");
        if (payload.error) throw new Error(`Hugging Face error: ${formatProviderError(payload.error)}`);
        const content = payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text ?? payload.generated_text ?? payload.answer ?? payload.summary ?? payload.text ?? "";
        if (!content.trim()) throw new Error("Hugging Face returned an empty analysis response.");
        return content;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") lastError = "Hugging Face request timed out.";
        else if (error instanceof Error) lastError = error.message;
        if (attempt === 2) break;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      } finally { clearTimeout(timeout); }
    }
  }
  throw new Error(lastError);
}

function transcriptInput(transcript: string) {
  const normalized = transcript.trim();
  if (!normalized) throw new Error("Cannot analyze an empty transcript.");
  return normalized.length <= MAX_TRANSCRIPT_CHARS ? normalized : normalized.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[Transcript truncated for AI analysis.]";
}

function sentences(text: string) {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 25);
}

function heuristicSummary(transcript: string) {
  const list = sentences(transcript);
  const keyPoints = list.slice(0, 5);
  const risks = list.filter((s) => /risk|issue|problem|concern|delay|block|challenge|warning|failure/i.test(s)).slice(0, 5);
  const nextSteps = list.filter((s) => /\b(will|should|must|need to|action|follow up|next|prepare|submit|review|send|complete)\b/i.test(s)).slice(0, 5);
  const summary = list.slice(0, 3).join(" ") || transcript.slice(0, 900);
  return { executive_summary: summary.slice(0, 2000), key_points: keyPoints, risks, next_steps: nextSteps, suggested_minutes: summary.slice(0, 4000) };
}

function heuristicActions(transcript: string) {
  return sentences(transcript).filter((s) => /\b(will|should|must|need to|action|follow up|prepare|submit|review|send|complete|assigned)\b/i.test(s)).slice(0, 10).map((sentence) => ({ decision_text: sentence, action_item: sentence, assignee_email: null, due_date: null }));
}

function extractJson<T>(value: string): T | null {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T; } catch { return null; }
}

export async function summarizeWithHuggingFace(transcript: string) {
  const normalized = transcriptInput(transcript);
  const model = resolveAnalysisModel(process.env.HUGGINGFACE_SUMMARY_MODEL || process.env.HUGGINGFACE_MODEL);
  const prompt = `Return valid JSON only with keys: executive_summary, key_points, risks, next_steps, suggested_minutes. Use only directly supported facts from the transcript. If a value is unknown, use empty arrays or empty strings. Transcript:\n${normalized}`;
  try {
    const raw = await callHuggingFace(prompt, model);
    const parsed = extractJson<{ executive_summary?: string; key_points?: string[]; risks?: string[]; next_steps?: string[]; suggested_minutes?: string }>(raw);
    if (!parsed) throw new Error("Hugging Face returned malformed summary JSON.");
    return { executive_summary: typeof parsed.executive_summary === "string" ? parsed.executive_summary : "", key_points: Array.isArray(parsed.key_points) ? parsed.key_points.filter((value): value is string => typeof value === "string") : [], risks: Array.isArray(parsed.risks) ? parsed.risks.filter((value): value is string => typeof value === "string") : [], next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps.filter((value): value is string => typeof value === "string") : [], suggested_minutes: typeof parsed.suggested_minutes === "string" ? parsed.suggested_minutes : "", fallback: false };
  } catch {
    return { ...heuristicSummary(normalized), fallback: true };
  }
}

export async function extractActionsWithHuggingFace(transcript: string) {
  const normalized = transcriptInput(transcript);
  const model = resolveAnalysisModel(process.env.HUGGINGFACE_SUMMARY_MODEL || process.env.HUGGINGFACE_MODEL);
  const prompt = `Return valid JSON only with a top-level "items" array. Each item must include: decision_text, action_item, assignee_email, due_date. Use null for unknown values. Never invent missing assignees or dates. Transcript:\n${normalized}`;
  try {
    const raw = await callHuggingFace(prompt, model);
    const parsed = extractJson<{ items?: Array<{ decision_text?: string; action_item?: string; assignee_email?: string | null; due_date?: string | null }> }>(raw);
    if (!parsed || !Array.isArray(parsed.items)) throw new Error("Hugging Face returned malformed action-item JSON.");
    return parsed.items.map((item) => ({ ...item, fallback: false }));
  } catch {
    return heuristicActions(normalized).map((item) => ({ ...item, fallback: true }));
  }
}

export async function answerWithHuggingFace(context: string, question: string) {
  const model = resolveAnalysisModel(process.env.HUGGINGFACE_ANSWER_MODEL || process.env.HUGGINGFACE_MODEL);
  const safeContext = context.slice(0, MAX_TRANSCRIPT_CHARS);
  const prompt = `Answer only from the provided institutional context. If the context is insufficient, say: "No relevant meeting information was found." Never invent meeting facts. Use source identifiers like [meeting:ID] when available.\n\nContext:\n${safeContext}\n\nQuestion:\n${question}`;
  try {
    const response = await callHuggingFace(prompt, model);
    return response.trim() || "No relevant meeting information was found.";
  } catch {
    if (!safeContext.trim()) return "No relevant meeting information was found.";
    return `AI provider is temporarily unavailable. Relevant records found:\n\n${safeContext.slice(0, 1800)}`;
  }
}
