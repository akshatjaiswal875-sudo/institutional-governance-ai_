import hmac
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile

app = FastAPI(title="Institutional Governance Whisper Worker", version="2.1.0")
MODEL_PATH = os.getenv("WHISPER_MODEL_PATH", "/models/ggml-tiny-q5_1.bin")
WHISPER_CLI = os.getenv("WHISPER_CLI", "/usr/local/bin/whisper-cli")
WHISPER_THREADS = max(1, int(os.getenv("WHISPER_THREADS", "1")))
MAX_UPLOAD_BYTES = int(os.getenv("WHISPER_MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)))
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="whisper")


def verify_token(authorization: str | None):
    expected = os.getenv("WHISPER_WORKER_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Worker authentication is not configured.")
    supplied = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid worker token.")


def prune_jobs():
    cutoff = time.time() - 4 * 60 * 60
    with _jobs_lock:
        for job_id in [key for key, value in _jobs.items() if value.get("created_at", 0) < cutoff]:
            _jobs.pop(job_id, None)


def run_transcription(job_id: str, source_path: str, temp_dir: str):
    job_started = time.monotonic()
    try:
        with _jobs_lock:
            _jobs[job_id]["status"] = "running"
        source = Path(source_path)
        audio_path = Path(temp_dir) / "audio.wav"
        output_prefix = Path(temp_dir) / "transcript"

        ffmpeg_started = time.monotonic()
        subprocess.run(
            ["ffmpeg", "-nostdin", "-y", "-i", str(source), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(audio_path)],
            check=True, capture_output=True, timeout=600,
        )
        ffmpeg_seconds = time.monotonic() - ffmpeg_started
        print(f"[whisper-worker] job={job_id} stage=audio_conversion seconds={ffmpeg_seconds:.1f}", flush=True)

        whisper_started = time.monotonic()
        result = subprocess.run(
            [WHISPER_CLI, "-m", MODEL_PATH, "-f", str(audio_path), "-t", str(WHISPER_THREADS), "-nt", "-np", "-otxt", "-of", str(output_prefix)],
            check=True, capture_output=True, text=True, timeout=3 * 60 * 60,
        )
        whisper_seconds = time.monotonic() - whisper_started
        transcript_file = Path(f"{output_prefix}.txt")
        transcript = transcript_file.read_text(encoding="utf-8", errors="replace").strip() if transcript_file.exists() else result.stdout.strip()
        if not transcript:
            raise RuntimeError("No speech was detected in this recording.")
        total_seconds = time.monotonic() - job_started
        print(f"[whisper-worker] job={job_id} stage=completed whisper_seconds={whisper_seconds:.1f} total_seconds={total_seconds:.1f} threads={WHISPER_THREADS}", flush=True)
        with _jobs_lock:
            _jobs[job_id].update({"status": "completed", "transcript": transcript, "finished_at": time.time()})
    except subprocess.TimeoutExpired:
        with _jobs_lock:
            _jobs[job_id].update({"status": "failed", "error": "Transcription exceeded the worker time limit.", "finished_at": time.time()})
    except subprocess.CalledProcessError as exc:
        command = Path(str(exc.cmd[0])).name if isinstance(exc.cmd, (list, tuple)) and exc.cmd else "unknown command"
        raw_detail = exc.stderr or exc.stdout or b""
        detail = raw_detail.decode("utf-8", errors="replace") if isinstance(raw_detail, bytes) else str(raw_detail)
        detail = detail.strip() or f"{command} exited with status {exc.returncode} without diagnostic output."
        print(f"[whisper-worker] job={job_id} command={command} exit={exc.returncode}: {detail[-1500:]}", flush=True)
        with _jobs_lock:
            _jobs[job_id].update({"status": "failed", "error": f"{command}: {detail[-1200:]}", "finished_at": time.time()})
    except Exception as exc:
        with _jobs_lock:
            _jobs[job_id].update({"status": "failed", "error": str(exc)[:1500], "finished_at": time.time()})
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@app.get("/health")
def health():
    return {"status": "ok", "service": "whisper.cpp-worker", "model": "tiny-q5_1"}


@app.post("/transcribe", status_code=202)
async def transcribe(file: UploadFile = File(...), authorization: str | None = Header(default=None)):
    verify_token(authorization)
    filename = Path(file.filename or "recording.bin").name
    suffix = Path(filename).suffix.lower()
    allowed = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".mp4", ".mov", ".mkv", ".webm", ".mpeg", ".mpga"}
    if suffix not in allowed:
        raise HTTPException(status_code=415, detail="Unsupported audio/video format.")
    prune_jobs()
    with _jobs_lock:
        if any(job.get("status") in {"queued", "running"} for job in _jobs.values()):
            raise HTTPException(status_code=429, detail="The free CPU worker is already processing another recording. Please retry in a few minutes.")
    temp_dir = tempfile.mkdtemp(prefix="governance-whisper-")
    source_path = str(Path(temp_dir) / filename)
    total = 0
    try:
        with open(source_path, "wb") as target:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Recording exceeds the configured upload limit.")
                target.write(chunk)
        if total == 0:
            raise HTTPException(status_code=400, detail="The uploaded recording is empty.")
        job_id = str(uuid.uuid4())
        with _jobs_lock:
            _jobs[job_id] = {"status": "queued", "created_at": time.time()}
        _executor.submit(run_transcription, job_id, source_path, temp_dir)
        return {"job_id": job_id, "status": "queued"}
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise
    finally:
        await file.close()


@app.get("/jobs/{job_id}")
def get_job(job_id: str, authorization: str | None = Header(default=None)):
    verify_token(authorization)
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Transcription job not found. The worker may have restarted; retry processing.")
        return {
            "job_id": job_id,
            "status": job["status"],
            "transcript": job.get("transcript"),
            "error": job.get("error"),
        }
