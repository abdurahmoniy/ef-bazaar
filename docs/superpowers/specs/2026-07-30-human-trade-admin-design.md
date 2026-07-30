# Human trade-admin — dizayn spetsifikatsiyasi

**Sana:** 2026-07-30
**Holat:** tasdiqlangan, implementation plan kutilmoqda
**Qamrov:** `TRADE_ADMIN` roli, admin katalogi, human-driven savdo hayot tsikli, reyting
**Qamrovdan tashqarida:** global presence (alohida spec), payment-service integratsiyasi

---

## 1. Maqsad

Hozir har savdoni `smart-admin-worker` avtomatik olib boradi: Mailcow'da escrow mailbox
ochadi, Konami'da forgot-password'ni Chromium bilan bosadi, IMAP'ni pollab kodni
tutadi. Bu bir xil ishlaydi, lekin nostandart holatlarda (Konami oqimi o'zgargan,
sotuvchi chalkashib ketgan, akkountda kutilmagan holat) tiqilib qoladi va savdo
`ORPHANED` bo'ladi.

Bu spec **inson admin** yo'lini qo'shadi. Sotuvchi savdo ochayotganda ikki variantdan
birini tanlaydi:

- **Smart admin** — hozirgi avtomatika, o'zgarishsiz
- **Inson admin** — `TRADE_ADMIN` rolidagi haqiqiy odam savdoni qo'lda olib boradi

Inson admin platformada quyidagilarni oladi: escrow mailbox'ga vaqtincha kirish, sotuvchi
va xaridor bilan ikkita alohida xavfsiz chat, belgilanadigan qadamlar ro'yxati, va
yakunda ikki tarafdan yulduzcha bahosi.

**Platforma inson savdoda faqat vositani beradi:** email, ikki chat, qadam yozuvi,
reyting. Pul platformadan o'tmaydi va platforma bu savdodan daromad olmaydi.

---

## 2. Qamrovdan tashqarida (ataylab)

- **Global presence.** To'liq online/oxirgi-faollik tizimi (hamma userlar uchun,
  WebSocket bilan) alohida spec. Bu yerda faqat adminlar uchun vaqtinchalik yechim
  bor — §9.3.
- **payment-service.** Human savdo ledger'ga, wallet'ga, escrow'ga tegmaydi. §8.
- **Smart rejim uchun `WAITING_BUYER_VERIFY` ekspluatatsiyasi.** Payment spec §14 da
  qayd etilgan, hali kechiktirilgan. Human yo'lida bu muammo tug'ilmaydi (§6.4).
- **Admin uchun rejim almashtirish.** Platforma admini tiqilib qolgan human savdoni
  SMART'ga o'tkaza olmaydi — §7.2 da sababi.
- **Admin haqi uchun to'lov instrumenti.** Haq platformadan tashqarida to'lanadi;
  biz faqat kelishilgan summani yozib qo'yamiz.

---

## 3. Qarorlar va sabablari

