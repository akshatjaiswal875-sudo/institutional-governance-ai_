FROM debian:bookworm AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git
WORKDIR /build/whisper.cpp
RUN cmake -B build -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON -DWHISPER_BUILD_SERVER=OFF -DBUILD_SHARED_LIBS=OFF && \
    cmake --build build --config Release -j2

RUN mkdir -p /models && \
    curl -fL --retry 3 https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin -o /models/ggml-tiny-q5_1.bin

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WHISPER_MODEL_PATH=/models/ggml-tiny-q5_1.bin \
    WHISPER_CLI=/usr/local/bin/whisper-cli \
    WHISPER_MAX_UPLOAD_BYTES=104857600

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgomp1 ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY ai/whisper/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY ai/whisper/service.py /app/service.py
COPY --from=build /build/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=build /models/ggml-tiny-q5_1.bin /models/ggml-tiny-q5_1.bin

EXPOSE 10000
CMD ["sh", "-c", "uvicorn service:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1"]
