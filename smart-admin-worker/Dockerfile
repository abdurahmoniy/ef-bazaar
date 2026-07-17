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

# patchright needs its OWN bundled Chromium — the apt-installed chromium
# above satisfies system-lib deps but patchright looks for its bundled
# binary under PLAYWRIGHT_BROWSERS_PATH. Install to a shared system path so
# both root (during build) and the non-root 'app' user (at runtime) can
# read it. Without this, launch_random_chromium() in rotate.py fails on all
# three channels (bundled-chromium / chrome / msedge).
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
RUN python -m patchright install chromium \
    && chmod -R a+rx /opt/playwright-browsers

COPY smart_admin_worker/ ./smart_admin_worker/

USER app

ENV PYTHONUNBUFFERED=1 \
    PATH=/home/app/.local/bin:$PATH

EXPOSE 8086

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8086/health || exit 1

CMD ["uvicorn", "smart_admin_worker.main:app", "--host", "0.0.0.0", "--port", "8086"]
