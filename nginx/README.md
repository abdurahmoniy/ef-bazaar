# nginx

Yagona kirish nuqtasi: TLS, domenlar bo'yicha marshrutlash, har so'rovda auth tekshiruvi
(`auth_request`) va identity headerlarni servislarga uzatish.

## Fayllar

| Fayl | Nima |
|---|---|
| `nginx.conf` | http darajasi: Docker DNS `resolver 127.0.0.11`, `limit_req_zone`lar, `client_max_body_size 60M` |
| `conf.d/backends.inc` | Upstream manzillari **o'zgaruvchi** sifatida (`$backend_auth` va h.k.) |
| `conf.d/proxy-common.inc` | Umumiy proxy headerlari va timeoutlar |
| `conf.d/chat-websocket.inc` | `/ws/chat` (marketplace) — majburiy sessiya tekshiruvi bilan |
| `conf.d/ssl-params.inc` | TLS sozlamalari |
| `conf.d/efbazaar.conf` | efbazaar.uz: 443 public blok, **8080 ichki blok** (frontend SSR uchun), noma'lum domenlarga 444 |
| `conf.d/api.conf` | api.efbazaar.uz: prefiksisiz `/api/v1/**` (tashqi iste'molchilar) va Swagger UI (basic auth) |
| `conf.d/mail.conf` | mail.efbazaar.uz → mail-frontend |
| `conf.d/mailcow.conf` | mailcow.efbazaar.uz, autodiscover/autoconfig → hostdagi Mailcow (`host.docker.internal:8443`) |
| `conf.d/dashboard.conf` | dashboard.efbazaar.uz → Grafana |
| `conf.d/chempox.conf` | chempox.uz, api.chempox.uz → shu hostdagi Chempionat-X konteynerlari |
| `docker-entrypoint.sh` | Real sertifikat hali yo'q bo'lsa self-signed yaratadi (nginx start bo'lsin). certbot keyin almashtiradi |

## efbazaar.uz marshrutlari

| Yo'l | Servis | Auth |
|---|---|---|
| `/api/auth/**` | auth-service | — |
| `/api/marketplace/**` | marketplace-service | ixtiyoriy (token yo'q → `@marketplace_anon`, identity headerlar tozalanadi) |
| `/api/trade/**` | trade-service | shart (401) |
| `/api/payment/**` | payment-service | shart (401) |
| `/api/access/**` | access-service | ixtiyoriy |
| `/api/tournaments/**` | Chempionat-X (`chempionat-api:8080`) | ixtiyoriy |
| `/api/rec/**` | recommendation-service | ixtiyoriy (token yo'q → `@rec_anon`, identity headerlar tozalanadi) |
| `/ws/chat` | marketplace WebSocket | shart |
| `/bot/**` | bot (webhook, media proxy); `/bot/internal/**` → 404 | — |
| `/actuator/**` | bloklangan (403) | — |
| `/` | frontend | — |

Servisga uzatishda `/api/<servis>/` prefiksi `rewrite` bilan `/api/` ga qisqartiriladi.

## Qoidalar (buzilsa prod sinadi)

- **Upstream'lar o'zgaruvchi orqali** (`proxy_pass http://$backend_x$uri$is_args$args`). Statik
  `proxy_pass` konteyner qayta ishga tushganda eski IP'da qolib 502 beradi. O'zgaruvchi bilan
  nginx location → URI prefiks almashtirishini qilmaydi — shuning uchun `rewrite` kerak.
- `_auth_verify` bloklarida `proxy_set_header Host $host;` shart — aks holda Host `auth_upstream`
  (pastki chiziq) bo'ladi va Tomcat 400 qaytaradi.
- Anonim fallback bloklari (`@*_anon`) `X-User-*` headerlarni **tozalashi shart** — aks holda
  mijoz o'zi `X-User-Id` yuborib boshqa foydalanuvchi bo'lib oladi.
- Ichki 8080 bloki frontend SSR uchun: 80-portdagi HTTPS redirect'ga tushmaslik uchun.
  Public bloklarga qo'shilgan yangi `location` odatda 8080 blokiga ham kerak.
- Yangi servis qo'shilsa: `backends.inc` ga o'zgaruvchi, `efbazaar.conf` ga (443 va 8080) location,
  kerak bo'lsa `api.conf` ga ham.