| # | Qaror | Sabab |
|---|---|---|
| 3.1 | State machine ikkiga bo'linmaydi — bitta `TradeStateMachine`, `mode` ustuni | Smart yo'lidagi bir ham o'tish o'zgarmaydi → ishlab turgan savdolar uchun regressiya yuzasi deyarli nol |
| 3.2 | Mailbox ikki rejimda ham avtomatik ochiladi | Parol hech qachon adminning shaxsiy pochtasiga tushmasligi kerak; escrow mailbox platformada qoladi |
| 3.3 | Konami avtomatikasi (`forgotPasswordRequest`, `imapPollRequest`) human rejimda o'chadi | Aynan shu avtomatika tiqilib qolgani uchun inson admin kerak bo'ldi |
| 3.4 | Human savdo `IN_PROGRESS` bitta holatda turadi, ustida 6 ta belgi | Admin to'lovni tekshiruvdan oldin ham, keyin ham qabul qilishi mumkin — chiziqli holatlar bu erkinlikni bermaydi |
| 3.5 | Admin roziligi savdo ochilgandan **keyin** so'raladi (`WAITING_ADMIN`) | Admin faqat xaridor allaqachon rozi bo'lgan haqiqiy ishga chaqiriladi; timer ham shu paytdan boshlanadi |
| 3.6 | Admin haqi ma'lumot uchun saqlanadi, pul harakati yo'q | Xaridor adminga to'g'ridan-to'g'ri to'laydi. Kelishilgan summa ikki chatda ko'rinadi — nizoda va statistikada kerak |
| 3.7 | Platforma human savdodan daromad olmaydi | Pul yonimizdan o'tmagani uchun ushlab qolish texnik jihatdan imkonsiz. Human admin savdo hajmini oshirish uchun |
| 3.8 | Yopish ikki taraf tasdig'i bilan, 24 soatdan keyin avtomatik `SUCCESS` | Admin barcha 6 qadamni belgilagan — bu reytingi bor tarafning guvohligi. Sukut = rozilik. Aks holda g'oyib bo'lgan taraf savdoni abadiy muzlatadi |
| 3.9 | Admin g'oyib bo'lsa platforma admini eskalatsiya oladi | Foydalanuvchi tanlovi. Avtomatik SMART'ga o'tish qo'shilmadi — §7.2 |
| 3.10 | Admin profili trade-service'da | Reyting savdolardan, o'rtacha vaqt trade timer'idan tug'iladi. auth-service faqat rol bitini biladi, va boshqa servis auth DB'siga ulanmaydi (CLAUDE.md) |
| 3.11 | Faqat sotuvchi rejim va adminni tanlaydi | Admin haqi amalda sotuvchi ulushidan chiqadi (xaridor to'laydi, admin ushlab qoladi, qolgani sotuvchiga) — demak tanlov uning puliga tegishli |
| 3.12 | Yomon admin mavjud trust moduliga tushadi | marketplace'da complaints → bosqichli jazo → qora ro'yxat allaqachon bor va tashqi identifikator (telegram, telefon) bo'yicha qaytib kelishni ushlaydi |
| 3.13 | Parol oddiy chat xabari bilan beriladi | Foydalanuvchi tanlovi. `PASSWORD_ONETIME` mexanizmi human yo'lida ishlatilmaydi |
| 3.14 | Human savdoda karta talab qilinmaydi | Platforma to'lovi yo'q, karta hech narsaga ishlatilmaydi |

---

## 4. Arxitektura

```
                        ┌─────────────────────────────────────┐
                        │  auth-service                       │
                        │  Role { USER, ADMIN, TRADE_ADMIN }  │
                        │  rolesFor() → JWT roles claim       │
                        │  /internal/auth/v1/users/summary/…  │
                        └───────┬─────────────────────┬───────┘
                                │ Kafka               │ HTTP
                                │ user-role-changed   │ X-Internal-Secret
                                ▼                     ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  trade-service                                                   │
   │                                                                  │
   │  ┌────────────────────┐   ┌──────────────────────────────────┐  │
   │  │ TradeAdminProfile  │   │ TradeStateMachine (bitta)        │  │
   │  │  Service           │   │  SMART yo'li  |  HUMAN yo'li     │  │
   │  │  – narx oralig'i   │   └──────────┬───────────────────────┘  │
   │  │  – reyting         │              │                          │
   │  │  – statistika      │   ┌──────────▼───────────────────────┐  │
   │  └────────────────────┘   │ TradeStateHandler                │  │
   │                            │  if (mode == SMART) → Kafka     │  │
   │  ┌────────────────────┐   └──────────┬───────────────────────┘  │
   │  │ TradeAdminCatalog  │              │                          │
   │  │  Service           │   ┌──────────▼───────────────────────┐  │
   │  │  – qidiruv, sort   │   │ TradeStepService                 │  │
   │  │  – PresenceQuery   │   │  6 belgi, 6/6 → yopish ochiladi  │  │
   │  └────────────────────┘   └──────────────────────────────────┘  │
   └────────┬──────────────────────────────────┬──────────────────────┘
            │ Kafka                            │ Kafka
            ▼                                  ▼
   ┌────────────────────┐        ┌──────────────────────────────┐
   │ smart-admin-worker │        │ marketplace-service          │
   │  faqat SMART       │        │  – chatni important qiladi   │
   │  + mailbox/rotate  │        │  – TRADE_ADMIN_INVITED       │
   │    ikki rejimda    │        │    notification              │
   └────────────────────┘        │  – trust: complaints/jazolar │
                                 └──────────────────────────────┘
```

### 4.1 Rol modeli

`Role` enum uchinchi qiymat oladi. Muhim: `role` ustuni **bitta qiymatli** qoladi —
join jadval qo'shilmaydi. O'rniga JWT'ga tushadigan authority ro'yxati hisoblanadi:

```java
public static List<String> rolesFor(Role role) {
    return switch (role) {
        case USER        -> List.of("ROLE_USER");
        case ADMIN       -> List.of("ROLE_USER", "ROLE_ADMIN");
        case TRADE_ADMIN -> List.of("ROLE_USER", "ROLE_TRADE_ADMIN");
    };
}
```

`JwtService` va `UserMapper` ikkisi ham shu metodni chaqiradi (hozir ikkisida
`List.of("ROLE_" + role.name())` takrorlanadi).

**Tekshirilgan:** kodda hech qayerda `ROLE_USER` talab qilinmaydi — himoya faqat
`X-User-Id` mavjudligiga tayanadi. Ya'ni `ROLE_USER`ni qo'shish qo'shimcha
xavfsizlik, buzilish emas.

**Cheklov:** bir odam bir vaqtda `ADMIN` ham, `TRADE_ADMIN` ham bo'lolmaydi. Bu
ataylab — platforma admini nizoni hal qiladi, savdo adminini emas, aks holda
manfaatlar to'qnashuvi bo'ladi.

Rolni platforma admini beradi — `AdminUserController` va `UpdateRoleRequest`
allaqachon mavjud, faqat `UpdateRoleRequest` validatsiyasi yangi qiymatni qabul
qilishi kerak.

### 4.2 Ism va avatar

trade-service userlarni bilmaydi. Katalog uchun ism/avatar mavjud naqsh bilan
olinadi: `POST /internal/auth/v1/users/summary/batch`, `X-Internal-Secret` header,
marketplace'dagi `AuthSummaryClient` ko'chiriladi (`fail-soft` — ism kelmasa
kartochka statistika bilan chiqadi, xato qaytarilmaydi).

### 4.3 Rol o'zgarishi sinxronizatsiyasi

Yangi Kafka topic: **`efbazaar.auth.user-role-changed`**

```json
{ "userId": "...", "oldRole": "TRADE_ADMIN", "newRole": "USER", "occurredAt": "..." }
```

trade-service consumer: `newRole != TRADE_ADMIN` bo'lsa profil `active = FALSE`
(o'chirilmaydi — reyting tarixi qoladi). Ochiq savdolari darhol eskalatsiyaga
tushadi (§7.2).

Busiz roli olib tashlangan admin katalogda qolib ketadi.

---

## 5. State machine

```
SMART (o'zgarmaydi):
  INITIATED ──MAILBOX_PROVISIONED──▶ WAITING_PAYMENT ──▶ WAITING_EMAIL_CHANGE
            ──▶ VERIFYING_KONAMI_LINK ──▶ WAITING_PASSWORD ──▶ WAITING_BUYER_VERIFY
            ──▶ SUCCESS | REJECTED | ORPHANED

HUMAN (yangi):
  INITIATED ──MAILBOX_PROVISIONED──▶ WAITING_ADMIN
                                        │
              ┌─────────────────────────┼──────────────────────┐
              │ ADMIN_ACCEPTED          │ ADMIN_DECLINED       │ TIMEOUT
              ▼                         ▼ (self-loop)          ▼
         IN_PROGRESS               WAITING_ADMIN           ORPHANED
              │
              ├── ADMIN_CLOSED (6/6 belgi shart) ──▶ WAITING_CLOSE_CONFIRM
              │                                          │
              │                    ┌─────────────────────┼──────────────┐
              │                    │ CLOSE_CONFIRMED     │ TIMEOUT 24s  │
              │                    ▼                     ▼              │
              │                 SUCCESS               SUCCESS ──────────┘
              │
              └── ADMIN_CANCELLED ──▶ REJECTED
```

### 5.1 Yangi holatlar

| Holat | Ma'nosi | `state_deadline` |
|---|---|---|
| `WAITING_ADMIN` | Admin roziligi kutilmoqda | `human-waiting-admin-seconds` (24 soat) → `ORPHANED` |
| `IN_PROGRESS` | Admin ishlayapti | **`NULL`** — §11.1 sababini o'qing |
| `WAITING_CLOSE_CONFIRM` | Ikki taraf tasdig'i kutilmoqda | `human-close-confirm-seconds` (24 soat) → `SUCCESS` |

### 5.2 Yangi eventlar

| Event | Qayerdan → qayerga | Kim otadi |
|---|---|---|
| `ADMIN_ACCEPTED` | `WAITING_ADMIN` → `IN_PROGRESS` | Taklif qilingan admin |
| `ADMIN_DECLINED` | `WAITING_ADMIN` → `WAITING_ADMIN` | Taklif qilingan admin |
| `ADMIN_CLOSED` | `IN_PROGRESS` → `WAITING_CLOSE_CONFIRM` | Biriktirilgan admin, 6/6 belgi bilan |
| `CLOSE_CONFIRMED` | `WAITING_CLOSE_CONFIRM` → `SUCCESS` | Ikki taraf ham tasdiqlagach tizim |
| `ADMIN_CANCELLED` | `IN_PROGRESS` → `REJECTED` | Biriktirilgan admin yoki platforma admini |

`ADMIN_DECLINED` self-loop — `RECHECK` bilan bir xil naqsh. O'tish davomida
`assigned_admin_id = NULL`, `admin_fee_uzs = NULL`, va `state_deadline` yangilanadi
(sotuvchiga boshqa admin tanlashga vaqt beradi).

`ADMIN_CANCELLED` shart: admin akkountni tekshirib **qalbaki** ekanini topsa savdoni
to'xtatishi kerak. Busiz u faqat 6/6 belgilab yopishga majbur bo'lardi.

### 5.3 `TIMEOUT` ning uch xil ma'nosi

`TradeTimeoutScheduler` bitta `TIMEOUT` event otadi, natija holatga bog'liq:

```
WAITING_ADMIN          + TIMEOUT → ORPHANED   (hech narsa boshlanmagan, yo'qotish yo'q)
WAITING_CLOSE_CONFIRM  + TIMEOUT → SUCCESS    (admin guvohligi yetarli, §3.8)
IN_PROGRESS            + TIMEOUT → mavjud emas — deadline NULL bo'lgani uchun otilmaydi
```

---

## 6. Human savdo oqimi

### 6.1 To'liq ketma-ketlik

```
 1. Sotuvchi proposal yaratadi: narx + mode=HUMAN + adminId + adminFeeUzs
    (adminFeeUzs adminning [min_fee, max_fee] oralig'ida bo'lishi tekshiriladi)
 2. Xaridor qabul qiladi → Trade yaratiladi, INITIATED
 3. Kafka: emailProvisionRequest → worker Mailcow'da mailbox ochadi
 4. MAILBOX_PROVISIONED → WAITING_ADMIN
    Kafka: tradeAdminInvited → marketplace notification → adminning qo'ng'irog'i
 5. Admin qabul qiladi → IN_PROGRESS
    – mailbox vaqtincha adminga biriktiriladi (assignOwner)
    – 6 ta trade_steps qatori yaratiladi (completed_at = NULL)
    – admin_accepted_at yoziladi → timer boshlanadi
    – ikki chatga STATUS xabari: "Admin <ism> savdoni oldi"
 6. Admin ikki chatda ishlaydi:
    – sotuvchiga escrow email ko'rsatiladi (panelda, TradeResponse.mailboxEmail)
    – sotuvchi akkountni shu emailga o'tkazadi
    – admin webmail'dan (mail.efbazaar.uz) xatlarni o'qib akkountni tekshiradi
    – admin xaridordan pulni oladi (platformadan tashqarida)
    – admin xaridorga email + parolni chatda beradi
    – admin sotuvchiga pulni o'tkazadi (platformadan tashqarida)
    Har qadam belgilanadi → audit log + ikki chatga STATUS xabari
 7. 6/6 belgilangach [Savdoni yopish] ochiladi → WAITING_CLOSE_CONFIRM
    admin_closed_at yoziladi → adminning ish timeri to'xtaydi
 8. Sotuvchi va xaridor tasdiqlaydi (yoki 24 soat o'tadi) → SUCCESS
    – mailbox rotate + xaridorga o'tadi → adminning kirishi uziladi
    – listingSold → marketplace
    – admin statistikasi yangilanadi
 9. Ikki tarafga baholash oynasi chiqadi (1–5 yulduz + izoh, ixtiyoriy, 7 kun ichida)
    Chat yopilgan, qayta ochilmaydi
```

### 6.2 Olti belgi

| Kod | Matni | Nima isbotlaydi |
|---|---|---|
| `SELLER_BRIEFED` | Sotuvchi bilan gaplashdim | Admin jarayonni tushuntirdi |
| `ACCOUNT_TRANSFERRED` | Akkount escrow emailga o'tkazildi | Sotuvchi o'z ishini qildi |
| `ACCOUNT_VERIFIED` | Akkountni tekshirdim — haqiqiy | Admin webmail'dan tasdiqladi |
| `PAYMENT_RECEIVED` | Xaridordan to'lovni oldim | Pul admin qo'lida |
| `CREDENTIALS_DELIVERED` | Xaridorga email va parol berildi | Xaridor akkountni oldi |
| `SELLER_PAID` | Sotuvchiga pulni o'tkazdim | Sotuvchi haqini oldi |

Tartib majburiy emas — admin istagan ketma-ketlikda belgilaydi. Belgini **olib
tashlash** ham mumkin (xatoni tuzatish uchun); har ikki amal `trade_audit_log`ga
tushadi.

`ADMIN_CLOSED` faqat oltitasi ham belgilangan bo'lsa ruxsat etiladi, aks holda
`409 Conflict`.

### 6.3 Mailbox egaligi

```
INITIATED            → owner = NULL              (hozirgidek)
ADMIN_ACCEPTED       → owner = admin             ← YANGI, vaqtincha
Almashtirish (§7.2)  → rotate + owner = yangi admin
SUCCESS              → rotate + owner = buyer
REJECTED             → rotate + owner = seller
ORPHANED             → stripFromTrade
```

**Tekshirilgan:** `MailService` har amalda `mailboxes.getOwned(userId, mailboxId)`
chaqiradi, ya'ni `assignOwner` adminga mail.efbazaar.uz'da to'liq kirish beradi —
webmail kodiga tegish kerak emas.

Almashtirishda ham rotate otilishi **majburiy**: eski admin mailbox parolini
allaqachon biladi.

### 6.4 Nega human yo'lida `WAITING_BUYER_VERIFY` ekspluatatsiyasi yo'q

Smart yo'lida xaridor akkountni olib jim qolsa yoki rad etsa `TIMEOUT → REJECTED`
ishlaydi va pul to'liq qaytadi (payment spec §14). Human yo'lida:

1. Escrow yo'q — qaytariladigan pul platformada turmaydi
2. `WAITING_CLOSE_CONFIRM` `TIMEOUT` → `SUCCESS`, `REJECTED` emas
3. Xaridorning jim qolishi savdoni bekor qilmaydi

---

## 7. Chatlar va ruxsatlar

### 7.1 Mavjud ikki chat qayta ishlatiladi

`trade_chats` har savdoda aynan ikki qator yaratadi (`SELLER`, `BUYER`), ikki taraf
bir-birining chatini ko'rmaydi. Bu aynan kerak bo'lgan shakl — **yangi jadval
qo'shilmaydi**.

Kerakli o'zgarishlar:

| Nima | Qanday |
|---|---|
| `TradeSenderType` | `HUMAN_ADMIN` qo'shiladi; V5'dagi CHECK yangi migration bilan kengaytiriladi |
| Ko'ruvchi tushunchasi | `TradeViewer { SELLER, BUYER, ADMIN }`. Hozirgi `Trade.roleFor()` faqat ikkitasini biladi va admin uchun `null` qaytaradi |
| Trade o'qish | `findByIdAndParticipant` adminni ko'rmaydi → `findByIdAndParticipantOrAdmin` |
| Xabar yuborish | `POST /trades/{id}/messages?target=SELLER\|BUYER` — admin uchun majburiy, taraflar uchun e'tiborsiz (o'z chatiga tushadi) |
| WS ruxsati | `WebSocketConfig.handleSubscribe` `assigned_admin_id`ni ham qabul qiladi. Admin **mavjud ikki topikka** ulanadi — yangi topik yo'q |
| `TradeBroadcaster.withRole` | `TradeViewer` bilan ishlaydi |

Admin `/topic/trades/{id}/seller` va `/topic/trades/{id}/buyer` ikkisiga ham
subscribe qiladi. Bu ma'lumot chiqib ketishiga olib kelmaydi — admin ikki chatni
ham ko'rishga haqli.

**Admin marketplace chatini ko'rmaydi.** Sotuvchi va xaridor savdodan oldin
narx haqida qanday gaplashgani adminga tegishli emas.

### 7.2 Eskalatsiya

`IN_PROGRESS` da `escalation_deadline_at` bor (adminning oxirgi amalidan
`human-admin-idle-seconds`, standart 12 soat). Alohida sweeper (§11.1) muddat
o'tganini topsa:

```
escalated_at    = now()
escalation_reason = 'ADMIN_IDLE'
→ ROLE_ADMIN navbatiga tushadi
→ holat O'ZGARMAYDI (IN_PROGRESS da qoladi)
```

`escalation_deadline_at` **adminning har amalida** yangilanadi — qadam belgilash,
belgini olib tashlash, ikki chatdan biriga xabar yozish. Ya'ni faol ishlab turgan
admin hech qachon eskalatsiyaga tushmaydi. Chat xabarini ham hisoblash muhim:
admin sotuvchi bilan uzoq gaplashib, hali hech qanday qadamni belgilamagan bo'lishi
mumkin, va bu tashlab ketish emas.

Eskalatsiya qilingan savdo ikkinchi marta olinmaydi (`escalated_at IS NULL`
sharti indeksda ham, so'rovda ham bor). Platforma admini `reassign` qilsa
`escalated_at` va `escalation_reason` tozalanadi.

Platforma admini ikki amaldan birini bajaradi:

| Amal | Natija |
|---|---|
| `reassign` | `IN_PROGRESS` → `WAITING_ADMIN`, mailbox rotate, eski adminga `abandoned_count++` |
| `cancel` | `ADMIN_CANCELLED` → `REJECTED`, mailbox rotate + sotuvchiga |

**SMART'ga o'tkazish qo'shilmadi.** `IN_PROGRESS` smart yo'lida mavjud emas, ya'ni
avtomatika qaysi holatdan davom etishi noaniq bo'lardi. Ustiga human savdoda escrow
yo'q — bekor qilish hech kimga pul yo'qotmaydi. Ikki amal yetarli.

---

## 8. payment-service bilan chegara

Human savdo payment-service'ga **umuman tegmaydi**:

| Nima | SMART | HUMAN |
|---|---|---|
| Escrow hold (`/internal/escrow/hold`) | ✓ | ✗ |
| `payment_outbox` (SETTLE / RELEASE) | ✓ | ✗ |
| Platforma haqi (5 000) | ✓ | ✗ (§3.7) |
| Wallet harakati | ✓ | ✗ |

`admin_fee_uzs` **faqat ma'lumot uchun** saqlanadi: ikki chatda "kelishilgan haq:
15 000 so'm" deb ko'rinadi, admin statistikasiga (o'rtacha haq) tushadi, nizoda
dalil bo'ladi. Ledger'da unga mos yozuv yo'q.

Ma'no jihatidan haq sotuvchi ulushidan chiqadi: xaridor adminga 80 000 beradi, admin
o'ziga 15 000 olib sotuvchiga 65 000 o'tkazadi. Bu platformadan tashqarida sodir
bo'ladi va biz uni faqat qayd qilamiz.

**payment-service hozir to'xtatilgan** (2026-07-30 qarori). Uning spec'i
`2026-07-27-payment-service-design.md` da yozilgan holda qoladi, lekin qurilmaydi.
Bu spec'dagi hech bir bosqich unga tayanmaydi: human savdoda pul adminning qo'lidan
o'tadi, smart savdoda esa mavjud `MockPaymentAdapter` ishlashda davom etadi.

**payment-service qurilganda unga qo'shilishi kerak:** `TradeStateHandler`
`payment_outbox` qatorini yozishdan oldin `mode == SMART` tekshiradi. Busiz human
savdo yopilganda mavjud bo'lmagan hold'ni settle qilishga urinadi.

---

## 9. Admin profili va katalog

### 9.1 Profil

```sql
CREATE TABLE trade_admin_profiles (
    user_id               UUID PRIMARY KEY,
    min_fee_uzs           BIGINT  NOT NULL,
    max_fee_uzs           BIGINT  NOT NULL,
    bio                   VARCHAR(500),
    accepting_orders      BOOLEAN NOT NULL DEFAULT TRUE,
    max_concurrent_trades INT     NOT NULL DEFAULT 3,
    active                BOOLEAN NOT NULL DEFAULT TRUE,

    rating_sum            INT     NOT NULL DEFAULT 0,
    rating_count          INT     NOT NULL DEFAULT 0,
    completed_count       INT     NOT NULL DEFAULT 0,
    abandoned_count       INT     NOT NULL DEFAULT 0,
    cancelled_count       INT     NOT NULL DEFAULT 0,
    total_work_seconds    BIGINT  NOT NULL DEFAULT 0,
    total_close_seconds   BIGINT  NOT NULL DEFAULT 0,

    version               BIGINT  NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_tap_fee_range CHECK (min_fee_uzs > 0 AND max_fee_uzs >= min_fee_uzs),
    CONSTRAINT chk_tap_concurrent CHECK (max_concurrent_trades BETWEEN 1 AND 20)
);

CREATE INDEX ix_tap_catalog ON trade_admin_profiles (active, accepting_orders);
```

Profil qatori borligi = "men savdo admini bo'lib ishlayman". Rol bor, lekin profil
yo'q → katalogda ko'rinmaydi. Profilni admin o'zi yaratadi.

`accepting_orders` — adminning "hozir yangi savdo olmayman" tugmasi.

### 9.2 Ikki timer

Foydalanuvchi "timer savdo yopilguncha hisoblab boradi" dedi. Muammo: 24 soatlik
avtomatik tasdiq kutish ham unga tushadi, ya'ni **jim qolgan xaridor adminning
statistikasini buzadi**. Shuning uchun ikkita raqam:

```
total_work_seconds  += (admin_closed_at - admin_accepted_at)   ← katalogda ko'rinadi
total_close_seconds += (closed_at       - admin_accepted_at)   ← platforma tahlili
```

Katalog `total_work_seconds / completed_count` ni ko'rsatadi — adminning o'z ishi
baholanadi, taraflarning sustligi emas.

### 9.3 Presence — vaqtinchalik yechim

To'liq global presence alohida spec. Bu yerda:

```java
/** Katalog online holatini shu port orqali o'qiydi. */
public interface PresenceQuery {
    Map<UUID, Presence> of(Collection<UUID> userIds);
    record Presence(boolean online, Instant lastSeenAt) {}
}
```

Vaqtinchalik implementatsiya: trade-service'ga kelgan har autentifikatsiyalangan
request `SETEX presence:{userId} 120 <timestamp>` yozadi (interceptor). `online` =
kalit mavjud. `lastSeenAt` = kalit qiymati; kalit yo'q bo'lsa `null`.

**Redis, Postgres emas** — har request'da jadval yozuvi issiq yo'lda keraksiz
yozuv ko'payishi bo'lardi. Shu sababli profil jadvalida `last_seen_at` ustuni yo'q.

Global presence spec'i kelganda faqat bu klass almashadi, katalog kodiga tegilmaydi.

### 9.4 Katalog

`GET /api/v1/trade-admins?q=&sort=&page=`

Saralash: online → reyting → o'rtacha ish vaqti.

Kartochkada: ism · avatar · ⭐ 4.8 (32 baho) · o'rtacha 2 soat 15 daqiqa ·
15 000–40 000 so'm · online / "5 daqiqa oldin" · band 2/5.

Adminlar soni kichik (o'nlab), shuning uchun ism bo'yicha qidiruv shunday ishlaydi:
faol profillarning `user_id` lari SQL'dan olinadi → ismlar batch bilan resolve
qilinadi → server tomonda filtrlanadi → natija Redis'da 60 s cache. Yangi auth
endpoint kerak emas.

Katalogdan chiqib ketish shartlari: `active = FALSE`, `accepting_orders = FALSE`,
yoki aktiv savdolari `max_concurrent_trades` ga yetgan (kartochka "band" deb
chiqadi, tanlanmaydi).

### 9.5 Sig'im poygasi

Ikki sotuvchi bir vaqtda bir adminni tanlashi mumkin. Chegara **tanlashda emas,
qabul qilishda** bog'lanadi:

```
ADMIN_ACCEPTED tranzaksiyasi ichida:
  SELECT … FROM trade_admin_profiles WHERE user_id = ? FOR UPDATE
  aktiv savdolar sonini hisoblash
  >= max_concurrent_trades bo'lsa → 409, savdo WAITING_ADMIN da qoladi
```

Tanlash (taklif) erkin — u faqat taklif, band qilish emas.

---

## 10. Baholash

```sql
CREATE TABLE trade_admin_ratings (
    id          UUID PRIMARY KEY,
    trade_id    UUID     NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    admin_id    UUID     NOT NULL,
    rater_id    UUID     NOT NULL,
    rater_role  VARCHAR(8) NOT NULL,
    stars       SMALLINT NOT NULL,
    comment     VARCHAR(500),
    hidden_at   TIMESTAMPTZ,
    hidden_by   UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_tar_stars CHECK (stars BETWEEN 1 AND 5),
    CONSTRAINT chk_tar_role  CHECK (rater_role IN ('SELLER', 'BUYER')),
    CONSTRAINT uk_tar_rater  UNIQUE (trade_id, rater_id)
);

CREATE INDEX ix_tar_admin ON trade_admin_ratings (admin_id, created_at DESC);
```

- Ikki taraf ham baholaydi, **ixtiyoriy** (savdoni bloklamaydi)
- Baholash oynasi `SUCCESS` dan keyin ochiladi, `rating-window-days` (7) ichida
- Baholash chat xabari **emas**, shuning uchun yopilgan chatdan keyin ham ishlaydi
- Izohlar admin profilida **ochiq** ko'rinadi
- Platforma admini haqoratli izohni yashiradi (`hidden_at`, `hidden_by`) — o'chirmaydi
- **Yashirish faqat izoh matnini yashiradi, yulduzcha o'rtachada qoladi.**
  `rating_sum` / `rating_count` faqat insert'da yangilanadi. Sabab: aks holda
  platforma admini izohni yashirib adminning reytingini ko'tarib qo'yishi mumkin
  bo'lardi — moderatsiya vositasi reyting manipulyatsiyasiga aylanib ketadi

Yomon admin uchun ikkinchi qatlam — mavjud trust moduli (§12.3).

---

## 11. Ma'lumot modeli o'zgarishlari

### 11.1 `trades` (trade-service `V9`)

```sql
ALTER TABLE trades
    ADD COLUMN mode                  VARCHAR(8) NOT NULL DEFAULT 'SMART',
    ADD COLUMN assigned_admin_id     UUID,
    ADD COLUMN admin_fee_uzs         BIGINT,
    ADD COLUMN admin_accepted_at     TIMESTAMPTZ,
    ADD COLUMN admin_closed_at       TIMESTAMPTZ,
    ADD COLUMN seller_confirmed_at   TIMESTAMPTZ,
    ADD COLUMN buyer_confirmed_at    TIMESTAMPTZ,
    ADD COLUMN escalation_deadline_at TIMESTAMPTZ,
    ADD COLUMN escalated_at          TIMESTAMPTZ,
    ADD COLUMN escalation_reason     VARCHAR(32);

ALTER TABLE trades ADD CONSTRAINT chk_trades_mode
    CHECK (mode IN ('SMART', 'HUMAN'));

-- Admin o'zi taraf bo'lib qolmasligi kerak.
ALTER TABLE trades ADD CONSTRAINT chk_trades_admin_not_party
    CHECK (assigned_admin_id IS NULL
        OR (assigned_admin_id <> seller_id AND assigned_admin_id <> buyer_id));

-- SMART savdoda admin maydonlari bo'sh bo'lishi kerak.
ALTER TABLE trades ADD CONSTRAINT chk_trades_smart_no_admin
    CHECK (mode = 'HUMAN' OR (assigned_admin_id IS NULL AND admin_fee_uzs IS NULL));

-- V4 immutable, shuning uchun holat CHECK'i qayta quriladi.
ALTER TABLE trades DROP CONSTRAINT chk_trades_state;
ALTER TABLE trades ADD  CONSTRAINT chk_trades_state CHECK (state IN (
    'INITIATED', 'WAITING_PAYMENT', 'WAITING_EMAIL_CHANGE',
    'VERIFYING_KONAMI_LINK', 'WAITING_PASSWORD', 'WAITING_BUYER_VERIFY',
    'WAITING_ADMIN', 'IN_PROGRESS', 'WAITING_CLOSE_CONFIRM',
    'SUCCESS', 'REJECTED', 'ORPHANED'
));

-- Human savdoda karta talab qilinmaydi (§3.14). SMART'da service qatlami majburlaydi.
ALTER TABLE trades ALTER COLUMN seller_card_id DROP NOT NULL;
ALTER TABLE trades ALTER COLUMN buyer_card_id  DROP NOT NULL;
ALTER TABLE trades ADD CONSTRAINT chk_trades_smart_cards
    CHECK (mode = 'HUMAN' OR (seller_card_id IS NOT NULL AND buyer_card_id IS NOT NULL));

-- Eskalatsiya sweeper'i uchun arzon qidiruv.
CREATE INDEX ix_trades_escalation ON trades (escalation_deadline_at)
    WHERE escalated_at IS NULL AND escalation_deadline_at IS NOT NULL;
CREATE INDEX ix_trades_escalated ON trades (escalated_at)
    WHERE escalated_at IS NOT NULL;
CREATE INDEX ix_trades_admin ON trades (assigned_admin_id)
    WHERE assigned_admin_id IS NOT NULL;

-- Enum kengaytirishlar.
ALTER TABLE trade_audit_log DROP CONSTRAINT chk_audit_actor;
ALTER TABLE trade_audit_log ADD  CONSTRAINT chk_audit_actor
    CHECK (actor_type IN ('USER', 'WORKER', 'SYSTEM', 'ADMIN', 'TRADE_ADMIN'));

ALTER TABLE trade_messages DROP CONSTRAINT chk_trade_messages_sender;
ALTER TABLE trade_messages ADD  CONSTRAINT chk_trade_messages_sender
    CHECK (sender_type IN ('USER', 'SMART_ADMIN', 'SYSTEM', 'HUMAN_ADMIN'));
```

**`IN_PROGRESS` da `state_deadline` NIMA UCHUN `NULL`:**
`TradeTimeoutScheduler` har 10 sekundda `findByStateInAndStateDeadlineBefore(
nonTerminal(), now)` bilan barcha terminal bo'lmagan holatlarni qamrab oladi va
`TIMEOUT` otadi. `IN_PROGRESS` da `TIMEOUT` o'tishi yo'q, ya'ni agar unga deadline
qo'yilsa `InvalidTradeTransitionException` **har 10 sekundda abadiy** otiladi.
Shuning uchun eskalatsiya alohida ustun (`escalation_deadline_at`) va alohida
sweeper bilan ishlaydi.

### 11.2 Yangi jadvallar (trade-service `V10`–`V12`)

`V10` — `trade_admin_profiles` (§9.1)
`V11` — `trade_steps`:

```sql
CREATE TABLE trade_steps (
    trade_id     UUID        NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    step         VARCHAR(32) NOT NULL,
    completed_at TIMESTAMPTZ,
    completed_by UUID,
    note         VARCHAR(500),
    PRIMARY KEY (trade_id, step),
    CONSTRAINT chk_trade_steps_step CHECK (step IN (
        'SELLER_BRIEFED', 'ACCOUNT_TRANSFERRED', 'ACCOUNT_VERIFIED',
        'PAYMENT_RECEIVED', 'CREDENTIALS_DELIVERED', 'SELLER_PAID'))
);
```

`V12` — `trade_admin_ratings` (§10)

### 11.3 auth-service `V7`

```sql
ALTER TABLE users DROP CONSTRAINT chk_users_role;
ALTER TABLE users ADD  CONSTRAINT chk_users_role
    CHECK (role IN ('USER', 'ADMIN', 'TRADE_ADMIN'));
```

Busiz rol berish `constraint violation` bilan yiqiladi.

### 11.4 marketplace-service `V27`

```sql
ALTER TABLE notifications DROP CONSTRAINT chk_notifications_type;
ALTER TABLE notifications ADD  CONSTRAINT chk_notifications_type
    CHECK (type IN ('CHAT_CREATED', 'CHAT_MESSAGE', 'TRADE_ADMIN_INVITED'));

ALTER TABLE notifications ADD COLUMN trade_id UUID;

-- Aktiv savdo chatni avtomatik yopilishdan saqlaydi (§12.1).
-- Foydalanuvchining qo'lda qo'ygan yulduzchasi (chats.is_important) alohida
-- qoladi — aks holda savdo yopilganda uning belgisi ham o'chib ketardi.
ALTER TABLE chats ADD COLUMN system_important BOOLEAN NOT NULL DEFAULT FALSE;

-- V2__chat.sql dagi qidiruv indeksi system_important ni bilmaydi, shuning uchun
-- qayta quriladi. findExpired sharti: status='ACTIVE' AND NOT is_important
--                                    AND NOT system_important
DROP INDEX IF EXISTS idx_chats_expiry_candidates;
CREATE INDEX idx_chats_expiry_candidates ON chats (last_message_at)
    WHERE status = 'ACTIVE' AND is_important = FALSE AND system_important = FALSE;
```

**Diqqat:** indeksning haqiqiy nomi va ustunlari `V2__chat.sql:37` dan olinishi
kerak — bu yerda taxminiy nom yozilgan. Implementation'da avval o'sha faylni
o'qib, mavjud indeks nomi va saralash ustuni aynan ko'chiriladi.

### 11.5 Redis proposal hash

`TradeProposalService.create` hozir `Map.of` bilan 7 juft yozadi. `mode`,
`adminId`, `adminFeeUzs` qo'shilsa roppa-rosa 10 bo'ladi — `Map.of`ning
maksimumi. Keyingi maydonda kompilyatsiya xatosi bo'lmasligi uchun `LinkedHashMap`ga
o'tkaziladi.

---

## 12. Boshqa servislar bilan integratsiya

### 12.1 Marketplace chat muddati

`ChatExpirationScheduler` aktiv chatni 24 soatdan keyin yopadi, `important = true`
bo'lsa yopmaydi. Human savdo bir necha kun ketishi mumkin, va trade paneli shu chat
ichida yashaydi.

Yechim: trade-service savdo `INITIATED` bo'lganda va terminal bo'lganda Kafka event
otadi, marketplace chatning `important` bayrog'ini boshqaradi.

```
efbazaar.trade.trade-opened  { tradeId, chatId }  → chats.system_important = TRUE
efbazaar.trade.trade-closed  { tradeId, chatId }  → chats.system_important = FALSE
```

**Muhim nozik nuqta:** marketplace'da `chats.is_important` ikki tarafning
`chat_participants.is_important` yulduzchalarining OR'i sifatida qayta hisoblanadi
(`ChatService` izohi, `V10__chat_participants.sql`). Shuning uchun tizim bayrog'i
**alohida ustun** bo'lishi shart — busiz savdo yopilganda foydalanuvchining qo'lda
qo'ygan yulduzchasi ham o'chib ketardi.

Yopish sharti: `status = 'ACTIVE' AND NOT is_important AND NOT system_important`.
`V2__chat.sql` dagi qismli indeks shu shartga moslab qayta quriladi (§11.4),
aks holda `findExpired` indeksdan foydalanmay to'liq skanerlashga o'tadi.

Bu ikki rejim uchun ham ishlaydi — smart savdo ham 24 soatdan uzun ketishi mumkin,
ya'ni bu mavjud kamchilikni ham yopadi.

### 12.2 Admin taklifi xabarnomasi

trade-service `WAITING_ADMIN` ga kirganda:

```
efbazaar.trade.admin-invited { tradeId, adminId, sellerId, priceUzs, feeUzs, occurredAt }
```

marketplace-service consumer `TRADE_ADMIN_INVITED` turida notification yozadi.
Admin mavjud qo'ng'iroq belgisida ko'radi — ikkinchi qo'ng'iroq qurilmaydi.

Yetkazish kafolatlanmagan (fail-soft): Kafka yoki marketplace ishlamasa admin
taklifni ish maydonida baribir ko'radi (`GET /trade-admins/me/invitations`).
Xabarnoma qulaylik, yagona kanal emas.

### 12.3 Trust moduli

Yomon admin ustidan shikoyat mavjud modulga tushadi:

```
POST /api/v1/complaints  { accusedId: adminId, contextType: 'TRADE',
                           contextId: tradeId, category: 'FRAUD', details }
```

Bu endpoint mavjud (`TrustController:39`) va yangi kod talab qilmaydi — faqat
frontend'da savdo yopilgandan keyin "Admin ustidan shikoyat" tugmasi qo'shiladi.
marketplace'da `POST /internal/marketplace/v1/trust/complaints` server-to-server
varianti ham bor, lekin biz undan foydalanmaymiz: shikoyatni odam yozadi, tizim
emas.

Mavjud jazo dvigateli ishlaydi: 1 tasdiqlangan = `WARNING`, 3 = 7-kunlik
`TEMP_BLOCK`, 5+ = `PERM_BLOCK`. `blacklist_identifiers` orqali admin telegram /
telefon / Konami ID bo'yicha qora ro'yxatga tushadi va yangi akkount bilan qaytib
kelolmaydi.

`uk_complaints_context UNIQUE (complainant_id, context_type, context_id)` bir savdo
uchun bir shikoyatni kafolatlaydi — spam yo'q.

Avtomatik shikoyat **ochilmaydi** — tashlab ketilgan savdo faqat `abandoned_count`ni
oshiradi va profilda ko'rinadi. Noto'g'ri avtomatik shikoyat halol adminni
jazolab qo'yishi mumkin.

### 12.4 nginx

```nginx
# Mavjud regex kengaytiriladi:
location ~ ^/api/v1/(trades|mailboxes|cards|trade-admins|admin/mailboxes|admin/trades)(/|$) {
    limit_except GET POST DELETE OPTIONS { deny all; }
    ...
}
```

Ikki tuzatish:

1. `trade-admins` va `admin/trades` regex'da yo'q edi — busiz ular
   marketplace'ga yoki 404'ga ketadi
2. `limit_except` `PUT`/`PATCH`ni **deny** qiladi. Shuning uchun profil yangilash
   `POST /api/v1/trade-admins/me` bo'ladi, `PUT` emas. Bu ataylab — nginx
   konfiguratsiyasini kengaytirishdan ko'ra bir usulda qolish arzonroq

WSS bloki (`/ws/trade/`) o'zgarmaydi — admin mavjud topiklarga ulanadi.

---

## 13. API

### 13.1 Admin profili

| Metod | Yo'l | Ruxsat | Tavsif |
|---|---|---|---|
| `GET` | `/api/v1/trade-admins/me` | `ROLE_TRADE_ADMIN` | O'z profili (yo'q bo'lsa 404) |
| `POST` | `/api/v1/trade-admins/me` | `ROLE_TRADE_ADMIN` | Yaratish yoki yangilash (upsert) |
| `GET` | `/api/v1/trade-admins/me/invitations` | `ROLE_TRADE_ADMIN` | `WAITING_ADMIN` dagi takliflar |
| `GET` | `/api/v1/trade-admins/me/trades` | `ROLE_TRADE_ADMIN` | Aktiv va yopilgan savdolari |
| `GET` | `/api/v1/trade-admins` | autentifikatsiya | Katalog: `?q=&sort=&page=` |
| `GET` | `/api/v1/trade-admins/{userId}` | autentifikatsiya | Ochiq profil + izohlar |

`/me` va `/{userId}` bir xil naqshga tushadi. Spring literal yo'lni `{userId}` dan
oldin tanlaydi, shuning uchun bu ishlaydi — lekin ikkisi **bitta controller
klassida** turishi kerak, aks holda tartib kafolatlanmaydi va `/me` `UUID` parse
xatosiga tushadi.

### 13.2 Savdo amallari

| Metod | Yo'l | Kim |
|---|---|---|
| `POST` | `/trades/{id}/actions/admin-accept` | Taklif qilingan admin |
| `POST` | `/trades/{id}/actions/admin-decline` | Taklif qilingan admin |
| `POST` | `/trades/{id}/actions/assign-admin` | Sotuvchi, `WAITING_ADMIN` da |

| `POST` | `/trades/{id}/steps/{step}` | Biriktirilgan admin |
| `DELETE` | `/trades/{id}/steps/{step}` | Biriktirilgan admin |
| `POST` | `/trades/{id}/actions/admin-close` | Biriktirilgan admin, 6/6 shart |
| `POST` | `/trades/{id}/actions/admin-cancel` | Biriktirilgan admin |
| `POST` | `/trades/{id}/actions/close-confirm` | Sotuvchi yoki xaridor |
| `POST` | `/trades/{id}/rating` | Sotuvchi yoki xaridor, `SUCCESS` dan keyin |
| `POST` | `/trades/{id}/messages?target=SELLER\|BUYER` | Admin (target majburiy) |

`assign-admin` **state machine eventi emas** — savdo `WAITING_ADMIN` da qoladi. U
faqat `assigned_admin_id` va `admin_fee_uzs` ni yozadi, `state_deadline` ni
yangilaydi va yangi `admin-invited` eventini otadi. Shuning uchun sotuvchi
ketma-ket bir necha adminni sinab ko'ra oladi va har biri o'z 24 soatini oladi.

`close-confirm` ham bevosita o'tish qilmaydi: u faqat `seller_confirmed_at` yoki
`buyer_confirmed_at` ni yozadi, va **ikkisi ham to'lgach** `CLOSE_CONFIRMED`
eventi otiladi. Bu ikkinchi tasdiqni ishlovchi tranzaksiya ichida bo'ladi.

### 13.3 Platforma admini

| Metod | Yo'l |
|---|---|
| `GET` | `/api/v1/admin/trades/escalated` |
| `POST` | `/api/v1/admin/trades/{id}/reassign` |
| `POST` | `/api/v1/admin/trades/{id}/cancel` |
| `POST` | `/api/v1/admin/trade-admins/{userId}/ratings/{ratingId}/hide` |

### 13.4 Proposal o'zgarishi

```java
public record ProposalCreateRequest(
        UUID marketplaceChatId,
        UUID otherPartyUserId,
        UUID sellerId,
        UUID buyerId,
        Long amountUzs,
        UUID cardId,          // HUMAN da null bo'lishi mumkin
        UUID listingId,
        TradeMode mode,       // YANGI, standart SMART
        UUID adminId,         // YANGI, HUMAN uchun majburiy
        Long adminFeeUzs      // YANGI, HUMAN uchun majburiy
) {}
```

Validatsiya:

- `mode == HUMAN` bo'lsa `adminId` va `adminFeeUzs` majburiy
- `adminFeeUzs` adminning `[min_fee_uzs, max_fee_uzs]` oralig'ida bo'lishi shart
- Admin `active && accepting_orders` bo'lishi shart
- `adminId != sellerId && adminId != buyerId`
- **`mode == HUMAN` faqat `proposerUserId == sellerId` bo'lganda ruxsat** (§3.11) —
  xaridor yaratgan proposal doim SMART

---

## 14. Konfiguratsiya

```yaml
trade:
  timeouts:
    # mavjud smart deadline'lar o'zgarmaydi
    human-waiting-admin-seconds:  86400    # 24 soat → ORPHANED
    human-close-confirm-seconds:  86400    # 24 soat → SUCCESS
    human-admin-idle-seconds:     43200    # 12 soat → eskalatsiya
  human:
    expires-after-hours:          168      # 7 kun (SMART'da 24)
    rating-window-days:           7
  admin-catalog:
    name-cache-ttl-seconds:       60
  scheduler:
    escalation-sweep-interval-ms: 60000
```

`trades.expires_at` hozir kodda 24 soat qotib turgan va **hech qayerda
majburlanmaydi** — faqat DTO orqali frontend'ga ketadi. HUMAN savdo uchun
`expires-after-hours` dan olinadi, aks holda panel yolg'on muddat ko'rsatadi.

---

## 15. Frontend

Backend'dan kattaroq qism. Implementation plan'da alohida bosqichlarga bo'linadi.

| Ekran | Ish |
|---|---|
| Proposal yaratish | Rejim tanlash (Smart / Inson admin). HUMAN tanlansa: admin qidiruv modali (qidiruv, kartochkalar, online, reyting, oraliq) + haq kiritish (oraliqda validatsiya). Karta maydoni HUMAN'da yashiriladi |
| Trade paneli (taraflar) | HUMAN rejimda 6 belgi ro'yxati (faqat o'qish), biriktirilgan admin kartochkasi, escrow email `IN_PROGRESS` da ko'rinadi, `WAITING_CLOSE_CONFIRM` da tasdiqlash tugmasi |
| Admin ish maydoni (yangi sahifa) | Kelgan takliflar; aktiv savdolar; har savdoda ikki chat yonma-yon, 6 belgi (interaktiv), ish timeri, [Savdoni yopish] va [Bekor qilish] |
| Admin profil sozlamalari | Narx oralig'i, bio, `accepting_orders`, `max_concurrent_trades` |
| Ochiq admin profili | Statistika + izohlar ro'yxati |
| Baholash oynasi | `SUCCESS` dan keyin: 1–5 yulduz + ixtiyoriy izoh |
| Platforma admin paneli | Eskalatsiya navbati, almashtirish / bekor qilish, izohni yashirish |

**Diqqat:** frontend hozir WebSocket ishlatmaydi — `trade-panel.tsx` har 4 sekundda
poll qiladi va `package.json`da `sockjs`/`stomp` yo'q. Admin ish maydoni ikki
chatni jonli ko'rsatishi kerak, ya'ni bu **frontend'dagi birinchi haqiqiy WS
klienti** bo'ladi. Muqobil: mavjud pollingni davom ettirish (arzonroq, lekin
chat 4 sekund kechikadi). Plan'da bu alohida qaror nuqtasi sifatida belgilanadi.

---

## 16. Testlash

### 16.1 Regressiya qo'riqlari (eng muhim)

| Test | Nima himoyalanadi |
|---|---|
| HUMAN savdo hech qachon `forgotPasswordRequest` / `imapPollRequest` otmaydi | Konami avtomatikasi human savdoga aralashmasligi |
| SMART savdo `WAITING_ADMIN` / `IN_PROGRESS` / `WAITING_CLOSE_CONFIRM` ga kirmaydi | Mavjud oqim buzilmagani |
| `IN_PROGRESS` da `state_deadline IS NULL` | §11.1 dagi cheksiz sweeper xatosi |
| HUMAN savdo `payment_outbox` qatori yozmaydi | §8 chegarasi |
| HUMAN terminal holatda `mailboxRotateRequest` otiladi | Adminning kirishi uzilishi |

### 16.2 State machine

- Har yangi o'tish uchun unit test, va noqonuniy o'tishlar `InvalidTradeTransitionException` berishi
- `ADMIN_DECLINED` self-loop `assigned_admin_id`ni tozalashi
- `WAITING_CLOSE_CONFIRM` + `TIMEOUT` → `SUCCESS` (`REJECTED` emas)
- `WAITING_ADMIN` + `TIMEOUT` → `ORPHANED`

### 16.3 Ruxsatlar

- Admin ikki chatni ham o'qiydi va yozadi
- Biriktirilmagan `TRADE_ADMIN` savdoga kirolmaydi (404, 403 emas — mavjudlikni oshkor qilmaslik uchun)
- Sotuvchi xaridor chatini ko'rmaydi va teskarisi
- STOMP: admin ikki topikka ulanadi; biriktirilmagan admin rad etiladi
- Admin `close-confirm` bosolmaydi (u taraf emas)
- Taraf `steps` belgilay olmaydi

### 16.4 Biznes qoidalari

- `admin-close` 5/6 belgida `409`
- `adminFeeUzs` oraliqdan tashqarida `400`
- `mode == HUMAN` xaridor tomonidan yaratilgan proposal'da `400`
- `max_concurrent_trades` to'lganda `admin-accept` `409`, savdo `WAITING_ADMIN` da qoladi
- Bir odam bir savdoni ikki marta baholay olmaydi (`uk_tar_rater`)
- HUMAN savdo kartasiz ochiladi, SMART savdo kartasiz `400`

### 16.5 Konkurentlik

- Ikki admin bir vaqtda `admin-accept` (Testcontainers, ikki tranzaksiya) → bittasi `409`
- Ikki taraf bir vaqtda `close-confirm` → bitta `SUCCESS` o'tishi
- `admin-close` va eskalatsiya sweeper'i bir vaqtda → mos kelmaydigan holat yo'q

### 16.6 Schedulerlar

- Eskalatsiya sweeper'i `escalated_at` qo'yadi, holatni **o'zgartirmaydi**
- `WAITING_CLOSE_CONFIRM` 24 soatdan keyin `SUCCESS`
- Eskalatsiya sweeper'i allaqachon eskalatsiya qilingan savdoni ikkinchi marta olmaydi

---

## 17. Qurish tartibi

Har bosqich mustaqil test qilinadi va o'zidan oldingisiga tayanadi.

| # | Bosqich | Bloklaydi |
|---|---|---|
| 1 | auth: `TRADE_ADMIN` roli, `rolesFor()`, `V7`, `user-role-changed` event | hammasi |
| 2 | trade: `V9`–`V12` migrationlar, `TradeMode`, `TradeViewer`, enum kengaytirishlar | 3+ |
| 3 | trade: admin profili CRUD + `AuthSummaryClient` ko'chirish | 4 |
| 4 | trade: katalog + `PresenceQuery` (Redis) + qidiruv cache | 5 |
| 5 | trade: state machine yangi o'tishlar + `TradeStateHandler` mode gate | 6 |
| 6 | trade: proposal'da mode/admin, `WAITING_ADMIN`, accept/decline, sig'im lock | 7 |
| 7 | trade: `trade_steps` + belgilash + chat STATUS xabarlari | 8 |
| 8 | trade: yopish oqimi, `close-confirm`, 24 soatlik sweeper, statistika | 9 |
| 9 | trade: baholash + profil agregatlari | — |
| 10 | trade: eskalatsiya sweeper + platforma admin endpointlari | — |
| 11 | nginx regex + `admin/trades` yo'nalishi | frontend |
| 12 | marketplace: `V27`, `TRADE_ADMIN_INVITED` consumer, `system_important` | — |
| 13 | frontend: proposal rejim tanlash + admin qidiruv modali | 14 |
| 14 | frontend: trade panelda belgilar + tasdiqlash + baholash | 15 |
| 15 | frontend: admin ish maydoni (ikki chat, belgilar, timer) | — |
| 16 | frontend: admin profil sozlamalari + ochiq profil | — |
| 17 | frontend: platforma admin eskalatsiya navbati | — |

1–12 backend, 13–17 frontend. 1–2 bosqichlar hech qanday ko'rinadigan
o'zgarish bermaydi, lekin ularsiz qolgani ishlamaydi.

---

## 18. Ochiq savollar va qabul qilingan xatarlar

### 18.1 Qabul qilingan xatarlar

**Escrow himoyasi yo'q.** Human savdoda pul platformadan o'tmaydi. Admin pulni olib
g'oyib bo'lsa platformaning yagona vositasi reyting, `abandoned_count` va trust
moduli jazolari. Bu Telegram "garant" xizmatlarining aynan modeli — ishlaydi, lekin
himoya adminning obro'siga tayanadi, kodga emas. Loyiha egasi bu xatarni
tushunib qabul qildi.

**Adminning webmail'ga kirishi.** `IN_PROGRESS` davomida admin escrow mailbox'ni
to'liq o'qiydi — Konami xatlari, parol tiklash havolalari. Yumshatish: kirish faqat
savdo davomida, terminal holatda va almashtirishda rotate otiladi. Lekin admin
o'sha oynada parolni ko'chirib olishi mumkin va bunga texnik to'siq yo'q.

**Xaridor adminning haqini bilmaydi.** Haq sotuvchi ulushidan chiqadi, xaridor
e'londagi narxni to'laydi. Xaridor uchun bu shaffof emas, lekin uning to'lovi
o'zgarmaydi.

### 18.2 Ochiq savollar

| Savol | Qachon hal bo'ladi |
|---|---|
| Admin ish maydoni WS ishlatadimi yoki mavjud 4-sekundlik pollingni davom ettiradimi | Implementation plan, 15-bosqich |
| Global presence spec'i qachon yoziladi va u `PresenceQuery`ni qanday almashtiradi | Alohida spec |
| `max_concurrent_trades` standart qiymati (hozir 3) real ishda to'g'rimi | Ishga tushgandan keyin kuzatiladi |
| Admin bir vaqtda `ADMIN` va `TRADE_ADMIN` bo'lishi kerak bo'lib qolsa | Ko'p rolli modelga o'tish kerak bo'ladi — hozir ataylab qilinmadi (§4.1) |
| Yangi rol tokenga 15 daqiqagacha tushmaydi (access token TTL) | Tuzatilmaydi; adminga "qayta kiring" deb aytiladi |
