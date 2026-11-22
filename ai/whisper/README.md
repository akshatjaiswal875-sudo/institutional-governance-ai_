# Whisper transcription worker

This service runs `faster-whisper` outside Vercel and exposes an authenticated HTTP transcription endpoint.

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

## Configure the Next.js app

Set these Vercel Production environment variables:

- `WHISPER_WORKER_URL`: the worker URL ending in `/transcribe`.
- `WHISPER_WORKER_TOKEN`: the same token configured on Render.
- `WHISPER_MODEL`: `small` (must match the worker model selection).

When `WHISPER_WORKER_URL` is configured, the app uses this worker before considering Hugging Face. The Hugging Face inference key is no longer needed for transcription.

## Local development

Install `ai/whisper/requirements.txt`, install ffmpeg, then run:

```bash
WHISPER_WORKER_TOKEN=replace-me uvicorn service:app --app-dir ai/whisper --host 127.0.0.1 --port 8000
```

Audio and temporary video files are removed after processing. The worker never stores uploaded recordings.
