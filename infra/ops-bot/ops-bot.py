#!/usr/bin/env python3
"""
efBazaar ops-bot — host-level Telegram helper.

Runs as a systemd service on the host (see ops-bot.service). Independent of
docker-compose services: uses `docker` CLI directly and long-polls the
Telegram Bot API. Everything here keeps working when every app container has
crashed, so long as the docker daemon itself is alive.

Commands:
  /logs   — pick a docker service and a tail count, get a .md log file
  /health — full snapshot (host + all containers) into TELEGRAM_TOPIC_HEALTH

Background:
  Monitor thread (every 2 min) — posts alerts on:
    - container becomes unhealthy / exited / restarting
    - previously bad container recovers (green announcement)
    - host CPU > 85% sustained 5+ min
    - host memory > 90%
    - host disk > 85%
  Heartbeat (every 6h): compact "all green" if there were no alerts,
  so the channel proves the monitor is alive.

Config (env, loaded by systemd EnvironmentFile):
  OPS_BOT_TOKEN            — @EfbazaarOpsBot token
  TELEGRAM_GROUP_CHAT_ID   — supergroup id (negative)
  TELEGRAM_TOPIC_LOGS      — /logs replies here
  TELEGRAM_TOPIC_HEALTH    — /health and monitor alerts here
  CONTAINER_PREFIX         — docker ps filter (default: efbazaar-)
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import threading
import time
from typing import Optional

import requests

try:
    import psutil
except ImportError:
    print("FATAL: python3-psutil is required (apt install python3-psutil)", file=sys.stderr)
    sys.exit(2)


# ─── Config ────────────────────────────────────────────────────────────────

TOKEN = os.environ.get("OPS_BOT_TOKEN", "").strip()
CHAT_ID = os.environ.get("TELEGRAM_GROUP_CHAT_ID", "").strip()
_topic_logs = os.environ.get("TELEGRAM_TOPIC_LOGS", "").strip()
_topic_health = os.environ.get("TELEGRAM_TOPIC_HEALTH", "").strip()
TOPIC_LOGS: Optional[int] = int(_topic_logs) if _topic_logs else None
TOPIC_HEALTH: Optional[int] = int(_topic_health) if _topic_health else None
CONTAINER_PREFIX = os.environ.get("CONTAINER_PREFIX", "efbazaar-")

POLL_TIMEOUT = 25
DOCKER_TIMEOUT = 30
TAIL_OPTIONS = [20, 50, 100, 200, 500, 1000]

# Monitor thresholds
MONITOR_INTERVAL_SEC = 120        # tekshirish oralig'i
HEARTBEAT_INTERVAL_SEC = 6 * 3600 # "hammasi yashil" qisqa xabar
CPU_ALERT_PCT = 85
CPU_SUSTAINED_MIN = 5              # nechta ketma-ket tick'da >85% bo'lsa
MEM_ALERT_PCT = 90
DISK_ALERT_PCT = 85
CPU_SUSTAINED_TICKS = max(1, (CPU_SUSTAINED_MIN * 60) // MONITOR_INTERVAL_SEC)

if not TOKEN or not CHAT_ID:
    print("FATAL: OPS_BOT_TOKEN and TELEGRAM_GROUP_CHAT_ID are required", file=sys.stderr)
    sys.exit(2)

API = f"https://api.telegram.org/bot{TOKEN}"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("ops-bot")


# ─── Icons ─────────────────────────────────────────────────────────────────

def icon_pct(pct: float) -> str:
    if pct < 60: return "🟢"
    if pct < 85: return "🟡"
    return "🔴"

def icon_status(status: str) -> str:
    s = (status or "").lower()
    if "unhealthy" in s or "exited" in s or "dead" in s:
        return "🔴"
    if "restarting" in s or "starting" in s or "created" in s or "paused" in s:
        return "🟡"
    if "healthy" in s or s.startswith("up") or "running" in s:
        return "🟢"
    return "🔴"

def humanize_bytes(n: int) -> str:
    for unit in ("B", "K", "M", "G", "T"):
        if abs(n) < 1024:
            return f"{n:.0f}{unit}" if unit in ("B", "K") else f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}P"


# ─── Docker CLI wrappers ────────────────────────────────────────────────────

def _run(argv: list[str], timeout: int = 15) -> tuple[str, int]:
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        return (r.stdout or "") + (r.stderr or ""), r.returncode
    except subprocess.TimeoutExpired:
        return f"[timeout after {timeout}s]", 124
    except FileNotFoundError:
        return "[docker CLI missing]", 127

def docker_ps_running() -> list[str]:
    out, code = _run(
        ["docker", "ps", "--format", "{{.Names}}", "--filter", f"name={CONTAINER_PREFIX}"],
        timeout=10,
    )
    if code != 0:
        return []
    return sorted(n.strip() for n in out.splitlines()
                  if n.strip().startswith(CONTAINER_PREFIX))

def docker_ps_all_with_status() -> list[dict]:
    """Include stopped/exited containers (for /health)."""
    out, code = _run(
        ["docker", "ps", "-a",
         "--format", "{{.Names}}\t{{.Status}}\t{{.State}}",
         "--filter", f"name={CONTAINER_PREFIX}"],
        timeout=10,
    )
    if code != 0:
        return []
    items = []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) < 3: continue
        name, status, state = parts[0].strip(), parts[1].strip(), parts[2].strip()
        if name.startswith(CONTAINER_PREFIX):
            items.append({"name": name, "status": status, "state": state})
    return sorted(items, key=lambda x: x["name"])

def docker_stats_map() -> dict[str, dict]:
    """Return {name: {cpu_pct, mem_bytes, mem_pct}} for RUNNING containers."""
    out, code = _run(
        ["docker", "stats", "--no-stream",
         "--format", "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"],
        timeout=15,
    )
    if code != 0:
        return {}
    result: dict[str, dict] = {}
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) < 4: continue
        name = parts[0].strip()
        if not name.startswith(CONTAINER_PREFIX): continue
        try:
            cpu_pct = float(parts[1].rstrip("%").strip())
        except ValueError:
            cpu_pct = 0.0
        mem_used_str = parts[2].split("/")[0].strip()  # "112.5MiB" tarafi
        try:
            mem_pct = float(parts[3].rstrip("%").strip())
        except ValueError:
            mem_pct = 0.0
        result[name] = {"cpu_pct": cpu_pct, "mem_used": mem_used_str, "mem_pct": mem_pct}
    return result

def docker_logs(container: str, tail: int) -> str:
    r = subprocess.run(
        ["docker", "logs", "--tail", str(tail), "--timestamps", container],
        capture_output=True, text=True, timeout=DOCKER_TIMEOUT,
    )
    return (r.stdout or "") + (r.stderr or "")


# ─── Host stats (psutil) ────────────────────────────────────────────────────

def host_snapshot() -> dict:
    """Blocking ~1s for accurate cpu %."""
    cpu = psutil.cpu_percent(interval=1)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    return {
        "cpu_pct": cpu,
        "mem_pct": mem.percent,
        "mem_used": mem.used,
        "mem_total": mem.total,
        "disk_pct": disk.percent,
        "disk_used": disk.used,
        "disk_total": disk.total,
    }


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


def send_message(text: str, keyboard=None, topic: Optional[int] = None):
    p = {"chat_id": CHAT_ID, "text": text, "parse_mode": "HTML",
         "disable_web_page_preview": True}
    tid = topic if topic is not None else TOPIC_LOGS
    if tid: p["message_thread_id"] = tid
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
    if text: p["text"] = text
    return _post("answerCallbackQuery", **p)


def send_document(content: bytes, filename: str, caption: str, topic: Optional[int] = None):
    data = {"chat_id": CHAT_ID, "caption": caption, "parse_mode": "HTML"}
    tid = topic if topic is not None else TOPIC_LOGS
    if tid: data["message_thread_id"] = tid
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


# ─── Health snapshot ────────────────────────────────────────────────────────

def render_health_snapshot() -> str:
    host = host_snapshot()
    stats = docker_stats_map()
    containers = docker_ps_all_with_status()

    lines_host = [
        f"  CPU     {icon_pct(host['cpu_pct'])}  {host['cpu_pct']:>4.0f}%",
        f"  Memory  {icon_pct(host['mem_pct'])}  {host['mem_pct']:>4.0f}%  "
        f"({humanize_bytes(host['mem_used'])} / {humanize_bytes(host['mem_total'])})",
        f"  Disk    {icon_pct(host['disk_pct'])}  {host['disk_pct']:>4.0f}%  "
        f"({humanize_bytes(host['disk_used'])} / {humanize_bytes(host['disk_total'])})",
    ]

    lines_ctr = []
    for c in containers:
        name = c["name"]
        # trim prefix for compactness
        short = name[len(CONTAINER_PREFIX):] if name.startswith(CONTAINER_PREFIX) else name
        short = short[:16].ljust(16)
        st = c["status"]
        # extract just the state word after Up ... (healthy) etc.
        low = st.lower()
        if "unhealthy" in low: state_word = "unhealthy"
        elif "healthy" in low: state_word = "healthy"
        elif "restarting" in low: state_word = "restart"
        elif "starting" in low: state_word = "starting"
        elif "exited" in low: state_word = "exited"
        elif "up" in low: state_word = "running"
        else: state_word = c["state"] or "?"
        state_word = state_word.ljust(9)

        s = stats.get(name)
        if s:
            mem = s["mem_used"].rjust(8)
            cpu = f"{s['cpu_pct']:>4.1f}%"
        else:
            mem = "     — "
            cpu = "   — "
        lines_ctr.append(f"  {icon_status(st)} {short} {state_word} {mem}  {cpu}")

    # Overall icon: red if any container red OR any host metric red
    overall = "🟢"
    if any(x in "🔴" for x in [icon_pct(host['cpu_pct']),
                                 icon_pct(host['mem_pct']),
                                 icon_pct(host['disk_pct'])]) \
       or any("🔴" in line for line in lines_ctr):
        overall = "🔴"
    elif any(x == "🟡" for x in [icon_pct(host['cpu_pct']),
                                    icon_pct(host['mem_pct']),
                                    icon_pct(host['disk_pct'])]) \
         or any("🟡" in line for line in lines_ctr):
        overall = "🟡"

    ts = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    header = f"{overall} <b>System Health</b> — {ts}"
    body = (
        "📊 <b>Host</b>\n"
        + "\n".join(lines_host)
        + f"\n\n📦 <b>Containers</b> ({len(containers)})\n"
        + "\n".join(lines_ctr)
    )
    return header + "\n\n<pre>" + body + "</pre>"


# ─── Monitor thread (thresholds + heartbeat) ────────────────────────────────

class MonitorState:
    def __init__(self):
        self.bad_containers: dict[str, str] = {}   # name -> last-known status
        self.cpu_over_ticks: int = 0
        self.alerted_cpu = False
        self.alerted_mem = False
        self.alerted_disk = False
        self.last_heartbeat = 0.0
        self.alerts_since_heartbeat = 0

def _is_container_bad(status: str) -> Optional[str]:
    low = status.lower()
    if "unhealthy" in low: return "unhealthy"
    if "restarting" in low: return "restarting"
    if "exited" in low or "dead" in low: return "exited"
    return None

def monitor_tick(state: MonitorState):
    now = time.time()

    # Containers — compare against last known state
    containers = docker_ps_all_with_status()
    seen = {}
    for c in containers:
        bad = _is_container_bad(c["status"])
        if bad:
            seen[c["name"]] = bad

    # New bad — alert
    for name, bad in seen.items():
        prev = state.bad_containers.get(name)
        if prev != bad:
            send_message(
                f"🔴 <b>{name}</b> — <code>{bad}</code>\n<i>{c_status_lookup(containers, name)}</i>",
                topic=TOPIC_HEALTH,
            )
            state.alerts_since_heartbeat += 1
    # Recovered — announce
    for name in list(state.bad_containers):
        if name not in seen:
            send_message(f"🟢 <b>{name}</b> — tiklandi (healthy)", topic=TOPIC_HEALTH)
            state.alerts_since_heartbeat += 1
    state.bad_containers = seen

    # Host — CPU (sustained), Memory, Disk
    host = host_snapshot()
    if host["cpu_pct"] >= CPU_ALERT_PCT:
        state.cpu_over_ticks += 1
    else:
        if state.alerted_cpu:
            send_message(f"🟢 CPU tiklandi ({host['cpu_pct']:.0f}%)", topic=TOPIC_HEALTH)
            state.alerts_since_heartbeat += 1
        state.cpu_over_ticks = 0
        state.alerted_cpu = False

    if state.cpu_over_ticks >= CPU_SUSTAINED_TICKS and not state.alerted_cpu:
        send_message(
            f"🔴 <b>CPU {host['cpu_pct']:.0f}%</b> — {CPU_SUSTAINED_MIN}+ daqiqa davomida yuqori",
            topic=TOPIC_HEALTH,
        )
        state.alerted_cpu = True
        state.alerts_since_heartbeat += 1

    if host["mem_pct"] >= MEM_ALERT_PCT and not state.alerted_mem:
        send_message(
            f"🔴 <b>Memory {host['mem_pct']:.0f}%</b> "
            f"({humanize_bytes(host['mem_used'])} / {humanize_bytes(host['mem_total'])})",
            topic=TOPIC_HEALTH,
        )
        state.alerted_mem = True
        state.alerts_since_heartbeat += 1
    elif host["mem_pct"] < MEM_ALERT_PCT - 5 and state.alerted_mem:
        send_message(f"🟢 Memory tiklandi ({host['mem_pct']:.0f}%)", topic=TOPIC_HEALTH)
        state.alerted_mem = False
        state.alerts_since_heartbeat += 1

    if host["disk_pct"] >= DISK_ALERT_PCT and not state.alerted_disk:
        send_message(
            f"🔴 <b>Disk {host['disk_pct']:.0f}%</b> "
            f"({humanize_bytes(host['disk_used'])} / {humanize_bytes(host['disk_total'])})",
            topic=TOPIC_HEALTH,
        )
        state.alerted_disk = True
        state.alerts_since_heartbeat += 1
    elif host["disk_pct"] < DISK_ALERT_PCT - 5 and state.alerted_disk:
        send_message(f"🟢 Disk tiklandi ({host['disk_pct']:.0f}%)", topic=TOPIC_HEALTH)
        state.alerted_disk = False
        state.alerts_since_heartbeat += 1

    # Heartbeat every N seconds — proof-of-life if no alerts were sent
    if now - state.last_heartbeat >= HEARTBEAT_INTERVAL_SEC:
        if state.alerts_since_heartbeat == 0:
            up_ctr = sum(1 for c in containers if not _is_container_bad(c["status"]))
            send_message(
                f"🟢 <b>Heartbeat</b> — hammasi joyida "
                f"(containers {up_ctr}/{len(containers)}, "
                f"CPU {host['cpu_pct']:.0f}%, MEM {host['mem_pct']:.0f}%, "
                f"DISK {host['disk_pct']:.0f}%)",
                topic=TOPIC_HEALTH,
            )
        state.last_heartbeat = now
        state.alerts_since_heartbeat = 0

def c_status_lookup(containers, name):
    for c in containers:
        if c["name"] == name:
            return c["status"]
    return ""

def monitor_loop():
    if not TOPIC_HEALTH:
        log.warning("TELEGRAM_TOPIC_HEALTH not set — monitor thread disabled")
        return
    log.info("monitor thread started (interval=%ss, heartbeat=%sh)",
             MONITOR_INTERVAL_SEC, HEARTBEAT_INTERVAL_SEC // 3600)
    state = MonitorState()
    while True:
        try:
            monitor_tick(state)
        except Exception:
            log.exception("monitor tick failed")
        time.sleep(MONITOR_INTERVAL_SEC)


# ─── /logs — keyboards + handlers ──────────────────────────────────────────

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

def _logs_header(n: int) -> str:
    return f"🗂 <b>Log ko'rish</b>\n{n} ta service topildi. Qaysi biri?"

def handle_logs_command():
    containers = docker_ps_running()
    if not containers:
        send_message("❌ Hech qanday container topilmadi.", topic=TOPIC_LOGS)
        return
    send_message(_logs_header(len(containers)), kb_services(containers), topic=TOPIC_LOGS)

def esc(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def _send_logs_file(chat_id, message_id, container: str, tail: int):
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
    if send_document(md.encode("utf-8"), filename, caption, topic=TOPIC_LOGS):
        edit_message(chat_id, message_id,
                     f"✅ <b>{esc(container)}</b> — {tail} qator yuborildi.", [])
    else:
        edit_message(chat_id, message_id,
                     f"❌ <b>{esc(container)}</b>: Telegram sendDocument xato ({len(md)} byte)", [])


# ─── /health — handler ─────────────────────────────────────────────────────

def handle_health_command():
    if not TOPIC_HEALTH:
        send_message("❌ TELEGRAM_TOPIC_HEALTH sozlanmagan.", topic=TOPIC_LOGS)
        return
    send_message(render_health_snapshot(), topic=TOPIC_HEALTH)


# ─── Callback dispatcher ────────────────────────────────────────────────────

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
        containers = docker_ps_running()
        edit_message(chat_id, message_id, _logs_header(len(containers)), kb_services(containers))
        answer_callback(cb_id)
        return

    if action == "svc" and len(parts) >= 3:
        container = parts[2]
        containers = docker_ps_running()
        if container not in containers:
            answer_callback(cb_id, "Container endi mavjud emas")
            edit_message(chat_id, message_id, _logs_header(len(containers)), kb_services(containers))
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
        if container not in docker_ps_running():
            answer_callback(cb_id, "Container endi mavjud emas")
            return
        answer_callback(cb_id, "Yig'ilyapti…")
        _send_logs_file(chat_id, message_id, container, tail)


# ─── Main loop ──────────────────────────────────────────────────────────────

def handle_update(upd: dict):
    if "callback_query" in upd:
        handle_callback(upd["callback_query"])
        return
    msg = upd.get("message") or {}
    text = msg.get("text", "")
    if text.startswith("/logs"):
        handle_logs_command()
    elif text.startswith("/health"):
        handle_health_command()

def main():
    log.info("ops-bot starting: chat=%s topic_logs=%s topic_health=%s prefix=%s",
             CHAT_ID, TOPIC_LOGS, TOPIC_HEALTH, CONTAINER_PREFIX)
    send_message("♻ <b>ops-bot ishga tushdi</b> — /logs, /health tayyor.",
                 topic=TOPIC_LOGS)

    # Monitor thread — background health checks + heartbeat
    threading.Thread(target=monitor_loop, name="monitor", daemon=True).start()

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
