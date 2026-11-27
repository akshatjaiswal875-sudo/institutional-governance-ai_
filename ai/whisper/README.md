# Whisper transcription worker

This optional service runs `faster-whisper` outside Vercel and exposes an authenticated HTTP transcription endpoint. For a no-extra-hosting-cost setup, the Next.js app can use Groq's hosted Whisper API first.

## Deploy on Render

Create a Docker web service from this repository with:

- Dockerfile path: `ai/whisper/Dockerfile`
- Docker context: repository root (`.`)
- Health check path: `/health`
- Region: Singapore (closest available region for India)
- Plan: at least 1 CPU / 2 GB RAM is recommended for the `small` model. Free instances may sleep and are not recommended for production latency.

Set these worker environment variables:

- `WHISPER_WORKER_TOKEN`: a long random secret shared only with the Next.js production app.
- `WHISPER_MODEL`: `small` (default; use `base` for lower memory/latency).
- `WHISPER_DEVICE`: `cpu`
- `WHISPER_COMPUTE_TYPE`: `int8`

The worker exposes `POST /transcribe` with multipart field `file` and header `Authorization: Bearer <token>`. It returns JSON `{"transcript":"..."}`. The unauthenticated `GET /health` endpoint is intended for service health checks.

## Free hosted transcription with Groq (recommended for small production workloads)\n\n1. Create an API key at https://console.groq.com/keys.\n2. Add `GROQ_API_KEY` to the Vercel Production environment variables.\n3. Optionally set `GROQ_WHISPER_MODEL=whisper-large-v3-turbo` (the default).\n\nThe application checks providers in this order: configured self-hosted worker, Groq, Hugging Face, then local Whisper. Groq's free-tier direct upload limit is 25 MB per file. The free tier is rate-limited and is not an unlimited or guaranteed-capacity production service; users may need to retry after a rate-limit response. Recordings larger than 25 MB currently return a clear size-limit error and must be compressed or split before upload.\n\n## Configure the Next.js app

Set these Vercel Production environment variables:

- `WHISPER_WORKER_URL`: the worker URL ending in `/transcribe`.
- `WHISPER_WORKER_TOKEN`: the same token configured on Render.
- `WHISPER_MODEL`: `small` (must match the worker model selection).

When `WHISPER_WORKER_URL` is configured, the app uses this worker before Groq and Hugging Face. If no worker is configured, `GROQ_API_KEY` enables hosted Groq Whisper transcription. Hugging Face is used only when neither worker nor Groq is configured.

## Local development

Install `ai/whisper/requirements.txt`, install ffmpeg, then run:

```bash
WHISPER_WORKER_TOKEN=replace-me uvicorn service:app --app-dir ai/whisper --host 127.0.0.1 --port 8000
```

Audio and temporary video files are removed after processing. The worker never stores uploaded recordings.
