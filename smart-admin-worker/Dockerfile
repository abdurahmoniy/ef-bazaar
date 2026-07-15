# ==============================================================
# smart-admin-worker — Python 3.12 + Chromium for rotate.py
# ==============================================================

FROM python:3.12-slim

# Chromium for Konami rotate.py (Playwright subprocess). Also curl for the
# Docker HEALTHCHECK, plus font/lib deps Chromium needs to render pages.
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        libnss3 \
        libgbm1 \
        libasound2 \
        curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r app && useradd -r -g app app
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY smart_admin_worker/ ./smart_admin_worker/

USER app

ENV PYTHONUNBUFFERED=1 \
    PATCHRIGHT_CHROMIUM_PATH=/usr/bin/chromium \
    PATH=/home/app/.local/bin:$PATH

EXPOSE 8086

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8086/health || exit 1

CMD ["uvicorn", "smart_admin_worker.main:app", "--host", "0.0.0.0", "--port", "8086"]
