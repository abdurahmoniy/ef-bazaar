# Userbotlar boshqaruvi — dizayn

Sana: 2026-10-02 · Holat: tasdiqlangan dizayn, spec ko'rib chiqilishi kutilmoqda
Bog'liq: [transactional outbox](2026-09-30-transactional-outbox-design.md) §4.2 ning o'rnini shu dizayn
egallaydi (pastda §7).

## 1. Muammo va maqsad

Hozir `humo-userbot` bitta Pyrogram sessiyasi bilan ishlaydi. Sessiya serverda terminal orqali
(`docker compose run -it ...`) interaktiv login bilan yaratiladi va volume'da `.session` fayl
bo'lib yotadi. Ko'rinmaydi, boshqarib bo'lmaydi, bekor bo'lsa qayta tiklash uchun yana SSH kerak.

Userbotlar faqat payment uchun emas. Rejada:

- **PAYMENT**: Humo bot chatini kuzatish (hozir bor).
- **Kanalga post**: admin nomidan kanalga yozish (keyingi spec).
- **Support**: maxsus chatbotga bog'langan avto-javob (keyingi spec).

Maqsad: admin panelida **"Userbotlar"** bo'limi bo'ladi. U yerda akkountlar Telegram login
oynasining efBazaar ranglaridagi nusxasi orqali ulanadi, barcha ulangan akkountlar ro'yxatda
ko'rinadi va har bir vazifa uchun "Userbotni tanlash" orqali bitta akkount biriktiriladi.

**Bu spec doirasi:** registry, panel orqali login, ro'yxat va status, uzish, mavjud sessiyani import
qilish, vazifa biriktirish mexanizmi. Mexanizm umumiy quriladi, lekin bu specda yagona vazifa `PAYMENT`.
Post va support vazifalari alohida spec'lar bo'ladi.

