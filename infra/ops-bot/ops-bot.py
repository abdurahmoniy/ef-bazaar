#!/usr/bin/env python3
"""
efBazaar ops-bot — host-level Telegram helper for /logs.

Runs as a systemd service on the host (see ops-bot.service). Independent of
docker-compose services: uses `docker` CLI directly and long-polls the
Telegram Bot API. This means /logs works even when every app container has
crashed, so long as the docker daemon itself is alive.

Config (env, populated by systemd EnvironmentFile):
    OPS_BOT_TOKEN            — dedicated bot token (@EfbazaarOpsBot)
    TELEGRAM_GROUP_CHAT_ID   — supergroup id, negative (e.g. -100...)
    TELEGRAM_TOPIC_LOGS      — forum topic thread id (int); empty ⇒ no topic
    CONTAINER_PREFIX         — docker ps name filter (default: efbazaar-)
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import time
from typing import Optional

import requests

# ─── Config ────────────────────────────────────────────────────────────────

TOKEN = os.environ.get("OPS_BOT_TOKEN", "").strip()
CHAT_ID = os.environ.get("TELEGRAM_GROUP_CHAT_ID", "").strip()
_topic_raw = os.environ.get("TELEGRAM_TOPIC_LOGS", "").strip()
TOPIC_LOGS: Optional[int] = int(_topic_raw) if _topic_raw else None
CONTAINER_PREFIX = os.environ.get("CONTAINER_PREFIX", "efbazaar-")

POLL_TIMEOUT = 25
DOCKER_TIMEOUT = 30
TAIL_OPTIONS = [20, 50, 100, 200, 500, 1000]

if not TOKEN or not CHAT_ID:
    print("FATAL: OPS_BOT_TOKEN and TELEGRAM_GROUP_CHAT_ID are required", file=sys.stderr)
    sys.exit(2)

API = f"https://api.telegram.org/bot{TOKEN}"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("ops-bot")


# ─── Docker CLI wrappers ────────────────────────────────────────────────────

def docker_ps() -> list[str]:
    """Return sorted container names matching CONTAINER_PREFIX."""
    try:
        r = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}", "--filter", f"name={CONTAINER_PREFIX}"],
            capture_output=True, text=True, timeout=10,
        )
    except subprocess.TimeoutExpired:
        log.warning("docker ps timed out")
        return []
    except FileNotFoundError:
        log.error("docker CLI not on PATH")
        return []
    if r.returncode != 0:
        log.warning("docker ps exit=%s stderr=%s", r.returncode, r.stderr.strip())
        return []
    names = [n.strip() for n in r.stdout.splitlines() if n.strip().startswith(CONTAINER_PREFIX)]
    return sorted(names)


def docker_logs(container: str, tail: int) -> str:
    """Fetch merged stdout+stderr from `docker logs`. May be long."""
    r = subprocess.run(
        ["docker", "logs", "--tail", str(tail), "--timestamps", container],
        capture_output=True, text=True, timeout=DOCKER_TIMEOUT,
    )
    return (r.stdout or "") + (r.stderr or "")


# ─── Telegram wrappers ──────────────────────────────────────────────────────

def _post(method: str, **payload):
    try:
        r = requests.post(f"{API}/{method}", json=payload, timeout=30)
        j = r.json()
        if not j.get("ok"):
            log.warning("api %s error: %s", method, j)
            return None
        return j.get("result")
    except requests.RequestException as e:
        log.warning("api %s transport: %s", method, e)
        return None


def send_message(text: str, keyboard=None):
    p = {"chat_id": CHAT_ID, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    if TOPIC_LOGS:
        p["message_thread_id"] = TOPIC_LOGS
    if keyboard is not None:
        p["reply_markup"] = {"inline_keyboard": keyboard}
    return _post("sendMessage", **p)


def edit_message(chat_id, message_id, text, keyboard=None):
    p = {"chat_id": chat_id, "message_id": message_id, "text": text,
         "parse_mode": "HTML", "disable_web_page_preview": True}
    if keyboard is not None:
        p["reply_markup"] = {"inline_keyboard": keyboard}
    return _post("editMessageText", **p)


def answer_callback(callback_id, text=None):
    p = {"callback_query_id": callback_id}
    if text:
        p["text"] = text
    return _post("answerCallbackQuery", **p)


def send_document(content: bytes, filename: str, caption: str):
    data = {"chat_id": CHAT_ID, "caption": caption, "parse_mode": "HTML"}
    if TOPIC_LOGS:
        data["message_thread_id"] = TOPIC_LOGS
    files = {"document": (filename, content, "text/markdown")}
    try:
        r = requests.post(f"{API}/sendDocument", data=data, files=files, timeout=60)
        j = r.json()
        if not j.get("ok"):
            log.warning("sendDocument error: %s", j)
            return None
        return j.get("result")
    except requests.RequestException as e:
        log.warning("sendDocument transport: %s", e)
        return None


# ─── Keyboards ──────────────────────────────────────────────────────────────

def kb_services(containers: list[str]):
    kb = []
    for i in range(0, len(containers), 2):
        row = [{"text": containers[i], "callback_data": f"logs:svc:{containers[i]}"}]
        if i + 1 < len(containers):
            row.append({"text": containers[i + 1], "callback_data": f"logs:svc:{containers[i + 1]}"})
        kb.append(row)
    return kb


def kb_lines(container: str):
    kb = []
    for i in range(0, len(TAIL_OPTIONS), 2):
        row = [{"text": str(TAIL_OPTIONS[i]),
                "callback_data": f"logs:lines:{container}:{TAIL_OPTIONS[i]}"}]
        if i + 1 < len(TAIL_OPTIONS):
            row.append({"text": str(TAIL_OPTIONS[i + 1]),
                        "callback_data": f"logs:lines:{container}:{TAIL_OPTIONS[i + 1]}"})
        kb.append(row)
    kb.append([{"text": "◀ Ortga", "callback_data": "logs:back"}])
    return kb


# ─── Handlers ───────────────────────────────────────────────────────────────

def esc(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def header(n: int) -> str:
    return f"🗂 <b>Log ko'rish</b>\n{n} ta service topildi. Qaysi biri?"


def handle_logs_command():
    containers = docker_ps()
    if not containers:
        send_message("❌ Hech qanday container topilmadi.\n<i>docker daemon ishlayaptimi?</i>")
        return
    send_message(header(len(containers)), kb_services(containers))


def handle_callback(cb: dict):
    data = cb.get("data", "")
    if not data.startswith("logs:"):
        return
    cb_id = cb["id"]
    msg = cb["message"]
    chat_id = msg["chat"]["id"]
    message_id = msg["message_id"]

    parts = data.split(":", 3)
    action = parts[1] if len(parts) > 1 else ""

    if action == "back":
        containers = docker_ps()
        edit_message(chat_id, message_id, header(len(containers)), kb_services(containers))
        answer_callback(cb_id)
        return

    if action == "svc" and len(parts) >= 3:
        container = parts[2]
        containers = docker_ps()
        if container not in containers:
            answer_callback(cb_id, "Container endi mavjud emas")
            edit_message(chat_id, message_id, header(len(containers)), kb_services(containers))
            return
        edit_message(chat_id, message_id,
                     f"🗂 <b>{esc(container)}</b>\nNechta qator?", kb_lines(container))
        answer_callback(cb_id)
        return

    if action == "lines" and len(parts) >= 4:
        container = parts[2]
        try:
            tail = int(parts[3])
        except ValueError:
            tail = 200
        if container not in docker_ps():
            answer_callback(cb_id, "Container endi mavjud emas")
            return
        answer_callback(cb_id, "Yig'ilyapti…")
        send_logs(chat_id, message_id, container, tail)
        return


def send_logs(chat_id, message_id, container: str, tail: int):
    try:
        content = docker_logs(container, tail)
    except subprocess.TimeoutExpired:
        edit_message(chat_id, message_id,
                     f"❌ <b>{esc(container)}</b>: docker logs timed out", [])
        return
    except Exception as e:
        log.exception("docker logs failed")
        edit_message(chat_id, message_id,
                     f"❌ <b>{esc(container)}</b>: <code>{esc(str(e))}</code>", [])
        return

    ts = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    fname_ts = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    md = (
        f"# {container} — last {tail} lines\n"
        f"_Generated: {ts}_\n\n"
        f"```log\n"
        f"{content}"
        f"{'' if content.endswith(chr(10)) else chr(10)}"
        f"```\n"
    )
    filename = f"{container}-last-{tail}-{fname_ts}.md"
    caption = f"📄 <b>{esc(container)}</b> — oxirgi {tail} qator"

    edit_message(chat_id, message_id,
                 f"📤 <b>{esc(container)}</b> — {tail} qator yuborilmoqda…", [])

    if send_document(md.encode("utf-8"), filename, caption):
        edit_message(chat_id, message_id,
                     f"✅ <b>{esc(container)}</b> — {tail} qator yuborildi.", [])
    else:
        edit_message(chat_id, message_id,
                     f"❌ <b>{esc(container)}</b>: Telegram sendDocument xato ({len(md)} byte)", [])


# ─── Main loop ──────────────────────────────────────────────────────────────

def handle_update(upd: dict):
    if "callback_query" in upd:
        handle_callback(upd["callback_query"])
        return
    msg = upd.get("message") or {}
    text = msg.get("text", "")
    if text.startswith("/logs"):
        handle_logs_command()
    # Aksariyat boshqa xabarlar ignore — bot faqat /logs uchun.


def main():
    log.info("ops-bot starting: chat=%s topic=%s prefix=%s",
             CHAT_ID, TOPIC_LOGS, CONTAINER_PREFIX)
    # Startup notification — verifies token + topic wiring on every restart
    send_message("♻ <b>ops-bot ishga tushdi</b> — <code>/logs</code> tayyor.")

    offset = 0
    while True:
        try:
            r = requests.post(
                f"{API}/getUpdates",
                json={"offset": offset, "timeout": POLL_TIMEOUT,
                      "allowed_updates": ["message", "callback_query"]},
                timeout=POLL_TIMEOUT + 10,
            )
            data = r.json()
            if not data.get("ok"):
                log.warning("getUpdates error: %s", data)
                time.sleep(3)
                continue
            for upd in data["result"]:
                offset = max(offset, upd["update_id"] + 1)
                try:
                    handle_update(upd)
                except Exception:
                    log.exception("update handling failed")
        except requests.exceptions.Timeout:
            continue
        except requests.exceptions.RequestException as e:
            log.warning("transport error: %s", e)
            time.sleep(3)
        except Exception:
            log.exception("main loop error")
            time.sleep(3)


if __name__ == "__main__":
    main()
