import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

function resolvePython() {
  if (process.env.WHISPER_PYTHON) return process.env.WHISPER_PYTHON;
  const candidate = process.platform === "win32"
    ? path.join(process.cwd(), ".venv", "Scripts", "python.exe")
    : path.join(process.cwd(), ".venv", "bin", "python");
  return candidate;
}

export async function transcribeLocalAudio(file: File): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "institutional-whisper-"));
  const safeName = path.basename(file.name || "recording.wav").replace(/[^a-zA-Z0-9._-]/g, "_");
  const inputPath = path.join(tempDir, safeName || "recording.wav");
  const model = process.env.WHISPER_MODEL || "small";
  const python = resolvePython();
  const worker = path.join(process.cwd(), "ai", "whisper", "transcribe.py");

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(inputPath, buffer);

    return await new Promise<string>((resolve, reject) => {
      const child = spawn(python, [worker, inputPath, "--model", model], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          WHISPER_MODEL: model,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        reject(new Error(`Local Whisper runtime could not be started: ${error.message}`));
      });
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || `Local Whisper exited with code ${code ?? "unknown"}.`));
          return;
        }
        const transcript = stdout.trim();
        if (!transcript) {
          reject(new Error("Whisper returned an empty transcript."));
          return;
        }
        resolve(transcript);
      });
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
