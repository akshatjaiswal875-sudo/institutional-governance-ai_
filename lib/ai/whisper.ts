type WhisperJob = {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  transcript?: string | null;
  error?: string | null;
};

function workerUrl(path: string) {
  const configured = process.env.WHISPER_WORKER_URL?.trim();
  if (!configured) throw new Error("Whisper worker is not configured. Set WHISPER_WORKER_URL in Vercel.");
  const base = configured.replace(/\/transcribe\/?$/, "").replace(/\/$/, "");
  return \`${base}${path}\`;
}

function workerHeaders(): HeadersInit {
  const token = process.env.WHISPER_WORKER_TOKEN?.trim();
  if (!token) throw new Error("WHISPER_WORKER_TOKEN is not configured in Vercel.");
  return { Authorization: \`Bearer \${token}\` };
}

async function parseWorkerResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error(\`Whisper worker returned an invalid response (\${response.status}).\`);
  const payload = await response.json() as T & { detail?: string; error?: string };
  if (!response.ok) throw new Error(payload.detail || payload.error || \`Whisper worker request failed (\${response.status}).\`);
  return payload;
}

export async function startWhisperJob(file: File): Promise<WhisperJob> {
  const form = new FormData();
  form.append("file", file, file.name || "recording");
  const response = await fetch(workerUrl("/transcribe"), {
    method: "POST",
    headers: workerHeaders(),
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  return parseWorkerResponse<WhisperJob>(response);
}

export async function getWhisperJob(jobId: string): Promise<WhisperJob> {
  const response = await fetch(workerUrl(\`/jobs/\${encodeURIComponent(jobId)}\`), {
    method: "GET",
    headers: workerHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  return parseWorkerResponse<WhisperJob>(response);
}
