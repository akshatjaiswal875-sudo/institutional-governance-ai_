# Free CPU Whisper transcription worker

This worker runs **whisper.cpp** with the multilingual `tiny-q5_1` model. The model weights are downloaded into the Docker image at build time; transcription runs locally on the worker CPU. It does not call Hugging Face Inference Providers or any paid transcription API.

## Free-tier trade-offs

The repository is configured for a Render Free web service:
- 0.1 CPU and 512 MB RAM.
- Spins down after 15 minutes without inbound traffic and takes about a minute to wake.
- Free instance hours are shared across the Render workspace (750 hours/month).
- The tiny quantized model is intentionally selected to fit a very small machine. Accuracy is lower than Whisper small/large-v3, and long recordings can take a long time on 0.1 CPU.
- Render Free is suitable for testing and hobby projects, not production guarantees.

## Deploy as a free Render web service

Create a **new Web Service** from this repository:
- Name: `institutional-governance-whisper`
- Branch: `feature/free-whisper-cpu-pipeline` while validating this PR; switch to `main` after merge
- Runtime: Docker
- Dockerfile path: `ai/whisper/Dockerfile`
- Docker context / root directory: repository root
- Region: Singapore
- Instance type: Free
- Health check path: `/health`

Add this secret environment variable in the worker service:
- `WHISPER_WORKER_TOKEN`: generate a long random value (at least 32 characters). Do not commit it or share it.

## API and Vercel configuration

The worker exposes:
- `GET /health` for health checks.
- `POST /transcribe` with multipart field `file`; it queues transcription and returns a job ID immediately.
- `GET /jobs/{job_id}` to read queued, running, completed, or failed state.

Both job endpoints require `Authorization: Bearer <token>`.

In Vercel, set:
- `WHISPER_WORKER_URL`: the worker URL ending in `/transcribe`.
- `WHISPER_WORKER_TOKEN`: the exact same token configured on Render.

Redeploy the Vercel app after changing environment variables. The app stores the worker job ID on each meeting recording, polls asynchronously, and resumes polling after a page refresh. The worker holds job state in memory; if Render restarts while a job is running, retry that recording.

## Local worker development

Install the packages in `ai/whisper/requirements.txt`, install `ffmpeg`, and ensure `whisper-cli` plus the `ggml-tiny-q5_1.bin` model are available. Then run:

```bash
WHISPER_WORKER_TOKEN=replace-me uvicorn service:app --app-dir ai/whisper --host 127.0.0.1 --port 8000
```

Uploaded audio/video is written to a temporary directory and deleted after processing. The worker stores job state and transcript text in memory.
