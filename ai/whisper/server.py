import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel

app = FastAPI(title="Institutional Governance Local Whisper")
MODEL_CACHE: dict[str, WhisperModel] = {}
MAX_FILE_SIZE = 100 * 1024 * 1024


def get_model(model_name: str) -> WhisperModel:
    if model_name not in MODEL_CACHE:
        MODEL_CACHE[model_name] = WhisperModel(model_name, device="cpu", compute_type="int8")
    return MODEL_CACHE[model_name]


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), model: str = "small", authorization: str | None = Header(default=None)):
    expected = os.getenv("WHISPER_WORKER_TOKEN")
    if expected and authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not file.filename:
        raise HTTPException(status_code=400, detail="A recording file is required.")

    suffix = Path(file.filename).suffix or ".audio"
    total = 0
    fd, temp_name = tempfile.mkstemp(prefix="institutional-whisper-", suffix=suffix)
    os.close(fd)
    try:
        with open(temp_name, "wb") as target:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_FILE_SIZE:
                    raise HTTPException(status_code=413, detail="Recording must be 100 MB or smaller.")
                target.write(chunk)

        whisper = get_model(model)
        segments, _ = whisper.transcribe(temp_name, vad_filter=True, word_timestamps=False)
        transcript = "\n".join(segment.text.strip() for segment in segments if segment.text and segment.text.strip())
        if not transcript:
            raise HTTPException(status_code=422, detail="Whisper returned an empty transcript.")
        return {"transcript": transcript}
    finally:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
