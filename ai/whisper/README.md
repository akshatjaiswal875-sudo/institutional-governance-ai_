# Local Whisper Worker

This worker provides local transcription for meeting recordings. The resulting transcript is sent server-side to Hugging Face for meeting intelligence analysis.

## Requirements

- Python 3.10+
- pip
- ffmpeg (required for video files and recommended for audio extraction)
- `faster-whisper`

## Windows setup

1. Install Python 3.10+.
2. Open a terminal in the project root.
3. Create a virtual environment:
   `python -m venv .venv`
4. Activate it:
   `.\\.venv\\Scripts\\activate`
5. Install requirements:
   `python -m pip install --upgrade pip`
   `python -m pip install -r ai/whisper/requirements.txt`
6. Install ffmpeg and ensure it is available on PATH.
7. Run the worker:
   `python ai/whisper/transcribe.py "C:/path/to/meeting.mp3" --model small`

## Notes

- Default Whisper model: small
- Supported inputs: mp3, wav, m4a, aac, ogg and common video containers when ffmpeg is available.
- Audio is transcribed locally by faster-whisper and is not sent to a hosted transcription provider.
- The Next.js server invokes this worker; temporary files are written under the runtime OS temp directory and cleaned after processing.
- The worker must run in a Python-capable environment. Vercel serverless functions do not provide a reliable persistent Python/faster-whisper runtime, so production deployments should run the Whisper worker on a separate Python worker/container while keeping this same Local Whisper implementation.
