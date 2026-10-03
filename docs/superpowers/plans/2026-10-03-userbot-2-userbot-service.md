# Userbot 2/3 — userbot-service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `humo-userbot` ni `userbot-service` ga aylantirish: bir nechta Telegram akkountini Postgres'dagi shifrlangan sessiyalardan yuritadigan, panel API orqali login/uzish/biriktirishni beradigan, payment kuzatuvini alohida container'da catch-up va navbat bilan ishlatadigan servis.

**Architecture:** Bitta Python image, ikki entrypoint: `userbot-core` (FastAPI panel API + login + payment'ga biriktirilmagan akkountlar) va `userbot-payment` (faqat `PAYMENT` akkounti, Humo kuzatuvi, heartbeat, legacy import). Ikkalasi `userbot_db` dagi akkount, binding va lease jadvallarini ishlatadi; har akkount faqat lease olgan runner'da ishlaydi. Pyrogram ikki port (`LoginGateway`, `AccountClient`) orqasida — mantiq Telegram'siz test qilinadi.

**Tech Stack:** Python 3.12, Pyrogram 2.0.106, FastAPI + uvicorn, SQLAlchemy 2 async (Core) + asyncpg, Alembic, cryptography (AES-GCM), aiokafka, pytest + pytest-asyncio + testcontainers[postgres] + httpx.

**Spec:** `docs/superpowers/specs/2026-10-02-userbot-management-design.md`

**Oldin:** 1-reja (`2026-10-03-userbot-1-payment-idempotency.md`) `main` ga merge va deploy qilingan bo'lishi shart — bu servis `userbotTelegramId` yuboradi.

## Global Constraints

- Python 3.12 (`.python-version`). Lokal muhit: `cd userbot-service && uv venv -p 3.12 .venv && . .venv/bin/activate && uv pip install -r requirements-dev.txt`.
- Tekshiruv (AGENTS.md): `ruff check userbot_service/ tests/`, `pytest -q`, `docker build -t userbot-service:ci .`. DB testlari Docker talab qiladi (testcontainers).
- Pyrogram `Client` **hech qachon import vaqtida** yaratilmaydi — faqat ishlab turgan event loop ichida (Dispatcher `asyncio.get_event_loop()` ni konstruktorda ushlaydi; eski `main.py` dagi izohga qarang). Task 5 testi shuni pinlaydi.
- `pyrogram.errors.SessionPasswordNeeded` `Unauthorized` ning **voris**i. Runner'da "sessiya o'ldi" deb `Unauthorized` ushlanganda u istisno qilinadi.
- Sessiya satri, telefon raqami (to'liq), kod va parol hech qachon logga yozilmaydi va API javobida qaytmaydi.
- Payment idempotency kaliti `(userbotTelegramId, telegramMessageId)`; payload kalitlari Java record bilan shartnoma — `tests/test_wire_format.py` pinlaydi.
- Kafka payload'lari header'siz oddiy JSON (mavjud konvensiya).
- DB nomi `userbot_db` (`USERBOT_DB_NAME`), HTTP port `8089`, sessiya kaliti `USERBOT_SESSION_KEY` (base64, 32 bayt).
- Alembic revision'lari immutable (merge'dan keyin edit yo'q).
- Commit xabarlariga Claude imzosi / Co-Authored-By qo'shilmaydi.

## Review Focus

- **Deploy paytida eski va yangi container bir vaqtda bitta auth key bilan** — `AUTH_KEY_DUPLICATED` payment sessiyasini o'ldiradi. `deploy.sh` eski containerni `up -d` dan oldin o'chiradi (Task 11 qadami + `bash -n` tekshiruvi).
- **Import qilingan akkount uchun tarix qayta o'ynalsa** — eski `NULL` qatorlar bilan to'qnashmay ikki marta kredit. Importdan keyin `humo_watch_state` eng oxirgi xabarga o'rnatilishi (Task 9 testi `test_import_does_not_replay_history`).
- **Lease uzaytirilmasa client ishlashda davom etsa** — boshqa runner olib, ikki joyda ishlaydi. DB 20 s dan ortiq yo'q bo'lsa barcha clientlar to'xtashi (Task 8 testi `test_db_outage_stops_every_client`).
- **Login muvaffaqiyatli, lekin akkount allaqachon ACTIVE** — yangi yaratilgan Telegram sessiyasi osilib qolmasligi, `log_out` qilinishi (Task 6 testi `test_already_connected_logs_the_new_session_out`).
- **`X-User-Roles` da `ROLE_ADMIN` bo'sh joy bilan yoki boshqa rollar orasida** (`"ROLE_USER, ROLE_ADMIN"`) — kirishga ruxsat; `ROLE_TRADE_ADMIN` — 403 (Task 10 testlari).

---

## File Structure

```
userbot-service/                       (git mv humo-userbot)
├── Dockerfile                         ← ikki entrypoint, alembic
├── README.md, CLAUDE.md
├── alembic.ini
├── requirements.txt, requirements-dev.txt, pyproject.toml
├── userbot_service/
│   ├── config.py                      Settings (+DB, runner, key, port, avatar dir)
│   ├── crypto.py                      SessionCipher (AES-GCM)
│   ├── phone.py                       normalize_phone, mask_phone
│   ├── errors.py                      domen xatolari (ApiError ierarxiyasi)
│   ├── features.py                    FEATURES = {"PAYMENT": ...}
│   ├── db/schema.py                   SQLAlchemy Core jadvallari
│   ├── db/engine.py                   make_engine
│   ├── db/migrations/                 alembic env.py + versions/0001_initial.py
│   ├── repository.py                  AccountRepository (akkount, binding, audit)
│   ├── lease.py                       LeaseStore
│   ├── telegram/ports.py              Me, Msg, CodeSent, TelegramError, PasswordNeeded, SessionDead, LoginGateway, AccountClient
│   ├── telegram/pyrogram_adapter.py   PyrogramLoginGateway, PyrogramAccountClient, PyrogramLegacySession
│   ├── login.py                       LoginService
│   ├── payment/observation.py         observation_for (sof)
│   ├── payment/queue.py               PendingQueue
│   ├── payment/watcher.py             HumoWatcher
│   ├── supervisor.py                  Supervisor
│   ├── importer.py                    import_legacy_session
│   ├── api.py                         create_app (FastAPI)
│   ├── main_core.py, main_payment.py  entrypointlar
│   ├── parser.py, kafka_client.py, observability/   (mavjud)
└── tests/
    ├── conftest.py                    postgres container, engine, cipher, repo fixture'lari
    ├── fakes.py                       FakeLoginGateway, FakeAccountClient, FakeKafka
    └── test_*.py
```

`main.py` (eski bitta-akkountli entrypoint) Task 7 da o'chiriladi.

---

### Task 1: Papka va paketni qayta nomlash, CI yo'llari

**Files:**
- Move: `humo-userbot/` → `userbot-service/`, `humo_userbot/` → `userbot_service/`
- Modify: barcha `tests/*.py` importlari, `pyproject.toml`, `Dockerfile`, `.github/workflows/ci.yml`, `.github/workflows/build.yml`, `AGENTS.md`, `.gitignore`

**Interfaces:**
- Produces: paket `userbot_service` (eski modullar o'z nomlari bilan).

- [ ] **Step 1: Ko'chirish**

```bash
cd /home/mukhiddinov/IdeaProjects/ef-bazaar
git mv humo-userbot userbot-service
git mv userbot-service/humo_userbot userbot-service/userbot_service
grep -rl "humo_userbot" userbot-service | xargs sed -i 's/humo_userbot/userbot_service/g'
sed -i 's/^name = "humo-userbot"/name = "userbot-service"/' userbot-service/pyproject.toml
```

- [ ] **Step 2: CI va build**

`.github/workflows/ci.yml`:
- `humo-userbot: ${{ steps.filter.outputs['humo-userbot'] }}` → `userbot-service: ${{ steps.filter.outputs['userbot-service'] }}`
- `set_output humo-userbot   'humo-userbot/'` → `set_output userbot-service 'userbot-service/'`
- `add_py` qatori → `if [ "${{ steps.filter.outputs['userbot-service'] }}" = "true" ]; then add_py userbot-service userbot-service userbot_service true; fi`

`.github/workflows/build.yml`:
- filter: `humo-userbot:` / `'humo-userbot/**'` → `userbot-service:` / `'userbot-service/**'`
- matrix: `if changed "${{ steps.filter.outputs['userbot-service'] }}"; then add userbot-service userbot-service userbot-service/Dockerfile userbot-service; fi`

`AGENTS.md` jadvalidagi qator:
```
| `userbot-service/` | Python 3.12, dependencies from `requirements-dev.txt`; `ruff check userbot_service/ tests/`, `pytest -q` (Docker kerak — testcontainers), and `docker build -t userbot-service:ci .`. |
```
`.gitignore` dagi `humo-userbot` izohini `userbot-service` ga o'zgartiring (`*.session` qoidasi qoladi).

`grep -rn "set_output\|filter" .github/workflows/ci.yml | grep -n userbot` bilan tekshiring — `humo` qolmasin:
```bash
grep -rn "humo-userbot\|humo_userbot" .github AGENTS.md .gitignore
```
Expected: hech narsa.

- [ ] **Step 3: Testlar o'zgarishsiz o'tadi**

```bash
cd userbot-service && uv venv -p 3.12 .venv && . .venv/bin/activate && uv pip install -r requirements-dev.txt
ruff check userbot_service/ tests/ && pytest -q
```
Expected: PASS (barcha mavjud testlar).

- [ ] **Step 4: Commit**

```bash
git add -A userbot-service humo-userbot .github AGENTS.md .gitignore
git commit -m "refactor(userbot): humo-userbot → userbot-service"
```

(docker-compose, deploy.sh, deploy.yml Task 11 da — shu orada `build.yml` yangi image nomini quradi, compose eski nomni kutadi; branch merge bo'lmaguncha bu muammo emas.)

---

### Task 2: Config, shifrlash, telefon, xatolar, vazifalar

**Files:**
- Modify: `userbot-service/userbot_service/config.py`
- Create: `userbot-service/userbot_service/crypto.py`, `phone.py`, `errors.py`, `features.py`
- Modify: `userbot-service/requirements.txt`, `requirements-dev.txt`
- Test: `userbot-service/tests/test_crypto.py`, `tests/test_phone.py`, `tests/test_settings.py`

**Interfaces:**
- Produces:
  - `Settings` maydonlari: `runner: Literal["core","payment"]`, `postgres_host/port/user/password/db`, `session_key`, `http_port=8089`, `avatar_dir="/avatars"`, `database_url` property; eskilari saqlanadi.
  - `SessionCipher(key_b64: str)`, `.encrypt(plaintext: str) -> tuple[bytes, bytes]` (ciphertext, iv), `.decrypt(ciphertext: bytes, iv: bytes) -> str`.
  - `normalize_phone(raw: str) -> str` ("+998901234567"; xato bo'lsa `ApiError("PHONE_INVALID")`), `mask_phone(digits: str) -> str`.
  - `ApiError(code: str, **params)` — `.status`, `.message`, `.params`; `MESSAGES` lug'ati.
  - `FEATURES: dict[str, str]` = `{"PAYMENT": "To'lovlarni kuzatish (Humo karta)"}`.

- [ ] **Step 1: Bog'liqliklar**

`requirements.txt` oxiriga:
```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy[asyncio]==2.0.35
asyncpg==0.29.0
alembic==1.13.3
cryptography==43.0.1
```
`requirements-dev.txt` oxiriga:
```
testcontainers[postgres]==4.8.1
httpx==0.27.2
psycopg2-binary==2.9.9
```
(`psycopg2-binary` faqat testcontainers'ning `PostgresContainer` health-check'i uchun.)

```bash
uv pip install -r requirements-dev.txt
```

- [ ] **Step 2: Yiqiluvchi testlar**

`tests/test_crypto.py`:
```python
import base64
import os

import pytest

from userbot_service.crypto import SessionCipher

KEY = base64.b64encode(os.urandom(32)).decode()


def test_a_session_string_round_trips():
    cipher = SessionCipher(KEY)
    ciphertext, iv = cipher.encrypt("BAADsession")
    assert cipher.decrypt(ciphertext, iv) == "BAADsession"


def test_the_ciphertext_does_not_contain_the_plaintext():
    ciphertext, _ = SessionCipher(KEY).encrypt("BAADsession")
    assert b"BAADsession" not in ciphertext


def test_every_encryption_uses_a_fresh_iv():
    cipher = SessionCipher(KEY)
    assert cipher.encrypt("x")[1] != cipher.encrypt("x")[1]


def test_a_wrong_key_cannot_decrypt():
    ciphertext, iv = SessionCipher(KEY).encrypt("secret")
    other = SessionCipher(base64.b64encode(os.urandom(32)).decode())
    with pytest.raises(Exception):
        other.decrypt(ciphertext, iv)


@pytest.mark.parametrize("bad", ["", "not-base64!!", base64.b64encode(b"short").decode()])
def test_a_key_that_is_not_32_bytes_is_refused_at_startup(bad):
    with pytest.raises(ValueError, match="USERBOT_SESSION_KEY"):
        SessionCipher(bad)
```

`tests/test_phone.py`:
```python
import pytest

from userbot_service.errors import ApiError
from userbot_service.phone import mask_phone, normalize_phone


@pytest.mark.parametrize("raw", ["+998 90 123 45 67", "998901234567", " +998-90-123-45-67 "])
def test_formatting_is_stripped_and_a_plus_is_added(raw):
    assert normalize_phone(raw) == "+998901234567"


@pytest.mark.parametrize("raw", ["", "+", "abc", "+12", "+1234567890123456"])
def test_an_impossible_number_is_refused_before_telegram_sees_it(raw):
    with pytest.raises(ApiError) as e:
        normalize_phone(raw)
    assert e.value.code == "PHONE_INVALID"


def test_only_the_country_code_and_the_last_two_digits_stay_visible():
    assert mask_phone("998901234567") == "+998 ******* 67"


def test_a_short_number_is_masked_entirely():
    assert mask_phone("1234") == "+****"
```

`tests/test_settings.py`:
```python
import base64
import os

from userbot_service.config import Settings

ENV = {
    "TELEGRAM_API_ID": "1",
    "TELEGRAM_API_HASH": "h",
    "KAFKA_BOOTSTRAP_SERVERS": "kafka:9092",
    "RUNNER": "core",
    "POSTGRES_HOST": "postgres",
    "POSTGRES_USER": "efbazaar",
    "POSTGRES_PASSWORD": "p@ss/word",
    "USERBOT_SESSION_KEY": base64.b64encode(os.urandom(32)).decode(),
}


def test_the_database_url_escapes_the_password(monkeypatch):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    s = Settings()
    assert s.database_url == "postgresql+asyncpg://efbazaar:p%40ss%2Fword@postgres:5432/userbot_db"
    assert s.http_port == 8089
```

- [ ] **Step 3: Yiqilishini tekshirish**

Run: `pytest tests/test_crypto.py tests/test_phone.py tests/test_settings.py -q`
Expected: FAIL — `ModuleNotFoundError: userbot_service.crypto`.

- [ ] **Step 4: Amalga oshirish**

`userbot_service/errors.py`:
```python
"""API-facing domain errors. One class, keyed by code, so the HTTP layer maps
them in one place and the Uzbek wording lives next to the code it explains."""

from __future__ import annotations

MESSAGES: dict[str, tuple[int, str]] = {
    "FORBIDDEN": (403, "Bu bo'lim faqat adminlar uchun."),
    "PHONE_INVALID": (400, "Telefon raqami noto'g'ri."),
    "PHONE_NOT_REGISTERED": (400, "Bu raqamda Telegram akkounti yo'q."),
    "PHONE_BANNED": (400, "Bu raqam Telegram tomonidan bloklangan."),
    "CODE_INVALID": (400, "Kod noto'g'ri."),
    "CODE_EXPIRED": (400, "Kodning muddati tugadi. Kodni qayta yuboring."),
    "PASSWORD_INVALID": (400, "Parol noto'g'ri."),
    "FLOOD_WAIT": (429, "Telegram urinishlarni vaqtincha to'xtatdi. {retryAfterSec} soniyadan keyin urinib ko'ring."),
    "TOO_MANY_LOGINS": (429, "Bir vaqtda juda ko'p login ochilgan. Birozdan keyin urinib ko'ring."),
    "LOGIN_GONE": (410, "Login muddati yoki urinishlar tugadi. Boshidan boshlang."),
    "ALREADY_CONNECTED": (409, "Bu Telegram akkounti allaqachon ulangan."),
    "ACCOUNT_BOUND": (409, "Bu userbot {features} vazifasiga biriktirilgan. Avval vazifani boshqa userbotga o'tkazing."),
    "ACCOUNT_NOT_ACTIVE": (409, "Faqat faol userbotni vazifaga biriktirish mumkin."),
    "ACCOUNT_BUSY": (409, "Userbot hozir boshqa jarayonda band. Bir necha soniyadan keyin qayta urinib ko'ring."),
    "ACCOUNT_NOT_FOUND": (404, "Userbot topilmadi."),
    "UNKNOWN_FEATURE": (404, "Bunday vazifa yo'q."),
    "TELEGRAM_ERROR": (502, "Telegram xatosi. Qayta urinib ko'ring."),
}


class ApiError(Exception):
    def __init__(self, code: str, **params: object) -> None:
        status, template = MESSAGES[code]
        super().__init__(code)
        self.code = code
        self.status = status
        self.params = params
        self.message = template.format(**params)
```

`userbot_service/phone.py`:
```python
from __future__ import annotations

import re

from userbot_service.errors import ApiError


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"[\s\-()+]", "", raw or "")
    if not digits.isdigit() or not 7 <= len(digits) <= 15:
        raise ApiError("PHONE_INVALID")
    return "+" + digits


def mask_phone(digits: str) -> str:
    """'998901234567' → '+998 ******* 67'. Shown on admin screens; the full
    number is never stored."""
    digits = digits.lstrip("+")
    if len(digits) < 6:
        return "+" + "*" * len(digits)
    return f"+{digits[:3]} {'*' * (len(digits) - 5)} {digits[-2:]}"
```

`userbot_service/crypto.py`:
```python
"""AES-GCM for session strings. A session string is full control of a
Telegram account, so it is only ever at rest encrypted."""

from __future__ import annotations

import base64
import binascii
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class SessionCipher:
    def __init__(self, key_b64: str) -> None:
        try:
            key = base64.b64decode(key_b64, validate=True)
        except (binascii.Error, ValueError) as e:
            raise ValueError("USERBOT_SESSION_KEY is not valid base64") from e
        if len(key) != 32:
            raise ValueError("USERBOT_SESSION_KEY must decode to 32 bytes (openssl rand -base64 32)")
        self._aes = AESGCM(key)

    def encrypt(self, plaintext: str) -> tuple[bytes, bytes]:
        iv = os.urandom(12)
        return self._aes.encrypt(iv, plaintext.encode("utf-8"), None), iv

    def decrypt(self, ciphertext: bytes, iv: bytes) -> str:
        return self._aes.decrypt(iv, ciphertext, None).decode("utf-8")
```

`userbot_service/features.py`:
```python
"""Jobs a userbot account can be bound to. Each feature has at most one
account; one account may serve several features."""

PAYMENT = "PAYMENT"

FEATURES: dict[str, str] = {
    PAYMENT: "To'lovlarni kuzatish (Humo karta)",
}
```

`userbot_service/config.py` — `Settings` klassiga qo'shing (mavjud maydonlar va `as_chat_ref` saqlanadi; `telegram_session_dir` defaulti `/session` ga o'zgaradi):
```python
from typing import Literal
from urllib.parse import quote

    runner: Literal["core", "payment"] = Field(alias="RUNNER")

    postgres_host: str = Field(alias="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, alias="POSTGRES_PORT")
    postgres_user: str = Field(alias="POSTGRES_USER")
    postgres_password: str = Field(alias="POSTGRES_PASSWORD")
    postgres_db: str = Field(default="userbot_db", alias="POSTGRES_DB")

    # base64 of 32 random bytes; `openssl rand -base64 32`. Losing it makes
    # every stored session unreadable — the accounts must then be re-connected.
    session_key: str = Field(alias="USERBOT_SESSION_KEY")

    http_port: int = Field(default=8089, alias="HTTP_PORT")
    avatar_dir: str = Field(default="/avatars", alias="AVATAR_DIR")

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{quote(self.postgres_user, safe='')}:"
            f"{quote(self.postgres_password, safe='')}@{self.postgres_host}:"
            f"{self.postgres_port}/{self.postgres_db}"
        )
```

- [ ] **Step 5: O'tishini tekshirish**

Run: `pytest -q && ruff check userbot_service/ tests/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add userbot-service
git commit -m "feat(userbot): sozlamalar, sessiya shifrlash, telefon maskalash, xato kodlari"
```

---

### Task 3: DB sxemasi, Alembic, AccountRepository

**Files:**
- Create: `userbot_service/db/__init__.py`, `db/schema.py`, `db/engine.py`, `db/migrations/env.py`, `db/migrations/script.py.mako`, `db/migrations/versions/0001_initial.py`, `alembic.ini`, `userbot_service/repository.py`
- Create: `tests/conftest.py`
- Test: `tests/test_repository.py`

**Interfaces:**
- Consumes: `SessionCipher`, `ApiError`, `mask_phone`, `FEATURES`.
- Produces:
  - `make_engine(url: str) -> AsyncEngine`; `run_migrations(url: str) -> None` (sync; advisory lock ichida `alembic upgrade head`).
  - `@dataclass(frozen=True) Account(id: UUID, telegram_user_id: int, first_name: str, last_name: str | None, username: str | None, phone_masked: str, status: str, status_reason: str | None, source: str, connected_by: UUID | None, connected_at: datetime)`
  - `AccountRepository(engine, cipher)`:
    - `upsert_connected(*, me: Me, session_string: str, source: str, actor: UUID | None, bind_feature: str | None = None) -> Account` — `ACTIVE` bo'lsa `ApiError("ALREADY_CONNECTED")`.
    - `get(account_id) -> Account` (yo'q → `ApiError("ACCOUNT_NOT_FOUND")`), `find_by_telegram_id(tg_id) -> Account | None`, `list() -> list[Account]`
    - `session_string(account_id) -> str`
    - `mark_revoked(account_id, reason: str) -> None`, `mark_disconnected(account_id, actor) -> None`
    - `active_ids() -> set[UUID]`
    - `bindings() -> dict[str, UUID]`, `features_of(account_id) -> list[str]`
    - `bind(feature, account_id, actor) -> None` (noma'lum → `UNKNOWN_FEATURE`, faol emas → `ACCOUNT_NOT_ACTIVE`)
  - `Me` Task 5 dagi port'dan keladi; bu task uchun `telegram/ports.py` dagi `Me` dataclass'ini **shu taskda** yarating (Task 5 uni to'ldiradi):
    ```python
    @dataclass(frozen=True)
    class Me:
        telegram_user_id: int
        first_name: str
        last_name: str | None
        username: str | None
        phone: str          # raqamlar, '+' siz
    ```
  - Test fixture'lari (`tests/conftest.py`): `engine` (har test uchun toza jadvallar), `cipher`, `repo`.

- [ ] **Step 1: Sxema**

`userbot_service/db/schema.py`:
```python
from sqlalchemy import (
    BigInteger, Column, DateTime, ForeignKey, Identity, LargeBinary, MetaData, Table, Text, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

metadata = MetaData()

accounts = Table(
    "userbot_accounts", metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("telegram_user_id", BigInteger, nullable=False, unique=True),
    Column("first_name", Text, nullable=False),
    Column("last_name", Text),
    Column("username", Text),
    Column("phone_masked", Text, nullable=False),
    Column("session_ciphertext", LargeBinary, nullable=False),
    Column("session_iv", LargeBinary, nullable=False),
    Column("status", Text, nullable=False),
    Column("source", Text, nullable=False),
    Column("connected_by", UUID(as_uuid=True)),
    Column("connected_at", DateTime(timezone=True), nullable=False),
    Column("status_changed_at", DateTime(timezone=True), nullable=False),
    Column("status_reason", Text),
)

bindings = Table(
    "userbot_bindings", metadata,
    Column("feature", Text, primary_key=True),
    Column("account_id", UUID(as_uuid=True), ForeignKey("userbot_accounts.id"), nullable=False),
    Column("bound_by", UUID(as_uuid=True)),
    Column("bound_at", DateTime(timezone=True), nullable=False),
)

leases = Table(
    "userbot_leases", metadata,
    Column("account_id", UUID(as_uuid=True),
           ForeignKey("userbot_accounts.id", ondelete="CASCADE"), primary_key=True),
    Column("runner", Text, nullable=False),
    Column("lease_until", DateTime(timezone=True), nullable=False),
    Column("last_heartbeat", DateTime(timezone=True), nullable=False),
)

humo_watch_state = Table(
    "humo_watch_state", metadata,
    Column("account_id", UUID(as_uuid=True),
           ForeignKey("userbot_accounts.id", ondelete="CASCADE"), primary_key=True),
    Column("last_message_id", BigInteger, nullable=False),
)

humo_pending = Table(
    "humo_pending", metadata,
    Column("account_id", UUID(as_uuid=True), primary_key=True),
    Column("message_id", BigInteger, primary_key=True),
    Column("topic", Text, nullable=False),
    Column("payload", JSONB, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

audit = Table(
    "userbot_audit", metadata,
    Column("id", BigInteger, Identity(), primary_key=True),
    Column("action", Text, nullable=False),
    Column("account_id", UUID(as_uuid=True)),
    Column("feature", Text),
    Column("actor", UUID(as_uuid=True)),
    Column("at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)
```

- [ ] **Step 2: Alembic**

`alembic.ini`:
```ini
[alembic]
script_location = userbot_service/db/migrations

[loggers]
keys = root
[handlers]
keys = console
[formatters]
keys = generic
[logger_root]
level = WARN
handlers = console
[handler_console]
class = StreamHandler
args = (sys.stderr,)
formatter = generic
[formatter_generic]
format = %(levelname)s %(name)s %(message)s
```

`userbot_service/db/migrations/script.py.mako` — Alembic'ning standart shabloni:
```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = None
depends_on = None


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

`userbot_service/db/migrations/env.py`:
```python
"""Both containers run `alembic upgrade head` on start, at the same time on a
deploy. A session-level advisory lock serialises them; the loser waits and
then finds nothing to do."""

import asyncio

from alembic import context
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

MIGRATION_LOCK = 7_240_001


def _run(connection) -> None:
    context.configure(connection=connection, target_metadata=None)
    with context.begin_transaction():
        context.run_migrations()


async def _main() -> None:
    url = context.config.get_main_option("sqlalchemy.url")
    engine = create_async_engine(url)
    async with engine.connect() as conn:
        await conn.execute(text(f"SELECT pg_advisory_lock({MIGRATION_LOCK})"))
        await conn.commit()
        try:
            await conn.run_sync(_run)
            await conn.commit()
        finally:
            await conn.execute(text(f"SELECT pg_advisory_unlock({MIGRATION_LOCK})"))
            await conn.commit()
    await engine.dispose()


asyncio.run(_main())
```

`userbot_service/db/migrations/versions/0001_initial.py` — Step 1 dagi jadvallarni aniq DDL bilan:
```python
"""userbot registry, bindings, leases, payment watcher state

Revision ID: 0001
Revises:
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE userbot_accounts (
            id                 UUID PRIMARY KEY,
            telegram_user_id   BIGINT      NOT NULL UNIQUE,
            first_name         TEXT        NOT NULL,
            last_name          TEXT,
            username           TEXT,
            phone_masked       TEXT        NOT NULL,
            session_ciphertext BYTEA       NOT NULL,
            session_iv         BYTEA       NOT NULL,
            status             TEXT        NOT NULL
                CHECK (status IN ('ACTIVE', 'REVOKED', 'DISCONNECTED')),
            source             TEXT        NOT NULL CHECK (source IN ('PANEL', 'IMPORTED')),
            connected_by       UUID,
            connected_at       TIMESTAMPTZ NOT NULL,
            status_changed_at  TIMESTAMPTZ NOT NULL,
            status_reason      TEXT
        );
        CREATE TABLE userbot_bindings (
            feature     TEXT PRIMARY KEY,
            account_id  UUID NOT NULL REFERENCES userbot_accounts(id),
            bound_by    UUID,
            bound_at    TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE userbot_leases (
            account_id     UUID PRIMARY KEY REFERENCES userbot_accounts(id) ON DELETE CASCADE,
            runner         TEXT        NOT NULL,
            lease_until    TIMESTAMPTZ NOT NULL,
            last_heartbeat TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE humo_watch_state (
            account_id      UUID PRIMARY KEY REFERENCES userbot_accounts(id) ON DELETE CASCADE,
            last_message_id BIGINT NOT NULL
        );
        CREATE TABLE humo_pending (
            account_id  UUID   NOT NULL,
            message_id  BIGINT NOT NULL,
            topic       TEXT   NOT NULL,
            payload     JSONB  NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (account_id, message_id)
        );
        CREATE TABLE userbot_audit (
            id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            action     TEXT NOT NULL,
            account_id UUID,
            feature    TEXT,
            actor      UUID,
            at         TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)


def downgrade() -> None:
    raise NotImplementedError("forward-only")
```

`userbot_service/db/engine.py`:
```python
from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

_ROOT = Path(__file__).resolve().parents[2]


def make_engine(url: str) -> AsyncEngine:
    return create_async_engine(url, pool_size=5, max_overflow=0, pool_pre_ping=True)


def run_migrations(url: str) -> None:
    """Sync on purpose: called before any event loop exists (env.py runs its own)."""
    cfg = Config(str(_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(_ROOT / "userbot_service/db/migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
```

- [ ] **Step 3: Test fixture'lari**

`tests/conftest.py`:
```python
import base64
import os

import pytest
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer

from userbot_service.crypto import SessionCipher
from userbot_service.db.engine import make_engine, run_migrations


@pytest.fixture(scope="session")
def database_url():
    with PostgresContainer("postgres:16-alpine") as pg:
        url = pg.get_connection_url().replace("postgresql+psycopg2", "postgresql+asyncpg")
        run_migrations(url)
        yield url


@pytest.fixture
async def engine(database_url):
    engine = make_engine(database_url)
    async with engine.begin() as conn:
        await conn.execute(text(
            "TRUNCATE userbot_audit, humo_pending, humo_watch_state, userbot_leases,"
            " userbot_bindings, userbot_accounts"))
    yield engine
    await engine.dispose()


@pytest.fixture
def cipher():
    return SessionCipher(base64.b64encode(os.urandom(32)).decode())


@pytest.fixture
def repo(engine, cipher):
    from userbot_service.repository import AccountRepository
    return AccountRepository(engine, cipher)
```

- [ ] **Step 4: Yiqiluvchi repository testlari**

`tests/test_repository.py`:
```python
import uuid

import pytest
from sqlalchemy import text

from userbot_service.errors import ApiError
from userbot_service.telegram.ports import Me

ADMIN = uuid.uuid4()


def me(tg_id=1001, first="Aziz"):
    return Me(telegram_user_id=tg_id, first_name=first, last_name=None,
              username="aziz", phone="998901234567")


async def test_a_connected_account_is_stored_encrypted_and_masked(repo, engine):
    account = await repo.upsert_connected(me=me(), session_string="SESSION", source="PANEL", actor=ADMIN)

    assert account.status == "ACTIVE"
    assert account.phone_masked == "+998 ******* 67"
    assert account.connected_by == ADMIN
    assert await repo.session_string(account.id) == "SESSION"
    async with engine.connect() as conn:
        raw = (await conn.execute(text("SELECT session_ciphertext FROM userbot_accounts"))).scalar_one()
    assert b"SESSION" not in raw


async def test_connecting_an_active_account_again_is_refused(repo):
    await repo.upsert_connected(me=me(), session_string="A", source="PANEL", actor=ADMIN)
    with pytest.raises(ApiError) as e:
        await repo.upsert_connected(me=me(), session_string="B", source="PANEL", actor=ADMIN)
    assert e.value.code == "ALREADY_CONNECTED"


async def test_reconnecting_a_revoked_account_replaces_the_session_and_keeps_bindings(repo):
    first = await repo.upsert_connected(me=me(), session_string="OLD", source="IMPORTED",
                                        actor=None, bind_feature="PAYMENT")
    await repo.mark_revoked(first.id, "AUTH_KEY_UNREGISTERED")

    again = await repo.upsert_connected(me=me(first="Aziz2"), session_string="NEW",
                                        source="PANEL", actor=ADMIN)

    assert again.id == first.id
    assert again.status == "ACTIVE"
    assert again.first_name == "Aziz2"
    assert await repo.session_string(first.id) == "NEW"
    assert (await repo.bindings())["PAYMENT"] == first.id


async def test_binding_needs_a_known_feature_and_an_active_account(repo):
    a = await repo.upsert_connected(me=me(), session_string="S", source="PANEL", actor=ADMIN)
    with pytest.raises(ApiError) as unknown:
        await repo.bind("NOPE", a.id, ADMIN)
    assert unknown.value.code == "UNKNOWN_FEATURE"

    await repo.mark_revoked(a.id, "x")
    with pytest.raises(ApiError) as inactive:
        await repo.bind("PAYMENT", a.id, ADMIN)
    assert inactive.value.code == "ACCOUNT_NOT_ACTIVE"


async def test_rebinding_moves_the_feature(repo):
    a = await repo.upsert_connected(me=me(1), session_string="S", source="PANEL", actor=ADMIN)
    b = await repo.upsert_connected(me=me(2), session_string="S", source="PANEL", actor=ADMIN)
    await repo.bind("PAYMENT", a.id, ADMIN)
    await repo.bind("PAYMENT", b.id, ADMIN)
    assert await repo.bindings() == {"PAYMENT": b.id}
    assert await repo.features_of(a.id) == []
    assert await repo.features_of(b.id) == ["PAYMENT"]


async def test_disconnect_wipes_the_session_and_leaves_an_audit_trail(repo, engine):
    a = await repo.upsert_connected(me=me(), session_string="S", source="PANEL", actor=ADMIN)
    await repo.mark_disconnected(a.id, ADMIN)

    assert (await repo.get(a.id)).status == "DISCONNECTED"
    assert a.id not in await repo.active_ids()
    async with engine.connect() as conn:
        ct = (await conn.execute(text("SELECT session_ciphertext FROM userbot_accounts"))).scalar_one()
        actions = (await conn.execute(text("SELECT action FROM userbot_audit ORDER BY id"))).scalars().all()
    assert ct == b""
    assert actions == ["CONNECTED", "DISCONNECTED"]


async def test_an_unknown_account_is_not_found(repo):
    with pytest.raises(ApiError) as e:
        await repo.get(uuid.uuid4())
    assert e.value.code == "ACCOUNT_NOT_FOUND"
```

- [ ] **Step 5: Yiqilishini tekshirish**

Run: `pytest tests/test_repository.py -q`
Expected: FAIL — `ModuleNotFoundError: userbot_service.repository` (yoki `telegram.ports`).

- [ ] **Step 6: `telegram/ports.py` (faqat `Me`) va repository**

`userbot_service/telegram/__init__.py` (bo'sh), `userbot_service/telegram/ports.py`:
```python
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Me:
    telegram_user_id: int
    first_name: str
    last_name: str | None
    username: str | None
    phone: str
```

`userbot_service/repository.py`:
```python
"""Accounts, feature bindings and their audit trail."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncEngine

from userbot_service.crypto import SessionCipher
from userbot_service.db.schema import accounts, audit, bindings
from userbot_service.errors import ApiError
from userbot_service.features import FEATURES
from userbot_service.phone import mask_phone
from userbot_service.telegram.ports import Me


@dataclass(frozen=True)
class Account:
    id: UUID
    telegram_user_id: int
    first_name: str
    last_name: str | None
    username: str | None
    phone_masked: str
    status: str
    status_reason: str | None
    source: str
    connected_by: UUID | None
    connected_at: datetime


_COLUMNS = [
    accounts.c.id, accounts.c.telegram_user_id, accounts.c.first_name, accounts.c.last_name,
    accounts.c.username, accounts.c.phone_masked, accounts.c.status, accounts.c.status_reason,
    accounts.c.source, accounts.c.connected_by, accounts.c.connected_at,
]


def _now() -> datetime:
    return datetime.now(UTC)


class AccountRepository:
    def __init__(self, engine: AsyncEngine, cipher: SessionCipher) -> None:
        self._engine = engine
        self._cipher = cipher

    async def upsert_connected(
        self, *, me: Me, session_string: str, source: str, actor: UUID | None,
        bind_feature: str | None = None,
    ) -> Account:
        ciphertext, iv = self._cipher.encrypt(session_string)
        now = _now()
        async with self._engine.begin() as conn:
            existing = (await conn.execute(
                select(accounts.c.id, accounts.c.status)
                .where(accounts.c.telegram_user_id == me.telegram_user_id)
                .with_for_update()
            )).first()
            values = dict(
                first_name=me.first_name, last_name=me.last_name, username=me.username,
                phone_masked=mask_phone(me.phone), session_ciphertext=ciphertext, session_iv=iv,
                status="ACTIVE", source=source, connected_by=actor, connected_at=now,
                status_changed_at=now, status_reason=None,
            )
            if existing is None:
                account_id = uuid.uuid4()
                await conn.execute(insert(accounts).values(
                    id=account_id, telegram_user_id=me.telegram_user_id, **values))
            elif existing.status == "ACTIVE":
                raise ApiError("ALREADY_CONNECTED")
            else:
                account_id = existing.id
                await conn.execute(update(accounts).where(accounts.c.id == account_id).values(**values))
            await conn.execute(insert(audit).values(
                action="IMPORTED" if source == "IMPORTED" else "CONNECTED",
                account_id=account_id, actor=actor))
            if bind_feature is not None:
                await self._bind(conn, bind_feature, account_id, actor)
        return await self.get(account_id)

    async def get(self, account_id: UUID) -> Account:
        async with self._engine.connect() as conn:
            row = (await conn.execute(select(*_COLUMNS).where(accounts.c.id == account_id))).first()
        if row is None:
            raise ApiError("ACCOUNT_NOT_FOUND")
        return Account(**row._mapping)

    async def find_by_telegram_id(self, telegram_user_id: int) -> Account | None:
        async with self._engine.connect() as conn:
            row = (await conn.execute(
                select(*_COLUMNS).where(accounts.c.telegram_user_id == telegram_user_id))).first()
        return None if row is None else Account(**row._mapping)

    async def list(self) -> list[Account]:
        async with self._engine.connect() as conn:
            rows = (await conn.execute(select(*_COLUMNS).order_by(accounts.c.connected_at))).all()
        return [Account(**r._mapping) for r in rows]

    async def session_string(self, account_id: UUID) -> str:
        async with self._engine.connect() as conn:
            row = (await conn.execute(
                select(accounts.c.session_ciphertext, accounts.c.session_iv)
                .where(accounts.c.id == account_id))).first()
        if row is None:
            raise ApiError("ACCOUNT_NOT_FOUND")
        return self._cipher.decrypt(row.session_ciphertext, row.session_iv)

    async def mark_revoked(self, account_id: UUID, reason: str) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(update(accounts).where(accounts.c.id == account_id).values(
                status="REVOKED", status_reason=reason, status_changed_at=_now()))
            await conn.execute(insert(audit).values(action="REVOKED", account_id=account_id))

    async def mark_disconnected(self, account_id: UUID, actor: UUID | None) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(update(accounts).where(accounts.c.id == account_id).values(
                status="DISCONNECTED", status_reason=None, status_changed_at=_now(),
                session_ciphertext=b"", session_iv=b""))
            await conn.execute(insert(audit).values(
                action="DISCONNECTED", account_id=account_id, actor=actor))

    async def active_ids(self) -> set[UUID]:
        async with self._engine.connect() as conn:
            rows = await conn.execute(select(accounts.c.id).where(accounts.c.status == "ACTIVE"))
        return set(rows.scalars())

    async def bindings(self) -> dict[str, UUID]:
        async with self._engine.connect() as conn:
            rows = (await conn.execute(select(bindings.c.feature, bindings.c.account_id))).all()
        return {r.feature: r.account_id for r in rows}

    async def features_of(self, account_id: UUID) -> list[str]:
        async with self._engine.connect() as conn:
            rows = await conn.execute(
                select(bindings.c.feature).where(bindings.c.account_id == account_id)
                .order_by(bindings.c.feature))
        return list(rows.scalars())

    async def bind(self, feature: str, account_id: UUID, actor: UUID | None) -> None:
        async with self._engine.begin() as conn:
            await self._bind(conn, feature, account_id, actor)

    async def _bind(self, conn, feature: str, account_id: UUID, actor: UUID | None) -> None:
        if feature not in FEATURES:
            raise ApiError("UNKNOWN_FEATURE")
        status = (await conn.execute(
            select(accounts.c.status).where(accounts.c.id == account_id))).scalar_one_or_none()
        if status is None:
            raise ApiError("ACCOUNT_NOT_FOUND")
        if status != "ACTIVE":
            raise ApiError("ACCOUNT_NOT_ACTIVE")
        stmt = pg_insert(bindings).values(
            feature=feature, account_id=account_id, bound_by=actor, bound_at=_now())
        await conn.execute(stmt.on_conflict_do_update(
            index_elements=[bindings.c.feature],
            set_=dict(account_id=stmt.excluded.account_id, bound_by=stmt.excluded.bound_by,
                      bound_at=stmt.excluded.bound_at)))
        await conn.execute(insert(audit).values(
            action="BOUND", account_id=account_id, feature=feature, actor=actor))
```

- [ ] **Step 7: O'tishini tekshirish**

Run: `pytest tests/test_repository.py -q && ruff check userbot_service/ tests/`
Expected: PASS. (`test_disconnect_...` audit tartibi `["CONNECTED", "DISCONNECTED"]` — `bind` chaqirilmagan.)

- [ ] **Step 8: Commit**

```bash
git add userbot-service
git commit -m "feat(userbot): userbot_db sxemasi, alembic, akkount va binding repository"
```

---

### Task 4: LeaseStore

**Files:**
- Create: `userbot_service/lease.py`
- Test: `tests/test_lease.py`

**Interfaces:**
- Consumes: `engine`, `leases` jadvali.
- Produces: `LeaseStore(engine, runner: str, ttl_seconds: int = 30)`:
  - `acquire(account_id) -> bool`
  - `renew(held: Iterable[UUID], alive: set[UUID]) -> set[UUID]` — hali shu runner'da turgan id'lar
  - `release(account_id) -> None`
  - `liveness() -> dict[UUID, tuple[str, datetime]]` (runner, last_heartbeat)

- [ ] **Step 1: Yiqiluvchi testlar**

`tests/test_lease.py`:
```python
import uuid

from sqlalchemy import text

from userbot_service.lease import LeaseStore
from userbot_service.telegram.ports import Me


async def account(repo, tg=1):
    a = await repo.upsert_connected(
        me=Me(tg, "A", None, None, "998901234567"), session_string="S", source="PANEL", actor=None)
    return a.id


async def test_only_one_runner_can_hold_an_account(engine, repo):
    acc = await account(repo)
    core, payment = LeaseStore(engine, "core"), LeaseStore(engine, "payment")

    assert await core.acquire(acc) is True
    assert await payment.acquire(acc) is False


async def test_the_same_runner_reacquires_its_own_lease_after_a_restart(engine, repo):
    acc = await account(repo)
    assert await LeaseStore(engine, "payment").acquire(acc)
    assert await LeaseStore(engine, "payment").acquire(acc)


async def test_an_expired_lease_can_be_taken_over(engine, repo):
    acc = await account(repo)
    await LeaseStore(engine, "core").acquire(acc)
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE userbot_leases SET lease_until = now() - interval '1 second'"))
    assert await LeaseStore(engine, "payment").acquire(acc) is True


async def test_release_frees_the_account_immediately(engine, repo):
    acc = await account(repo)
    core = LeaseStore(engine, "core")
    await core.acquire(acc)
    await core.release(acc)
    assert await LeaseStore(engine, "payment").acquire(acc) is True


async def test_renew_reports_only_leases_still_held_and_stamps_alive_ones(engine, repo):
    a, b = await account(repo, 1), await account(repo, 2)
    core = LeaseStore(engine, "core")
    await core.acquire(a)
    await core.acquire(b)
    async with engine.begin() as conn:  # b was lost (expired and taken by payment)
        await conn.execute(text("UPDATE userbot_leases SET runner = 'payment' WHERE account_id = :b"),
                           {"b": b})

    held = await core.renew([a, b], alive={a})

    assert held == {a}
    live = await core.liveness()
    assert live[a][0] == "core"
    assert live[a][1].year > 1970


async def test_a_new_lease_is_not_alive_until_renewed_as_alive(engine, repo):
    acc = await account(repo)
    store = LeaseStore(engine, "core")
    await store.acquire(acc)
    assert (await store.liveness())[acc][1].year == 1970


async def test_releasing_an_unknown_lease_is_harmless(engine):
    await LeaseStore(engine, "core").release(uuid.uuid4())
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `pytest tests/test_lease.py -q` — Expected: FAIL (`userbot_service.lease` yo'q).

- [ ] **Step 3: Amalga oshirish**

`userbot_service/lease.py`:
```python
"""Exactly one runner may run an account at a time.

Telegram revokes an auth key it sees used from two places at once
(AUTH_KEY_DUPLICATED), so a client is started only after its lease row is ours
and stopped before the lease could expire (see Supervisor)."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

_ACQUIRE = text("""
    INSERT INTO userbot_leases (account_id, runner, lease_until, last_heartbeat)
    VALUES (:id, :runner, now() + make_interval(secs => :ttl), to_timestamp(0))
    ON CONFLICT (account_id) DO UPDATE
        SET runner = EXCLUDED.runner, lease_until = EXCLUDED.lease_until
        WHERE userbot_leases.lease_until < now() OR userbot_leases.runner = EXCLUDED.runner
    RETURNING account_id
""")

_RENEW = text("""
    UPDATE userbot_leases
       SET lease_until = now() + make_interval(secs => :ttl),
           last_heartbeat = CASE WHEN account_id = ANY(:alive) THEN now() ELSE last_heartbeat END
     WHERE runner = :runner AND account_id = ANY(:held)
    RETURNING account_id
""")


class LeaseStore:
    def __init__(self, engine: AsyncEngine, runner: str, ttl_seconds: int = 30) -> None:
        self._engine = engine
        self.runner = runner
        self._ttl = ttl_seconds

    async def acquire(self, account_id: UUID) -> bool:
        async with self._engine.begin() as conn:
            row = (await conn.execute(
                _ACQUIRE, {"id": account_id, "runner": self.runner, "ttl": self._ttl})).first()
        return row is not None

    async def renew(self, held: Iterable[UUID], alive: set[UUID]) -> set[UUID]:
        held = list(held)
        if not held:
            return set()
        async with self._engine.begin() as conn:
            rows = await conn.execute(_RENEW, {
                "ttl": self._ttl, "runner": self.runner, "held": held, "alive": list(alive)})
        return set(rows.scalars())

    async def release(self, account_id: UUID) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(
                text("DELETE FROM userbot_leases WHERE account_id = :id AND runner = :runner"),
                {"id": account_id, "runner": self.runner})

    async def liveness(self) -> dict[UUID, tuple[str, datetime]]:
        async with self._engine.connect() as conn:
            rows = await conn.execute(
                text("SELECT account_id, runner, last_heartbeat FROM userbot_leases"))
        return {r.account_id: (r.runner, r.last_heartbeat) for r in rows}
```

- [ ] **Step 4: O'tishini tekshirish**

Run: `pytest tests/test_lease.py -q` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add userbot-service
git commit -m "feat(userbot): akkount lease'i — bitta akkount faqat bitta runner'da"
```

---

### Task 5: Telegram portlari va Pyrogram adapterlari

**Files:**
- Modify: `userbot_service/telegram/ports.py`
- Create: `userbot_service/telegram/pyrogram_adapter.py`
- Create: `tests/fakes.py`
- Test: `tests/test_pyrogram_adapter.py`

**Interfaces:**
- Produces (`ports.py`, `Me` Task 3 dan):
  ```python
  @dataclass(frozen=True) class Msg: id: int; text: str | None; date: datetime
  @dataclass(frozen=True) class CodeSent: phone_code_hash: str; code_type: str; timeout_sec: int | None
  class TelegramError(Exception): code: str; retry_after: int | None
  class PasswordNeeded(Exception): hint: str | None
  class SessionDead(Exception): reason: str

  class LoginGateway(Protocol):
      async def connect(self) -> None
      async def send_code(self, phone: str) -> CodeSent
      async def resend_code(self, phone: str, phone_code_hash: str) -> CodeSent
      async def sign_in(self, phone: str, phone_code_hash: str, code: str) -> Me   # PasswordNeeded
      async def check_password(self, password: str) -> Me
      async def export_session(self) -> str
      async def log_out(self) -> None
      async def disconnect(self) -> None

  class AccountClient(Protocol):
      @property
      def is_connected(self) -> bool
      def has_handlers(self) -> bool
      async def start(self) -> None                       # SessionDead
      async def stop(self) -> None
      async def get_me(self) -> Me                        # SessionDead
      async def log_out(self) -> None
      async def download_avatar(self, path: str) -> bool
      def on_incoming(self, chat: str | int, callback: Callable[[Msg], Awaitable[None]]) -> None
      async def history_after(self, chat: str | int, after_id: int, limit: int = 500) -> list[Msg]  # eskisi birinchi
      async def newest_message_id(self, chat: str | int) -> int

  class LegacySession(Protocol):
      async def open(self) -> Me
      async def export(self) -> str
      async def close(self) -> None
  ```
- Produces (`pyrogram_adapter.py`): `PyrogramLoginGateway(api_id, api_hash)`, `PyrogramAccountClient(account_id: UUID, session_string: str, api_id, api_hash)`, `PyrogramLegacySession(session_name, session_dir, api_id, api_hash)`.
- Produces (`tests/fakes.py`): `FakeLoginGateway`, `FakeAccountClient`, `FakeKafka` (quyida).

- [ ] **Step 1: Portlar**

`userbot_service/telegram/ports.py` ni to'liq quyidagiga almashtiring:
```python
"""What the service needs from Telegram, without Pyrogram.

Everything that decides something — login rules, leases, the payment queue —
talks to these ports, so it is tested with fakes and no Telegram account."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class Me:
    telegram_user_id: int
    first_name: str
    last_name: str | None
    username: str | None
    phone: str


@dataclass(frozen=True)
class Msg:
    id: int
    text: str | None
    date: datetime


@dataclass(frozen=True)
class CodeSent:
    phone_code_hash: str
    code_type: str
    timeout_sec: int | None


class TelegramError(Exception):
    def __init__(self, code: str, retry_after: int | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.retry_after = retry_after


class PasswordNeeded(Exception):
    def __init__(self, hint: str | None) -> None:
        super().__init__("password needed")
        self.hint = hint


class SessionDead(Exception):
    """The authorization is gone: revoked, logged out elsewhere, deactivated."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class LoginGateway(Protocol):
    async def connect(self) -> None: ...
    async def send_code(self, phone: str) -> CodeSent: ...
    async def resend_code(self, phone: str, phone_code_hash: str) -> CodeSent: ...
    async def sign_in(self, phone: str, phone_code_hash: str, code: str) -> Me: ...
    async def check_password(self, password: str) -> Me: ...
    async def export_session(self) -> str: ...
    async def log_out(self) -> None: ...
    async def disconnect(self) -> None: ...


class AccountClient(Protocol):
    @property
    def is_connected(self) -> bool: ...
    def has_handlers(self) -> bool: ...
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
    async def get_me(self) -> Me: ...
    async def log_out(self) -> None: ...
    async def download_avatar(self, path: str) -> bool: ...
    def on_incoming(self, chat: str | int, callback: Callable[[Msg], Awaitable[None]]) -> None: ...
    async def history_after(self, chat: str | int, after_id: int, limit: int = 500) -> list[Msg]: ...
    async def newest_message_id(self, chat: str | int) -> int: ...


class LegacySession(Protocol):
    async def open(self) -> Me: ...
    async def export(self) -> str: ...
    async def close(self) -> None: ...
```

- [ ] **Step 2: Yiqiluvchi adapter testlari**

`tests/test_pyrogram_adapter.py`:
```python
"""Only what can be checked without a network: construction and error mapping.
Everything else in the adapter is a one-line delegation to Pyrogram."""

import asyncio
import uuid

import pytest
from pyrogram import errors

from userbot_service.telegram.ports import SessionDead, TelegramError
from userbot_service.telegram.pyrogram_adapter import (
    PyrogramAccountClient,
    as_session_dead,
    as_telegram_error,
)


async def test_a_client_built_inside_the_loop_dispatches_on_that_loop():
    """The bug that cost three real transfers: a Client built outside the
    running loop registers its handlers on a loop nothing runs."""
    client = PyrogramAccountClient(uuid.uuid4(), "", api_id=1, api_hash="x")
    assert client._client.dispatcher.loop is asyncio.get_running_loop()


@pytest.mark.parametrize("exc, code", [
    (errors.PhoneNumberInvalid(), "PHONE_INVALID"),
    (errors.PhoneCodeInvalid(), "CODE_INVALID"),
    (errors.PhoneCodeExpired(), "CODE_EXPIRED"),
    (errors.PasswordHashInvalid(), "PASSWORD_INVALID"),
    (errors.PhoneNumberBanned(), "PHONE_BANNED"),
    (errors.PhoneNumberUnoccupied(), "PHONE_NOT_REGISTERED"),
])
def test_telegram_login_errors_get_our_codes(exc, code):
    assert as_telegram_error(exc).code == code


def test_flood_wait_carries_the_wait():
    mapped = as_telegram_error(errors.FloodWait(value=42))
    assert (mapped.code, mapped.retry_after) == ("FLOOD_WAIT", 42)


def test_an_unknown_rpc_error_is_a_generic_telegram_error():
    assert as_telegram_error(errors.InternalServerError()).code == "TELEGRAM_ERROR"


@pytest.mark.parametrize("exc", [errors.AuthKeyUnregistered(), errors.SessionRevoked(),
                                 errors.UserDeactivated(), errors.UserDeactivatedBan()])
def test_a_dead_authorization_is_session_dead(exc):
    assert isinstance(as_session_dead(exc), SessionDead)


def test_a_password_prompt_is_not_a_dead_session():
    """SessionPasswordNeeded subclasses Unauthorized in Pyrogram."""
    assert as_session_dead(errors.SessionPasswordNeeded()) is None


def test_non_auth_errors_are_not_session_dead():
    assert as_session_dead(errors.FloodWait(value=1)) is None
    assert isinstance(as_telegram_error(errors.FloodWait(value=1)), TelegramError)
```

- [ ] **Step 3: Yiqilishini tekshirish**

Run: `pytest tests/test_pyrogram_adapter.py -q` — Expected: FAIL (`pyrogram_adapter` yo'q). Agar biror `errors.X` klassi Pyrogram 2.0.106 da boshqacha nomlangan bo'lsa (`python -c "from pyrogram import errors; print(errors.PhoneNumberUnoccupied)"`), testdagi klassni o'sha `ID` li klass bilan almashtiring — kod xaritasi `exc.ID` bo'yicha ishlaydi.

- [ ] **Step 4: Adapter**

`userbot_service/telegram/pyrogram_adapter.py`:
```python
"""The only module that imports Pyrogram's Client.

Clients are constructed lazily by callers that are already inside the running
event loop: Pyrogram's Dispatcher captures asyncio.get_event_loop() in its
constructor, and a client built anywhere else registers handlers on a loop
that never runs (see tests/test_pyrogram_adapter.py)."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from uuid import UUID

from pyrogram import Client, enums, errors, filters, raw
from pyrogram.handlers import MessageHandler
from pyrogram.types import User

from userbot_service.telegram.ports import (
    CodeSent, Me, Msg, PasswordNeeded, SessionDead, TelegramError,
)

log = logging.getLogger(__name__)

_LOGIN_CODES = {
    "PHONE_NUMBER_INVALID": "PHONE_INVALID",
    "PHONE_CODE_INVALID": "CODE_INVALID",
    "PHONE_CODE_EMPTY": "CODE_INVALID",
    "PHONE_CODE_EXPIRED": "CODE_EXPIRED",
    "PASSWORD_HASH_INVALID": "PASSWORD_INVALID",
    "PHONE_NUMBER_BANNED": "PHONE_BANNED",
    "PHONE_NUMBER_UNOCCUPIED": "PHONE_NOT_REGISTERED",
}


def as_telegram_error(exc: errors.RPCError) -> TelegramError:
    if isinstance(exc, errors.FloodWait):
        return TelegramError("FLOOD_WAIT", retry_after=int(exc.value))
    return TelegramError(_LOGIN_CODES.get(exc.ID, "TELEGRAM_ERROR"))


def as_session_dead(exc: BaseException) -> SessionDead | None:
    if isinstance(exc, errors.SessionPasswordNeeded):
        return None
    if isinstance(exc, (errors.Unauthorized, errors.UserDeactivatedBan)):
        return SessionDead(getattr(exc, "ID", type(exc).__name__))
    return None


def _me(user: User) -> Me:
    return Me(telegram_user_id=user.id, first_name=user.first_name or "",
              last_name=user.last_name, username=user.username,
              phone=user.phone_number or "")


def _code_sent(sent) -> CodeSent:
    code_type = sent.type.name if isinstance(sent.type, enums.SentCodeType) else str(sent.type)
    return CodeSent(phone_code_hash=sent.phone_code_hash, code_type=code_type,
                    timeout_sec=sent.timeout)


class PyrogramLoginGateway:
    def __init__(self, api_id: int, api_hash: str) -> None:
        self._client = Client("login", api_id=api_id, api_hash=api_hash, in_memory=True)

    async def connect(self) -> None:
        await self._client.connect()

    async def send_code(self, phone: str) -> CodeSent:
        try:
            return _code_sent(await self._client.send_code(phone))
        except errors.RPCError as e:
            raise as_telegram_error(e) from e

    async def resend_code(self, phone: str, phone_code_hash: str) -> CodeSent:
        try:
            return _code_sent(await self._client.resend_code(phone, phone_code_hash))
        except errors.RPCError as e:
            raise as_telegram_error(e) from e

    async def sign_in(self, phone: str, phone_code_hash: str, code: str) -> Me:
        try:
            result = await self._client.sign_in(phone, phone_code_hash, code)
        except errors.SessionPasswordNeeded:
            raise PasswordNeeded(await self._client.get_password_hint()) from None
        except errors.RPCError as e:
            raise as_telegram_error(e) from e
        if not isinstance(result, User):
            # Unregistered number: Pyrogram returns TermsOfService or False.
            raise TelegramError("PHONE_NOT_REGISTERED")
        return _me(result)

    async def check_password(self, password: str) -> Me:
        try:
            return _me(await self._client.check_password(password))
        except errors.RPCError as e:
            raise as_telegram_error(e) from e

    async def export_session(self) -> str:
        return await self._client.export_session_string()

    async def log_out(self) -> None:
        try:
            await self._client.invoke(raw.functions.auth.LogOut())
        except errors.RPCError:
            log.warning("logging the fresh login session out failed", exc_info=True)

    async def disconnect(self) -> None:
        if self._client.is_connected:
            await self._client.disconnect()


class PyrogramAccountClient:
    def __init__(self, account_id: UUID, session_string: str, *, api_id: int, api_hash: str) -> None:
        self._client = Client(str(account_id), api_id=api_id, api_hash=api_hash,
                              session_string=session_string or None, in_memory=True)
        self._logged_out = False

    @property
    def is_connected(self) -> bool:
        return bool(self._client.is_connected)

    def has_handlers(self) -> bool:
        # Connected but with an empty dispatcher means updates go nowhere.
        return bool(self._client.dispatcher.groups)

    async def start(self) -> None:
        try:
            await self._client.start()
        except Exception as e:
            dead = as_session_dead(e)
            if dead is not None:
                raise dead from e
            raise

    async def stop(self) -> None:
        if self._client.is_connected and not self._logged_out:
            await self._client.stop()

    async def get_me(self) -> Me:
        try:
            return _me(await self._client.get_me())
        except Exception as e:
            dead = as_session_dead(e)
            if dead is not None:
                raise dead from e
            raise

    async def log_out(self) -> None:
        # Pyrogram's log_out() invokes auth.LogOut and then stops the client itself.
        await self._client.log_out()
        self._logged_out = True

    async def download_avatar(self, path: str) -> bool:
        async for photo in self._client.get_chat_photos("me", limit=1):
            await self._client.download_media(photo.file_id, file_name=path)
            return True
        return False

    def on_incoming(self, chat: str | int, callback: Callable[[Msg], Awaitable[None]]) -> None:
        # filters.incoming: anyone with access to this account could otherwise
        # paste a top-up-shaped message and mint a credit observation.
        async def handler(_client, message) -> None:
            await callback(Msg(id=message.id, text=message.text or message.caption, date=message.date))

        self._client.add_handler(MessageHandler(handler, filters.chat(chat) & filters.incoming))

    async def history_after(self, chat: str | int, after_id: int, limit: int = 500) -> list[Msg]:
        found: list[Msg] = []
        async for message in self._client.get_chat_history(chat, limit=limit):
            if message.id <= after_id:
                break
            if message.outgoing:
                continue
            found.append(Msg(id=message.id, text=message.text or message.caption, date=message.date))
        found.reverse()
        return found

    async def newest_message_id(self, chat: str | int) -> int:
        async for message in self._client.get_chat_history(chat, limit=1):
            return message.id
        return 0


class PyrogramLegacySession:
    """The pre-panel `.session` file, opened once to move it into the database."""

    def __init__(self, session_name: str, session_dir: str, *, api_id: int, api_hash: str) -> None:
        self._client = Client(session_name, api_id=api_id, api_hash=api_hash, workdir=session_dir)

    async def open(self) -> Me:
        await self._client.connect()
        return _me(await self._client.get_me())

    async def export(self) -> str:
        return await self._client.export_session_string()

    async def close(self) -> None:
        if self._client.is_connected:
            await self._client.disconnect()
```

- [ ] **Step 5: Fakes**

`tests/fakes.py`:
```python
from __future__ import annotations

from datetime import UTC, datetime

from userbot_service.telegram.ports import (
    CodeSent, Me, Msg, PasswordNeeded, SessionDead, TelegramError,
)

ME = Me(telegram_user_id=5550001, first_name="Aziz", last_name=None, username="aziz",
        phone="998901234567")


class FakeLoginGateway:
    def __init__(self, *, code="12345", password=None, me=ME, send_error=None):
        self.code, self.password, self.me, self.send_error = code, password, me, send_error
        self.connected = self.logged_out = False
        self.sent = 0

    async def connect(self):
        self.connected = True

    async def send_code(self, phone):
        if self.send_error:
            raise self.send_error
        self.sent += 1
        return CodeSent("hash", "APP", 60)

    async def resend_code(self, phone, phone_code_hash):
        self.sent += 1
        return CodeSent("hash", "SMS", 120)

    async def sign_in(self, phone, phone_code_hash, code):
        if code != self.code:
            raise TelegramError("CODE_INVALID")
        if self.password is not None:
            raise PasswordNeeded("it's the cat")
        return self.me

    async def check_password(self, password):
        if password != self.password:
            raise TelegramError("PASSWORD_INVALID")
        return self.me

    async def export_session(self):
        return "EXPORTED-SESSION"

    async def log_out(self):
        self.logged_out = True

    async def disconnect(self):
        self.connected = False


class FakeAccountClient:
    def __init__(self, *, me=ME, dead_on_start=False, history=()):
        self.me = me
        self.dead_on_start = dead_on_start
        self.dead = False
        self.history = list(history)
        self.started = self.stopped = self.logged_out = False
        self.handlers = []

    @property
    def is_connected(self):
        return self.started and not self.stopped

    def has_handlers(self):
        return bool(self.handlers)

    async def start(self):
        if self.dead_on_start:
            raise SessionDead("AUTH_KEY_UNREGISTERED")
        self.started = True

    async def stop(self):
        self.stopped = True

    async def get_me(self):
        if self.dead:
            raise SessionDead("SESSION_REVOKED")
        return self.me

    async def log_out(self):
        self.logged_out = True
        self.stopped = True

    async def download_avatar(self, path):
        return False

    def on_incoming(self, chat, callback):
        self.handlers.append(callback)

    async def deliver(self, msg_id, text):
        for h in self.handlers:
            await h(Msg(msg_id, text, datetime(2026, 10, 1, tzinfo=UTC)))

    async def history_after(self, chat, after_id, limit=500):
        return [m for m in self.history if m.id > after_id]

    async def newest_message_id(self, chat):
        return max((m.id for m in self.history), default=0)


class FakeKafka:
    def __init__(self):
        self.sent = []
        self.fail = False

    async def publish(self, topic, value, key=None):
        if self.fail:
            raise RuntimeError("kafka down")
        self.sent.append((topic, value, key))
```

- [ ] **Step 6: O'tishini tekshirish**

Run: `pytest tests/test_pyrogram_adapter.py -q && ruff check userbot_service/ tests/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add userbot-service
git commit -m "feat(userbot): Telegram portlari va Pyrogram adapterlari"
```

---

### Task 6: LoginService

**Files:**
- Create: `userbot_service/login.py`
- Test: `tests/test_login.py`

**Interfaces:**
- Consumes: `LoginGateway`, `AccountRepository.upsert_connected`, `normalize_phone`, `ApiError`, `TelegramError`, `PasswordNeeded`.
- Produces:
  ```python
  @dataclass(frozen=True) class LoginStep: login_id: UUID; status: str  # "CODE_SENT" | "PASSWORD_REQUIRED" | "DONE"
      code_type: str | None = None; timeout_sec: int | None = None; hint: str | None = None; account: Account | None = None
  class LoginService:
      def __init__(self, *, gateway_factory: Callable[[], LoginGateway], repo, clock=time.monotonic,
                   ttl_seconds=300, max_attempts=5, max_pending=5)
      async def start(self, phone: str, actor: UUID | None) -> LoginStep
      async def submit_code(self, login_id: UUID, code: str) -> LoginStep
      async def submit_password(self, login_id: UUID, password: str) -> LoginStep
      async def resend(self, login_id: UUID) -> LoginStep
      async def cancel(self, login_id: UUID) -> None
      async def sweep(self) -> None
  ```

- [ ] **Step 1: Yiqiluvchi testlar**

`tests/test_login.py`:
```python
import uuid

import pytest

from tests.fakes import FakeLoginGateway
from userbot_service.errors import ApiError
from userbot_service.login import LoginService
from userbot_service.telegram.ports import TelegramError

ADMIN = uuid.uuid4()


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def service(repo, gateway, clock=None, **kw):
    return LoginService(gateway_factory=lambda: gateway, repo=repo, clock=clock or Clock(), **kw)


async def test_phone_then_code_connects_the_account(repo):
    gw = FakeLoginGateway()
    svc = service(repo, gw)

    step = await svc.start("+998 90 123 45 67", ADMIN)
    assert (step.status, step.code_type, step.timeout_sec) == ("CODE_SENT", "APP", 60)

    done = await svc.submit_code(step.login_id, "12345")
    assert done.status == "DONE"
    assert done.account.telegram_user_id == 5550001
    assert done.account.connected_by == ADMIN
    assert await repo.session_string(done.account.id) == "EXPORTED-SESSION"
    assert gw.connected is False


async def test_two_step_verification_asks_for_the_password_with_its_hint(repo):
    svc = service(repo, FakeLoginGateway(password="pw"))
    step = await svc.start("+998901234567", ADMIN)

    need = await svc.submit_code(step.login_id, "12345")
    assert (need.status, need.hint) == ("PASSWORD_REQUIRED", "it's the cat")

    done = await svc.submit_password(step.login_id, "pw")
    assert done.status == "DONE"


async def test_a_wrong_code_is_reported_and_can_be_retried(repo):
    svc = service(repo, FakeLoginGateway())
    step = await svc.start("+998901234567", ADMIN)
    with pytest.raises(ApiError) as e:
        await svc.submit_code(step.login_id, "00000")
    assert e.value.code == "CODE_INVALID"
    assert (await svc.submit_code(step.login_id, "12345")).status == "DONE"


async def test_five_wrong_codes_end_the_login(repo):
    gw = FakeLoginGateway()
    svc = service(repo, gw)
    step = await svc.start("+998901234567", ADMIN)
    for _ in range(5):
        with pytest.raises(ApiError):
            await svc.submit_code(step.login_id, "00000")
    with pytest.raises(ApiError) as e:
        await svc.submit_code(step.login_id, "12345")
    assert e.value.code == "LOGIN_GONE"
    assert gw.connected is False


async def test_five_wrong_passwords_end_the_login(repo):
    svc = service(repo, FakeLoginGateway(password="pw"))
    step = await svc.start("+998901234567", ADMIN)
    await svc.submit_code(step.login_id, "12345")
    for _ in range(5):
        with pytest.raises(ApiError):
            await svc.submit_password(step.login_id, "nope")
    with pytest.raises(ApiError) as e:
        await svc.submit_password(step.login_id, "pw")
    assert e.value.code == "LOGIN_GONE"


async def test_a_password_before_the_code_is_refused(repo):
    svc = service(repo, FakeLoginGateway(password="pw"))
    step = await svc.start("+998901234567", ADMIN)
    with pytest.raises(ApiError) as e:
        await svc.submit_password(step.login_id, "pw")
    assert e.value.code == "LOGIN_GONE"


async def test_an_expired_login_is_gone_and_its_client_closed(repo):
    clock = Clock()
    gw = FakeLoginGateway()
    svc = service(repo, gw, clock=clock)
    step = await svc.start("+998901234567", ADMIN)
    clock.t = 301
    await svc.sweep()
    assert gw.connected is False
    with pytest.raises(ApiError) as e:
        await svc.submit_code(step.login_id, "12345")
    assert e.value.code == "LOGIN_GONE"


async def test_flood_wait_is_passed_through_with_its_wait(repo):
    svc = service(repo, FakeLoginGateway(send_error=TelegramError("FLOOD_WAIT", retry_after=42)))
    with pytest.raises(ApiError) as e:
        await svc.start("+998901234567", ADMIN)
    assert e.value.code == "FLOOD_WAIT"
    assert e.value.params == {"retryAfterSec": 42}


async def test_already_connected_logs_the_new_session_out(repo):
    first = service(repo, FakeLoginGateway())
    s1 = await first.start("+998901234567", ADMIN)
    await first.submit_code(s1.login_id, "12345")

    gw = FakeLoginGateway()
    second = service(repo, gw)
    s2 = await second.start("+998901234567", ADMIN)
    with pytest.raises(ApiError) as e:
        await second.submit_code(s2.login_id, "12345")
    assert e.value.code == "ALREADY_CONNECTED"
    assert gw.logged_out is True


async def test_too_many_parallel_logins_are_refused(repo):
    svc = LoginService(gateway_factory=FakeLoginGateway, repo=repo, clock=Clock(), max_pending=2)
    await svc.start("+998901234567", ADMIN)
    await svc.start("+998901234568", ADMIN)
    with pytest.raises(ApiError) as e:
        await svc.start("+998901234569", ADMIN)
    assert e.value.code == "TOO_MANY_LOGINS"


async def test_resend_returns_the_new_delivery(repo):
    svc = service(repo, FakeLoginGateway())
    step = await svc.start("+998901234567", ADMIN)
    again = await svc.resend(step.login_id)
    assert (again.status, again.code_type) == ("CODE_SENT", "SMS")


async def test_cancel_closes_the_client(repo):
    gw = FakeLoginGateway()
    svc = service(repo, gw)
    step = await svc.start("+998901234567", ADMIN)
    await svc.cancel(step.login_id)
    assert gw.connected is False
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `pytest tests/test_login.py -q` — Expected: FAIL (`userbot_service.login` yo'q).

- [ ] **Step 3: Amalga oshirish**

`userbot_service/login.py`:
```python
"""Interactive login, one HTTP call per step.

A pending login is an in-memory, not-yet-authorized client keyed by a random
id. A restart of userbot-core loses them; the admin starts again."""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from uuid import UUID

from userbot_service.errors import ApiError
from userbot_service.phone import normalize_phone
from userbot_service.repository import Account, AccountRepository
from userbot_service.telegram.ports import LoginGateway, Me, PasswordNeeded, TelegramError


@dataclass(frozen=True)
class LoginStep:
    login_id: UUID
    status: str
    code_type: str | None = None
    timeout_sec: int | None = None
    hint: str | None = None
    account: Account | None = None


@dataclass
class _Pending:
    gateway: LoginGateway
    phone: str
    phone_code_hash: str
    actor: UUID | None
    created_at: float
    awaiting_password: bool = False
    code_attempts: int = 0
    password_attempts: int = 0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


def _api_error(e: TelegramError) -> ApiError:
    if e.code == "FLOOD_WAIT":
        return ApiError("FLOOD_WAIT", retryAfterSec=e.retry_after or 0)
    return ApiError(e.code)


class LoginService:
    def __init__(
        self, *, gateway_factory: Callable[[], LoginGateway], repo: AccountRepository,
        clock: Callable[[], float] = time.monotonic, ttl_seconds: int = 300,
        max_attempts: int = 5, max_pending: int = 5,
    ) -> None:
        self._factory = gateway_factory
        self._repo = repo
        self._clock = clock
        self._ttl = ttl_seconds
        self._max_attempts = max_attempts
        self._max_pending = max_pending
        self._pending: dict[UUID, _Pending] = {}

    async def start(self, phone: str, actor: UUID | None) -> LoginStep:
        phone = normalize_phone(phone)
        await self.sweep()
        if len(self._pending) >= self._max_pending:
            raise ApiError("TOO_MANY_LOGINS")
        gateway = self._factory()
        await gateway.connect()
        try:
            sent = await gateway.send_code(phone)
        except TelegramError as e:
            await gateway.disconnect()
            raise _api_error(e) from e
        login_id = uuid.uuid4()
        self._pending[login_id] = _Pending(gateway, phone, sent.phone_code_hash, actor, self._clock())
        return LoginStep(login_id, "CODE_SENT", sent.code_type, sent.timeout_sec)

    async def submit_code(self, login_id: UUID, code: str) -> LoginStep:
        p = self._get(login_id)
        async with p.lock:
            if p.awaiting_password:
                raise ApiError("LOGIN_GONE")
            try:
                me = await p.gateway.sign_in(p.phone, p.phone_code_hash, code.strip())
            except PasswordNeeded as e:
                p.awaiting_password = True
                return LoginStep(login_id, "PASSWORD_REQUIRED", hint=e.hint)
            except TelegramError as e:
                p.code_attempts += 1
                await self._drop_if_spent(login_id, p, p.code_attempts, e)
                raise _api_error(e) from e
            return await self._finish(login_id, p, me)

    async def submit_password(self, login_id: UUID, password: str) -> LoginStep:
        p = self._get(login_id)
        async with p.lock:
            if not p.awaiting_password:
                await self._close(login_id)
                raise ApiError("LOGIN_GONE")
            try:
                me = await p.gateway.check_password(password)
            except TelegramError as e:
                p.password_attempts += 1
                await self._drop_if_spent(login_id, p, p.password_attempts, e)
                raise _api_error(e) from e
            return await self._finish(login_id, p, me)

    async def resend(self, login_id: UUID) -> LoginStep:
        p = self._get(login_id)
        async with p.lock:
            try:
                sent = await p.gateway.resend_code(p.phone, p.phone_code_hash)
            except TelegramError as e:
                raise _api_error(e) from e
            p.phone_code_hash = sent.phone_code_hash
            return LoginStep(login_id, "CODE_SENT", sent.code_type, sent.timeout_sec)

    async def cancel(self, login_id: UUID) -> None:
        await self._close(login_id)

    async def sweep(self) -> None:
        now = self._clock()
        for login_id in [i for i, p in self._pending.items() if now - p.created_at > self._ttl]:
            await self._close(login_id)

    def _get(self, login_id: UUID) -> _Pending:
        p = self._pending.get(login_id)
        if p is None or self._clock() - p.created_at > self._ttl:
            raise ApiError("LOGIN_GONE")
        return p

    async def _drop_if_spent(self, login_id: UUID, p: _Pending, attempts: int,
                             e: TelegramError) -> None:
        if attempts >= self._max_attempts or e.code in {"CODE_EXPIRED", "FLOOD_WAIT"}:
            await self._close(login_id)

    async def _finish(self, login_id: UUID, p: _Pending, me: Me) -> LoginStep:
        try:
            session = await p.gateway.export_session()
            account = await self._repo.upsert_connected(
                me=me, session_string=session, source="PANEL", actor=p.actor)
        except ApiError as e:
            if e.code == "ALREADY_CONNECTED":
                # The sign-in just created a second authorization on that account.
                await p.gateway.log_out()
            raise
        finally:
            await self._close(login_id)
        return LoginStep(login_id, "DONE", account=account)

    async def _close(self, login_id: UUID) -> None:
        p = self._pending.pop(login_id, None)
        if p is not None:
            await p.gateway.disconnect()
```
Eslatma: `CODE_EXPIRED` dan keyin login yopiladi — admin "qayta yuborish" emas, boshidan boshlaydi (`resend` eski hash bilan ishlamaydi). Bu `_drop_if_spent` da.

- [ ] **Step 4: O'tishini tekshirish**

Run: `pytest tests/test_login.py -q && ruff check userbot_service/ tests/` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add userbot-service
git commit -m "feat(userbot): panel orqali login oqimi (kod, 2FA, urinish chegarasi, TTL)"
```

---

### Task 7: Payment kuzatuvi — payload, navbat, catch-up, health

**Files:**
- Modify: `userbot_service/kafka_client.py` (payload builder'larga `userbot_telegram_id`)
- Create: `userbot_service/payment/__init__.py`, `payment/observation.py`, `payment/queue.py`, `payment/watcher.py`
- Delete: `userbot_service/main.py`
- Modify: `tests/test_wire_format.py`
- Test: `tests/test_observation.py`, `tests/test_watcher.py`

**Interfaces:**
- Consumes: `AccountClient`, `Msg`, `parse_topup`, `parse_debit`, `KafkaClient.publish(topic, value, key)`.
- Produces:
  - `build_card_credit_payload(..., userbot_telegram_id: int)` / `build_card_debit_payload(..., userbot_telegram_id: int)` — payload'da `"userbotTelegramId"`.
  - `observation_for(msg: Msg, userbot_telegram_id: int) -> tuple[str, dict] | None`
  - `PendingQueue(engine)`: `last_message_id(account_id) -> int | None`, `init_state(account_id, last_id) -> None`, `record(account_id, message_id, item: tuple[str, dict] | None) -> None`, `pending(account_id) -> list[Pending]`, `done(account_id, message_id) -> None`, `oldest_age_seconds(account_id) -> float | None`
  - `HumoWatcher(*, account_id, telegram_user_id, client, queue, kafka, source_chat)`: `attach() -> None`, `flush() -> None`, `health() -> tuple[bool, str]`

- [ ] **Step 1: Wire format testi yiqilsin**

`tests/test_wire_format.py` da `build_card_credit_payload(...)` va `build_card_debit_payload(...)` chaqiruvlariga `userbot_telegram_id=5_550_001` argumentini qo'shing va kutilgan kalitlar to'plamiga `"userbotTelegramId"` ni qo'shing. Qo'shimcha test:
```python
def test_the_observing_account_travels_with_every_observation():
    """Message ids are only unique per account; payment-service keys on the pair."""
    credit = build_card_credit_payload(
        telegram_message_id=1, card_last4="4556", amount_tiyin=1, card_balance_tiyin=None,
        observed_at=datetime(2026, 8, 10, tzinfo=UTC), raw_text="x", userbot_telegram_id=5_550_001)
    assert credit["userbotTelegramId"] == 5_550_001
```
Run: `pytest tests/test_wire_format.py -q` — Expected: FAIL (`unexpected keyword argument 'userbot_telegram_id'`).

- [ ] **Step 2: Builder'lar**

`kafka_client.py` dagi ikkala builder'ga oxirgi keyword parametr `userbot_telegram_id: int` va qaytarilgan dict'ga `"userbotTelegramId": userbot_telegram_id,` qo'shing. Docstring'ga bir qator: "`userbotTelegramId` — kuzatgan akkount; payment idempotency kaliti juftlik."

Run: `pytest tests/test_wire_format.py -q` — Expected: PASS.

- [ ] **Step 3: Kuzatuv, navbat va watcher uchun yiqiluvchi testlar**

`tests/test_observation.py`:
```python
from datetime import UTC, datetime

from tests.test_parser import TOPUP_MESSAGE, WITHDRAWAL_MESSAGE  # mavjud fixture konstantalari
from userbot_service.kafka_client import CARD_CREDIT_OBSERVED, CARD_DEBIT_OBSERVED
from userbot_service.payment.observation import observation_for
from userbot_service.telegram.ports import Msg

AT = datetime(2026, 10, 1, tzinfo=UTC)


def test_a_top_up_becomes_a_credit_observation_from_this_account():
    topic, payload = observation_for(Msg(7, TOPUP_MESSAGE, AT), 5550001)
    assert topic == CARD_CREDIT_OBSERVED
    assert payload["telegramMessageId"] == 7
    assert payload["userbotTelegramId"] == 5550001


def test_a_debit_becomes_a_debit_observation():
    topic, _ = observation_for(Msg(8, WITHDRAWAL_MESSAGE, AT), 5550001)
    assert topic == CARD_DEBIT_OBSERVED


def test_anything_else_is_nothing():
    assert observation_for(Msg(9, "salom", AT), 5550001) is None
    assert observation_for(Msg(10, None, AT), 5550001) is None
```
(`tests/test_parser.py` dagi konstantalar nomi boshqacha bo'lsa — fayldan haqiqiy nomlarni oling; top-up va debit fixture'lari u yerda modul darajasida turadi.)

`tests/test_watcher.py`:
```python
from datetime import UTC, datetime

from sqlalchemy import text

from tests.fakes import FakeAccountClient, FakeKafka
from tests.test_parser import TOPUP_MESSAGE
from userbot_service.payment.queue import PendingQueue
from userbot_service.payment.watcher import HumoWatcher
from userbot_service.telegram.ports import Me, Msg

AT = datetime(2026, 10, 1, tzinfo=UTC)


async def setup(repo, engine, *, history=(), kafka=None):
    acc = await repo.upsert_connected(me=Me(5550001, "A", None, None, "998901234567"),
                                      session_string="S", source="PANEL", actor=None)
    client = FakeAccountClient(history=history)
    await client.start()
    queue = PendingQueue(engine)
    kafka = kafka or FakeKafka()
    watcher = HumoWatcher(account_id=acc.id, telegram_user_id=5550001, client=client,
                          queue=queue, kafka=kafka, source_chat="humocardbot")
    return acc, client, queue, kafka, watcher


async def test_a_fresh_account_starts_at_the_newest_message_and_replays_nothing(repo, engine):
    acc, _, queue, kafka, watcher = await setup(
        repo, engine, history=[Msg(1, TOPUP_MESSAGE, AT), Msg(2, TOPUP_MESSAGE, AT)])
    await watcher.attach()
    await watcher.flush()
    assert kafka.sent == []
    assert await queue.last_message_id(acc.id) == 2


async def test_messages_missed_while_down_are_published_once_after_a_restart(repo, engine):
    acc, _, queue, kafka, watcher = await setup(
        repo, engine, history=[Msg(5, TOPUP_MESSAGE, AT), Msg(6, "salom", AT), Msg(7, TOPUP_MESSAGE, AT)])
    await queue.init_state(acc.id, 5)

    await watcher.attach()
    await watcher.flush()
    await watcher.flush()

    assert [v["telegramMessageId"] for _, v, _ in kafka.sent] == [7]
    assert await queue.last_message_id(acc.id) == 7


async def test_a_live_message_is_published_with_the_account_in_its_key(repo, engine):
    acc, client, _, kafka, watcher = await setup(repo, engine)
    await watcher.attach()
    await client.deliver(11, TOPUP_MESSAGE)
    assert len(kafka.sent) == 1
    assert kafka.sent[0][2] == "5550001:11"


async def test_a_kafka_failure_keeps_the_observation_queued_and_retries_it(repo, engine):
    kafka = FakeKafka()
    acc, client, queue, _, watcher = await setup(repo, engine, kafka=kafka)
    await watcher.attach()
    kafka.fail = True
    await client.deliver(12, TOPUP_MESSAGE)
    assert len(await queue.pending(acc.id)) == 1

    kafka.fail = False
    await watcher.flush()
    assert len(kafka.sent) == 1
    assert await queue.pending(acc.id) == []


async def test_health_fails_when_an_observation_is_stuck(repo, engine):
    kafka = FakeKafka()
    acc, client, _, _, watcher = await setup(repo, engine, kafka=kafka)
    await watcher.attach()
    assert await watcher.health() == (True, "")

    kafka.fail = True
    await client.deliver(13, TOPUP_MESSAGE)
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE humo_pending SET created_at = now() - interval '61 seconds'"))
    healthy, reason = await watcher.health()
    assert healthy is False
    assert "unpublished" in reason


async def test_health_fails_when_the_client_is_down(repo, engine):
    _, client, _, _, watcher = await setup(repo, engine)
    await watcher.attach()
    await client.stop()
    assert (await watcher.health())[0] is False


async def test_health_fails_when_no_handler_is_registered(repo, engine):
    _, _, _, _, watcher = await setup(repo, engine)
    assert (await watcher.health())[0] is False   # attach() never ran
```

- [ ] **Step 4: Yiqilishini tekshirish**

Run: `pytest tests/test_observation.py tests/test_watcher.py -q` — Expected: FAIL (`userbot_service.payment` yo'q).

- [ ] **Step 5: Amalga oshirish**

`userbot_service/payment/__init__.py` — bo'sh.

`userbot_service/payment/observation.py`:
```python
"""Pure: one Telegram message → at most one observation. The parsers are the
correctness boundary (see README); this only picks the topic and payload."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from userbot_service.kafka_client import (
    CARD_CREDIT_OBSERVED, CARD_DEBIT_OBSERVED, build_card_credit_payload, build_card_debit_payload,
)
from userbot_service.parser import parse_debit, parse_topup
from userbot_service.telegram.ports import Msg


def observation_for(msg: Msg, userbot_telegram_id: int) -> tuple[str, dict[str, Any]] | None:
    observed_at = msg.date or datetime.now(UTC)
    topup = parse_topup(msg.text)
    if topup is not None:
        return CARD_CREDIT_OBSERVED, build_card_credit_payload(
            telegram_message_id=msg.id, card_last4=topup.card_last4,
            amount_tiyin=topup.amount_tiyin, card_balance_tiyin=topup.card_balance_tiyin,
            observed_at=observed_at, raw_text=msg.text, userbot_telegram_id=userbot_telegram_id)
    debit = parse_debit(msg.text)
    if debit is not None:
        return CARD_DEBIT_OBSERVED, build_card_debit_payload(
            telegram_message_id=msg.id, card_last4=debit.card_last4,
            amount_tiyin=debit.amount_tiyin, commission_tiyin=debit.commission_tiyin,
            card_balance_tiyin=debit.card_balance_tiyin, description=debit.description,
            observed_at=observed_at, raw_text=msg.text, userbot_telegram_id=userbot_telegram_id)
    return None
```

`userbot_service/payment/queue.py`:
```python
"""Write-ahead queue for observations, per account.

An observation is in this table before anything tries to publish it, and
leaves only after Kafka acknowledged it, so neither a Kafka outage nor a
restart can lose money the card received."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


@dataclass(frozen=True)
class Pending:
    message_id: int
    topic: str
    payload: dict[str, Any]


class PendingQueue:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def last_message_id(self, account_id: UUID) -> int | None:
        async with self._engine.connect() as conn:
            return (await conn.execute(
                text("SELECT last_message_id FROM humo_watch_state WHERE account_id = :a"),
                {"a": account_id})).scalar_one_or_none()

    async def init_state(self, account_id: UUID, last_id: int) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO humo_watch_state (account_id, last_message_id) VALUES (:a, :m)"
                " ON CONFLICT (account_id) DO NOTHING"), {"a": account_id, "m": last_id})

    async def record(self, account_id: UUID, message_id: int,
                     item: tuple[str, dict[str, Any]] | None) -> None:
        async with self._engine.begin() as conn:
            if item is not None:
                await conn.execute(text(
                    "INSERT INTO humo_pending (account_id, message_id, topic, payload)"
                    " VALUES (:a, :m, :t, CAST(:p AS JSONB)) ON CONFLICT DO NOTHING"),
                    {"a": account_id, "m": message_id, "t": item[0],
                     "p": json.dumps(item[1])})
            await conn.execute(text(
                "INSERT INTO humo_watch_state (account_id, last_message_id) VALUES (:a, :m)"
                " ON CONFLICT (account_id) DO UPDATE"
                " SET last_message_id = GREATEST(humo_watch_state.last_message_id, EXCLUDED.last_message_id)"),
                {"a": account_id, "m": message_id})

    async def pending(self, account_id: UUID) -> list[Pending]:
        async with self._engine.connect() as conn:
            rows = await conn.execute(text(
                "SELECT message_id, topic, payload FROM humo_pending WHERE account_id = :a"
                " ORDER BY message_id"), {"a": account_id})
            return [Pending(r.message_id, r.topic, r.payload) for r in rows]

    async def done(self, account_id: UUID, message_id: int) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(text(
                "DELETE FROM humo_pending WHERE account_id = :a AND message_id = :m"),
                {"a": account_id, "m": message_id})

    async def oldest_age_seconds(self, account_id: UUID) -> float | None:
        async with self._engine.connect() as conn:
            return (await conn.execute(text(
                "SELECT EXTRACT(EPOCH FROM now() - min(created_at)) FROM humo_pending"
                " WHERE account_id = :a"), {"a": account_id})).scalar_one_or_none()
```

`userbot_service/payment/watcher.py`:
```python
"""The Humo chat watcher for the account bound to PAYMENT."""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from userbot_service.config import as_chat_ref
from userbot_service.payment.observation import observation_for
from userbot_service.payment.queue import PendingQueue
from userbot_service.telegram.ports import AccountClient, Msg

log = logging.getLogger(__name__)

STUCK_AFTER_SECONDS = 60


class HumoWatcher:
    def __init__(self, *, account_id: UUID, telegram_user_id: int, client: AccountClient,
                 queue: PendingQueue, kafka, source_chat: str) -> None:
        self.account_id = account_id
        self._tg = telegram_user_id
        self._client = client
        self._queue = queue
        self._kafka = kafka
        self._chat = as_chat_ref(source_chat)
        self._flush_lock = asyncio.Lock()

    async def attach(self) -> None:
        # Handler first, history second: a message arriving in between is seen
        # twice, which the queue's primary key and payment's idempotency absorb.
        # The other order would lose it.
        self._client.on_incoming(self._chat, self._on_message)
        last = await self._queue.last_message_id(self.account_id)
        if last is None:
            # A newly bound account: its past is not the platform's money.
            await self._queue.init_state(self.account_id, await self._client.newest_message_id(self._chat))
        else:
            missed = await self._client.history_after(self._chat, last)
            for msg in missed:
                await self._queue.record(self.account_id, msg.id, observation_for(msg, self._tg))
            if missed:
                log.info("caught up %d message(s) missed while down", len(missed))
        await self.flush()

    async def _on_message(self, msg: Msg) -> None:
        await self._queue.record(self.account_id, msg.id, observation_for(msg, self._tg))
        await self.flush()

    async def flush(self) -> None:
        async with self._flush_lock:
            for item in await self._queue.pending(self.account_id):
                try:
                    await self._kafka.publish(item.topic, item.payload,
                                              key=f"{self._tg}:{item.message_id}")
                except Exception:
                    log.exception("publishing observation %s failed; it stays queued", item.message_id)
                    return
                await self._queue.done(self.account_id, item.message_id)
                log.info("published %s for message %s", item.topic, item.message_id)

    async def health(self) -> tuple[bool, str]:
        if not self._client.is_connected:
            return False, "Telegram client is not connected"
        if not self._client.has_handlers():
            return False, "no message handler is registered — updates go nowhere"
        age = await self._queue.oldest_age_seconds(self.account_id)
        if age is not None and age > STUCK_AFTER_SECONDS:
            return False, f"an observation has been unpublished for {int(age)}s"
        return True, ""
```

`git rm userbot-service/userbot_service/main.py` (o'rnini Task 11 dagi `main_payment.py` egallaydi; uning izohlaridagi tarix shu yerdagi docstring'larga ko'chirilgan).

- [ ] **Step 6: O'tishini tekshirish**

Run: `pytest -q && ruff check userbot_service/ tests/` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A userbot-service
git commit -m "feat(userbot): payment kuzatuvi — akkount id payload'da, Postgres navbati, catch-up"
```

---

### Task 8: Supervisor

**Files:**
- Create: `userbot_service/supervisor.py`
- Test: `tests/test_supervisor.py`

**Interfaces:**
- Consumes: `AccountRepository`, `LeaseStore`, `AccountClient`, `SessionDead`, `FEATURES`/`PAYMENT`.
- Produces:
  ```python
  ClientFactory = Callable[[UUID, str], AccountClient]
  OnStarted = Callable[[UUID, AccountClient], Awaitable[None]]
  class Supervisor:
      def __init__(self, *, runner: str, repo, leases, client_factory, on_started: OnStarted | None = None,
                   on_stopped: Callable[[UUID], Awaitable[None]] | None = None,
                   avatar_dir: str | None = None, clock=time.monotonic, db_grace_seconds=20)
      running: dict[UUID, AccountClient]
      async def desired(self) -> set[UUID]
      async def reconcile(self) -> None
      async def probe(self) -> None
      async def tick(self, n: int) -> None          # reconcile; every 12th: probe; DB xatosida grace
      async def log_out(self, account_id: UUID) -> None   # ApiError ACCOUNT_BUSY
      async def shutdown(self) -> None
      async def run_forever(self, interval: float = 5) -> None
  ```

- [ ] **Step 1: Yiqiluvchi testlar**

`tests/test_supervisor.py`:
```python
import uuid

import pytest
from sqlalchemy import text

from tests.fakes import FakeAccountClient
from userbot_service.errors import ApiError
from userbot_service.lease import LeaseStore
from userbot_service.supervisor import Supervisor
from userbot_service.telegram.ports import Me


class Factory:
    def __init__(self, **kw):
        self.kw = kw
        self.made: dict[uuid.UUID, list[FakeAccountClient]] = {}

    def __call__(self, account_id, session):
        c = FakeAccountClient(**self.kw)
        self.made.setdefault(account_id, []).append(c)
        return c


async def acc(repo, tg):
    return (await repo.upsert_connected(me=Me(tg, "A", None, None, "998901234567"),
                                        session_string=f"S{tg}", source="PANEL", actor=None)).id


def sup(runner, repo, engine, factory, **kw):
    return Supervisor(runner=runner, repo=repo, leases=LeaseStore(engine, runner),
                      client_factory=factory, **kw)


async def test_payment_runs_only_the_bound_account_and_core_runs_the_rest(repo, engine):
    a, b = await acc(repo, 1), await acc(repo, 2)
    await repo.bind("PAYMENT", a, None)
    core, payment = sup("core", repo, engine, Factory()), sup("payment", repo, engine, Factory())

    await core.reconcile()
    await payment.reconcile()

    assert set(core.running) == {b}
    assert set(payment.running) == {a}


async def test_rebinding_never_runs_one_account_in_two_places(repo, engine):
    a, b = await acc(repo, 1), await acc(repo, 2)
    await repo.bind("PAYMENT", a, None)
    core, payment = sup("core", repo, engine, Factory()), sup("payment", repo, engine, Factory())
    await core.reconcile()
    await payment.reconcile()

    await repo.bind("PAYMENT", b, None)
    for _ in range(3):
        for s in (payment, core, core, payment):   # any interleaving
            await s.reconcile()
            assert not (set(core.running) & set(payment.running))

    assert set(payment.running) == {b}
    assert set(core.running) == {a}


async def test_a_dead_session_is_marked_revoked_and_its_lease_released(repo, engine):
    a = await acc(repo, 1)
    core = sup("core", repo, engine, Factory(dead_on_start=True))
    await core.reconcile()

    assert core.running == {}
    assert (await repo.get(a)).status == "REVOKED"
    assert await LeaseStore(engine, "payment").acquire(a)


async def test_a_session_revoked_while_running_is_noticed_by_the_probe(repo, engine):
    a = await acc(repo, 1)
    factory = Factory()
    core = sup("core", repo, engine, factory)
    await core.reconcile()
    factory.made[a][0].dead = True

    await core.probe()

    assert core.running == {}
    assert (await repo.get(a)).status == "REVOKED"


async def test_a_lost_lease_stops_the_client_without_touching_the_new_owner(repo, engine):
    a = await acc(repo, 1)
    factory = Factory()
    core = sup("core", repo, engine, factory)
    await core.reconcile()
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE userbot_leases SET runner = 'payment'"))

    await core.reconcile()

    assert factory.made[a][0].stopped is True
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT runner FROM userbot_leases"))).scalar_one() == "payment"


async def test_db_outage_stops_every_client(repo, engine):
    await acc(repo, 1)
    factory = Factory()
    t = [0.0]
    core = sup("core", repo, engine, factory, clock=lambda: t[0])
    await core.tick(1)
    client = next(iter(factory.made.values()))[0]

    async def broken(*a, **k):
        raise ConnectionError("db down")
    core._repo.active_ids = broken

    t[0] = 10
    await core.tick(2)
    assert client.stopped is False          # inside the grace period
    t[0] = 25
    await core.tick(3)
    assert client.stopped is True
    assert core.running == {}


async def test_log_out_of_a_running_account(repo, engine):
    a = await acc(repo, 1)
    factory = Factory()
    core = sup("core", repo, engine, factory)
    await core.reconcile()

    await core.log_out(a)

    assert factory.made[a][0].logged_out is True
    assert a not in core.running
    assert (await repo.get(a)).status == "DISCONNECTED"


async def test_log_out_of_an_account_held_elsewhere_is_busy(repo, engine):
    a = await acc(repo, 1)
    await LeaseStore(engine, "payment").acquire(a)
    with pytest.raises(ApiError) as e:
        await sup("core", repo, engine, Factory()).log_out(a)
    assert e.value.code == "ACCOUNT_BUSY"


async def test_log_out_of_an_already_dead_session_still_disconnects(repo, engine):
    a = await acc(repo, 1)
    core = sup("core", repo, engine, Factory(dead_on_start=True))
    await core.log_out(a)
    assert (await repo.get(a)).status == "DISCONNECTED"


async def test_on_started_runs_for_each_started_account(repo, engine):
    a = await acc(repo, 1)
    started = []

    async def hook(account_id, client):
        started.append(account_id)
    core = sup("core", repo, engine, Factory(), on_started=hook)
    await core.reconcile()
    await core.reconcile()
    assert started == [a]
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `pytest tests/test_supervisor.py -q` — Expected: FAIL (`userbot_service.supervisor` yo'q).

- [ ] **Step 3: Amalga oshirish**

`userbot_service/supervisor.py`:
```python
"""Runs the accounts this runner is responsible for, and only while it holds
their leases.

Order matters everywhere here: a client starts only after its lease is ours,
and stops before the lease could expire. Breaking either lets two processes
use one auth key, and Telegram answers that by revoking it."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import Awaitable, Callable
from uuid import UUID

from userbot_service.errors import ApiError
from userbot_service.features import PAYMENT
from userbot_service.lease import LeaseStore
from userbot_service.repository import AccountRepository
from userbot_service.telegram.ports import AccountClient, SessionDead

log = logging.getLogger(__name__)

ClientFactory = Callable[[UUID, str], AccountClient]
OnStarted = Callable[[UUID, AccountClient], Awaitable[None]]
PROBE_EVERY_TICKS = 12


class Supervisor:
    def __init__(
        self, *, runner: str, repo: AccountRepository, leases: LeaseStore,
        client_factory: ClientFactory, on_started: OnStarted | None = None,
        on_stopped: Callable[[UUID], Awaitable[None]] | None = None,
        avatar_dir: str | None = None, clock: Callable[[], float] = time.monotonic,
        db_grace_seconds: float = 20,
    ) -> None:
        self._runner = runner
        self._repo = repo
        self._leases = leases
        self._factory = client_factory
        self._on_started = on_started
        self._on_stopped = on_stopped
        self._avatar_dir = avatar_dir
        self._clock = clock
        self._grace = db_grace_seconds
        self._last_db_ok = clock()
        self._lock = asyncio.Lock()
        self.running: dict[UUID, AccountClient] = {}

    async def desired(self) -> set[UUID]:
        active = await self._repo.active_ids()
        bound = (await self._repo.bindings()).get(PAYMENT)
        if self._runner == "payment":
            return {bound} & active if bound else set()
        return active - {bound}

    async def reconcile(self) -> None:
        async with self._lock:
            want = await self.desired()
            for account_id in set(self.running) - want:
                await self._stop(account_id)
            for account_id in want - set(self.running):
                if await self._leases.acquire(account_id):
                    await self._start(account_id)
            alive = {i for i, c in self.running.items() if c.is_connected}
            held = await self._leases.renew(self.running.keys(), alive)
            for account_id in set(self.running) - held:
                log.error("lost the lease on account %s; stopping it here", account_id)
                await self._stop(account_id, release=False)

    async def probe(self) -> None:
        async with self._lock:
            for account_id, client in list(self.running.items()):
                try:
                    await client.get_me()
                except SessionDead as e:
                    await self._revoked(account_id, e)
                except Exception:
                    log.warning("probe of account %s failed", account_id, exc_info=True)

    async def tick(self, n: int) -> None:
        try:
            await self.reconcile()
            if n % PROBE_EVERY_TICKS == 0:
                await self.probe()
            self._last_db_ok = self._clock()
        except Exception:
            log.exception("supervisor tick failed")
            if self._clock() - self._last_db_ok > self._grace and self.running:
                # Our leases may be expiring unseen: stop before anyone else may start.
                log.error("cannot renew leases for %ss; stopping every client", self._grace)
                for account_id in list(self.running):
                    await self._stop(account_id, release=False)

    async def log_out(self, account_id: UUID) -> None:
        async with self._lock:
            client = self.running.pop(account_id, None)
            if client is None:
                if not await self._leases.acquire(account_id):
                    raise ApiError("ACCOUNT_BUSY")
                client = self._factory(account_id, await self._repo.session_string(account_id))
                try:
                    await client.start()
                except SessionDead:
                    client = None
                except Exception as e:
                    await self._leases.release(account_id)
                    raise ApiError("TELEGRAM_ERROR") from e
            try:
                if client is not None:
                    await client.log_out()
            except SessionDead:
                pass
            finally:
                await self._leases.release(account_id)
                if self._on_stopped:
                    await self._on_stopped(account_id)
            await self._repo.mark_disconnected(account_id, None)

    async def shutdown(self) -> None:
        async with self._lock:
            for account_id in list(self.running):
                await self._stop(account_id)

    async def run_forever(self, interval: float = 5) -> None:
        n = 0
        while True:
            n += 1
            await self.tick(n)
            await asyncio.sleep(interval)

    async def _start(self, account_id: UUID) -> None:
        client = self._factory(account_id, await self._repo.session_string(account_id))
        try:
            await client.start()
        except SessionDead as e:
            await self._repo.mark_revoked(account_id, e.reason)
            await self._leases.release(account_id)
            log.error("account %s cannot sign in: %s — marked REVOKED", account_id, e.reason)
            return
        except Exception:
            await self._leases.release(account_id)
            log.exception("account %s failed to start; will retry", account_id)
            return
        self.running[account_id] = client
        log.info("runner %s started account %s", self._runner, account_id)
        if self._on_started:
            await self._on_started(account_id, client)
        await self._refresh_avatar(account_id, client)

    async def _stop(self, account_id: UUID, release: bool = True) -> None:
        client = self.running.pop(account_id, None)
        if client is not None:
            try:
                await client.stop()
            except Exception:
                log.warning("stopping account %s raised", account_id, exc_info=True)
            if self._on_stopped:
                await self._on_stopped(account_id)
        if release:
            await self._leases.release(account_id)

    async def _revoked(self, account_id: UUID, e: SessionDead) -> None:
        log.error("account %s lost its Telegram authorization: %s — marked REVOKED",
                  account_id, e.reason)
        await self._stop(account_id)
        await self._repo.mark_revoked(account_id, e.reason)

    async def _refresh_avatar(self, account_id: UUID, client: AccountClient) -> None:
        if not self._avatar_dir:
            return
        try:
            os.makedirs(self._avatar_dir, exist_ok=True)
            await client.download_avatar(os.path.join(self._avatar_dir, f"{account_id}.jpg"))
        except Exception:
            log.warning("avatar of account %s could not be fetched", account_id, exc_info=True)
```
`log.error(...)` chiqishlari log forwarder orqali Telegram log kanaliga ketadi (spec §4.7).

- [ ] **Step 4: O'tishini tekshirish**

Run: `pytest tests/test_supervisor.py -q && ruff check userbot_service/ tests/` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add userbot-service
git commit -m "feat(userbot): supervisor — lease ostida akkountlarni yuritish, revoke aniqlash, logout"
```

---

### Task 9: Legacy sessiya importi

**Files:**
- Create: `userbot_service/importer.py`
- Test: `tests/test_importer.py`

**Interfaces:**
- Consumes: `AccountRepository`, `LegacySession`, `features.PAYMENT`.
- Produces: `async def import_legacy_session(*, session_file: Path, repo: AccountRepository, open_legacy: Callable[[], LegacySession]) -> UUID | None`. `humo_watch_state` ga tegmaydi: `HumoWatcher.attach()` dagi "holat yo'q → eng oxirgi xabardan boshla" qoidasi import qilingan akkountga ham ishlaydi, shuning uchun tarix qayta o'ynalmaydi.

- [ ] **Step 1: Yiqiluvchi testlar**

`tests/test_importer.py`:
```python
from datetime import UTC, datetime

from tests.fakes import ME, FakeAccountClient, FakeKafka
from tests.test_parser import TOPUP_MESSAGE
from userbot_service.importer import import_legacy_session
from userbot_service.payment.queue import PendingQueue
from userbot_service.payment.watcher import HumoWatcher
from userbot_service.telegram.ports import Msg


class Legacy:
    def __init__(self):
        self.closed = False

    async def open(self):
        return ME

    async def export(self):
        return "LEGACY-SESSION"

    async def close(self):
        self.closed = True


async def test_the_terminal_session_becomes_the_payment_account(repo, tmp_path):
    f = tmp_path / "humo_userbot_session.session"
    f.write_bytes(b"sqlite")
    legacy = Legacy()

    account_id = await import_legacy_session(session_file=f, repo=repo, open_legacy=lambda: legacy)

    account = await repo.get(account_id)
    assert account.source == "IMPORTED"
    assert account.connected_by is None
    assert await repo.session_string(account_id) == "LEGACY-SESSION"
    assert (await repo.bindings())["PAYMENT"] == account_id
    assert legacy.closed
    assert f.exists()  # kept for rollback


async def test_no_file_means_nothing_to_import(repo, tmp_path):
    assert await import_legacy_session(session_file=tmp_path / "x.session", repo=repo,
                                       open_legacy=Legacy) is None


async def test_an_existing_payment_binding_means_the_import_already_happened(repo, tmp_path):
    f = tmp_path / "s.session"
    f.write_bytes(b"x")
    first = await import_legacy_session(session_file=f, repo=repo, open_legacy=Legacy)
    second = await import_legacy_session(session_file=f, repo=repo, open_legacy=Legacy)
    assert first is not None and second is None
    assert len(await repo.list()) == 1


async def test_an_account_already_connected_from_the_panel_is_just_bound(repo, tmp_path):
    panel = await repo.upsert_connected(me=ME, session_string="PANEL", source="PANEL", actor=None)
    f = tmp_path / "s.session"
    f.write_bytes(b"x")

    account_id = await import_legacy_session(session_file=f, repo=repo, open_legacy=Legacy)

    assert account_id == panel.id
    assert await repo.session_string(panel.id) == "PANEL"
    assert (await repo.bindings())["PAYMENT"] == panel.id


async def test_import_does_not_replay_history(repo, engine, tmp_path):
    """The old userbot published these without userbotTelegramId; replaying
    them now with the id would be a different key to payment-service — a
    double credit."""
    f = tmp_path / "s.session"
    f.write_bytes(b"x")
    account_id = await import_legacy_session(session_file=f, repo=repo, open_legacy=Legacy)
    at = datetime(2026, 10, 1, tzinfo=UTC)
    client = FakeAccountClient(history=[Msg(40, TOPUP_MESSAGE, at), Msg(41, TOPUP_MESSAGE, at)])
    await client.start()
    kafka = FakeKafka()
    watcher = HumoWatcher(account_id=account_id, telegram_user_id=ME.telegram_user_id,
                          client=client, queue=PendingQueue(engine), kafka=kafka,
                          source_chat="humocardbot")

    await watcher.attach()

    assert kafka.sent == []
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `pytest tests/test_importer.py -q` — Expected: FAIL (`userbot_service.importer` yo'q).

- [ ] **Step 3: Amalga oshirish**

`userbot_service/importer.py`:
```python
"""One-time move of the terminal-created `.session` file into the database.

The file is left in place so the old image can still be rolled back to. It is
read only while no PAYMENT binding exists, i.e. once."""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path
from uuid import UUID

from userbot_service.errors import ApiError
from userbot_service.features import PAYMENT
from userbot_service.repository import AccountRepository
from userbot_service.telegram.ports import LegacySession

log = logging.getLogger(__name__)


async def import_legacy_session(
    *, session_file: Path, repo: AccountRepository, open_legacy: Callable[[], LegacySession],
) -> UUID | None:
    if not session_file.exists() or PAYMENT in await repo.bindings():
        return None
    legacy = open_legacy()
    try:
        me = await legacy.open()
        session = await legacy.export()
    finally:
        await legacy.close()
    try:
        account = await repo.upsert_connected(
            me=me, session_string=session, source="IMPORTED", actor=None, bind_feature=PAYMENT)
    except ApiError as e:
        if e.code != "ALREADY_CONNECTED":
            raise
        account = await repo.find_by_telegram_id(me.telegram_user_id)
        await repo.bind(PAYMENT, account.id, None)
    log.info("imported the terminal session as account %s and bound it to PAYMENT", account.id)
    return account.id
```

- [ ] **Step 4: O'tishini tekshirish**

Run: `pytest tests/test_importer.py -q && ruff check userbot_service/ tests/` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add userbot-service
git commit -m "feat(userbot): terminal orqali olingan sessiyani bir martalik import qilish"
```

---

### Task 10: Panel HTTP API

**Files:**
- Create: `userbot_service/api.py`
- Test: `tests/test_api.py`

**Interfaces:**
- Consumes: `LoginService`, `AccountRepository`, `Supervisor.log_out`, `LeaseStore.liveness`, `FEATURES`, `ApiError`.
- Produces: `create_app(*, repo, logins: LoginService, logout: Callable[[UUID], Awaitable[None]], liveness: Callable[[], Awaitable[dict[UUID, tuple[str, datetime]]]], avatar_dir: str) -> FastAPI`. Yo'llar servis ichida `/api/v1/...` (nginx `/api/userbot/` → `/api/` rewrite qiladi), `GET /healthz`.

  JSON shakllari (camelCase):
  - Login javobi: `{"loginId", "status", "codeType"?, "timeoutSec"?, "hint"?, "account"?}`
  - Akkount: `{"id","firstName","lastName","username","phoneMasked","status","statusReason","source","connectedBy","connectedAt","alive","lastHeartbeat","runner","features":[...],"hasAvatar"}`
  - Vazifa: `{"feature","title","accountId"}`
  - Xato: `{"code","message", ...params}`

- [ ] **Step 1: Yiqiluvchi testlar**

`tests/test_api.py`:
```python
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from tests.fakes import ME, FakeLoginGateway
from userbot_service.api import create_app
from userbot_service.login import LoginService

ADMIN = str(uuid.uuid4())
H = {"X-User-Id": ADMIN, "X-User-Roles": "ROLE_USER,ROLE_ADMIN"}


@pytest.fixture
def state():
    return {"logged_out": [], "live": {}}


@pytest.fixture
async def client(repo, state, tmp_path):
    async def logout(account_id):
        state["logged_out"].append(account_id)
        await repo.mark_disconnected(account_id, None)

    async def liveness():
        return state["live"]

    app = create_app(repo=repo, logins=LoginService(gateway_factory=lambda: FakeLoginGateway(password="pw"), repo=repo),
                     logout=logout, liveness=liveness, avatar_dir=str(tmp_path))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c


@pytest.mark.parametrize("roles", [None, "ROLE_USER", "ROLE_TRADE_ADMIN", "ROLE_ADMINISTRATOR"])
async def test_only_admins_get_in(client, roles):
    headers = {"X-User-Roles": roles} if roles else {}
    r = await client.get("/api/v1/accounts", headers=headers)
    assert r.status_code == 403
    assert r.json()["code"] == "FORBIDDEN"


async def test_roles_with_spaces_are_understood(client):
    r = await client.get("/api/v1/accounts", headers={"X-User-Roles": "ROLE_USER, ROLE_ADMIN"})
    assert r.status_code == 200


async def test_the_full_login_with_two_step_verification(client):
    r = await client.post("/api/v1/logins", json={"phone": "+998 90 123 45 67"}, headers=H)
    assert r.status_code == 200
    login = r.json()
    assert login["status"] == "CODE_SENT" and login["codeType"] == "APP"

    r = await client.post(f"/api/v1/logins/{login['loginId']}/code", json={"code": "12345"}, headers=H)
    assert r.json() == {"loginId": login["loginId"], "status": "PASSWORD_REQUIRED", "hint": "it's the cat"}

    r = await client.post(f"/api/v1/logins/{login['loginId']}/password", json={"password": "pw"}, headers=H)
    body = r.json()
    assert body["status"] == "DONE"
    assert body["account"]["phoneMasked"] == "+998 ******* 67"
    assert body["account"]["connectedBy"] == ADMIN
    assert "session" not in r.text.lower()


async def test_a_wrong_code_is_an_uzbek_400(client):
    login = (await client.post("/api/v1/logins", json={"phone": "+998901234567"}, headers=H)).json()
    r = await client.post(f"/api/v1/logins/{login['loginId']}/code", json={"code": "0"}, headers=H)
    assert r.status_code == 400
    assert r.json() == {"code": "CODE_INVALID", "message": "Kod noto'g'ri."}


async def test_an_unknown_login_is_gone(client):
    r = await client.post(f"/api/v1/logins/{uuid.uuid4()}/code", json={"code": "1"}, headers=H)
    assert r.status_code == 410


async def test_accounts_list_with_liveness_and_features(client, repo, state):
    a = await repo.upsert_connected(me=ME, session_string="S", source="IMPORTED", actor=None,
                                    bind_feature="PAYMENT")
    state["live"] = {a.id: ("payment", datetime.now(UTC) - timedelta(seconds=5))}

    [acc] = (await client.get("/api/v1/accounts", headers=H)).json()

    assert acc["features"] == ["PAYMENT"]
    assert acc["alive"] is True
    assert acc["runner"] == "payment"
    assert acc["source"] == "IMPORTED"
    assert acc["hasAvatar"] is False


async def test_a_stale_heartbeat_is_not_alive(client, repo, state):
    a = await repo.upsert_connected(me=ME, session_string="S", source="PANEL", actor=None)
    state["live"] = {a.id: ("core", datetime.now(UTC) - timedelta(seconds=31))}
    [acc] = (await client.get("/api/v1/accounts", headers=H)).json()
    assert acc["alive"] is False


async def test_a_bound_account_cannot_be_disconnected(client, repo, state):
    a = await repo.upsert_connected(me=ME, session_string="S", source="PANEL", actor=None,
                                    bind_feature="PAYMENT")
    r = await client.delete(f"/api/v1/accounts/{a.id}", headers=H)
    assert r.status_code == 409
    assert r.json()["code"] == "ACCOUNT_BOUND"
    assert "PAYMENT" in r.json()["message"]
    assert state["logged_out"] == []


async def test_an_unbound_account_is_logged_out(client, repo, state):
    a = await repo.upsert_connected(me=ME, session_string="S", source="PANEL", actor=None)
    r = await client.delete(f"/api/v1/accounts/{a.id}", headers=H)
    assert r.status_code == 204
    assert state["logged_out"] == [a.id]


async def test_features_list_and_binding(client, repo):
    a = await repo.upsert_connected(me=ME, session_string="S", source="PANEL", actor=None)
    assert (await client.get("/api/v1/features", headers=H)).json() == [
        {"feature": "PAYMENT", "title": "To'lovlarni kuzatish (Humo karta)", "accountId": None}]

    r = await client.put("/api/v1/features/PAYMENT", json={"accountId": str(a.id)}, headers=H)
    assert r.status_code == 200
    assert r.json()["accountId"] == str(a.id)


async def test_binding_an_unknown_feature_is_404(client, repo):
    a = await repo.upsert_connected(me=ME, session_string="S", source="PANEL", actor=None)
    r = await client.put("/api/v1/features/NOPE", json={"accountId": str(a.id)}, headers=H)
    assert r.status_code == 404


async def test_avatar_is_served_when_present(client, repo, tmp_path):
    a = await repo.upsert_connected(me=ME, session_string="S", source="PANEL", actor=None)
    assert (await client.get(f"/api/v1/accounts/{a.id}/avatar", headers=H)).status_code == 404
    (tmp_path / f"{a.id}.jpg").write_bytes(b"\xff\xd8jpeg")
    r = await client.get(f"/api/v1/accounts/{a.id}/avatar", headers=H)
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"


async def test_healthz_needs_no_auth(client):
    assert (await client.get("/healthz")).status_code == 200
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `pytest tests/test_api.py -q` — Expected: FAIL (`userbot_service.api` yo'q).

- [ ] **Step 3: Amalga oshirish**

`userbot_service/api.py`:
```python
"""Admin panel API. nginx authenticates and forwards X-User-Id / X-User-Roles;
this service only checks the role, like every service behind auth_request."""

from __future__ import annotations

import os
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from uuid import UUID

from fastapi import Depends, FastAPI, Header, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from userbot_service.errors import ApiError
from userbot_service.features import FEATURES
from userbot_service.login import LoginService, LoginStep
from userbot_service.repository import Account, AccountRepository

ALIVE_WITHIN_SECONDS = 30


class PhoneIn(BaseModel):
    phone: str


class CodeIn(BaseModel):
    code: str


class PasswordIn(BaseModel):
    password: str


class BindIn(BaseModel):
    accountId: UUID  # noqa: N815 — wire name


def require_admin(x_user_roles: str | None = Header(None),
                  x_user_id: str | None = Header(None)) -> UUID | None:
    roles = {r.strip() for r in (x_user_roles or "").split(",")}
    if "ROLE_ADMIN" not in roles:
        raise ApiError("FORBIDDEN")
    try:
        return UUID(x_user_id) if x_user_id else None
    except ValueError:
        return None


def create_app(
    *, repo: AccountRepository, logins: LoginService,
    logout: Callable[[UUID], Awaitable[None]],
    liveness: Callable[[], Awaitable[dict[UUID, tuple[str, datetime]]]],
    avatar_dir: str,
) -> FastAPI:
    app = FastAPI(title="userbot-service", docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(ApiError)
    async def _api_error(_req: Request, e: ApiError) -> JSONResponse:
        return JSONResponse({"code": e.code, "message": e.message, **e.params}, status_code=e.status)

    def avatar_path(account_id: UUID) -> str:
        return os.path.join(avatar_dir, f"{account_id}.jpg")

    async def account_json(a: Account, live=None, features=None) -> dict:
        live = live if live is not None else await liveness()
        runner, beat = live.get(a.id, (None, None))
        alive = beat is not None and (datetime.now(UTC) - beat).total_seconds() <= ALIVE_WITHIN_SECONDS
        return {
            "id": str(a.id), "firstName": a.first_name, "lastName": a.last_name,
            "username": a.username, "phoneMasked": a.phone_masked, "status": a.status,
            "statusReason": a.status_reason, "source": a.source,
            "connectedBy": str(a.connected_by) if a.connected_by else None,
            "connectedAt": a.connected_at.isoformat(),
            "alive": bool(alive and a.status == "ACTIVE"),
            "lastHeartbeat": beat.isoformat() if beat and beat.year > 1970 else None,
            "runner": runner,
            "features": features if features is not None else await repo.features_of(a.id),
            "hasAvatar": os.path.exists(avatar_path(a.id)),
        }

    async def step_json(step: LoginStep) -> dict:
        body: dict = {"loginId": str(step.login_id), "status": step.status}
        if step.code_type is not None:
            body["codeType"] = step.code_type
        if step.timeout_sec is not None:
            body["timeoutSec"] = step.timeout_sec
        if step.status == "PASSWORD_REQUIRED":
            body["hint"] = step.hint
        if step.account is not None:
            body["account"] = await account_json(step.account)
        return body

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    @app.post("/api/v1/logins")
    async def start_login(body: PhoneIn, actor: UUID | None = Depends(require_admin)) -> dict:
        return await step_json(await logins.start(body.phone, actor))

    @app.post("/api/v1/logins/{login_id}/code")
    async def submit_code(login_id: UUID, body: CodeIn, _=Depends(require_admin)) -> dict:
        return await step_json(await logins.submit_code(login_id, body.code))

    @app.post("/api/v1/logins/{login_id}/password")
    async def submit_password(login_id: UUID, body: PasswordIn, _=Depends(require_admin)) -> dict:
        return await step_json(await logins.submit_password(login_id, body.password))

    @app.post("/api/v1/logins/{login_id}/resend")
    async def resend(login_id: UUID, _=Depends(require_admin)) -> dict:
        return await step_json(await logins.resend(login_id))

    @app.delete("/api/v1/logins/{login_id}", status_code=204)
    async def cancel(login_id: UUID, _=Depends(require_admin)) -> Response:
        await logins.cancel(login_id)
        return Response(status_code=204)

    @app.get("/api/v1/accounts")
    async def list_accounts(_=Depends(require_admin)) -> list[dict]:
        live = await liveness()
        by_account: dict[UUID, list[str]] = {}
        for feature, account_id in sorted((await repo.bindings()).items()):
            by_account.setdefault(account_id, []).append(feature)
        return [await account_json(a, live, by_account.get(a.id, [])) for a in await repo.list()]

    @app.get("/api/v1/accounts/{account_id}/avatar")
    async def avatar(account_id: UUID, _=Depends(require_admin)):
        path = avatar_path(account_id)
        if not os.path.exists(path):
            return Response(status_code=404)
        return FileResponse(path, media_type="image/jpeg")

    @app.delete("/api/v1/accounts/{account_id}", status_code=204)
    async def disconnect(account_id: UUID, _=Depends(require_admin)) -> Response:
        await repo.get(account_id)
        features = await repo.features_of(account_id)
        if features:
            raise ApiError("ACCOUNT_BOUND", features=", ".join(features))
        await logout(account_id)
        return Response(status_code=204)

    @app.get("/api/v1/features")
    async def list_features(_=Depends(require_admin)) -> list[dict]:
        bound = await repo.bindings()
        return [{"feature": f, "title": t, "accountId": str(bound[f]) if f in bound else None}
                for f, t in FEATURES.items()]

    @app.put("/api/v1/features/{feature}")
    async def bind(feature: str, body: BindIn, actor: UUID | None = Depends(require_admin)) -> dict:
        await repo.bind(feature, body.accountId, actor)
        return {"feature": feature, "title": FEATURES[feature], "accountId": str(body.accountId)}

    return app
```
Eslatma: `ApiError.params` `ACCOUNT_BOUND` uchun `features` ni ham javobga qo'shadi — bu frontend uchun foydali, test faqat `code` va `message` ni tekshiradi. `CODE_INVALID` javobida params bo'sh, shuning uchun test `== {"code","message"}` o'tadi.

- [ ] **Step 4: O'tishini tekshirish**

Run: `pytest tests/test_api.py -q && ruff check userbot_service/ tests/` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add userbot-service
git commit -m "feat(userbot): admin panel API — login, akkountlar, uzish, vazifaga biriktirish"
```

---

### Task 11: Entrypointlar, Docker, compose, nginx, deploy

**Files:**
- Create: `userbot_service/main_core.py`, `userbot_service/main_payment.py`, `userbot-service/entrypoint.sh`
- Modify: `userbot-service/Dockerfile`, `docker-compose.yml`, `nginx/conf.d/backends.inc`, `nginx/conf.d/efbazaar.conf` (443 va 8080 server bloklari), `deploy.sh`, `.github/workflows/deploy.yml`
- Test: `tests/test_entrypoints.py`

**Interfaces:**
- Consumes: hamma oldingi tasklar.
- Produces: `python -m userbot_service.main_core`, `python -m userbot_service.main_payment`; compose servislari `userbot-core` (8089) va `userbot-payment`.

- [ ] **Step 1: Entrypoint import testi (yiqiluvchi)**

`tests/test_entrypoints.py`:
```python
"""Importing an entrypoint must not build a Pyrogram Client or touch the
network: clients are created inside the running loop (see test_pyrogram_adapter)."""

import importlib


def test_entrypoints_import_without_side_effects(monkeypatch):
    for name in ("main_core", "main_payment"):
        module = importlib.import_module(f"userbot_service.{name}")
        assert callable(module.main)
        assert not hasattr(module, "app")
```
Run: `pytest tests/test_entrypoints.py -q` — Expected: FAIL (modul yo'q).

- [ ] **Step 2: `main_payment.py`**

```python
"""userbot-payment: the account bound to PAYMENT, the Humo watcher, the heartbeat.

Separate from userbot-core so that nothing done for other features can stall
the process that money depends on."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from userbot_service.config import get_settings
from userbot_service.crypto import SessionCipher
from userbot_service.db.engine import make_engine, run_migrations
from userbot_service.importer import import_legacy_session
from userbot_service.kafka_client import USERBOT_HEARTBEAT, KafkaClient, iso_z
from userbot_service.lease import LeaseStore
from userbot_service.observability.kafka_log_forwarder import KafkaLogForwarder
from userbot_service.payment.queue import PendingQueue
from userbot_service.payment.watcher import HumoWatcher
from userbot_service.repository import AccountRepository
from userbot_service.supervisor import Supervisor
from userbot_service.telegram.pyrogram_adapter import PyrogramAccountClient, PyrogramLegacySession

log = logging.getLogger(__name__)


async def main() -> None:
    s = get_settings()
    engine = make_engine(s.database_url)
    repo = AccountRepository(engine, SessionCipher(s.session_key))
    queue = PendingQueue(engine)
    kafka = KafkaClient(s.kafka_bootstrap_servers)
    await kafka.start()
    logging.getLogger().addHandler(KafkaLogForwarder(
        producer=kafka, service_name="userbot-payment", loop=asyncio.get_running_loop(),
    ).logging_handler())

    await import_legacy_session(
        session_file=Path(s.telegram_session_dir) / f"{s.telegram_session_name}.session",
        repo=repo,
        open_legacy=lambda: PyrogramLegacySession(
            s.telegram_session_name, s.telegram_session_dir,
            api_id=s.telegram_api_id, api_hash=s.telegram_api_hash))

    watchers: dict[UUID, HumoWatcher] = {}

    async def on_started(account_id, client):
        account = await repo.get(account_id)
        watcher = HumoWatcher(account_id=account_id, telegram_user_id=account.telegram_user_id,
                              client=client, queue=queue, kafka=kafka, source_chat=s.source_chat)
        watchers[account_id] = watcher
        await watcher.attach()
        log.info("watching %s with account %s", s.source_chat, account_id)

    async def on_stopped(account_id):
        watchers.pop(account_id, None)

    supervisor = Supervisor(
        runner="payment", repo=repo, leases=LeaseStore(engine, "payment"),
        client_factory=lambda account_id, session: PyrogramAccountClient(
            account_id, session, api_id=s.telegram_api_id, api_hash=s.telegram_api_hash),
        on_started=on_started, on_stopped=on_stopped, avatar_dir=s.avatar_dir)

    async def heartbeat() -> None:
        while True:
            try:
                watcher = next(iter(watchers.values()), None)
                healthy, reason = (await watcher.health()) if watcher else (
                    False, "no account is bound to PAYMENT or it is not running")
                if healthy:
                    await kafka.publish(USERBOT_HEARTBEAT, {"sentAt": iso_z(datetime.now(UTC))})
                else:
                    # Withholding is the safe direction: deposits close.
                    log.error("withholding the heartbeat — %s", reason)
            except Exception:
                log.exception("heartbeat failed")
            await asyncio.sleep(s.heartbeat_interval_seconds)

    async def flusher() -> None:
        while True:
            for watcher in list(watchers.values()):
                with contextlib.suppress(Exception):
                    await watcher.flush()
            await asyncio.sleep(5)

    tasks = [asyncio.create_task(supervisor.run_forever()), asyncio.create_task(heartbeat()),
             asyncio.create_task(flusher())]
    try:
        await asyncio.gather(*tasks)
    finally:
        for t in tasks:
            t.cancel()
        await supervisor.shutdown()
        await kafka.stop()
        await engine.dispose()


if __name__ == "__main__":
    settings = get_settings()
    logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO),
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    run_migrations(settings.database_url)
    # Clients are built by the supervisor inside this loop, never at import.
    asyncio.run(main())
```

- [ ] **Step 3: `main_core.py`**

```python
"""userbot-core: the admin panel API, logins, and every account not bound to PAYMENT."""

from __future__ import annotations

import asyncio
import logging

import uvicorn

from userbot_service.api import create_app
from userbot_service.config import get_settings
from userbot_service.crypto import SessionCipher
from userbot_service.db.engine import make_engine, run_migrations
from userbot_service.kafka_client import KafkaClient
from userbot_service.lease import LeaseStore
from userbot_service.login import LoginService
from userbot_service.observability.kafka_log_forwarder import KafkaLogForwarder
from userbot_service.repository import AccountRepository
from userbot_service.supervisor import Supervisor
from userbot_service.telegram.pyrogram_adapter import PyrogramAccountClient, PyrogramLoginGateway

log = logging.getLogger(__name__)


async def main() -> None:
    s = get_settings()
    engine = make_engine(s.database_url)
    repo = AccountRepository(engine, SessionCipher(s.session_key))
    leases = LeaseStore(engine, "core")
    kafka = KafkaClient(s.kafka_bootstrap_servers)
    await kafka.start()
    logging.getLogger().addHandler(KafkaLogForwarder(
        producer=kafka, service_name="userbot-core", loop=asyncio.get_running_loop(),
    ).logging_handler())

    supervisor = Supervisor(
        runner="core", repo=repo, leases=leases,
        client_factory=lambda account_id, session: PyrogramAccountClient(
            account_id, session, api_id=s.telegram_api_id, api_hash=s.telegram_api_hash),
        avatar_dir=s.avatar_dir)
    logins = LoginService(
        gateway_factory=lambda: PyrogramLoginGateway(s.telegram_api_id, s.telegram_api_hash),
        repo=repo)
    app = create_app(repo=repo, logins=logins, logout=supervisor.log_out,
                     liveness=leases.liveness, avatar_dir=s.avatar_dir)
    server = uvicorn.Server(uvicorn.Config(app, host="0.0.0.0", port=s.http_port,
                                           log_level=s.log_level.lower(), access_log=False))

    async def sweeper() -> None:
        while True:
            await logins.sweep()
            await asyncio.sleep(30)

    tasks = [asyncio.create_task(supervisor.run_forever()), asyncio.create_task(sweeper())]
    try:
        await server.serve()
    finally:
        for t in tasks:
            t.cancel()
        await supervisor.shutdown()
        await kafka.stop()
        await engine.dispose()


if __name__ == "__main__":
    settings = get_settings()
    logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO),
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    run_migrations(settings.database_url)
    asyncio.run(main())
```
`access_log=False`: login so'rovlari URL'ida maxfiy narsa yo'q, lekin body'lar logga tushmasligi uchun uvicorn access logi umuman o'chiq; xatolar baribir `log.exception` orqali chiqadi.

Run: `pytest tests/test_entrypoints.py -q` — Expected: PASS.

- [ ] **Step 4: Dockerfile**

`userbot-service/Dockerfile` ni almashtiring:
```dockerfile
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
```
(`entrypoint.sh` kerak emas — `run_migrations` har entrypoint'da `__main__` ichida.)

Run: `cd userbot-service && docker build -t userbot-service:ci .` — Expected: muvaffaqiyatli build.

- [ ] **Step 5: docker-compose**

`docker-compose.yml` dagi `humo-userbot:` blokini (izohi bilan) quyidagiga almashtiring:
```yaml
  # ---------- userbot-service (Telegram user akkountlari) ----------
  # Bitta image, ikki container. userbot-core — admin panel API (login, ro'yxat,
  # uzish, vazifaga biriktirish) va PAYMENT'ga biriktirilmagan akkountlar.
  # userbot-payment — faqat PAYMENT akkounti: Humo kuzatuvi va heartbeat.
  # Sessiyalar userbot_db da shifrlangan (USERBOT_SESSION_KEY). Akkount faqat
  # lease olgan containerda ishlaydi — bitta auth key ikki joyda ishlasa
  # Telegram uni bekor qiladi. Qarang: userbot-service/README.md.
  userbot-core:
    image: ${IMAGE_REGISTRY:-ghcr.io}/${IMAGE_NAMESPACE:-abdurahmoniy/efbazaar}-userbot-service:${IMAGE_TAG:-latest}
    build:
      context: ./userbot-service
    container_name: efbazaar-userbot-core
    command: ["python", "-m", "userbot_service.main_core"]
    restart: unless-stopped
    logging: *default-logging
    environment: &userbot-env
      RUNNER: core
      TELEGRAM_API_ID: ${TELEGRAM_API_ID}
      TELEGRAM_API_HASH: ${TELEGRAM_API_HASH}
      HUMO_SOURCE_CHAT: ${HUMO_SOURCE_CHAT:-humocardbot}
      KAFKA_BOOTSTRAP_SERVERS: ${KAFKA_BOOTSTRAP_SERVERS}
      POSTGRES_HOST: ${POSTGRES_HOST}
      POSTGRES_PORT: ${POSTGRES_PORT}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${USERBOT_DB_NAME:-userbot_db}
      USERBOT_SESSION_KEY: ${USERBOT_SESSION_KEY}
      AVATAR_DIR: /avatars
      LOG_LEVEL: INFO
    volumes:
      - userbot-avatars:/avatars
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8089/healthz', timeout=3)"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_started
    mem_limit: 256m
    memswap_limit: 384m
    networks:
      - efbazaar-net

  userbot-payment:
    image: ${IMAGE_REGISTRY:-ghcr.io}/${IMAGE_NAMESPACE:-abdurahmoniy/efbazaar}-userbot-service:${IMAGE_TAG:-latest}
    container_name: efbazaar-userbot-payment
    command: ["python", "-m", "userbot_service.main_payment"]
    restart: unless-stopped
    logging: *default-logging
    environment:
      <<: *userbot-env
      RUNNER: payment
      TELEGRAM_SESSION_DIR: /session
    volumes:
      # Pre-panel session from the terminal login; read once by the importer
      # and kept for rollback.
      - humo-userbot-session:/session
      - userbot-avatars:/avatars
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_started
    mem_limit: 256m
    memswap_limit: 384m
    networks:
      - efbazaar-net
```
`volumes:` bo'limiga `userbot-avatars:` qo'shing (`humo-userbot-session:` qoladi).
postgres servisidagi `POSTGRES_MULTIPLE_DATABASES` qatori oxiriga `,${USERBOT_DB_NAME:-userbot_db}` qo'shing.

Tekshirish:
```bash
cd /home/mukhiddinov/IdeaProjects/ef-bazaar
USERBOT_SESSION_KEY=x docker compose config -q && echo OK
docker compose config --services | grep -E "userbot|humo"
```
Expected: `OK`, `userbot-core`, `userbot-payment` (humo yo'q).

- [ ] **Step 6: nginx**

`nginx/conf.d/backends.inc` ga:
```nginx
set $backend_userbot     "userbot-core:8089";
```
`nginx/conf.d/efbazaar.conf` da **ikkala** serverdagi (443 va `listen 8080`) `/api/payment/` blokidan keyin — 443 serverda `@trade_unauth`, 8080 serverda `@trade_unauth_internal` bilan:
```nginx
    # ---------- userbot-service (admin: Telegram userbotlar) ----------
    # Auth majburiy; ROLE_ADMIN ni servisning o'zi tekshiradi.
    location /api/userbot/ {
        auth_request /_auth_verify;
        error_page 401 = @trade_unauth;

        auth_request_set $user_id      $upstream_http_x_user_id;
        auth_request_set $user_roles   $upstream_http_x_user_roles;

        proxy_set_header X-User-Id     $user_id;
        proxy_set_header X-User-Roles  $user_roles;

        rewrite ^/api/userbot/(.*)$ /api/$1 break;
        proxy_pass http://$backend_userbot$uri$is_args$args;
        include /etc/nginx/conf.d/proxy-common.inc;
    }
```
Tekshirish (nginx image'i bilan sintaksis):
```bash
docker compose build nginx && docker compose run --rm --no-deps --entrypoint nginx nginx -t
```
Expected: `syntax is ok` (agar sertifikat yo'qligi sabab yiqilsa — `nginx/README.md` dagi lokal tekshiruv usulidan foydalaning va natijani yozib qo'ying).

- [ ] **Step 7: deploy.sh va deploy.yml**

`deploy.sh`:
- `upsert_env .env RECOMMENDATION_DB_NAME ...` dan keyin: `upsert_env .env USERBOT_DB_NAME            userbot_db`
- humo bloki (144–150) yonida:
  ```bash
  # userbot-service — sessiyalarni shifrlash kaliti. Yo'qolsa barcha akkountlar
  # qayta ulanadi. `openssl rand -base64 32`.
  if [[ -n "${USERBOT_SESSION_KEY:-}" ]]; then
    assert_safe_for_env USERBOT_SESSION_KEY "$USERBOT_SESSION_KEY"
    upsert_env .env USERBOT_SESSION_KEY "$USERBOT_SESSION_KEY"
  fi
  ```
- `access_bootstrap` dan keyin:
  ```bash
  # ─── Userbot-service bootstrap ──────────────────────────────────────────────
  # userbot_db ni yaratadi va eski bitta-akkountli humo-userbot containerini
  # o'chiradi. Ikkinchisi --remove-orphans ga qoldirilmaydi: compose yangi
  # containerlarni eskisi o'chishidan OLDIN ishga tushirishi mumkin, va bitta
  # sessiya ikki joyda ishlasa Telegram uni bekor qiladi (AUTH_KEY_DUPLICATED).
  userbot_bootstrap() {
    ensure_db "${USERBOT_DB_NAME:-userbot_db}"
    docker rm -f efbazaar-humo-userbot >/dev/null 2>&1 || true
  }
  ```
- chaqiruvlar ro'yxatiga (`access_bootstrap` dan keyin) `userbot_bootstrap`.

`.github/workflows/deploy.yml`: `HUMO_SOURCE_CHAT` qatoridan keyin `USERBOT_SESSION_KEY: ${{ secrets.USERBOT_SESSION_KEY }}` va `envs:` ro'yxatiga `USERBOT_SESSION_KEY` (fayldagi izoh: ikkala joyda bo'lishi shart).

Tekshirish:
```bash
bash -n deploy.sh && grep -n "userbot_bootstrap\|USERBOT_SESSION_KEY" deploy.sh .github/workflows/deploy.yml
```
Expected: sintaksis xatosiz; kalit ikkala joyda, `envs:` ro'yxatida ham.

- [ ] **Step 8: Commit**

```bash
git add -A userbot-service docker-compose.yml nginx deploy.sh .github/workflows/deploy.yml
git commit -m "feat(userbot): core va payment entrypointlari, compose, nginx /api/userbot, deploy"
```

---

### Task 12: Hujjatlar va to'liq tekshiruv

**Files:**
- Modify: `userbot-service/README.md` (to'liq qayta yoziladi), `userbot-service/CLAUDE.md`, `CLAUDE.md`, `README.md`, `docs/kafka-topics.md`, `docs/superpowers/specs/2026-09-30-transactional-outbox-design.md` (§4.2 ga eslatma), `backend/payment-service/README.md` (humo-userbot → userbot-payment)

- [ ] **Step 1: README**

`userbot-service/README.md` tuzilishi (mavjud README'dagi "The filter is a correctness boundary", "Configuration", "Development" bo'limlarining mazmunini saqlang, yangilang):
1. Nima: ikki container, vazifalar (`PAYMENT`), lease qoidasi.
2. Panel API jadvali (Task 10 dagi yo'llar, `/api/userbot/v1/...`), xato kodlari jadvali.
3. Kafka: `card-credit-observed`, `card-debit-observed` (+`userbotTelegramId`), `userbot-heartbeat` — faqat `userbot-payment` yuboradi.
4. Jadvallar (`userbot_db`).
5. Akkount ulash: endi admin panel → "Userbotlar" → "Userbot ulash". Eski terminal buyrug'i o'chiriladi; uning o'rniga "Mavjud `.session` birinchi startda avtomatik import qilinadi" va "rollback: `userbot-payment` ni to'xtatib, eski `humo-userbot` image'ini ishga tushiring — ikkalasi bir vaqtda ishlamasin".
6. Konfiguratsiya: yangi env'lar (`RUNNER`, `POSTGRES_*`, `USERBOT_DB_NAME`, `USERBOT_SESSION_KEY`, `HTTP_PORT`, `AVATAR_DIR`) va eskilari.
7. Development: `uv venv -p 3.12`, `pytest -q` Docker talab qiladi.

`userbot-service/CLAUDE.md` sarlavhasi `# userbot-service`.

- [ ] **Step 2: Root hujjatlar**

- `CLAUDE.md`: repo strukturasida `humo-userbot/` → `userbot-service/        # Python — Telegram userbot akkountlari: admin panel API (8089) va Humo payment kuzatuvi`; servislar jadvaliga `| userbot-core | 8089 | /api/userbot/** (faqat ROLE_ADMIN) |`.
- `README.md`: shu o'zgarishlar.
- `docs/kafka-topics.md`: producer ustunida `humo-userbot` → `userbot-payment`.
- `backend/payment-service/README.md`: `humo-userbot` eslatmalari → `userbot-payment` (Java izohlariga tegilmaydi).
- Outbox spec §4.2 boshiga: `> 2026-10-03: o'rnini [userbot boshqaruvi dizayni](2026-10-02-userbot-management-design.md) §4.4 egalladi — navbat Postgres'da (userbot_db).`

- [ ] **Step 3: To'liq tekshiruv (AGENTS.md)**

```bash
cd /home/mukhiddinov/IdeaProjects/ef-bazaar/userbot-service
. .venv/bin/activate
uv pip install -r requirements-dev.txt
ruff check userbot_service/ tests/
pytest -q -ra
docker build -t userbot-service:ci .
cd .. && USERBOT_SESSION_KEY=x docker compose config -q && bash -n deploy.sh
git fetch && git rebase origin/main && (cd userbot-service && pytest -q)
git diff origin/main --stat && git diff --check
```
Expected: ruff toza; pytest — barcha testlar PASS, `skipped` 0 (`-ra` ko'rsatadi); docker build muvaffaqiyatli; compose config va bash -n xatosiz; `git diff --check` bo'sh; diffda `.session`, `.venv`, kalitlar yo'q.

- [ ] **Step 4: Commit**

```bash
git add -A userbot-service CLAUDE.md README.md docs backend/payment-service/README.md
git commit -m "docs(userbot): userbot-service README, servis jadvali, kafka katalogi"
```

- [ ] **Step 5: Deploy oldidan qo'lda qadamlar (PR tavsifiga yoziladi)**

1. GitHub Secrets: `USERBOT_SESSION_KEY` = `openssl rand -base64 32` natijasi.
2. 1-reja (payment-service) allaqachon deploy qilinganini tekshiring.
3. Deploy'dan keyin: `docker logs efbazaar-userbot-payment | grep imported` — import bo'lgani; `docker logs efbazaar-userbot-payment | grep withholding` — bo'sh bo'lishi; payment admin panelidagi userbot statusi yashil.
4. Staging/prod'da spec §10 dagi qo'lda tekshiruvlar (frontend 3-rejadan keyin).
