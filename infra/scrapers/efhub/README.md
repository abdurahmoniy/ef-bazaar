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
    position, playing_style, overall_rating, player_type,
    age, height, weight, preferred_foot,
    weak_foot_usage, weak_foot_accuracy,
    image_url,
    -- 25 base stats: offensive_awareness, ball_control, dribbling, ...
    skills TEXT[], com_skills TEXT[],
    additional_positions JSONB, raw_data JSONB,
    scraped_at, updated_at
);
```

## Konfiguratsiya

Environment variables:

| Var | Default | Tavsif |
|---|---|---|
| `EFHUB_DELAY` | `4.5` | So'rovlar orasidagi delay (sek) |
| `EFHUB_OUTPUT` | `/tmp/efhub_data` | JSONL fayllar uchun papka |
| `DATABASE_URL` | — | Postgres DSN (loader uchun majburiy) |
| `EFBAZAAR_DB_NAME` | `efbazaar` | DB nomi |
| `POSTGRES_CONTAINER` | `efbazaar-postgres` | Docker container nomi |

## Yangilash

Yangi cardlar chiqsa, faqat 1 va 3-4 bosqichlarni takrorlang:

```bash
curl ... > /tmp/player_index.json   # yangi index
python3 .../scrape.py               # faqat yangi ID'larni oladi (resume)
python3 .../load.py                 # upsert
```
