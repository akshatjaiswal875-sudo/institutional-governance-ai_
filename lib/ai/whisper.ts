import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

function resolvePython() {
  if (process.env.WHISPER_PYTHON) return process.env.WHISPER_PYTHON;
  return process.platform === "win32" ? path.join(process.cwd(), ".venv", "Scripts", "python.exe") : path.join(process.cwd(), ".venv", "bin", "python");
}

async function transcribeViaWorker(file: File): Promise<string> {
  const workerUrl = process.env.WHISPER_WORKER_URL?.trim();
  if (!workerUrl) throw new Error("WHISPER_WORKER_URL is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  try {
    const form = new FormData();
    form.append("file", file, file.name || "recording");
    form.append("model", process.env.WHISPER_MODEL || "small");
    const response = await fetch(workerUrl, { method: "POST", headers: process.env.WHISPER_WORKER_TOKEN ? { Authorization: `Bearer ${process.env.WHISPER_WORKER_TOKEN}` } : undefined, body: form, signal: controller.signal });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) throw new Error(`Local Whisper worker failed (${response.status}).`);
    if (!contentType.includes("application/json")) throw new Error("Local Whisper worker returned an invalid response.");
    const payload = await response.json() as { transcript?: string; error?: string };
    if (!payload.transcript?.trim()) throw new Error(payload.error || "Local Whisper worker returned an empty transcript.");
    return payload.transcript.trim();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Local Whisper worker timed out.");
    throw error;
  } finally { clearTimeout(timeout); }
}

async function transcribeViaHuggingFace(file: File): Promise<string> {
  const apiKey = process.env.HUGGINGFACE_API_KEY?.trim();
  if (!apiKey) throw new Error("HUGGINGFACE_API_KEY is missing.");

  // HF Inference currently recommends whisper-large-v3 for automatic speech recognition.
  // The previous whisper-small setting is not served by the hf-inference provider.
  const configuredModel = process.env.HUGGINGFACE_WHISPER_MODEL?.trim();
  const model = !configuredModel || configuredModel === "openai/whisper-small"
    ? "openai/whisper-large-v3"
    : configuredModel;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  try {
    const response = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": file.type || "application/octet-stream" },
      body: file,
      signal: controller.signal,
    });
    const bodyText = await response.text();
    if (!response.ok) {
      let detail = `Hugging Face Whisper failed (${response.status}).`;
      try { const parsed = JSON.parse(bodyText) as { error?: string }; if (parsed.error) detail += ` ${parsed.error}`; } catch {}
      throw new Error(detail);
    }
    let payload: { text?: string; error?: string };
    try { payload = JSON.parse(bodyText) as { text?: string; error?: string }; } catch { throw new Error("Hugging Face Whisper returned an invalid response."); }
    const transcript = payload.text?.trim();
    if (!transcript) throw new Error(payload.error || "Hugging Face Whisper returned an empty transcript.");
    return transcript;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Hugging Face Whisper timed out.");
    throw error;
  } finally { clearTimeout(timeout); }
}

async function transcribeLocally(file: File): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "institutional-whisper-"));
  const safeName = path.basename(file.name || "recording.wav").replace(/[^a-zA-Z0-9._-]/g, "_");
  const inputPath = path.join(tempDir, safeName || "recording.wav");
  const model = process.env.WHISPER_MODEL || "small";
  const python = resolvePython();
  const worker = path.join(process.cwd(), "ai", "whisper", "transcribe.py");
  try {
    await fs.writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(python, [worker, inputPath, "--model", model], { cwd: process.cwd(), env: { ...process.env, WHISPER_MODEL: model, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" }, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = ""; let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", (error) => reject(new Error(`Local Whisper runtime could not be started: ${error.message}`)));
      child.on("close", (code) => { if (code !== 0) return reject(new Error(stderr.trim() || `Local Whisper exited with code ${code ?? "unknown"}.`)); const transcript = stdout.trim(); if (!transcript) return reject(new Error("Whisper returned an empty transcript.")); resolve(transcript); });
    });
  } finally { await fs.rm(tempDir, { recursive: true, force: true }); }
}

export async function transcribeLocalAudio(file: File): Promise<string> {
  if (process.env.WHISPER_WORKER_URL?.trim()) return transcribeViaWorker(file);
  if (process.env.HUGGINGFACE_API_KEY?.trim()) return transcribeViaHuggingFace(file);
  return transcribeLocally(file);
}
