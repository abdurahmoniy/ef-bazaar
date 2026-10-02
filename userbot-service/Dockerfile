# ==============================================================
# userbot-service — Telegram user accounts: admin panel API (userbot-core)
# and the Humo payment watcher (userbot-payment). Same image, two commands.
# ==============================================================
FROM python:3.12-slim

RUN groupadd -r app && useradd -r -g app app -m
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY userbot_service/ ./userbot_service/

# /session: the pre-panel .session file, read once by the importer (rw: Pyrogram
# opens its SQLite file for writing). /avatars: profile photos, shared by both.
RUN mkdir -p /session /avatars && chown app:app /session /avatars

USER app
ENV PYTHONUNBUFFERED=1

EXPOSE 8089
CMD ["python", "-m", "userbot_service.main_core"]
