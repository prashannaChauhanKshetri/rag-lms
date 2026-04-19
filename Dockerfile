# ─── Backend: FastAPI + sentence-transformers + pgvector client ──────────────
# Multi-stage build keeps the final image small while still caching the model download.

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models \
    TRANSFORMERS_CACHE=/models \
    SENTENCE_TRANSFORMERS_HOME=/models \
    TOKENIZERS_PARALLELISM=false

# System deps: tesseract for OCR, poppler for pdf2image, libmagic for file-type detection
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        tesseract-ocr \
        poppler-utils \
        libpq-dev \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps. Install CPU-only torch FIRST so sentence-transformers
# uses that instead of pulling the default build with ~2GB of unused CUDA libs.
COPY requirements.txt ./
RUN pip install --upgrade pip \
 && pip install --index-url https://download.pytorch.org/whl/cpu torch==2.4.1 \
 && pip install -r requirements.txt

# Pre-download embedding + cross-encoder models into /models so the first
# request doesn't block on a 200 MB download. Baked into the image layer.
RUN python -c "from sentence_transformers import SentenceTransformer, CrossEncoder; \
    SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2'); \
    CrossEncoder('cross-encoder/mmarco-mMiniLMv2-L12-H384-v1')"

# Copy application code last so code changes don't invalidate the deps layer
COPY . .

# Create runtime directories (will be backed by volumes in compose)
RUN mkdir -p /app/fin_ed_docs /app/uploads /app/static

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