**Doiradan tashqari:** QR login (keyin alohida qo'shilishi mumkin), yangi rol, post va support logikasi.

## 2. Qattiq cheklovlar

1. **Bitta sessiya faqat bitta joyda ishlaydi.** Bir xil auth key ikki joyda parallel ishlatilsa,
   Telegram `AUTH_KEY_DUPLICATED` beradi va sessiyani butunlay bekor qiladi. Har bir akkountni
   faqat bitta runner yuritadi (§4.3 lease).
2. **Pyrogram uzilishda kelgan update'larni qayta olib bermaydi.** Payment uchun restart pul
   yo'qotish demakdir, shuning uchun payment runner startda catch-up qiladi (§4.4).
3. **Telegram user akkountlarni avtomatlashtirish uchun ban qilishi mumkin.** FloodWait ushlanadi va
   kutiladi. Payment akkountini xavfli vazifalardan (avto-javob) ajratish tavsiya qilinadi, lekin
   majburiy emas.
4. **Telegram xabar id'lari har bir akkountga alohida.** Shaxsiy chatdagi `message.id` faqat shu
   akkount ichida noyob. Payment'dagi `telegram_message_id UNIQUE` payment boshqa akkountga
   o'tkazilganda eski id'lar bilan to'qnashadi va kirim **jim tashlab yuboriladi** (§6).

## 3. Arxitektura

`humo-userbot/` papkasi `userbot-service/` ga ko'chiriladi va kengaytiriladi (Python 3.12).
Bitta image ikki container bo'lib ishlaydi:

| Container | Vazifasi |
|---|---|
| `userbot-core` | Panel HTTP API'si (FastAPI, port 8089), login oqimi, `PAYMENT` ga biriktirilmagan barcha `ACTIVE` akkountlarni yuritadi |
| `userbot-payment` | Faqat `PAYMENT` ga biriktirilgan akkountni yuritadi: Humo kuzatuvi, heartbeat, catch-up, import |

Ikki container sabab: post yoki support uchun qilingan o'zgarish payment kuzatuvchisini qayta
ishga tushirmasin. Image bitta bo'lgani uchun deploy baribir ikkalasini ham qayta ishga tushiradi.
Bundan catch-up (§4.4) himoya qiladi. Ajratishning asosiy foydasi ishlash vaqtidagi izolyatsiya:
core'dagi xato yoki osilib qolish payment'ga ta'sir qilmaydi.

Bir akkount bir nechta vazifada ishlashi mumkin. Akkount `PAYMENT` ga biriktirilgan bo'lsa, uning
boshqa vazifalari (keyingi spec'larda) ham `userbot-payment` ichida ishlaydi (cheklov 1).

`payment-service` userbot registry'sini bilmaydi. U avvalgidek Kafka'dan kuzatuvlar va heartbeat
oladi.

## 4. Komponentlar

### 4.1 DB: `userbot_db`

Postgres'da alohida baza (`infra/` init skripti). Migratsiyalar Alembic bilan, kod SQLAlchemy async +
asyncpg. Alembic revision'lari Flyway V-fayllari kabi **immutable**: merge bo'lganini edit qilish
taqiqlanadi, o'zgarish uchun yangi revision ochiladi.

```sql
CREATE TABLE userbot_accounts (
    id                 UUID PRIMARY KEY,
    telegram_user_id   BIGINT      NOT NULL UNIQUE,
    first_name         TEXT        NOT NULL,
    last_name          TEXT,
    username           TEXT,
    phone_masked       TEXT        NOT NULL,          -- +998 ** *** ** 12
    session_ciphertext BYTEA       NOT NULL,          -- AES-GCM, kalit USERBOT_SESSION_KEY
    session_iv         BYTEA       NOT NULL,
    status             TEXT        NOT NULL,          -- ACTIVE | REVOKED | DISCONNECTED
    source             TEXT        NOT NULL,          -- PANEL | IMPORTED
    connected_by       UUID,                          -- X-User-Id; IMPORTED da NULL
    connected_at       TIMESTAMPTZ NOT NULL,
    status_changed_at  TIMESTAMPTZ NOT NULL,
    status_reason      TEXT
);

CREATE TABLE userbot_bindings (
    feature     TEXT PRIMARY KEY,                     -- PAYMENT (keyin: CHANNEL_POST, SUPPORT)
    account_id  UUID NOT NULL REFERENCES userbot_accounts(id),
    bound_by    UUID,
    bound_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE userbot_leases (
    account_id     UUID PRIMARY KEY REFERENCES userbot_accounts(id) ON DELETE CASCADE,
    runner         TEXT        NOT NULL,              -- core | payment
    lease_until    TIMESTAMPTZ NOT NULL,
    last_heartbeat TIMESTAMPTZ NOT NULL
);

-- Payment kuzatuvchisining holati va yuborilmagan navbati (outbox §4.2 o'rniga)
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
    id         BIGSERIAL PRIMARY KEY,
    action     TEXT NOT NULL,                         -- CONNECTED | IMPORTED | DISCONNECTED | REVOKED | BOUND
    account_id UUID,
    feature    TEXT,
    actor      UUID,
    at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 Runner'lar

Har bir runner har 5 soniyada DB'dan o'ziga tegishli akkountlar to'plamini hisoblaydi:

- `payment`: `userbot_bindings.feature = 'PAYMENT'` dagi akkount (agar `ACTIVE` bo'lsa).
- `core`: qolgan barcha `ACTIVE` akkountlar.

Hisoblangan to'plam bilan hozir ishlab turgan client'lar farq qilsa, ortiqchalari to'xtatiladi
(lease bo'shatiladi), yetishmayotganlari lease olingandan keyin ishga tushiriladi.

Client sessiyasi DB'dagi shifrlangan satrdan `Client(name, session_string=..., in_memory=True)`
ko'rinishida ochiladi. Diskda sessiya fayli qolmaydi.

### 4.3 Lease (AUTH_KEY_DUPLICATED himoyasi)

- Client faqat lease olingandan **keyin** ishga tushadi. Lease olish:
  `INSERT ... ON CONFLICT (account_id) DO UPDATE ... WHERE userbot_leases.lease_until < now() OR userbot_leases.runner = :me`.
  Qator qaytmasa, akkount band.
- Runner lease'ni har 5 soniyada 30 soniyaga uzaytiradi. Uzaytira olmasa (DB uzilgan), client'ni
  **o'zi to'xtatadi**. Lease muddati o'tgandan keyin akkountni boshqa runner olishi mumkin, shu
  sababli to'xtatish lease muddatidan oldin bo'lishi shart.
- Client to'xtatilgach lease `DELETE` qilinadi.
- **Payment'ni boshqa akkountga o'tkazish (rebind):** bindings yangilanadi. Keyingi siklda core
  yangi akkountni to'xtatib lease'ini bo'shatadi, payment eski akkountni to'xtatib bo'shatadi va
  yangisini oladi, core eskisini oladi. Hech bir qadamda akkount ikki joyda bir vaqtda ishlamaydi.
  Bo'shliq ~5–10 soniya, uni catch-up yopadi.

### 4.4 Payment kuzatuvchisi: navbat va catch-up

Hozirgi `on_humo_message` + parser + heartbeat mantig'i o'zgarmaydi, faqat yetkazish ishonchli bo'ladi:

1. Xabar kelganda kuzatuv **avval** `humo_pending` ga yoziladi, keyin Kafka'ga yuboriladi.
   Muvaffaqiyatli bo'lsa, qator o'chiriladi va `last_message_id` yangilanadi.
2. Fon vazifasi har 5 soniyada `humo_pending` ni qayta yuboradi.
3. Startda va lease olingandan keyin `get_chat_history(source_chat)` bilan `last_message_id` dan
   keyingi xabarlar o'qiladi va xuddi shu parser orqali navbatga qo'yiladi. `humo_watch_state` qatori
   yo'q bo'lsa (yangi biriktirilgan akkount), joriy oxirgi xabar id'si yoziladi va tarix qayta
   o'ynalmaydi: yangi akkountning eski xabarlari platformaga tegishli emas.
4. `_reporting_ok` qoidasi: `humo_pending` da 60 soniyadan eski qator bo'lsa, heartbeat ushlab
   turiladi va depozitlar yopiladi.

Takrorlanish xavfsiz, chunki payment `(userbot_telegram_id, telegram_message_id)` bo'yicha idempotent (§6).

### 4.5 Mavjud sessiyani import qilish

`userbot-payment` startida quyidagilar tekshiriladi:

- `TELEGRAM_SESSION_DIR/<TELEGRAM_SESSION_NAME>.session` bor,
- `PAYMENT` binding hali yo'q.

Ikkalasi ham to'g'ri bo'lsa: fayldan client ochiladi, `get_me()` va `export_session_string()`
chaqiriladi, `userbot_accounts` ga `source=IMPORTED` bilan yoziladi va `PAYMENT` ga biriktiriladi
(audit `IMPORTED`). Client to'xtatiladi va oddiy runner oqimi davom etadi.

Import qilingan akkount uchun `humo_watch_state` joriy oxirgi xabardan boshlanadi, tarix qayta
**o'ynalmaydi**. Sabab: eski userbot xabarlarni `userbotTelegramId` siz (`NULL`) yuborgan, qayta
o'ynalgan nusxa esa id bilan ketadi. payment ular uchun boshqa kalit ko'radi va pulni **ikki marta**
kreditlaydi. Deploy paytidagi bir necha soniyalik bo'shliq bugungi har deploydagi bo'shliq bilan bir xil.

Eski `efbazaar-humo-userbot` container'i yangi runner ishga tushishidan **oldin** to'xtashi shart,
aks holda bitta auth key ikki joyda ishlaydi (cheklov 1). `deploy.sh` `up -d` dan oldin uni
`docker rm -f` qiladi, `--remove-orphans` ga ishonilmaydi. Fayl **o'chirilmaydi**,
shuning uchun rollback mumkin. Import bitta tranzaksiyada bo'ladi va `telegram_user_id UNIQUE`
tufayli takroriy start ikkinchi yozuv yaratmaydi.

### 4.6 Login oqimi (`userbot-core`)

Login boshlanganda xotirada `Client(in_memory=True)` ochiladi va `loginId` (UUID) bilan saqlanadi.
TTL 5 daqiqa, keyin client yopiladi. Core qayta ishga tushsa, boshlangan login'lar yo'qoladi va admin
boshidan boshlaydi.

1. `send_code(phone)` → `phone_code_hash` xotirada qoladi.
2. `sign_in(phone, hash, code)`. `SessionPasswordNeeded` bo'lsa `PASSWORD_REQUIRED` + hint qaytadi.
3. `check_password(password)`.
4. Muvaffaqiyatli bo'lsa: `get_me()`, `export_session_string()`, shifrlash, `userbot_accounts` ga
   yozish (`source=PANEL`, `connected_by=X-User-Id`), audit `CONNECTED`, vaqtinchalik client yopiladi.
   Runner keyingi siklda akkountni oladi.

Qoidalar:

- Bitta login uchun ko'pi bilan 5 ta kod va 5 ta parol urinishi, keyin `loginId` o'chiriladi.
- Shu `telegram_user_id` `ACTIVE` bo'lsa `409 ALREADY_CONNECTED`. `REVOKED` yoki `DISCONNECTED`
  bo'lsa sessiya yangi bilan almashtiriladi, status `ACTIVE` bo'ladi va biriktirishlar saqlanadi.
  Bekor bo'lgan payment akkounti shu yo'l bilan panel orqali qayta tiklanadi.
- Telefon raqami, kod, parol va sessiya satri hech qachon logga yozilmaydi va API javobida qaytmaydi.

### 4.7 Status aniqlash

- Runner `AuthKeyUnregistered`, `SessionRevoked`, `UserDeactivated` (va `*Ban`) ni ushlasa,
  akkount `REVOKED` ga o'tadi, `status_reason` yoziladi, client to'xtatiladi va ERROR log Telegram log
  kanaliga boradi. Payment akkounti bo'lsa heartbeat to'xtaydi va depozitlar yopiladi (mavjud mexanizm).
- `DISCONNECTED`: admin panel orqali uzgan akkount. Qator audit uchun saqlanadi, sessiya
  `session_ciphertext` dan o'chiriladi (bo'sh bayt).
- "Tirik" ko'rsatkichi `userbot_leases.last_heartbeat` dan olinadi (30 soniyadan yangi bo'lsa yashil).

## 5. Panel API (`userbot-core`)

nginx: `/api/userbot/**` → `userbot-core:8089`, `auth_request` boshqa servislardagi bilan bir xil
(`_auth_verify` blokida `proxy_set_header Host $host;`). Servis ichida `X-User-Roles` da `ROLE_ADMIN`
bo'lmasa `403` qaytadi. `ROLE_TRADE_ADMIN` kira olmaydi.

```
POST   /api/userbot/v1/logins                 {phone}     → {loginId, codeType: APP|SMS|CALL, timeoutSec}
POST   /api/userbot/v1/logins/{id}/code       {code}      → {status: DONE | PASSWORD_REQUIRED, hint?, account?}
POST   /api/userbot/v1/logins/{id}/password   {password}  → {status: DONE, account}
POST   /api/userbot/v1/logins/{id}/resend                 → {codeType, timeoutSec}
DELETE /api/userbot/v1/logins/{id}

GET    /api/userbot/v1/accounts               → [{id, firstName, lastName, username, phoneMasked, status,
                                                  statusReason, source, connectedBy, connectedAt,
                                                  alive, lastHeartbeat, features: [PAYMENT]}]
GET    /api/userbot/v1/accounts/{id}/avatar   → image/jpeg (umumiy `userbot-avatars` volume'idan)
DELETE /api/userbot/v1/accounts/{id}          → auth.logOut + DISCONNECTED

GET    /api/userbot/v1/features               → [{feature, title, accountId | null}]
PUT    /api/userbot/v1/features/{feature}     {accountId} → biriktirish / almashtirish
```

Xatolar (`{code, message}`, `message` o'zbekcha):

| Holat | HTTP | code |
|---|---|---|
| `PHONE_NUMBER_INVALID` | 400 | `PHONE_INVALID` |
| `PHONE_CODE_INVALID` | 400 | `CODE_INVALID` |
| `PHONE_CODE_EXPIRED` | 400 | `CODE_EXPIRED` |
| `PASSWORD_HASH_INVALID` | 400 | `PASSWORD_INVALID` |
| `FLOOD_WAIT_X` | 429 | `FLOOD_WAIT` (+ `retryAfterSec`) |
| Urinishlar tugadi / loginId topilmadi | 410 | `LOGIN_GONE` |
| Akkount allaqachon ulangan | 409 | `ALREADY_CONNECTED` |
| Biriktirilgan akkountni uzish | 409 | `ACCOUNT_BOUND` ("avval PAYMENT'ni boshqa userbotga o'tkazing") |
| `ACTIVE` bo'lmagan akkountni biriktirish | 409 | `ACCOUNT_NOT_ACTIVE` |

Avatar uchun core runner'i akkountning profil rasmini o'zi yuklaydi. Payment akkountining avatari ham
kerak bo'lgani uchun ikkala runner rasmni umumiy volume'dagi `avatars/<accountId>.jpg` ga yozadi.

## 6. payment-service o'zgarishlari

- `card-credit-observed` va `card-debit-observed` payload'lariga ixtiyoriy `userbotTelegramId`
  (Long) qo'shiladi. Eski xabarlarda u yo'q bo'ladi.
- Yangi `V<n>` migratsiya: `card_credit_observations` va `card_debit_observations` ga
  `userbot_telegram_id BIGINT NULL` ustuni. `telegram_message_id UNIQUE` olib tashlanadi, o'rniga
  `UNIQUE (COALESCE(userbot_telegram_id, 0), telegram_message_id)` indeksi qo'yiladi.
- Consumer idempotency tekshiruvi shu juftlik bo'yicha ishlaydi.
- Heartbeat va `UserbotHealth` o'zgarmaydi: payment'da baribir bitta akkount ishlaydi.
- `docs/kafka-topics.md` va `backend/payment-service/README.md` yangilanadi.

## 7. Outbox spec bilan munosabat

`2026-09-30-transactional-outbox-design.md` §4.2 humo-userbot uchun volume'dagi SQLite navbatini
rejalashtirgan edi. U hali qilinmagan. Shu dizayn uning o'rnini bosadi: navbat (`humo_pending`) va
holat (`humo_watch_state`) `userbot_db` Postgres'ida, akkount bo'yicha saqlanadi. Outbox
spec'iga shu haqda eslatma qo'shiladi.

## 8. Frontend

Admin panelida **"Userbotlar"** bo'limi bo'ladi, faqat `ROLE_ADMIN` uchun. Vizual dizayn Claude
Design'da tayyorlanadi.

- **Akkount kartalari:** avatar, ism, @username, maskalangan telefon, status belgisi
  (yashil tirik / qizil REVOKED / kulrang DISCONNECTED), manba ("Terminal orqali import qilingan" /
  "Panel orqali ulangan · <admin>"), vazifa chiplari, oxirgi heartbeat. `REVOKED` kartada
  "Qayta ulash" tugmasi bo'ladi, u login oynasini shu raqam bilan ochadi.
- **"Userbot ulash"**: Telegram login oynasining efBazaar ranglaridagi nusxasi.
  1. Mamlakat (default O'zbekiston) va telefon raqami.
  2. Kod: qayerga yuborilgani ("Telegram ilovangizga" / SMS), qayta yuborish taymeri, raqamni
     o'zgartirish havolasi.
  3. 2FA paroli: hint, ko'rsatish/yashirish.
  4. Muvaffaqiyat: akkount kartasi.
- **"Vazifalar" bloki:** har bir vazifa (hozir faqat PAYMENT) uchun joriy akkount va "Userbotni
  tanlash" dropdown'i. Faqat `ACTIVE` akkountlar ko'rsatiladi. Almashtirishdan oldin tasdiqlash
  oynasi chiqadi: "Payment kuzatuvi X dan Y ga o'tadi. Y akkountida Humo bot chati bo'lishi va
  kartalar shu akkountga ulangan bo'lishi kerak."
- **Uzish:** tasdiqlash oynasi. Akkount biriktirilgan bo'lsa tugma o'chiq bo'ladi va tooltip sababini
  tushuntiradi.

## 9. Deploy tartibi

Har qadam orqaga moslashuvchan, har biri alohida PR:

1. **payment-service**: §6. Eski userbot `userbotTelegramId` siz yuborishda davom etadi va
   buzilmaydi.
2. **userbot-service**:
   - `git mv humo-userbot userbot-service`.
   - compose: `userbot-core` va `userbot-payment`. Eski `humo-userbot-session` volume'i
     `userbot-payment` ga mount qilinadi (import uchun), `userbot-avatars` volume'i ikkalasiga.
   - `infra/` da `userbot_db` DB init, nginx'da `/api/userbot/**`, `deploy.yml` va `ci.yml` path
     filter'lari, `USERBOT_SESSION_KEY` va DB parol secret'lari (GitHub Secrets → `deploy.sh` → `.env`).
   - Alembic migratsiyasi container startida ishlaydi (`alembic upgrade head`, advisory lock bilan,
     chunki ikki container bir vaqtda turadi).
   - README, `docs/kafka-topics.md`, root `README.md` va `CLAUDE.md` (servis ro'yxati, port 8089)
     yangilanadi.
3. **frontend**: §8.

**Rollback:** import `.session` faylini o'chirmaydi. Avval `userbot-payment` (va `userbot-core`) ni to'xtating, so'ng eski `humo-userbot`
image'ini ishga tushiring — hech qachon ikkalasi birga emas: bir sessiya ikki joyda ishlasa Telegram
uni bekor qiladi. payment-service eski formatni ham qabul qiladi.

## 10. Test

- **`TelegramGateway` porti:** `send_code`, `sign_in`, `check_password`, `export_session`, `get_me`,
  `log_out`, `get_chat_history`. Pyrogram adapter'i shu port orqasida turadi. Login oqimi, xatolarni
  o'zbekchaga aylantirish, urinishlar chegarasi va TTL fake gateway bilan test qilinadi.
- **Lease** (testcontainers Postgres): ikki runner bir akkountni bir vaqtda ololmaydi; muddati
  o'tgan lease olinadi; uzaytira olmagan runner client'ni to'xtatadi; rebind ketma-ketligi hech bir
  qadamda ikki egani bermaydi.
- **Catch-up / navbat:** fake tarix bilan uzilishdan keyingi xabarlar bir martadan navbatga tushadi;
  Kafka xatosi bo'lsa qator qoladi va qayta yuboriladi; yangi akkountda tarix qayta o'ynalmaydi;
  eski pending qator heartbeat'ni to'xtatadi.
- **Import:** fayl bor/yo'q × binding bor/yo'q, takroriy start.
- **API:** `ROLE_ADMIN` siz `403`; `409` holatlari; javoblarda sessiya, kod yoki parol yo'qligi.
- **Mavjud testlar** (`test_parser.py`, `test_wire_format.py` va boshqalar) o'zgarishsiz o'tadi.
  `test_wire_format` ga `userbotTelegramId` qo'shiladi.
- **payment-service** (`mvn verify`, IT): ikki xil akkountdan kelgan bir xil `messageId` ikkalasi
  ham kreditlanadi; bir akkountdan kelgan takroriy xabar bir marta kreditlanadi; `userbotTelegramId`
  siz eski xabar ham ishlaydi.
- **Qo'lda (staging):** 2FA'li va 2FA'siz login, noto'g'ri kod va parol, payment rebind, telefondan
  sessiyani bekor qilish → `REVOKED` + alert, keyin panel orqali qayta ulash.
