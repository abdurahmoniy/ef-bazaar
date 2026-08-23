# efHub player card scraper

efhub.com'dan **Big Time / Epic / Showtime** card ma'lumotlarini olib, `efbazaar` Postgres DB'siga yozadi.

## Manba va cheklovlar

- Sayt: https://efhub.com (eFootball player database, Next.js App Router)
- `robots.txt`: ClaudeBot va boshqa AI botlar uchun `Disallow: /`, `Crawl-delay: 5`
- Skript 4.5s delay bilan ishlaydi — saytning yukini ko'tarmaslik uchun
- **Bu skript faqat ichki ma'lumot bazasini to'ldirish uchun mo'ljallangan.** Olingan ma'lumotni public API/UI orqali boshqalarga taqdim qilmang — bu efhub.com ToS'iga zid kelishi mumkin

## Card type prefiks xaritasi

Player ID prefiksi card type'ni kodlaydi:

| Prefix | Card type    | playerType | Index'da soni |
|--------|--------------|-----------:|---------------:|
| `89`   | **Big Time** | 7          | 140           |
| `88`   | **Epic**     | 5          | 669           |
| `1067` | **Showtime** | 8          | 608           |

Skript shu prefiks bo'yicha filtrlaydi, lekin yana har bir scraped row'ning `playerType`'ini tekshiradi — nomos card`lar `.errors.txt`'ga yoziladi.

## Foydalanish

### 1. Postgres'ni ishga tushiring

```bash
cp .env.example .env  # birinchi marta
# .env da EFBAZAAR_DB_NAME=efbazaar borligini tekshiring
docker compose up -d postgres
```

### 2. Schema'ni qo'llang

```bash
./infra/scrapers/efhub/setup-db.sh
```

Bu skript:
- `efbazaar` DB'sini yaratadi (yo'q bo'lsa)
- `infra/postgres/efbazaar/V1__init_player_cards.sql`'ni qo'llaydi
- 3 ta jadval yaratadi: `bigtime`, `epic`, `showtime`

### 3. Scrape qiling

```bash
# Player index'ni avval yuklab oling (43,809 o'yinchi metadata)
curl -s -A "Mozilla/5.0" \
  "https://efhub.com/search/player-index.json?v=dpl_8nXHsdY9zYwQoaxurdEqy7P2S9Gi" \
  -o /tmp/player_index.json

# Scrape boshlang (taxminan 1.8 soat, 1,417 card)
python3 infra/scrapers/efhub/scrape.py
```

Natija: `/tmp/efhub_data/{bigtime,epic,showtime}.jsonl`

Skript **resume rejimida** ishlaydi — to'xtatib qayta yoqsangiz, oxirgi joydan davom etadi.

### 4. DB'ga yuklang

```bash
pip install 'psycopg[binary]'
export DATABASE_URL="postgresql://efbazaar:$POSTGRES_PASSWORD@localhost:5432/efbazaar"
python3 infra/scrapers/efhub/load.py
```

`ON CONFLICT (efhub_id) DO UPDATE` — yangi run mavjud rowlarni yangilaydi.

## Jadval strukturasi

Har bir card type jadvali bir xil schemaga ega:

```sql
CREATE TABLE bigtime (
    id                  BIGSERIAL PRIMARY KEY,  -- auto-increment internal
    efhub_id            BIGINT NOT NULL UNIQUE, -- efhub'dan kelgan ID
    name, name_ja, name_zh,
    team, league, nationality, nationality_code,
    position, playing_style, overall_rating, max_overall_rating, player_type,
    age, height, weight, preferred_foot,
    weak_foot_usage, weak_foot_accuracy,
    image_url,
    -- 25 base stats: offensive_awareness, ball_control, dribbling, ...
    skills TEXT[], com_skills TEXT[],
    additional_positions JSONB, raw_data JSONB,
    scraped_at, updated_at
);
```

## `overall_rating` vs `max_overall_rating`

Player page'dagi `overallRating` — **1-darajadagi** qiymat (Messi
`89136409091415` uchun 89). O'yinchilar aytadigan raqam esa max level'dagi
OVR (106) va u **faqat player-index'dagi `"o"` maydonida** bor — efhub uni
sahifada brauzer ichida progression curve orqali hisoblaydi.

