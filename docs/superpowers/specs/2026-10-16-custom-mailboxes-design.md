# Custom mailboxlar va akkount emailini tasdiqlash — dizayn

Sana: 2026-10-16. Holat: tasdiqlangan (chatda, bo'limma-bo'lim).

## Maqsad

Foydalanuvchi o'zi tanlagan nomdagi pochta qutisini oladi (`ali@efbazaar.uz`,
Aristokrat'da `ali@efootball.uz` ham), Konami akkountini shu qutiga ulaydi va
platforma ulanishni tasdiqlaydi. Tasdiqlangan akkountlar "verified" belgisini,
custom qutiga ulanganlari oltin hoshiyani oladi. Custom qutilar bo'sh turmasligi
uchun platforma bo'shagan qutini boshqa akkountga ulashni taklif qilib turadi.

Muvaffaqiyat mezoni: user hint'dan boshlab qutini olib, akkountini ulab,
"Muvaffaqiyatli ulandi" ni ko'radi va akkountlarim'da email avtomatik yozilgan,
belgi va hoshiya qo'yilgan bo'ladi — admin aralashuvisiz.

## Qabul qilingan qarorlar

| Savol | Qaror |
|---|---|
| Qaysi slot hisobidan | `mailbox.custom_slots` (Jaydari 0, Boyvachcha 1, Aristokrat 3, STAFF cheksiz) |
| Savdoda ishlatiladimi | Yo'q — savdo uchun faqat random qutilar |
| Jaydari user | Sahifani ko'radi, nomni tekshiradi, ✓ ni ko'radi; "Olish" o'rnida Boyvachcha upgrade |
| Nomni o'zgartirish / qaytarish | Yo'q, doimiy. Tarif pasaysa boshqa qutilar kabi qulflanadi, o'chirilmaydi |
| Bir qutiga nechta akkount | Faqat bitta |
| Akkount tanlash ro'yxati | Hammasi, custom ulanganlardan tashqari; emaili yo'qlar tepada |
| Nom qoidasi | 5–24 belgi, faqat `[a-z0-9]`; katta harf kichikka aylanadi |
| Xatlarni o'qish | Ha, `mail.efbazaar.uz` da — boshqa egali qutilar kabi |
| Muddat | Har qadam 15 daqiqa; tugasa "Qayta urinish" |
| Forgot password | Faqat tekshiruv: reset xati qutiga kelishi kifoya, parolni o'zgartirish shart emas |
| Qo'lda yozilgan email | `@efbazaar.uz` / `@efootball.uz` bo'lsa va quti shu userniki bo'lsa — o'sha bosqichlar bilan tasdiqlanadi |
| Joylashuv | Session va qutilar trade-service'da; natija Kafka orqali marketplace'ga |

## Arxitektura

### trade-service

**`mailboxes` jadvali** — yangi ustunlar:
- `kind VARCHAR(16) NOT NULL DEFAULT 'RANDOM'` — `RANDOM | CUSTOM`.
- `domain VARCHAR(64) NOT NULL DEFAULT 'efbazaar.uz'` — mavjud qatorlar uchun
  manzildan backfill.

