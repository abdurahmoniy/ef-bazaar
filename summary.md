● efBazaar — To'liq Loyiha Hujjati

  ▎ eFootball akkountlar savdo platformasi (Marketplace). Monorepo. Telegram-first auth, har servis mustaqil deploy.

  ---
  1. Tech Stack

  ┌──────────────────┬────────────────────────────────────────────────────────────────────┐
  │      Qatlam      │                            Texnologiya                             │
  ├──────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Backend + Bot    │ Java 21, Spring Boot 3.3.4, Maven                                  │
  ├──────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Frontend         │ Next.js 16 + React 19, TypeScript strict, Tailwind 3.4 + shadcn/ui │
  ├──────────────────┼────────────────────────────────────────────────────────────────────┤
  │ DB               │ PostgreSQL 16 (har servisga alohida DB)                            │
  ├──────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Cache            │ Redis 7 (refresh blacklist, Telegram file_path cache)              │
  ├──────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Event bus        │ Apache Kafka 3.7 (KRaft, single-node)                              │
  ├──────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Reverse proxy    │ Nginx (public + internal 8080 server bloklari)                     │
  ├──────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Media storage    │ Telegram bot → guruh topiklari (DB'da message_id + file_id)        │
  ├──────────────────┼────────────────────────────────────────────────────────────────────┤
  │ CI/CD            │ GitHub Actions: paths-filter detect → matrix build → pull-deploy   │
  ├──────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Containerization │ Docker + Docker Compose v2                                         │
  └──────────────────┴────────────────────────────────────────────────────────────────────┘

  Server: 2GB RAM box. Memory limit'lar muhim: auth-service 460MB, marketplace 420MB, kafka 420MB, frontend 256MB.

  ---
  2. Repo Strukturasi

  ef-bazaar/
  ├── backend/
  │   ├── auth-service/           # Spring Boot, port 8081
  │   ├── marketplace-service/    # Spring Boot, port 8082
  │   └── recommendation-service/ # Placeholder (extra profile)
  ├── bot/                        # Telegram bot, port 8084
  ├── frontend/                   # Next.js 16, port 80 (in container)
  ├── nginx/                      # conf.d/efbazaar.conf
  ├── infra/
  │   ├── postgres/init-multiple-databases.sh
  │   └── scrapers/efhub/         # Player cards scraper (separate)
  ├── .github/workflows/          # build.yml + deploy.yml
  ├── docker-compose.yml
  ├── deploy.sh                   # Smart deploy (writes .env, pulls, recreates)
  └── CLAUDE.md                   # Loyiha qoidalari (asosiy reference)

  ---
  3. Servislar va Portlar

  ┌────────────────────────┬───────────────┬─────────────────────┬──────────────────────────────────┐
  │         Servis         │ Internal port │     Nginx path      │            Mas'uliyat            │
  ├────────────────────────┼───────────────┼─────────────────────┼──────────────────────────────────┤
  │ auth-service           │ 8081          │ /api/auth/**        │ JWT, Telegram/Google login, SSO  │
  ├────────────────────────┼───────────────┼─────────────────────┼──────────────────────────────────┤
  │ marketplace-service    │ 8082          │ /api/marketplace/** │ E'lon, like, savat, chat         │
  ├────────────────────────┼───────────────┼─────────────────────┼──────────────────────────────────┤
  │ recommendation-service │ 8083          │ /api/rec/**         │ (Hozir 503, kelajak uchun)       │
  ├────────────────────────┼───────────────┼─────────────────────┼──────────────────────────────────┤
  │ bot                    │ 8084          │ /bot/webhook        │ Telegram updates, media uploader │
  ├────────────────────────┼───────────────┼─────────────────────┼──────────────────────────────────┤
  │ frontend               │ 80            │ /                   │ Next.js SSR                      │
  ├────────────────────────┼───────────────┼─────────────────────┼──────────────────────────────────┤
  │ PostgreSQL             │ 5432          │ —                   │ Har servis uchun alohida DB      │
  ├────────────────────────┼───────────────┼─────────────────────┼──────────────────────────────────┤
  │ Redis                  │ 6379          │ —                   │ Blacklist + cache                │
  ├────────────────────────┼───────────────┼─────────────────────┼──────────────────────────────────┤
  │ Kafka                  │ 9092          │ —                   │ Event bus                        │
  └────────────────────────┴───────────────┴─────────────────────┴──────────────────────────────────┘

  ---
  4. Auth Arxitekturasi (MUHIM)
  
  Prinsip: auth-service yagona JWT issuer. Boshqa servislar tokenni o'zlari tekshirmaydi.

  Flow

  1. Foydalanuvchi → Telegram/Google login → auth-service access + refresh token beradi
  2. Har himoyalangan so'rov: nginx → auth_request /api/v1/auth/verify subrequest
  3. auth-service token'ni tekshiradi, javobda X-User-Id, X-User-Roles, X-Telegram-Id headerlar
  4. nginx bu headerlarni upstream'ga uzatadi
  5. marketplace/bot faqat shu headerlardan foydalanadi

  JWT

  { "iss": "efbazaar-auth", "sub": "<userId UUID>", "jti": "...",
    "typ": "access" | "refresh", "roles": ["ROLE_USER"], "tid": <telegramId>,
    "iat": ..., "exp": ... }
  - Access TTL: 15 daqiqa
  - Refresh TTL: 30 kun
  - Logout → refresh token's jti Redis blacklist'ga (bl:refresh:<jti>)
  - Secret: JWT_SECRET env, faqat auth-service'da

  Telegram-first Identity

  - Birinchi navbat — telegram_id (mandatory unique)
  - Google opsional — link bo'lsa verified=true + email
  - username/password umuman yo'q (V2 migration'da olib tashlangan)

  Auth Endpoints

  POST /api/v1/auth/telegram        — Login Widget callback (HMAC validate)
  POST /api/v1/auth/telegram-webapp — Mini App initData auto-login
  POST /api/v1/auth/google/login    — Google ID token (faqat avval link qilinganda)
  POST /api/v1/auth/google/link     — Joriy userga Google ulash (JWT kerak)
  POST /api/v1/auth/refresh         — Access token yangilash
  POST /api/v1/auth/logout          — Refresh token blacklist
  GET  /api/v1/auth/verify          — Nginx subrequest (X-User-* headerlar)
  GET  /api/v1/users/me             — Current user info
  GET  /api/v1/users/me/photo       — Profile photo proxy (file_id stream + URL fallback)

  ---
  5. Telegram Mini App Auto-Login

  Frontend

  - TelegramWebAppAutoLogin komponenti root layout'da — har sahifada ishlaydi
  - window.location.hash'dan tgWebAppData query-string'ni o'qiydi (skript yuklanmasdan)
  - telegramWebAppAuthAction(initData) server action'ga uzatadi
  - Auth muvaffaqiyatli bo'lsa → /profile'ga redirect, overlay yopiladi (setState('idle'))
  - NEXT_REDIRECT digest'ini detect qilib qayta tashlaydi (xato banner chiqmaslik uchun)
  - Hash bir martalik tozalanadi (replaceState) — loop oldini olish

  Backend (TelegramWebAppValidator)

  - HMAC algoritmi Login Widget'dan farqli:
    - secret_key = HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN)
    - data_check_string = hash siz sorted k=v\n... (URL-decoded values)
    - expected_hash_hex = HMAC_SHA256(key=secret_key, msg=data_check_string)
  - auth_date 24 soatdan eski → rad
  - user JSON ni parse qiladi → TelegramProfile(id, firstName, lastName, username, photoUrl)
  - TelegramAuthService.registerOrLogin(profile) — Login Widget bilan bir xil pipeline

  Bot Konfiguratsiyasi

  - BotFather'da Mini App tugmasi qo'shilgan (menu button yoki inline)
  - URL: https://efbazaar.chempox.uz
  - Telegram URL'ga #tgWebAppData=... hash qo'shadi, app shu hash'dan auto-login qiladi

  ---
  6. Profile Photo Pipeline (Eng yangi)
  
  Sabab: Mini App initData photo_url'ni faqat attachment-menu launchlarda beradi. Boshqa hollarda biz Telegram Bot API'dan rasmni o'zimiz olishimiz kerak.

  Arxitektura (asoslangan media topic pattern'da)

  Auth login/register
    └→ Kafka event: efbazaar.auth.user-photo-needed (currentPhotoFileUniqueId bilan)
       └→ Bot consumer (UserPhotoUploaderConsumer)
          ├→ getUserProfilePhotos(telegramId) → live ProfilePhoto(fileId, fileUniqueId)
          ├→ Hech narsa yo'q → skip
          ├→ Live fileUniqueId === current → skip (dedup!)
          └→ Farqli → sendPhoto(media topic, live.fileId, caption)
             └→ Kafka event: efbazaar.bot.user-photo-set
                └→ Auth consumer (UserPhotoSetConsumer)
                   └→ DB UPDATE: telegram_photo_file_id, _file_unique_id, _message_id

  Foydalanish (Browser/Mini App)

  - Frontend: <AvatarImage src={user.telegramPhotoUrl} />
  - telegramPhotoUrl doim /api/auth/v1/users/me/photo (proxy URL, agar source bor bo'lsa)
  - Endpoint logic:
    a. file_id bor → TelegramFileClient orqali Bot API'dan stream (Redis cache 50 min)
    b. Yo'q bo'lsa fallback telegramPhotoUrl (eski Login Widget t.me CDN URL) → 302
    c. Hech narsa yo'q → 404 → frontend initials fallback

  Caveats

  - file_unique_id — Telegram'ning barqaror identifikatori (file_id har sendPhoto'da o'zgaradi)
  - Telegram file URL bot token saqlaydi → frontendga ko'rsata olmaymiz, shuning uchun proxy
  - JwtAuthenticationFilter cookie'dan ham token o'qiy oladi (<img> Authorization yubormaydi)
  - t.me/i/userpic URL'lari Telegram tomonidan vaqt o'tib cache-bust qilinadi → file_id ustun

  ---
  7. Database Schemas

  auth_db

  users:
  id                              UUID PK
  telegram_id                     BIGINT UNIQUE NOT NULL
  telegram_username               VARCHAR(64)
  telegram_first_name             VARCHAR(128)
  telegram_last_name              VARCHAR(128)
  telegram_photo_url              VARCHAR(512)   -- Login Widget t.me URL (stale bo'ladi)
  telegram_photo_file_id          VARCHAR(256)   -- Bot API file_id (stream)
  telegram_photo_file_unique_id   VARCHAR(64)    -- dedup uchun (V4)
  telegram_photo_message_id       BIGINT         -- media topic'dagi msg id (audit)
  google_id                       VARCHAR(255)
  email                           VARCHAR(255)
  verified                        BOOLEAN
  role                            VARCHAR(16)    -- USER, ADMIN, ...
  created_at, updated_at          TIMESTAMP

  Migrations:
  - V1: init schema
  - V2: telegram_first_auth (username/password_hash drop, google_id/verified add)
  - V3: telegram_photo_file_id + telegram_photo_message_id
  - V4: telegram_photo_file_unique_id

  marketplace_db

  listings:
  description, valuable_players[], has_google_play_link, highest_division_level (1-9),
  android_coins, ios_coins, team_strength, price (so'm), is_price_negotiable,
  media_message_ids[], status (ACTIVE/SOLD/DELETED), seller_id, ...
  
  chats: Listing egasi va xaridor o'rtasida (24h scheduler avto-yopadi, "Muhim" belgisi auto-delete'dan ozod).

  Bir xaridor + bitta listing → bitta aktiv chat (spam oldini olish).

  efbazaar DB (scraper)

  - Player cards efhub.com'dan scrape qilinadi (infra/scrapers/efhub)
  - marketplace-service'da read-only 2-DataSource (EfbazaarDataSourceConfig)
  - 06:00 UTC kunlik delta-sync + Kafka efbazaar.marketplace.cards-added event

  ---
  8. Kafka Topics
  
  Format: efbazaar.<service>.<event> — kichik harf, defis bilan.

  efbazaar.auth.user-registered           # { userId, telegramId, telegramUsername, displayName, currentPhotoFileUniqueId, occurredAt }
  efbazaar.auth.user-logged-in            # { userId, method, occurredAt }
  efbazaar.auth.google-linked             # { userId, telegramId, telegramUsername, displayName, email, occurredAt }
  efbazaar.auth.user-photo-needed         # Same shape as user-registered (har login'da)
  efbazaar.bot.user-photo-set             # { userId, telegramId, photoFileId, photoFileUniqueId, photoMessageId, occurredAt }
  efbazaar.system.log-event               # ERROR/WARN forwarder
  efbazaar.marketplace.listing-created    # (kelajak)
  efbazaar.marketplace.cards-added        # { occurredAt, totalAdded, cards: [...] }

  Bot Kafka Listeners

  - RegistrationEventConsumer — user-registered va google-linked'ni registration topic'ga forward (👤 / 🛡)
  - UserPhotoUploaderConsumer — user-registered + user-photo-needed (dedup'lab media topic'ga)
  - LogEventConsumer — log eventlar logs topic'ga

  Auth Kafka Listeners

  - UserPhotoSetConsumer — bot.user-photo-set qabul qilib DB'ga yozadi

  Type Header Muammosi (echilgan)

  Auth-service global config'da: spring.json.use.type.headers: false — bot'ning __TypeId__ header'ini ignore qilib local DTO'ga deserialize qiladi.

  ---
  9. Frontend (Next.js 16)

  Routes

  - / — Landing (Telegram Mini App context'da auto-login layoutdan ishlaydi)
  - /auth/login — Telegram Login Widget + Google
  - /auth/register — Telegram Widget (Telegram orqali 1-klik)
  - /profile — Avatar (proxy URL), Telegram info, Google link, identifiers
  - (Marketplace pages — kelajak)

  Key Components

  - TelegramLogin — widget iframe, data-onauth callback
  - TelegramWebAppAutoLogin — root layout'da, hash'dan initData o'qiydi
  - TelegramSwitchHint — collapsible info, browser'da boshqa nomer bilan kirish
  - GoogleButton — GIS ID token flow (client_secret kerak emas)
  - LogoutButton, GoogleLinkButton

  Server-Side (lib/auth.ts)

  - apiFetch — server-side fetch + access_token cookie → Authorization header
  - getMe, telegramAuth, telegramWebAppAuth, googleLogin, linkGoogle, logout
  - Cookies: httpOnly + sameSite=lax, secure (prod); AUTH_COOKIE_DOMAIN=efbazaar.chempox.uz bo'lsa api subdomain'ga ham yuboriladi
  - INTERNAL_API_BASE_URL=http://nginx:8080/api (internal block, HTTPS redirect'siz)
  - Browser marketplace fetchlari: NEXT_PUBLIC_API_BASE_URL=https://api.efbazaar.chempox.uz

  Server Actions (auth/actions.ts)

  - telegramAuthAction, telegramWebAppAuthAction, googleLoginAction, linkGoogleAction, logoutAction

  Design

  - Gaming Cyber Glassmorphism (cyber-cyan, cyber-purple aksentlar)
  - shadcn/ui + Radix primitives
  - Tailwind 3.4
  - Inter font

  Critical Detail

  - getMe() response'da telegramPhotoUrl doim proxy URL (/api/auth/v1/users/me/photo), entity'dagi raw URL emas
  - Cache-control headerlar: max-age=3600, private — hard refresh kerak ba'zan

  ---
  10. Nginx

  Strategiya:
  - Public 80/443 → HTTPS redirect (80 → 443)
  - Internal 8080 → frontend SSR uchun (INTERNAL_API_BASE_URL=http://nginx:8080/api)
  - /api/auth/ → auth-service/api/
  - /api/marketplace/ → auth_request /_auth_verify (optional auth: 401 da @marketplace_anon)
  - api.efbazaar.chempox.uz/api/ → browser CORS + auth_request → marketplace-service/api/
  - /_auth_verify → auth-service/api/v1/auth/verify (internal subrequest)
  - Cookie va Authorization header upstream'ga forward bo'ladi

  ---
  11. Deploy & CI/CD

  GitHub Actions

  build.yml (CI — push to main):
  - detect job — paths-filter qaysi servis o'zgarganini aniqlaydi
  - matrix build — har bir o'zgargan servisni alohida (auth, marketplace, bot, frontend, nginx)
  - Docker buildx + GHCR push (ghcr.io/abdurahmoniy/efbazaar-<service>)

  deploy.yml (CD — workflow_run trigger after build):
  - SSH (appleboy/ssh-action) + secret env'larni o'tkazib bash deploy.sh
  - deploy.sh:
    - .env'ni CI secret'lardan yozadi (upsert_env)
    - GHCR login
    - docker compose pull (idempotent)
    - docker compose up -d --remove-orphans (image SHA / config diff → recreate)
    - Postgres avval ko'tariladi, parol sync qilinadi
    - FORCE_ALL=1 override mavjud

  GitHub Secrets (deploy uchun)

  DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY, DEPLOY_PORT, DEPLOY_PATH
  POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET, APP_BASE_URL
  TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_BOT_ID
  TELEGRAM_GROUP_CHAT_ID, TELEGRAM_TOPIC_LOGS, TELEGRAM_TOPIC_REGISTRATION, TELEGRAM_TOPIC_MEDIA
  TELEGRAM_WEBHOOK_URL, NGINX_HTTP_PORT, NGINX_HTTPS_PORT, GOOGLE_CLIENT_ID

  TELEGRAM_BOT_ID — tokenning : gacha qismi (oldinroq qo'shilgan, hozir foydalanilmaydi — logout popup featurati revert qilingan).

  ---
  12. Env Variables

  Backend (docker-compose.yml)

  JWT_SECRET, JWT_ACCESS_TOKEN_TTL_MINUTES=15, JWT_REFRESH_TOKEN_TTL_DAYS=30
  TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_GROUP_CHAT_ID
  TELEGRAM_TOPIC_LOGS=6, TELEGRAM_TOPIC_REGISTRATION=4, TELEGRAM_TOPIC_MEDIA=2
  GOOGLE_CLIENT_ID                          # ID token audience check
  SPRING_PROFILES_ACTIVE=docker

  Frontend (docker-compose.yml)

  INTERNAL_API_BASE_URL=http://nginx:8080/api
  AUTH_COOKIE_DOMAIN=efbazaar.chempox.uz
  NEXT_PUBLIC_API_BASE_URL=https://api.efbazaar.chempox.uz
  NEXT_PUBLIC_TELEGRAM_BOT=<bot username>
  NEXT_PUBLIC_GOOGLE_CLIENT_ID
  NEXT_PUBLIC_BASE_URL=https://efbazaar.chempox.uz

  ---
  13. Listing Domain Model

  description           TEXT
  valuablePlayers       List<String>   — search + recommendation uchun
  hasGooglePlayLink     boolean
  highestDivisionLevel  int (@Min(1) @Max(9))
  androidCoins, iosCoins, teamStrength  int
  price                 BigDecimal     — so'mda
  isPriceNegotiable     boolean
  mediaMessageIds       List<String>   — Telegram message_id lar
  status                ACTIVE | SOLD | DELETED

  Chat

  - Listing sahifasidagi "Egasi bilan bog'lanish" tugmasi → xaridor boshlaydi
  - Bir xaridor + bitta listing → bitta aktiv chat
  - 24h scheduler auto-yopadi
  - Bir taraf "Muhim" deb belgilasa auto-delete dan ozod
  - Yopilganda efbazaar.marketplace.chat-expired event

  ---
  14. Critical Conventions

  Kod

  - Java 21 — Record, sealed classes, pattern matching ishlatiladi
  - Package: uz.efbazaar.<service>.<layer>
  - Controller → Service → Repository
  - MapStruct (entity ↔ DTO)
  - Jakarta Validation
  - @ControllerAdvice — markazlashtirilgan exception handling
  - API versioning: /api/v1/...
  - TypeScript strict, Next.js force-dynamic auth sahifalarda

  Git

  - Commit format: feat(auth): ..., fix(bot): ..., feat(auth+bot): ...
  - Claude attribution YO'Q (commit, PR, kod ichida ham Co-Authored-By: Claude yoki Generated with Claude Code qo'shmaslik)
  - Atomik commit'lar afzal
  - PR-based deploy (mukhiddinov branch → main)

  Workflow

  - Design first — feature/arxitektura savolida avval matn bilan reja tushuntirilib tasdiqlatilsin
  - frontend/package.json o'zgartirilsa package-lock.json ham commit qilinishi shart
  - React/Next paketlarda RC/beta ishlatmaslik, stable kanal
  - Destructive operatsiyalar (DB delete, force push) — har doim tasdiqlash so'rab amalga oshirilsin

  Cheklovlar

  - Hech qachon auth_db'ga boshqa servisdan to'g'ridan ulanmaslik
  - sellerId request body'dan olinmaydi — faqat X-User-Id header
  - Secrets faqat .env da, git'ga tushmaydi
  - Kafka event'larda idempotency key (key field) ishlatiladi
  - Media fayllar DB'da faqat message_id + file_id — bayt saqlash yo'q

  ---
  15. Hozirgi Holat (oxirgi PR'lar)
  
  ┌────────────────────┬────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │         PR         │ Holat  │                                               Mazmun                                                │
  ├────────────────────┼────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ #30                │ merged │ (eski)                                                                                              │
  ├────────────────────┼────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ #31, #32, #33, #34 │ merged │ Telegram Mini App auto-login pipeline (TelegramWebAppValidator, frontend root layout, hash reading) │
  ├────────────────────┼────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ #35                │ merged │ Login backfill (user-photo-needed)                                                                  │
  ├────────────────────┼────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ #36                │ merged │ Kafka type header fix (use.type.headers=false) + file_id preference + cookie JWT extraction         │
  ├────────────────────┼────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ #37                │ OCHIQ  │ file_unique_id dedup — login'da rasm o'zgarmagan bo'lsa qayta upload qilmaslik                      │
  └────────────────────┴────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────┘

  Reverted features

  - Post-logout OAuth re-auth popup (PR'da edi, revert qilingan — foyda bermaganligi sababli)
  - NEXT_PUBLIC_TELEGRAM_BOT_ID env env'larda qoldi lekin frontend'da ishlatilmaydi

  Active issues / kelajakdagi ish

  - Marketplace listing/chat domain hali to'liq implement qilinmagan
  - Recommendation service — placeholder (extra profile)
  - Friends/Followers tizimi rejada (forward_count saqlash yetarli hozircha)
  - Test coverage past — asosan smoke testlar
  - Marketplace orphan cleanup (auth_db'dan user o'chirilsa marketplace_db da seller_id orphan bo'ladi)

  ---
  16. Useful Debug Commands

  # Auth-service logs
  docker logs --tail 100 efbazaar-auth 2>&1 | grep -iE "photo|user-photo|Stored profile"

  # Bot logs
  docker logs --tail 100 efbazaar-bot 2>&1 | grep -iE "photo|sync|backfill|register"

  # Postgres direct access
  docker compose exec -T postgres psql -U efbazaar -d auth_db -c "SELECT id, telegram_id, telegram_photo_file_id, telegram_photo_file_unique_id FROM users;"

  # Photo proxy test (kerak: access_token cookie)
  curl -sI -H "Cookie: access_token=$TOKEN" https://efbazaar.chempox.uz/api/auth/v1/users/me/photo
  # 200 + image/jpeg → file_id stream OK
  # 302 + location: t.me → URL fallback (file_id yo'q)
  # 404 → no source

  # Smart deploy (yoki force)
  ssh server "cd /opt/efbazaar && FORCE_ALL=1 bash deploy.sh"

  # Single service rebuild
  docker compose up -d --no-deps auth-service

  ---
  17. Local Development

  # Birinchi marta
  cp .env.example .env             # va qiymatlarni to'ldiring
  docker compose up -d postgres redis kafka

  # Backend (har servis alohida)
  cd backend/auth-service && mvn spring-boot:run

  # Frontend
  cd frontend && npm install && npm run dev

  # Bot — TELEGRAM_BOT_TOKEN kerak (BotFather'dan oling)
  cd bot && mvn spring-boot:run

  # Database migrations — Flyway avtomatik ishga tushadi spring-boot:run da

  spring.profiles.active=local (default) — port'lar localhost'ga ochiq, kafka/redis docker compose'dan.

  ---
  Ushbu hujjat orqali boshqa chatda davom etish uchun yetarli context bo'lishi kerak. Asosiy reference: CLAUDE.md (har doim aktual loyiha qoidalari).
