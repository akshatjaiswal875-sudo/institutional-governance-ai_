---

# Free CPU Whisper transcription worker

This worker runs **whisper.cpp** with the multilingual `tiny-q5_1` model. The model weights are downloaded into the Docker image at build time; transcription runs locally on the worker CPU. It does not call Hugging Face Inference Providers or any paid transcription API.

## Free-tier trade-offs

The repository is configured for a Render Free web service:
- 0.1 CPU and 512 MB RAM.
- Spins down after 15 minutes without inbound traffic and takes about a minute to wake.
- Free instance hours are shared across the Render workspace (750 hours/month).
- The tiny quantized model is intentionally selected to fit a very small machine. Accuracy is lower than Whisper small/large-v3, and long recordings can take a long time on 0.1 CPU.
- Render describes Free services as suitable for testing and hobby projects, not production guarantees.

If you need higher throughput or production reliability, the honest options are a more powerful machine or a different free compute source you control. Do not upgrade the Render plan for this setup.

## Deploy as a free Render web service

Create a **new Web Service** from this same GitHub repository:
- Name: `institutional-governance-whisper`
- Branch: `main` after merging this pull request
- Runtime: Docker
- Dockerfile path: `ai/whisper/Dockerfile`
- Docker context / root directory: repository root
- Region: Singapore
- Instance type: Free
- Health check path: `/health`

Add this secret environment variable in the worker service:
- `WHISPER_WORKER_TOKEN`: generate a long random value (at least 32 characters). Do not commit it or share it in chat.

The worker's health endpoint is `/health`. It accepts `POST /transcribe` with multipart field `file`, returns a job ID immediately, and exposes job state at `GET /jobs/{job_id}`. Both endpoints require `Authorization: Bearer <token>`.

## Configure the Vercel app

In Vercel → Project → Settings → Environment Variables → Production, set:
- `WHISPER_WORKER_URL`: `https://YOUR-WORKER.onrender.com/transcribe`
- `WHISPER_WORKER_TOKEN`: the exact same random token configured on Render.

Redeploy the Vercel application after setting these values.

The app stores the worker job ID on the meeting recording, polls asynchronously, and resumes polling after a page refresh. The worker itself holds job state in memory; if Render restarts while a job is running, retry that recording.

## Local worker development

Install the packages in `requirements.txt`, install `ffmpeg`, and ensure `whisper-cli` plus the `ggml-tiny-q5_1.bin` model are available. Then run:

```bash
WHISPER_WORKER_TOKEN=replace-me uvicorn service:app --app-dir ai/whisper --host 127.0.0.1 --port 8000
```

Uploaded audio/video is written to a temporary directory and deleted after processing. The worker stores only job state and transcript text in memory.
