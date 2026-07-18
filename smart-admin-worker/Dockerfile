# ==============================================================
# smart-admin-worker — Python 3.12 + Chromium for rotate.py
# ==============================================================
#
# Uses Microsoft's official Playwright base image which ships:
#   - Ubuntu 22.04 (jammy) — stable Chromium ABI baseline
#   - Python 3.12
#   - All Chromium system libs (libnss3, libatk, libgbm, etc)
#   - Xvfb + fonts
#
# History: python:3.12-slim (Debian 13 → 12) + apt chromium + patchright
# 1.48/latest all failed with chrome_crashpad_handler '--database required'
# or segfault. MS Playwright image is the tested-baseline that just works.
FROM mcr.microsoft.com/playwright/python:v1.55.0-noble

# curl for the HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r app && useradd -r -g app app -m
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# MS Playwright base has playwright's own Chromium at /ms-playwright.
# patchright bundles its own patched Chromium (anti-bot detection) — install
# to the same shared path with a+rx so the non-root 'app' user can read it.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN python -m patchright install chromium \
    && chmod -R a+rx /ms-playwright

COPY smart_admin_worker/ ./smart_admin_worker/

USER app

ENV PYTHONUNBUFFERED=1 \
    PATH=/home/app/.local/bin:$PATH

EXPOSE 8086

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8086/health || exit 1

CMD ["uvicorn", "smart_admin_worker.main:app", "--host", "0.0.0.0", "--port", "8086"]