Demak: player page'ni qayta scrape qilish bu ustunni **hech qachon**
to'ldirmaydi. Index kerak.

```bash
# Mavjud kartalarni to'ldirish — bitta HTTP so'rov, page scrape yo'q
export DATABASE_URL="postgresql://efbazaar:$POSTGRES_PASSWORD@localhost:5432/efbazaar"
python3 infra/scrapers/efhub/backfill_max_ovr.py
```

`EfhubSyncJob` ham har run'da shu ishni bajaradi — index'ni allaqachon
yuklab olgani uchun qo'shimcha so'rov ketmaydi.

UI hamma joyda `max_overall_rating ?? overall_rating` ko'rsatadi
(`cardRating()` — `frontend/src/lib/marketplace-types.ts`).

## Konfiguratsiya

Environment variables:

| Var | Default | Tavsif |
|---|---|---|
| `EFHUB_DELAY` | `4.5` | So'rovlar orasidagi delay (sek) |
| `EFHUB_OUTPUT` | `/tmp/efhub_data` | JSONL fayllar uchun papka |
| `DATABASE_URL` | — | Postgres DSN. `scrape.py` uchun: DB-delta (mavjud cardlarni skip qilib faqat yangi'sini oladi). `load.py` uchun: majburiy |
| `EFBAZAAR_DB_NAME` | `efbazaar` | DB nomi |
| `POSTGRES_CONTAINER` | `efbazaar-postgres` | Docker container nomi |

## Yangilash

### Production: avtomatik (tavsiya)

`marketplace-service` ichida `EfhubSyncJob` har kuni **06:00 UTC**da ishlaydi:
- `app.cards.sync.enabled=true` bo'lganda
- Faqat **yangi** ID'larni topadi (DB diff)
- Har scrape orasi `app.cards.sync.delay-ms` (default 5s)
- Bir runda max `batch-limit` ta card (default 50)
- Tugagach `efbazaar.marketplace.cards-added` Kafka eventini chiqaradi

Env'lar:
```
EFHUB_SYNC_ENABLED=true
EFHUB_SYNC_CRON="0 0 9 * * *"   # 09:00 UTC = 14:00 Toshkent
EFHUB_SYNC_DELAY_MS=5000
EFHUB_SYNC_BATCH_LIMIT=50
```

### Manual (Python skriptlar — local dev)

Yangi cardlar chiqsa (masalan yangi Big Time release), faqat yangi'larini localda oling:

```bash
UA="Mozilla/5.0"
export DATABASE_URL="postgresql://efbazaar:PASS@localhost:5433/efbazaar"

# 1. Yangi index'ni yuklab oling (token kerak emas)
curl -s -A "$UA" "https://efhub.com/search/player-index.json" -o /tmp/player_index.json

# 2. Delta scrape — DATABASE_URL berilgani uchun DB'da MAVJUD cardlarni skip qilib,
#    faqat yetishmayotganlarini oladi (JSONL /tmp'da bo'lmasa ham to'g'ri ishlaydi)
python3 infra/scrapers/efhub/scrape.py

# 3. Upsert
python3 infra/scrapers/efhub/load.py
```

**Muhim:** `DATABASE_URL` bo'lmasa `scrape.py` faqat JSONL fayl bo'yicha resume qiladi — `/tmp/efhub_data/*.jsonl` o'chgan bo'lsa hammani (~1400, ~1.8 soat) qayta scrape qiladi. DB-delta uchun `DATABASE_URL` bering.

Prefiks bo'yicha filtr ba'zan qisqa soxta ID'larni (masalan `8959`) ushlaydi — ular `MIN_ID_LEN` (10 raqam) filtri va `playerType` tekshiruvi bilan chiqarib tashlanadi.

## Serverga ko'chirish (bir martalik)

Lokal seed'ni serverga chiqarish uchun:

```bash
SERVER=user@example.com ./migrate-to-server.sh
```

Bu skript: `pg_dump` (data-only) → `scp` → server'da schema'ni qo'llaydi → `pg_restore` qiladi.
Soniyada tugaydi (~1,400 row).
