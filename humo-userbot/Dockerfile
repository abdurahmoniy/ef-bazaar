# ==============================================================
# humo-userbot — watches the Humo bot's Telegram chat
# ==============================================================
FROM python:3.12-slim

RUN groupadd -r app && useradd -r -g app app -m
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY humo_userbot/ ./humo_userbot/

# The session directory is a mounted volume; the non-root app user must be
# able to write to it (Pyrogram keeps its SQLite session there).
RUN mkdir -p /session && chown app:app /session

USER app

ENV PYTHONUNBUFFERED=1

# No EXPOSE and no healthcheck: this service has no HTTP surface. Its liveness
# is reported through the Kafka heartbeat, which is what payment-service gates
# deposits on.
CMD ["python", "-m", "humo_userbot.main"]
