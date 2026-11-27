type GeminiGenerateResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const MAX_PROMPT_CHARS = 120_000;

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export async function generateWithGemini(prompt: string, options?: { json?: boolean; maxOutputTokens?: number }): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing.");

  const configuredModel = (process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL).replace(/^models\//, "");
  // Do not retry a retired model after the configured model fails. That hid the real error in production logs.
  const modelsToTry = [configuredModel];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    let lastError = "Gemini request failed.";
    for (const model of modelsToTry) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt.slice(0, MAX_PROMPT_CHARS) }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: options?.maxOutputTokens ?? 1200,
              ...(options?.json ? { responseMimeType: "application/json" } : {}),
            },
          }),
          signal: controller.signal,
        },
      );
      const payload = await response.json().catch(() => ({})) as GeminiGenerateResponse;
      if (!response.ok) {
        const message = payload.error?.message || `Gemini request failed with HTTP ${response.status}.`;
        lastError = `Gemini API error (${response.status}) using ${model}: ${message}`;
        if ([400, 404, 429, 500, 502, 503, 504].includes(response.status) && model !== modelsToTry[modelsToTry.length - 1]) continue;
        throw new Error(lastError);
      }
      const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
      if (!text) throw new Error(payload.promptFeedback?.blockReason
        ? `Gemini blocked the request: ${payload.promptFeedback.blockReason}.`
        : "Gemini returned an empty response.");
      return text;
    }
    throw new Error(lastError);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Gemini request timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseGeminiJson<T>(value: string): T {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Gemini returned malformed JSON.");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}
