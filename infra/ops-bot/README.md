# ops-bot — host-level /logs Telegram helper

Standalone bot that runs as a **systemd service on the host**. Independent of
docker-compose apps: uses `docker` CLI directly and long-polls the Telegram
Bot API. So `/logs` works **even when every app container has crashed**, as
long as the docker daemon itself is alive.

## Why a separate bot

Telegram lets exactly one consumer per token (`getUpdates` or webhook, not
both). The main `@EfBazaarBot` uses the webhook path via nginx, so this
host-level tool needs its **own token** — `@EfbazaarOpsBot`.

## Layout

| File | Purpose |
|------|---------|
| `ops-bot.py` | Python 3 script (only dep: `requests`) — long-polls, handles `/logs`, sends `.md` files |
| `ops-bot.service` | systemd unit, `Restart=always`, `After=docker.service` |
| `ops-bot.env.example` | env template — `OPS_BOT_TOKEN`, `TELEGRAM_GROUP_CHAT_ID`, `TELEGRAM_TOPIC_LOGS` |
| `install.sh` | One-shot bootstrap — installs deps + copies unit + enables service |

## First-time install (server) — BIR MAROTABA

Bu qadam faqat serverni birinchi tayyorlaganda kerak. Keyingi barcha
o'zgarishlar CI orqali avtomatik boradi.

```bash
cd /opt/efbazaar
sudo bash infra/ops-bot/install.sh
```

Bu skript:
- `python3` + `requests`ni tekshiradi/o'rnatadi
- `ops-bot.service`ni `/etc/systemd/system/`ga ko'chiradi
- Deploy user (`$SUDO_USER`) uchun **passwordless sudo rule** yaratadi
  (`/etc/sudoers.d/efbazaar-ops-bot`) — CI to'g'ridan-to'g'ri `systemctl restart`
  chaqira olsin
- `systemctl daemon-reload` + `enable`

`.env` mavjud bo'lmagani uchun servisni start qilmaydi — birinchi CI deploy
`.env`ni yozib, servisni ishga tushiradi.

## Har deploy'da nima bo'ladi (avtomatik)

`main`'ga push bo'lganda CI (`deploy.yml`) serverga SSH qiladi va
`deploy.sh`'dagi `sync_ops_bot()` funksiya bajaradi:

1. `infra/ops-bot/.env`ni GitHub Secrets'dan qayta yozadi
2. `ops-bot.service` o'zgargan bo'lsa `/etc/systemd/system/`ga ko'chiradi
   + `daemon-reload`
3. `sudo systemctl restart efbazaar-ops-bot` — har doim restart
   (ops-bot stateless, restart xavfsiz)
4. `is-active` bilan tekshiradi — muvaffaqiyatsiz bo'lsa deploy log'ida ogohlantiradi

## Verify

```bash
# Service status
systemctl status efbazaar-ops-bot

# Live logs
journalctl -u efbazaar-ops-bot -f

# Manual restart
sudo systemctl restart efbazaar-ops-bot
```

Ops-bot ishga tushganda `logs` topik'ga "♻ ops-bot ishga tushdi" xabar tashlaydi.

## Usage

Har qanday Telegram chat/topikda `@EfbazaarOpsBot` bo'lsa `/logs` yozing.
Service picker `logs` topik'da ochiladi — u yerdan tugmalar bilan
`docker container` va qator sonini tanlab, `.md` fayl olasiz.

## GitHub Secrets

Deploy workflow avtomatik ravishda `/etc/efbazaar/ops-bot.env`'ni yozadi
(agar CI'da sozlansa). Kerakli secretlar:

| Secret | Manbai |
|---|---|
| `OPS_BOT_TOKEN` | Yangi — BotFather'dan `@EfbazaarOpsBot` uchun |
| `TELEGRAM_GROUP_CHAT_ID` | Mavjud — bosh bot bilan bir xil |
| `TELEGRAM_TOPIC_LOGS` | Mavjud — bosh bot bilan bir xil |

## Troubleshooting

**Service startdan keyin darhol crash bo'lsa:**
```bash
journalctl -u efbazaar-ops-bot -n 50
```
Ko'p uchraydi: `OPS_BOT_TOKEN` bo'sh, yoki `TELEGRAM_GROUP_CHAT_ID` xato format.

**`/logs`ga hech nima kelmasa:**
1. Bot guruh ichida borligini tekshiring
2. Bot logs topik'ga xabar yozish huquqiga ega ekanini tekshiring (Manage Group → Members → bot → admin ✓)
3. `journalctl -u efbazaar-ops-bot -f` ochib qayta chaqirib ko'ring — polling xabarlari kelayaptimi?

**"Container endi mavjud emas" toast:**
Container to'xtab qolgan yoki nomi almashgan. `/logs` qayta chaqirsangiz ro'yxat yangilanadi.
