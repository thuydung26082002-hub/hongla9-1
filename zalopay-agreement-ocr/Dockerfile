# ── Stage 1: build React SPA ──────────────────────────────────────────────────
FROM node:20-alpine AS fe
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build
# Output: /fe/dist

# ── Stage 2: backend + static + worker ────────────────────────────────────────
FROM python:3.12-slim AS app
WORKDIR /app

# System deps for PyMuPDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Copy built SPA from stage 1
COPY --from=fe /fe/dist ./static

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/healthz')"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
