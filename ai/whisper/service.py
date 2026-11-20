import hmac
import os
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel

app = FastAPI(title="Institutional Governance Whisper Worker", version="1.0.0")
_model = None
_model_lock = threading.Lock()
MAX_UPLOAD_BYTES = int(os.getenv("WHISPER_MAX_UPLOAD_BYTES", str(200 * 1024 * 1024)))


def get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                model_name = os.getenv("WHISPER_MODEL", "small")
                _model = WhisperModel(
                    model_name,
                    device=os.getenv("WHISPER_DEVICE", "cpu"),
                    compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
                )
    return _model


def verify_token(authorization: str | None):
    expected = os.getenv("WHISPER_WORKER_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Worker authentication is not configured.")
    supplied = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid worker token.")


@app.get("/health")
def health():
    return {"status": "ok", "service": "whisper-worker"}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), authorization: str | None = Header(default=None)):
    verify_token(authorization)
    filename = Path(file.filename or "recording.bin").name
    suffix = Path(filename).suffix.lower()
    allowed = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".mp4", ".mov", ".mkv", ".webm", ".mpeg", ".mpga"}
    if suffix not in allowed:
        raise HTTPException(status_code=415, detail="Unsupported audio/video format.")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded recording is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Recording exceeds the configured upload limit.")

    with tempfile.TemporaryDirectory(prefix="governance-whisper-") as temp_dir:
        source = Path(temp_dir) / filename
        source.write_bytes(content)
        audio_path = source
        if suffix not in {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".mpga"}:
            audio_path = Path(temp_dir) / "audio.wav"
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-i", str(source), "-vn", "-ac", "1", "-ar", "16000", str(audio_path)],
                    check=True,
                    capture_output=True,
                    timeout=180,
                )
            except FileNotFoundError:
                raise HTTPException(status_code=500, detail="ffmpeg is not installed on the worker.")
            except subprocess.CalledProcessError as exc:
                detail = exc.stderr.decode("utf-8", errors="replace")[-1000:]
                raise HTTPException(status_code=422, detail=f"Could not extract audio: {detail}")

        try:
            segments, _ = get_model().transcribe(
                str(audio_path),
                vad_filter=True,
                word_timestamps=False,
                beam_size=5,
            )
            transcript = "\n".join(
                segment.text.strip() for segment in segments if segment.text and segment.text.strip()
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Whisper transcription failed: {exc}")

    if not transcript.strip():
        raise HTTPException(status_code=422, detail="No speech was detected in this recording.")
    return {"transcript": transcript.strip()}