Custom qutilar savdo uchun quti tanlashda hech qachon olinmaydi; lock va slot
hisobida `CUSTOM` qutilar `mailbox.custom_slots` ga, `RANDOM` lar
`mailbox.slots` ga qarshi sanaladi. Tarif pasaysa custom qutilar ham mavjud lock
mexanizmi bilan qulflanadi (o'chirilmaydi).

**Ruxsat etilgan domenlar** — `MAILBOX_DOMAINS=efbazaar.uz,efootball.uz`
(birinchisi standart). `efootball.uz` faqat MAX va STAFF tarifiga ochiq.

**Nom tekshiruvi** —
`GET /api/v1/mailboxes/custom/availability?localPart=&domain=` →
`{ available: boolean, reason: TAKEN | RESERVED | INVALID | DOMAIN_NOT_ALLOWED | NO_SLOT | null }`.
- `INVALID`: 5–24 belgi, `[a-z0-9]` dan tashqari.
- `RESERVED`: admin, administrator, support, postmaster, abuse, noreply,
  no-reply'ning `[a-z0-9]` shakllari, hostmaster, webmaster, root, info, mail,
  efbazaar, efootball, konami, trade, pending, help, security, billing.
- `TAKEN`: shu manzildagi har qanday qator (o'chirilganlari ham — manzil qayta
  berilmaydi).
- `DOMAIN_NOT_ALLOWED`: domen ro'yxatda yo'q yoki tarif ruxsat bermaydi.
- `NO_SLOT`: bo'sh custom slot yo'q (Jaydari'da doim). Tekshiruv baribir
  `TAKEN`/`RESERVED`/`INVALID` ni ustun qo'yadi, shunda Jaydari ham ✓ ni ko'radi:
  javobda `available=true` + alohida `canClaim=false, claimBlock=NO_SLOT | PLAN`.

**Quti olish** — `POST /api/v1/mailboxes/custom { localPart, domain }`:
tarif va slot tekshiruvi, egasi `X-User-Id` dan, qator `PENDING` holatda, worker'ga
`mailbox-provision-request { mailboxId, localPart, domain }`. Bir xil nomga
bir vaqtda ikki so'rov — unique indeks hal qiladi, ikkinchisi `409 TAKEN`.

**`mailbox_link_sessions` jadvali**:
`id, owner_id, mailbox_id, account_id, state, step_deadline, created_at, updated_at`.
- Holatlar: `WAIT_EMAIL_CHANGE → WAIT_RESET → VERIFIED`; yon holatlar `EXPIRED`,
  `CANCELLED`.
- Qisman unique indeks: bitta qutida bitta faol (`WAIT_*`) session.
- Qutining joriy bog'lanishi: `mailboxes.linked_account_id UUID NULL` — VERIFIED
  bo'lganda yoziladi, `account-archived` kelganda tozalanadi.

**Endpointlar** (egasi `X-User-Id`, boshqa userning qutisi/sessioni — 404):
- `POST /api/v1/mailboxes/{id}/link-sessions { accountId, emailAlreadySet }` —
  `emailAlreadySet=true` (qo'lda yozilgan emailni tasdiqlash) bo'lsa
  `WAIT_RESET` dan boshlanadi, aks holda `WAIT_EMAIL_CHANGE`.
- `GET /api/v1/mailboxes/link-sessions/{sid}`
- `POST /api/v1/mailboxes/link-sessions/{sid}/email-changed` → `WAIT_RESET`
- `POST /api/v1/mailboxes/link-sessions/{sid}/retry` → `EXPIRED` dan oxirgi qadamga
- `DELETE /api/v1/mailboxes/link-sessions/{sid}` → `CANCELLED`
- `GET /api/v1/mailboxes/custom` — userning custom qutilari, har birida
  `linkedAccountId` va faol session.
- Jonli yangilanish savdodagi kabi WSS orqali (`session-updated`).

**Qo'lda yozilgan emailni tasdiqlash** — frontend akkount emaili bo'yicha
userning o'z qutisini topadi (`GET /api/v1/mailboxes/mine?email=`); topilmasa
"Tasdiqlash" ko'rinmaydi. RANDOM quti ham tasdiqlanadi (verified), lekin oltin
hoshiya faqat CUSTOM'da.

### smart-admin-worker

- `mailbox-provision-request` dagi `domain` dan foydalanadi (yo'q bo'lsa
  `efbazaar.uz`), sig'imni o'sha domen bo'yicha tekshiradi.
- Session uchun mavjud oqimlar qayta ishlatiladi: `imap-poll-request` purpose
  `WAIT_EMAIL_CHANGE_CODE` (kod relay) va `VERIFY_LINK` (reset xati). Event
  maydoni `trade_id` da session id yuboriladi; worker uchun farqi yo'q.
- Reset havolasi hech qayerga uzatilmaydi va logga yozilmaydi — faqat
  `reset_link_present` / `email_not_registered`.

### Event routing (trade-service)

Worker javoblari (`konami-email-received`, `konami-email-change-code-received`)
kelganda trade-service `mailbox_email` bo'yicha qutini topadi: `kind=CUSTOM` yoki
qutida faol link session bo'lsa — session handler'ga, aks holda hozirgidek savdo
handler'iga. Custom qutilar savdoda bo'lmagani uchun to'qnashuv yo'q; RANDOM
qutini tasdiqlash vaqtida shu quti faol savdoda bo'lsa session ochilmaydi
(`409 mailbox_in_trade`).

### marketplace-service

- `user_accounts.email_verified BOOLEAN NOT NULL DEFAULT false`; `EmailSource`
  ga `CUSTOM`.
- Migratsiya: `email_source='PLATFORM'` bo'lganlar `email_verified=true`.
- Consumer `efbazaar.trade.account-email-verified { sessionId, accountId, ownerId, mailboxId, email, custom }`:
  egasi mos kelsa `email`, `mailbox_id`, `email_source = custom ? CUSTOM : (o'zgarmaydi)`,
  `email_verified=true`. Idempotent (`sessionId`). Akkount arxivlangan yoki
  boshqa egada bo'lsa — e'tiborsiz, log.
- Savdo yakunida xaridorga kelgan PLATFORM email `email_verified=true` bilan
  yoziladi.
- User emailni qo'lda o'zgartirsa: `email_verified=false`, `mailbox_id=null`
  (hozirgi xatti-harakat + verified).
- Producer `efbazaar.marketplace.account-archived { accountId, ownerId, mailboxId, reason }` —
  akkount `ARCHIVED` bo'lganda (sotildi/obmen), `mailbox_id` bo'lsa.
  trade-service `linked_account_id` ni tozalaydi va egasiga "quti bo'shadi"
  bildirishnomasini yuboradi.

## Frontend

**Hint'lar**
- Akkount formasi (`/profile/accounts/new`, tahrir): email maydoni ostida
  "✨ Akkountingiz uchun o'z nomingizdagi email oling" → `/mailboxes/custom`.
- Akkountlarim kartasi: emaili yo'q — "O'zingiz tanlagan email biriktiring";
  `@efbazaar.uz`/`@efootball.uz` va tasdiqlanmagan, quti userniki — "Tasdiqlash".

**`/mailboxes/custom` — quti tanlash** (premium dizayn, Claude Design'da
tasdiqlanadi):
- Katta input `[ nom ] @domen`, 300 ms debounce bilan tekshiruv.
- Holatlar: ✓ "Olishingiz mumkin" (oltin animatsiya), "Band", "Bu nom zahirada",
  "5–24 belgi, faqat lotin harf va raqam".
- MAX/STAFF: domen segment tanlovi. Boyvachcha: "✨ `nom@efootball.uz` ni ham
  olishingiz mumkin — Aristokrat" → `/plans`. Jaydari: "Boyvachcha tarifida
  oling". Slot tugagan: "Barcha custom slotlar band" + upgrade.
- Pastda userning custom qutilari: ulangan akkount yoki "Bo'sh — ulash".

**`/mailboxes/custom/[id]/link` — ulash**
1. Akkount tanlash (custom ulanganlardan tashqari hammasi, emaili yo'qlar
   tepada) + "Boshqa" → akkount qo'shish formasi, saqlangach `returnTo` bilan
   shu sahifaga qaytadi.
2. `WAIT_EMAIL_CHANGE`: Konami'da emailni almashtirish qadamlari, kelgan 6 xonali
   kod, "Emailni o'zgartirdim".
3. `WAIT_RESET`: "Konami'da Forgot password qiling — parolni o'zgartirish shart
   emas, xatning kelishi kifoya". `email_not_registered` → "Email hali
   o'zgarmagan" va 2-qadamga qaytish.
4. `VERIFIED`: "Muvaffaqiyatli ulandi" → akkountlarim.
- `EXPIRED`: "Qayta urinish"; har doim "Bekor qilish".
- Savdo step UI komponentlari iloji boricha qayta ishlatiladi.

**Belgilar** (faqat egasiga — email maxfiy):
- Verified ✓ — akkount kartasi, akkount sahifasi, swap picker.
- Custom — kartaning oltin gradient hoshiyasi sekin tovlanadi;
  `prefers-reduced-motion` da harakatsiz; tungi rejimda ham.

**Bo'sh custom quti**: profil va akkountlarim tepasida banner
"`nom@domen` bo'sh turibdi — boshqa akkountingizga ulaysizmi?" → ulash sahifasi;
akkount sotilganda/obmen qilinganda xuddi shu bildirishnoma.

**Admin**: "Quti ochish" formasida domen dropdown'i (standart `efbazaar.uz`),
`MAILBOX_DOMAINS` ro'yxatidan.

Barcha yangi ekranlar tungi rejimda ishlaydi; URL/API/kod inglizcha, UI matni
o'zbekcha.

## Xatolar

- Worker eventi kelmasa — qadam muddati tugaydi (`EXPIRED`), akkount va quti
  o'zgarmaydi.
- `account-email-verified` yo'qolsa — session `VERIFIED` qoladi; user sahifani
  ochganda frontend akkountda email yo'qligini ko'rsa "Qayta sinxronlash"
  (`POST /link-sessions/{sid}/republish`) — eventni qayta yuboradi.
- Akkount session davomida sotilsa yoki o'chirilsa — marketplace consumer
  e'tiborsiz qoldiradi, session `VERIFIED`, quti bog'lanmagan holatda qoladi.

## Testlar

- trade-service (TDD, IT'lar `mvn verify`): nom qoidalari va zahira, tarif/domen
  ruxsati, slot hisobi (RANDOM va CUSTOM alohida), poyga (bir nom, ikki so'rov),
  session holat o'tishlari va muddat, event routing (savdo vs session),
  `account-archived` consumer.
- marketplace: consumer idempotentligi, egasi tekshiruvi, verified migratsiyasi,
  qo'lda o'zgartirishda verified tushishi, `account-archived` producer.
- worker: domen eventdan olinishi va sig'im domen bo'yicha.
- frontend: tekshiruv holatlari, tarif bo'yicha tugma/taklif, ulash qadamlari,
  belgilar, tungi rejim.

## Hujjatlar

`backend/trade-service/README.md`, `backend/marketplace-service/README.md`,
`smart-admin-worker/README.md`, `frontend/README.md`, `docs/kafka-topics.md`
(`account-email-verified`, `account-archived`, `mailbox-provision-request.domain`).

## Kiritilmagan (keyinroq)

- Custom nomni o'zgartirish yoki qaytarish.
- Custom qutini savdoda ishlatish.
- Bir qutiga bir nechta akkount.
- Tarif upsell yo'nalishlari (Telegram Premium uslubi) — alohida ish.

## Plan-time deviations (2026-10-16, kodni o'rganib chiqqandan keyin)

- `mailboxes.domain` ustuni qo'shilmaydi — domen manzildan olinadi (ortiqcha nusxa).
  Buning o'rniga `mailboxes.source` ga `USER` qiymati qo'shiladi (user o'zi olgan quti).
- `efbazaar.marketplace.account-archived` o'rniga kengroq
  `efbazaar.marketplace.account-email-unlinked { accountId, ownerId, mailboxId, reason }`:
  quti nafaqat sotuv/obmenda, balki email qo'lda o'zgartirilganda, akkount o'chirilganda
  yoki boshqa qutiga ko'chirilganda ham bo'shaydi. "Quti bo'shadi" bildirishnomasini
  marketplace o'zi yaratadi (bildirishnomalar o'sha yerda), faqat sotuv/obmen/boshqa joyda
  sotilganda.
- Ulash sahifasi WSS o'rniga har 3 soniyada so'rov yuboradi (polling) — sahifa qisqa
  muddatli, WSS kanalini session uchun kengaytirish arzimaydi.
- Worker'ning parol keshi xotirada va restartda yo'qoladi; custom qutilar uzoq yashaydi.
  Shuning uchun `imap-poll-request` ixtiyoriy `mailboxId, encryptedPassword, iv, tag`
  maydonlarini oladi (worker keshdan topmasa shifrni ochadi) va `restart` bayrog'i
  (eski poller'ni to'xtatib qayta boshlaydi). Session tugaganda yangi
  `efbazaar.trade.imap-poll-stop-request { mailboxEmail }` poller'larni to'xtatadi.
- `mailbox.custom_slots` qatori projection'da bo'lmasa — 0 (fail closed), `mailbox.slots`
  dagi kabi "cheklamaslik" emas: custom manzil doimiy beriladi.
- `efootball.uz` ruxsati tarif nomlari bilan konfiguratsiyada:
  `MAILBOX_PREMIUM_DOMAIN_PLANS=MAX,STAFF`.
- Qo'lda yozilgan emailni tasdiqlash uchun alohida `GET /mailboxes/mine?email=` kerak emas —
  mavjud `GET /mailboxes` ro'yxati `kind` va `linkedAccountId` bilan kengaytiriladi.
