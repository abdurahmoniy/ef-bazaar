# efBazaar Free va Pro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Free uchun 3 ta, Pro uchun jami 10 ta mailbox va Pro uchun 30 000 so‘m/oy asosida ikki tarifli xizmatni bosqichma-bosqich ishga tushirish.

**Architecture:** Narx, obuna va imkoniyatlar manbai payment-service bo‘lib qoladi. Trade-service pochta egaligi, sig‘imi va obuna tugagandagi kirishni boshqaradi; worker Mailcow operatsiyalarini bajaradi. Recommendation-service saqlangan qidiruvlarni, marketplace-service narx kuzatuvi va sotuvchi ma’lumotlarini boshqaradi; frontend, mail va Telegram mavjud servis chegaralari orqali ishlaydi.

**Tech Stack:** Java 21 / Spring Boot, PostgreSQL, Kafka, mavjud outbox kutubxonasi, Python 3.12 / Mailcow, Node 22 / Next.js / React / Vitest.

---

## 1. Mahsulot qarorlari

2026-10-19 kuni tasdiqlangan: Free — bepul va 3 mailbox; Pro — 30 000 so‘m/oy va 10 mailbox. Hali real foydalanish boshlanmagan.

Avvalgi paket asosidagi reja farazlari: 10 ta ichidan 2 tagacha nom tanlanadigan email, har qutiga 100 MB, qidiruvlar 1/5, narx kuzatuvlari 3/20, Pro uchun 90 kunlik sotuvchi hisoboti. Bular shu rejaning maqsadli tarkibi; alohida narx yoki tayyor ishlayotgan imkoniyat sifatida qaralmasin.

| Imkoniyat | Free | Pro | Chiqarish bosqichi |
|---|---|---|---|
| Oylik narx | 0 | 30 000 so‘m = 3 000 000 tiyin | A |
| Jami mailbox | 3 | 10 | B |
| Yangi nomli email yaratish | 0 | Jami 10 ichidan 2 tagacha | B |
| Har quti uchun kvota | 100 MB | 100 MB | Mavjud; B da ko‘rinadi |
| Saqlangan qidiruv | 1, kunlik jamlanma | 5, mos e’lon topilganda xabar | D |
| Narx kuzatuvi | 3, kunlik jamlanma | 20, narx o‘zgarganda xabar | D |
| Sotuvchi statistikasi | Mavjud asosiy sonlar | 90 kunlik tarix va eksport | E |
| Savdoni boshqarish | Mavjud oddiy oqim | Qaydlar, javob shablonlari, ommaviy amallar | F |
| Profil | Mavjud profil | Muqova va Pro a’zolik belgisi | F |

- E’lon joylash, qidirish, chat, favorites, asosiy himoya va nizolar bo‘yicha yordam Free’da saqlanadi. Pro belgisi tekshirilgan yoki ishonchli sotuvchi belgisi bo‘lmaydi.
- Yillik obuna, qo‘shimcha mailbox paketi, komissiya chegirmasi va pullik ranking bu ishga kirmaydi. Eski yillik narxni yangi Pro uchun tasodifan ochiq qoldirmaslik kerak.
- Avtomatik karta yechimi qo‘shilmaydi: mavjud hamyondan sotib olish va qo‘lda muddat uzaytirish ishlatiladi.
- Hozir o‘chirilgan Dream Team, turnirlar va gamer profillari Pro va’dalariga qo‘shilmaydi.
- Bu hujjat bir nechta servis uchun bosqichli reja. Har bosqich mustaqil tekshiriladigan natija beradi; qolgan bosqich tayyor bo‘lmaguncha uning funksiyalari sotuv sahifasida mavjud deb ko‘rsatilmaydi.

## 2. Hozir bor va qo‘shiladigan imkoniyatlar

“Bor” degani kodda implementatsiya mavjud; bu hujjat ishlab turgan muhit bo‘yicha tekshiruv hisoboti emas.

| Qism | Hozirgi holat | Kerakli ish |
|---|---|---|
| Tarif katalogi va narxlar | STANDARD, PRO, MAX; yashirin STAFF | Free/Pro ko‘rinishi, MAX sotuvini yopish, yangi narx |
| Hamyondan xarid | Tranzaksion yechim, takroriy xarid himoyasi, narx o‘zgarishi xatosi bor | Saqlash va yangi katalog bilan regressiya tekshiruvi |
| Obuna muddati | Muddat, uzaytirish va Telegram eslatmalari bor | Kechikkan eslatmalar, ishonchli yetkazish va pochta o‘tish davri |
| Mailbox yaratish va o‘qish | Oddiy va nomli qutilar, bog‘lash, egalik, webmail bor | Ikki tarifga moslash |
| Mailbox limiti | Oddiy va nomli limitlar alohida | Jami 3/10 va nomli quti uchun ichki limit |
| Obuna tugashi | Ortiqcha qutilarning o‘qilishi qulflanadi | 30 kunlik o‘tish davri, tanlash va recovery rejimi |
| Mail resurslari | 100 MB kvota va ayrim sonlar bor | Haqiqiy baytlar, serverda qolgan qutilar, o‘chirish natijasi hisoboti |
| E’lon qidirish | Filtrlar, karta mosligi, personalized feed bor | Qidiruvni saqlash, fon tekshiruvi va xabarlar yangi |
| Favorites | E’lonni saqlash bor | Narx tarixi va narx o‘zgarishi xabari yangi |
| Sotuvchi sonlari | Ko‘rishlar, saqlashlar va ayrim savdo ma’lumotlari bor | Davriy tarix, murojaat o‘lchovi, hisobot va eksport yangi |
| Chat | Doimiy suhbat, javob berish, muhim deb belgilash bor | Saqlangan javob shablonlari va shaxsiy qaydlar yangi |
| Profil | Oddiy profil va ishonch ma’lumotlari bor | Muqova va pullik a’zolik ko‘rinishi yangi |

## 3. Asosiy arxitektura shartlari

### Tarif va imkoniyatlar

Ichki `STANDARD` kodi saqlanadi, foydalanuvchiga `Free` deb chiqadi. `PRO` saqlanadi. `MAX` faol sotuvdan chiqariladi; tarixiy yozuv va tashqi kalitlar o‘chirilmaydi. `STAFF` ommaviy katalogda bo‘lmaydi.

`mailbox.slots` hozir faqat oddiy qutilarni sanaydi. Uning qiymatini 10 va custom qiymatini 2 qilish jami 12 quti beradi. Shu sababli yangi, aniq `mailbox.total_slots` kaliti kiritiladi:

```json
{
  "STANDARD": {"mailbox.total_slots": "3", "mailbox.custom_slots": "0"},
  "PRO": {"mailbox.total_slots": "10", "mailbox.custom_slots": "2"},
  "STAFF": {"mailbox.total_slots": null, "mailbox.custom_slots": null}
}
```

Bu kalit birinchi navbatda payment, trade va mijozlarga mos ravishda qo‘shiladi. Eski kalitni yangi ma’noda jimgina talqin qilish mumkin emas. Yetishmayotgan yoki buzilgan limit “cheksiz” bo‘lmaydi: yangi ajratish vaqtincha aniq xato bilan rad etiladi, mavjud pochtani o‘qish va davom etayotgan savdo saqlanadi.

Qidiruv va analitika entitlementlari o‘z bosqichida qo‘shiladi. Faqat frontendda yashirish yetarli emas; servis har so‘rovda egalik va imkoniyatni tekshiradi. Narxlar va limitlar UI ichida mustaqil takrorlanmaydi.

### Mailbox hisoblash

- Oddiy va nomli quti bitta umumiy sig‘imni sarflaydi. Masalan, 8 oddiy + 2 nomli = 10.
- Davom etayotgan savdo rezervatsiyasi hisobga olinadi; parallel oddiy/nomli yaratish faqat bitta qolgan slotni bir marta egallaydi. Ikki foydalanuvchili swap locklari barqaror tartibda olinadi.
- Egasi o‘zgargan mailbox yangi egasiga hisoblanadi. Har savdoda yaratiladigan yangi quti va oldingi qutining saqlanish holati alohida hisoblanadi.
- `detach` yoki `linkedAccountId=null` tashqi KONAMI emaili ko‘chganining isboti emas. Shunchaki yashirish/uzish serverda cheksiz yangi qutilar yig‘ishga ruxsat bermaydi.
- Yangi ajratish budjeti egadagi qutilar, trade rezervatsiyalari va emaili ko‘chirilgani tasdiqlanmagan saqlanayotgan qutilarni hisoblaydi. Oxirgi holat uchun mas’ul foydalanuvchi va `release_pending` yozuvi saqlanadi; qutini UI’dan yashirish bu yozuvni yo‘qotmaydi. Tasdiqlangan boshqa egaga o‘tkazish yoki xavfsiz release slotni bo‘shatadi. Recovery’dagi 7 quti ustiga qayta obuna orqali yangi 10 quti ochilmaydi.
- Administrator sovg‘alari tijoriy limitdan istisno bo‘lsa ham, resurs hisobida ko‘rinadi. Yashirin STAFF oddiy Pro mahsulotining bir qismi emas.
- 100 MB — quti kvotasi; 10 × 100 MB — maksimal nominal sig‘im. Amalda ishlatilgan disk alohida o‘lchanadi.

### Obuna tugaganda

| Vaqt/holat | Pullik funksiyalar | Mailbox |
|---|---|---|
| Pro faol | Pro | Jami 10; nomli yaratish sublimit bilan |
| Muddati tugadi, dastlabki 30 kun | Free limitlari; yangi ortiqcha quti yo‘q | Oldingi qutilarni o‘qish, Free uchun 3 tasini tanlash va emailni ko‘chirish |
| O‘tish muddati tugadi | Free | Tanlangan 3 tasi odatiy; qolgan bog‘langan qutilar uchun recovery/ko‘chirish rejimi |
| Qayta Pro olindi | Pro | Mavjud qutilar qayta ochiladi; eski qutilar hisobdan yo‘qolmaydi |
| Davom etayotgan savdo yoki nizo | Amaldagi savdo yakunlanadi | Kerakli kirish tarif sabab uzilmaydi |

30 kunlik davr obunaga qo‘shimcha 30 kun yozish orqali berilmaydi: aks holda barcha Pro funksiyalari tekin uzayadi. Oldingi paid expiry alohida saqlanadi. Hozir trade projection STANDARD hodisasida obuna yozuvini o‘chiradi, payment expiry javobi esa tugagan muddatni yashiradi; yangi rejim bu ma’lumotni yo‘qotmasligi kerak.

Free’da 0 custom limiti yangi nomli email yaratishga tegishli. Oldin qonuniy yaratilgan nomli quti Free uchun tanlangan 3 quti ichida qolishi mumkin. Recovery rejimi faqat tasdiqlangan egaga, login/tiklash/email ko‘chirishga kerakli xatlarga kirish beradi; to‘liq inboxni boshqa nom bilan bepul ochmaydi. Avtomatik o‘chirish yoki manzilni qayta sotish bo‘lmaydi. Recovery qutilari ham resurs budjetiga kiradi.

## 4. Bosqichlar va qabul mezonlari

Har xulq o‘zgarishi uchun avval quyidagi qabul holatini buzadigan regressiya testi yoziladi, kutilgan sabab bilan yiqilishi kuzatiladi, keyin minimal o‘zgarish kiritiladi. Testlar soatni boshqaradi; tasodifiy kutishlar, blanket retry va o‘chirilgan testlar ishlatilmaydi.

### A. Tarif katalogi va ishonchli faollashtirish

**Natija:** foydalanuvchi faqat Free/Pro ko‘radi, Pro xaridi aynan 30 000 so‘m turadi va tegishli servislar obunani yo‘qotmaydi.

**Mavjud fayllar:** payment-service `plan/service/PlanService.java`, `PlanPriceService.java`, `PlanEntitlementAdminService.java`, `PlanPurchaseService.java`, `PlanEventPublisher.java`; `plan/dto/SubscriptionChanged.java`; `notify/AdminTelegramNotifier.java`. To‘liq manba ildizi: `/Users/abdurahmoniy/Projects/personal/ef/ef-bazaar/backend/payment-service/src/main/java/uz/efbazaar/payment/`.

**Frontend:** `/Users/abdurahmoniy/Projects/personal/ef/ef-bazaar/frontend/src/lib/plans.ts`, `plans-admin.ts`, `src/components/plans/plans-view.tsx`, `plan-card.tsx`, `plans-faq.tsx`, `src/components/admin/admin-plan-prices.tsx`, `admin-plan-mailboxes.tsx`; profil va upgrade matnlari ham yangilanadi.

- [x] `PlanMigrationIT`, `PlanServiceIT`, `PlanPriceControllerIT`, `PlanPurchaseIT`, `StaffPlanIT` hamda frontend `plans.test.ts`, `plans-admin.test.ts`, `plans-view.test.ts` uchun yangi katalog kutilmalarini yozish va yiqilishini tekshirish.
- [x] Yangi versionli migratsiya bilan `MAX.active=false`, Pro MONTH narxini 3 000 000 tiyin qilish. Eski Pro YEAR va MAX sotuv narxlarini faol taklifdan chiqarish; eski xaridlar tarixini saqlash. Mavjud V-migratsiyalar o‘zgarmaydi.
- [x] Admin API/UI faolsiz MAX yoki yopiq YEAR narxini qayta sotuvga ochib yubormasligini tekshirish. STAFF ommaviy ro‘yxatda va xarid yo‘lida yopiq qoladi.
- [x] Mavjud outbox kutubxonasi orqali obuna va entitlement hodisasini DB tranzaksiyasida saqlash. Subscription snapshot/replay, hodisa tartibi va takroriga chidamli consumer qo‘shish. Payment butunlay qayta yozilmaydi.
- [x] D/E/F uchun marketplace va recommendation servislarida ham capability/obuna projectioni tayyorlash. Broker kechikishida yangi pullik amallar uchun aniq vaqtinchalik holat qaytarish; eskirgan projection cheksiz huquq bermaydi.
- [x] Frontendda `Free`/`Pro`, oylik narx, API katalogi va capabilityga mos ikki karta; yillik tugma yopiladi. Eski rad etilgan soat/shlyapa tasviri yangi tarif dizaynining asosi bo‘lmaydi.
- [x] Xarid tugmasi qayta bosilishi, mablag‘ yetmasligi, narx o‘zgarishi va joriy tarifni aniqlab bo‘lmasligi holatlarini saqlash. Faollashish projectioni kechiksa yolg‘on “tayyor” holati berilmaydi.

**Aniq regressiya namunasi:** mavjud `PlanPurchaseIT` ichidagi helperlar bilan yangi narx va idempotency testi:

```java
@Test
void proMonthChargesThirtyThousandSomOnlyOnce() throws Exception {
    UUID user = fundedUser(5_000_000);
    String key = UUID.randomUUID().toString();
    buy(user, "PRO", "MONTH", 3_000_000, key).andExpect(status().isOk());
    buy(user, "PRO", "MONTH", 3_000_000, key).andExpect(status().isOk());
    assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(2_000_000);
    assertThat(plans.planFor(user)).isEqualTo("PRO");
}
```

**Qabul:** broker vaqtincha o‘chsa xarid saqlanadi, qaytgach Pro to‘g‘ri qo‘llanadi; eski hodisa yangi obunani orqaga qaytarmaydi; MAX/YEAR to‘g‘ridan-to‘g‘ri API orqali ham sotilmaydi.

#### A implementatsiya dalillari (2026-10-19, lokal tekshiruv yakunlandi)

- Katalog/outbox focused: Java 21, `JAVA_TOOL_OPTIONS=-Dapi.version=1.44`, lokal Docker socket bilan `mvn -B -ntp -Dtest=AdminTelegramNotifierTest -Dit.test=PlanMigrationIT,PlanPriceControllerIT,PlanPurchaseIT,StaffPlanIT,PlanOutboxIT,PlanServiceIT,PlanEntitlementAdminIT,PlanDeliveryIT verify`: 19 unit + 45 IT, failure/error/skipped 0. Log: `/tmp/ef-catalog-green.log`.
- Red dalillari: katalog 5 va Telegram 1 kutilgan failure; outbox 3 failure (durable queue yo‘q); frontend 17 failure; trade projection 4 failure (stale/missing/out-of-order huquqlar).
- Frontend Node 22.23.3: lockfile asosida `npm ci --no-audit --no-fund --cache /private/tmp/efbazaar-ui-npm-cache`, final `npm run typecheck`, `npm run lint`, `npm test` o‘tdi; 277 fayl/2369 test, 0 failure/skipped. Lint 0 error va oldindan mavjud 27 warning. Final production `npm run build` aynan source/config nusxasida `/private/tmp/ef-phase-a-frontend-build` ichida exit 0; localhost3000 dev server saqlandi. Loglar `/tmp/ef-phase-a-availability-{typecheck,lint,test}.log` va `/tmp/ef-phase-a-font-diagnostic-build.log`. Font yuklash ikki urinishda tashqi ulanish xatosiga uchradi; diagnostik build `RUST_LOG=warn,turbo_tasks_fetch=trace,reqwest=debug,hyper_util=debug,rustls=debug` bilan o‘tdi. Font/config/bundler o‘zgarmadi; aniq DNS/TLS sababi isbotlanmadi, vaqtinchalik tarmoq muammosi kuzatildi.
- Muhitdagi dastlabki to‘siq: parallel buildda disk ENOSPC, keyin Docker VM EXT4 I/O/read-only va daemon timeout. Foydalanuvchi ruxsati bilan Docker qayta ishga tushirildi; joy tiklangach final tekshiruvlar qayta bajarildi. Bu jarayonda testlar yoki build fazalari o‘tkazib yuborilmadi.
- Payment final: Java 21 + yuqoridagi Docker moslik parametrlari bilan `mvn -B -ntp clean verify`, exit 0; Surefire 88, Failsafe 258, failure/error/skipped 0. Log `/tmp/ef-payment-full-final.log`; XML hisobotlari alohida yig‘ib tekshirildi. Marketplace final `mvn -B -ntp clean verify`: 707 unit + 132 IT, failure/error/skipped 0, exit 0 (`/tmp/marketplace-phase-a-final.log`). Recommendation final: 66 unit + 40 IT, failure/error/skipped 0 (`/tmp/recommendation-phase-a-final-compatible.log`); DockerHub IPv6 ulanishi ishlamagani uchun lokalda mavjud `TESTCONTAINERS_RYUK_CONTAINER_IMAGE=testcontainers/ryuk:0.12.0` ishlatildi. Trade final `mvn -B -ntp clean verify`: 327 unit + 365 IT, failure/error/skipped 0, exit 0 (`/tmp/trade-phase-a-final-verified.log`). Barcha to‘rtta servis Surefire/Failsafe XML hisobotlari alohida tekshirildi.
- Kod ko‘rigi mavjud Pro parallel renewalidagi eski JPA holati xavfini topdi. Native PostgreSQL 16’da barrier regressiya avval red (ikki to‘lovga bir oy), `EntityManager.refresh`dan keyin green bo‘ldi; final Testcontainers full suite ham uni qamradi. Projection lookup qiymat/freshnessni bitta SQL snapshotdan oladi; native PostgreSQL’da eski cache regressiyasi red/green va trade 7 + marketplace 6 + recommendation 6 focused green (full gate o‘rniga hisoblanmagan).
- Mavjud inboxlar: stale/yo‘q/buzilgan projection o‘qishni yangi qulflamaydi; faqat tasdiqlangan STANDARD yoki haqiqiy expiry limit qo‘llaydi. Yangi allocation ma’lum faol pullik obuna huquqi tayyor bo‘lmasa `503 plan_projection_unavailable` qaytaradi. Missing-subscription regressiya avval 1 failure, tuzatishdan keyin 44 focused IT green; oldingi read/503/capability focused 48 IT green. Frontend availability 503/network regressiyalari avval 2 failure; keyin xabar va aniq qayta urinish oqimi bilan 9 focused test green.
- Brauzer: 1280px desktop, 800px tablet, 390px mobile, dark, reduced-motion, Tab/Enter smoke o‘tdi. Mock katalog ishlatildi; localhost3000 backend katalogi mavjud emas edi. Tabletning eski uchinchi-karta layout qoidasi red/geometriya bilan topilib tuzatildi; final frontend checks shu kodda qayta o‘tdi.
- Final diff: `git diff --check` o‘tdi; oldingi versionli Flyway migratsiyalar o‘zgarmadi (faqat yangi payment V17/V18, trade V33, marketplace V79, recommendation V2). Trade test yaratgan `crypto_vectors.json` asl holatga qaytarildi. Userning oldingi assets va lokal UI fayllari saqlandi.
- Outbox kutubxonasi manbasi o‘zgarmadi; servisga ulash uchun `mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests` o‘tdi.
- B–F bajarilmadi. Pro’dagi amaldagi 5 random/1 custom capability saqlanadi; jami 10/custom 2 pool enforcementi tayyor deb ko‘rsatilmaydi. Push, PR va deploy qilinmadi.

### B. Umumiy 3/10 mailbox sig‘imi

**Mavjud fayllar:** trade-service `plan/service/MailboxSlotService.java`, `CustomSlotService.java`, `MailboxAccessService.java`, `EntitlementService.java`; `mailbox/repository/MailboxRepository.java`, `mailbox/custom/CustomMailboxService.java`, `mailbox/service/MailboxService.java`, `mailbox/config/MailboxDomains.java`. Manba ildizi: `/Users/abdurahmoniy/Projects/personal/ef/ef-bazaar/backend/trade-service/src/main/java/uz/efbazaar/trade/`.

- [x] `MailboxSlotIT`, `CustomSlotIT`, `MailboxAccessIT`, `CustomMailboxIT`da aralash qutilar va parallel rezervatsiya regressiyalarini yozish.
- [x] Umumiy count/reservation va atomar ajratish qo‘shish; custom yangi yaratishdan oldin umumiy va custom chegarasi tekshiriladi.
- [x] Slot javobi va ikkala mijozda `totalUsed`, `totalLimit`, `customUsed`, `customLimit`ni ko‘rsatish. Mavjud cross-kind access tanlash cheklovini umumiy pool qoidalariga moslash.
- [x] Premium domain konfiguratsiyasi mavjud bo‘lsa MAX o‘rniga PRO bilan ishlashini tekshirish; nomli quti trade escrow sifatida avtomatik ishlatilmaydi.
- [x] Profile/custom mailbox ekranlari, admin limit tahriri va mailbox warninglarni yangilash.

#### B ijro tartibi (2026-10-19)

1. Payment V19 yangi `mailbox.total_slots`: STANDARD 3, PRO 10, STAFF null; PRO custom 2. Eski `mailbox.slots` random semantikasida tarixiy qiymat bilan qoladi, admin uni tahrirlamaydi. MAX sotilmaydi; tarixiy jami random+custom grant saqlanadi. Snapshot formati o‘zgarmaydi, yangi kalit shu to‘liq xaritada uzatiladi.
2. Trade V34 retained mas’ul foydalanuvchi/release-pending hisobini, user bo‘yicha tranzaksion lock va yagona random/custom hisobni qo‘shadi. SALE bir qutini seller va eventual buyer uchun rezervlaydi; SWAP har tomon uchun bittadan rezerv saqlab, crossed handoff/terminal transitionni ikkala user locki bilan atomar bajaradi. Bir userda ownership+reservation bir mailbox uchun bitta hisob.
3. `/mailboxes/slots`: `totalUsed`, `totalLimit`, `customUsed`, `customLimit`; eski `used`/`limit` aliaslari total ma’nosida qoladi. `exemptUsed`/`resourceUsed` admin sovg‘alarini resurs ko‘rinishida saqlaydi. Custom sublimit faqat yangi yaratishga tegishli; o‘qish va unlock tanlovi umumiy pool.
4. Frontend va mail bir xil DTO/katalogni ko‘rsatadi; premium domen default PRO/STAFF. Keyin payment, marketplace, recommendation, trade full verify ketma-ket; frontend va mail full checks, browser smoke, final diff va yangi migratsiyalar baseline bilan tekshiriladi.

#### B tekshiruv dalillari (2026-10-19, lokal yakunlandi)

- Payment yangi total katalog/admin/migration testlari avval 3 kutilgan red (yo‘q total grant, legacy admin kaliti, V18→yangi migration yo‘q). Fokus: 19 unit + 23 IT green (`/tmp/ef-payment-b-{red,green}.log`). Final Java 21 `mvn -B -ntp clean verify`: exit 0, 88 unit + 261 IT, failure/error/skipped 0 (`/tmp/ef-payment-b-full.log`).
- Marketplace final clean verify: exit 0, 707 unit + 132 IT, hammasi green (`/tmp/ef-marketplace-b-full.log`). Recommendation: exit 0, 66 unit + 40 IT, hammasi green (`/tmp/ef-recommendation-b-full.log`). Wire regressiyalari 10 total/2 custom/5 legacy grantlarni farqlaydi. Surefire/Failsafe XML hisobotlari alohida yig‘ib tekshirildi.
- Lokal Java: `JAVA_HOME=/Users/abdurahmoniy/Library/Java/JavaVirtualMachines/ms-21.0.10/Contents/Home`, `JAVA_TOOL_OPTIONS=-Dapi.version=1.44`, `DOCKER_HOST=unix:///Users/abdurahmoniy/.docker/run/docker.sock`; recommendation cached Ryuk uchun `TESTCONTAINERS_RYUK_CONTAINER_IMAGE=testcontainers/ryuk:0.12.0`. Buyruq/fazalar o‘zgarmadi, testlar o‘tkazib yuborilmadi. Og‘ir Java full verifylar ketma-ket.
- Trade test-first: dastlabki 7 unified regressiya (6 failure + cross-kind rad etilishi), recorded partial failure 1 red, kechikkan provisioning 6 red (deleted/foreign/custom/password replay), oxirgi admin delete guard 4 red. Deterministik commit-lock testi birinchi custom allocation commit bo‘lmaguncha parallel trade advisory wait holatida qolishini kuzatib, keyin bitta muvaffaqiyat/bitta quota rad etilishini tasdiqlaydi. Oxirgi guard tuzatishidan keyingi focused 59 test green; final `mvn -B -ntp clean verify` exit 0: 327 unit + 405 IT, failure/error/skipped 0 (`/tmp/trade-b-delete-full-final.log`). Root yakuniy Surefire/Failsafe XML hisobotlarini yana alohida yig‘ib tekshirdi. Oldingi 327/401 natija final guard kodi uchun dalil sifatida olinmadi.
- Frontend final Node 22.23.3: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` exit 0; 278 fayl/2393 test, failure/skipped 0; lint 0 error/27 oldindan mavjud warning. Mail lockfile’dan `npm ci --no-audit --no-fund`, typecheck, test, build exit 0; 12 fayl/109 test, failure/skipped 0. Frontendning A da o‘rnatilgan lockfile dependencylari o‘zgarmagan muhitda qayta ishlatildi. Loglar `/tmp/ef-phase-b-{frontend-typecheck,frontend-lint,frontend-test,frontend-build,mail-install,mail-typecheck,mail-test,mail-build}.log`.
- Production buildlar o‘zgarishsiz source/config nusxalarida `/tmp/ef-phase-b-frontend-build`, `/tmp/ef-phase-b-mail-build` ichida bajarildi; haqiqiy bundler/fazalar ishlatildi. Workspace/nusxa hash manifesti `/tmp/ef-phase-b-client-source-hashes.json`; root source/config/public byte taqqoslashini ham alohida bajardi. User localhost3000 serveri saqlandi.
- Haqiqiy browser, mock backend: plans 1280/800/390px, ikkala cross-kind swap, faol/gift quti himoyasi, retained custom 2/0 izohi, PRO premium domen, locked custom → profile tanlash dialogi, mail desktop/mobile counters va paid locked ekranda soxta upgrade yo‘qligi o‘tdi. Log/suratlar `/tmp/ef-phase-b-*browser*`, `/tmp/ef-phase-b-*.png`; alohida portlar/browser sessiyasi yopildi. Bu production/Mailcow E2E emas.
- B dan oldin egasi yo‘qotilgan detached qutilar uchun ishonchli user ma’lumoti mavjud emas; V34 ownerni taxmin qilib yozmaydi. Yangi detach mas’uliyatni saqlaydi. Worker tasdig‘i umuman kelmagan tashqi Mailcow holatini reconciliation qilish C bosqichda; B ma’lum real/late successni hisobdan yashirmaydi.
- Mustaqil SPEC ko‘rigi PASS: mixed pool, retained/reservation, readiness, barcha UI qabul mezonlari bajarilgan. QUALITY ko‘rigidagi yagona P2 admin delete race/live-reservation guard bilan yopildi; qayta ko‘rik PASS. `git diff --check` o‘tdi; B boshlanishidagi 137 versionli migration hashiga nisbatan o‘zgarish 0 (A V17/V18/V33/V79/V2 ham saqlangan). Faqat yangi payment V19 va trade V34 qo‘shildi. Crypto test yaratgan worker fixture asl HEAD holatiga tiklandi; worker/bot/userbot kodi o‘zgarmadi.
- C–F boshlanmadi; commit/push/PR/deploy yo‘q. Remote CI tekshirilmadi; natijalar lokal final kodga tegishli.

**Qabul misollari:** Free 4-qutini yarata olmaydi; Pro 10 oddiy qutini yarata oladi; 8 oddiy + 2 nomli bo‘lganda 11-quti rad etiladi; 7 oddiy + 2 nomli bo‘lganda uchinchi nomli rad etiladi; oxirgi slotga ikkita parallel so‘rovdan bittasi muvaffaqiyatli. Boshlangan trade qutisi qulflanmaydi.

**Asosiy o‘zgargan fayllar:** payment `V19__unified_mailbox_limits.sql`, `PlanEntitlementAdminService.java`, `PlanTotalSlotsIT.java` va katalog/STAFF/admin regressiyalari; trade `V34__unified_mailbox_resource_pool.sql`, `MailboxQuotaLock.java`, `MailboxSlotService.java`, `EntitlementService.java`, `MailboxAccessService.java`, `MailboxRepository.java`, `MailboxService.java`, `CustomMailboxService.java`, `TradeService.java`, `TradeStateHandler.java`, `EmailProvisionedConsumer.java`, DTO/mapper/domain/premium konfiguratsiyasi va `UnifiedMailboxQuotaIT.java`; frontend `lib/plans.ts`, `lib/mailbox-slots.ts`, `lib/mailbox-lock.ts`, `lib/custom-mailbox.ts`, plans/profile/admin/custom komponentlari va testlari; mail `mail-server.ts`, `mail-types.ts`, `mail-sidebar.tsx`, `mail-shell.tsx`, `locked-mailbox.tsx`, inbox/message sahifalari va testlari; marketplace/recommendation `PlanProjectionIT.java` wire kontraktlari. Tegishli README’lar va `docs/kafka-topics.md` yangilandi.

### C. Obuna tugashi va pochta xarajatini nazorat qilish

**Qamrov:** payment `PlanReminderJob.java`, obuna DTO/domain; trade `plan/` projection va `mail/`, `mailbox/` API; `/Users/abdurahmoniy/Projects/personal/ef/ef-bazaar/mail/src/lib/mail-types.ts` va `src/components/mail/locked-mailbox.tsx`; frontend profil mailbox holatlari. Worker ildizi: `/Users/abdurahmoniy/Projects/personal/ef/ef-bazaar/smart-admin-worker/smart_admin_worker/` — `mailcow/client.py`, `handlers/mailbox_delete.py`, provision handlerlari.

- [x] Expiry, 30-kun chegarasi, grace paytida qayta xarid, eski paid expiry saqlanishi va boshqa egaga tegishli xatga kirishni rad etish testlarini birinchi yozish.
- [x] ACTIVE/GRACE/RECOVERY access holati, muddat va Free’da qoldiriladigan 3 qutini tanlashni API, frontend va webmailda ishlatish. Avvalgi generic `locked` bool yangi holatlarni yashirmaydi.
- [x] Eslatmalar uchun kechikkan jobni qayta tutish va bir xil xabarni takrorlamaslik; grace tugashini alohida xabar qilish. Faqat Telegrami bor odam uchun ishlaydigan UI bilan cheklanmaslik.
- [x] Mailcow’dan ishlatilgan baytlar, kvota va haqiqiy qutilar holatini olish; provisioned, grace/recovery, detached, gifted va bazada o‘chgan, serverda qolgan qutilarni ajratish. Xatolik/stale o‘lchovni 0 deb ko‘rsatmaslik.
- [x] O‘chirish muvaffaqiyati/xatosi acknowledgement va davriy solishtirish qo‘shish. Xavfsiz o‘chirish uchun email ko‘chirishning tasdiqlangan jarayoni; manzillarni qayta bermaslik.
- [x] Pochta hajmi ogohlantirishi, foydalanuvchi boshlatadigan eksport/tozalashni qo‘shish. Muhim recovery xatlariga kirish va nizodagi ma’lumotni saqlash qoidalarini shu oqimda tekshirish; yashirin avtomatik arxiv o‘chirish qo‘shilmaydi.
- [x] IMAP fan-out, umumiy connection chegarasi va sidebar polling yukini o‘lchash; cheklangan yuklama sinovida 10 qutili foydalanuvchilar uchun resurs va kechikish hisobotini olish.

**Qabul:** grace faqat pochta davomiyligini beradi; yangi ortiqcha quti yoki Pro alert bermaydi. Renewal mavjud qutilarni qaytaradi, yangi 10 quti bilan eski qutilarni hisobdan yashirmaydi. Account recovery obuna to‘loviga qaram bo‘lib qolmaydi. Mailcow delete rad etsa dashboard uni o‘chgan deb ko‘rsatmaydi.

#### C implementatsiya qaydlari (2026-10-20)

- Payment V20 oxirgi haqiqiy paid expiry tarixini va durable in-app eslatmalarni saqlaydi. Kechikkan job muddati o‘tgan eslatmalarni ham yaratadi; user/kind/paid-expiry takrori yo‘q. Telegram qo‘shimcha kanal: tashqi so‘rov natijasi noma’lum bo‘lsa `UNCONFIRMED`/`SENDING` qayta yuborilib spam qilinmaydi; ilova eslatmasi saqlanadi. Tarixiy expiry yangi Pro huquqi hisoblanmaydi; marketplace/recommendation consumer regressiyalari ham shuni tekshiradi.
- Trade V35–V43 paid tarix, saqlash holdi/auditi, correlated release/delete, inventory, doimiy address tombstone va bir martalik provisioning claimni qo‘shadi. Applied eski migratsiyalar tahrirlanmaydi. GRACE aniq 30 kun, keyin Free 3’dan ortig‘i RECOVERY; paid renewal mavjud qutilarni qayta ochadi. ADMIN sovg‘asi slot egallamaydi; boshlangan savdo va unresolved provisioning resursi yashirilmaydi.
- Recovery filtri count, pagination, preview, UID/detail/attachment va Seen yozishidan oldin ishlaydi. Egasi o‘zining to‘liq ZIP eksportini olishi mumkin; archive cursor va hajm cheklovi bor. Tanlangan xatlarni tozalash explicit confirm, UIDPLUS va aniq UID expunge bilan; muhim recovery/security xati va dispute/hold himoyalangan. Cleanup vaqtida egalik qayta row-lock ostida tekshiriladi.
- Worker Mailcow’dan real byte/quota/presence oladi; faqat to‘liq correlated inventory yo‘qlikni tasdiqlaydi. Server-only va stale/error/unknown alohida ko‘rsatiladi. Delete request slotni bo‘shatmaydi: muvaffaqiyatli nonce/snapshot bilan ack yoki yangi to‘liq inventory absence kerak; xato dashboardda ko‘rinadi.
- Release proof maxsus `VERIFY_RELEASE` oqimi, asl RFC822 DKIM tekshiruvi va yangi requestning aniq vaqt/recipient oynasidan foydalanadi. Foydalanuvchi avval tashqi emailga ko‘chirishni tasdiqlatadi, keyin o‘chirishni alohida tasdiqlaydi. Unresolved live trade/hold yoki provenance’siz xat delete huquqi bermaydi. Egasi bo‘lmagan odam xat yoki proofga kira olmaydi.
- Eski create replay o‘chirilgan addressni qayta yaratmasligi uchun `addressVersion=2`, to‘liq UUID va trade DB’da bir martalik claim tashqi create’dan oldin yoziladi. `STARTED`/noma’lum natija avtomatik yangi create yoki delete qilinmaydi, hisobdan tushmaydi. Worker qayta ishlaganda faqat immutable credentials bilan IMAP authni tekshiradi. Yangilashda avval eski workerlar to‘xtatilishi kerak; bu checkoutda deploy bajarilmagan. Tafsilotlar trade/worker README va Kafka hujjatida.
- Frontend profil/admin resurslari, in-app notice, Free3 tanlash, 80% hajm ogohlantirishi, recovery/banner, archive/cleanup va verified release holatlari qo‘shildi. Mobile card clipping regressiyasi tuzatildi. Unknown/stale usage 0 yoki o‘chgan deb talqin qilinmaydi.

#### C tekshiruv dalillari

- Trade focused regressiyalari: avval 79 testda late provisioning 2 xato qayta hosil qilindi; ichki placeholder `NONE` bo‘lgach 79/0. Mustaqil ko‘rik topgan null-provision ack tombstone holati yangi 2 testda kutilgan sabab bilan yiqildi; V43 va callback guarddan keyin jami 81 test, failure/error/skipped 0 (`/tmp/ef-trade-c-regression-final-green.log`). Haqiqiy server ack tombstone’i ham, kechikkan ichki placeholder tiklanishi ham tekshirilgan.
- Java test infra: payment’da Spring kontekstlari DB containerdan kech yopilishi, marketplace’da class-owned DB to‘xtagach cached JPA konteksti qolishi log/dump bilan qayta hosil qilindi. `DirtiesContext(AFTER_CLASS)` real scheduled/Kafka test ishini saqlab, pool/kontekstni DB to‘xtashidan oldin yopadi; timeout oshirilmadi yoki testlar o‘chirilmadi. Trade full Spring testlari Kafka/Redisli integration base’dan foydalanadi; sof JPA slice PG-only qoladi.
- Worker Python 3.12.14: yangi `dkimpy==1.1.8` dependency bilan `requirements-dev.txt` to‘liq qayta o‘rnatildi; `pip check`, `ruff check smart_admin_worker/ tests/` va to‘liq `pytest -q` exit 0, 271 test, failure/error/skipped 0. Haqiqiy Docker Kafka/Redis integration oqimlari qatnashgan (`/tmp/ef-phase-c-worker-final-full.log`, `/tmp/ef-phase-c-worker-results.xml`). Yopilgan event loop’ga log publication topshirilganda coroutine qolib ketishi real closed-loop regressiyada red→green; sync registry uchun noto‘g‘ri AsyncMocklar tuzatildi, unawaited warninglar yo‘q. Faqat tashqi kutubxona deprecation xabarlari qolgan.
- Payment final Java 21 `mvn -B -ntp clean verify`: exit 0, 88 unit + 265 IT, failure/error/skipped 0 (`/tmp/ef-payment-c-full-lifecycle-final.log`). `DirtiesContext` tuzatishidan keyingi final natija: barcha kontekst/poollar klass oxirida yopildi, majburiy fork kill va dump yo‘q. Oldingi xatosiz testlar, lekin teardown warningli run bu final dalil o‘rniga olinmadi.
- Trade final Java 21 `mvn -B -ntp clean verify`: exit 0, 345 unit + 441 IT, failure/error/skipped 0 (`/tmp/ef-trade-c-full-final.log`). Surefire/Failsafe XML alohida yig‘ildi; ikkala fazada ham dump va majburiy fork kill yo‘q. V43 final full run’da qo‘llandi. Review yangi confirmed-null-provision holatini yopdi; oldingi to‘xtatilgan full run yakuniy dalil sifatida olinmadi.
- Marketplace final Java 21 `mvn -B -ntp clean verify`: exit 0, 708 unit + 132 IT, failure/error/skipped 0 (`/tmp/ef-market-c-full-lifecycle-final.log`). Class-owned DB konteynerlari hali ishlayotgan paytda JPA kontekstlari yopildi; Surefire/Failsafe dump va majburiy fork kill yo‘q.
- Recommendation Java 21 `mvn -B -ntp clean verify`: 67 unit + 40 IT, failure/error/skipped 0, exit 0 (`/tmp/ef-recommendation-c-full.log`).
- Frontend Node 22.23.3: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` exit 0; 282 fayl/2413 test, failure/skipped 0. Lint 0 error/27 oldindan mavjud warning. Mail typecheck, `npm test`, `npm run build` exit 0; 14 fayl/114 test, failure/skipped 0. Frontend dependencylari o‘zgarmagan lockfile/muhitdan qayta ishlatildi; mail lockfile’dan `npm ci --no-audit --no-fund` bilan o‘rnatildi. Loglar `/tmp/c-frontend-{typecheck,lint,tests,build}-final.log`, `/tmp/c-mail-{tests,build}-final.log`.
- Worker CI arxitekturasidagi lokal image: `docker build --platform linux/amd64 -t efbazaar-smart-admin-worker:c-local .` exit 0; network-disabled image ichida `pip check` va main/release-auth import smoke exit 0 (Python 3.12.3 x86_64, dkimpy 1.1.8). Compose konfiguratsiyasi ham tekshirildi. Loglar `/tmp/ef-phase-c-worker-image{,-smoke}.log`; image lokal, registry’ga push qilinmagan.
- Ikkala production build exact Turbopack/fazalar bilan alohida byte-identical source/config/public nusxasida bajarildi (`/tmp/ef-phase-c-{frontend,mail}-build`). Hash manifest `/tmp/ef-phase-c-client-source-hashes.json`; final taqqoslashda source o‘zgarishi 0. User localhost3000 dev serveri saqlandi.
- Haqiqiy browser + fixture backend: desktop/mobile/dark, klaviatura, profile/admin server-only/retained/STARTED, Free tanlash, filtered Recovery, ZIP cursor, critical/hold cleanup rad etilishi, confirmed cleanup, fresh release proof/confirmation cancel/PENDING va in-app read oqimlari o‘tdi. 390px card clipping regressiyasi red→green. `/tmp/c-client-browser-final.log`, `/tmp/c-client-card-fit-final.log`, `/tmp/ef-phase-c-*.png`; fixture portlari/sessiyalar yopildi. Bu production Mailcow yoki Konami bilan jonli E2E emas.
- Lokal Java 21: `JAVA_HOME=/Users/abdurahmoniy/Library/Java/JavaVirtualMachines/ms-21.0.10/Contents/Home`, Docker 29 uchun `JAVA_TOOL_OPTIONS=-Dapi.version=1.44`, `DOCKER_HOST=unix:///Users/abdurahmoniy/.docker/run/docker.sock`, cached Ryuk `TESTCONTAINERS_RYUK_CONTAINER_IMAGE=testcontainers/ryuk:0.12.0`. `clean verify` fazalari saqlangan. Og‘ir Docker tekshiruvlari ketma-ket bajarildi; disk xatosidan keyingi Docker restart user ruxsati bilan bajarilgan.

#### C cheklangan yuklama hisoboti

Java 21 loopback IMAP fixture’i real Angus socketlar bilan, bo‘sh INBOX va faqat test ichidagi plaintext transportda o‘lchandi. Production IMAPS/TLS saqlanadi. Bu natijalar production DB, Mailcow disk hajmi yoki internet kechikishi prognozi emas.

| O‘lchov | Final lokal natija |
|---|---|
| Qutilar / parallel client / folder amallari | 10 / 16 / 100 |
| Global Store/socket chegarasi / kuzatilgan peak | 8 / 8 |
| Bir qutida bir vaqtdagi lease peak | 1 |
| 100 folder amali | 102.805 ms; p50 13.361 ms; p95 31.373 ms |
| 100 sidebar poll × 10 quti, 16 client | 24.299 ms; 10 ta cold folder read |
| Bitta ownership cutoff o‘zgargach | yana 1 read, jami 11 |
| Sidebar cache TTL / sig‘im | 10 soniya / 512 entry |

Worker alohida fake-server fixture’da 10 quti uchun 5 IDLE va 5 polling fallbackni, 10ms test polling intervalini tekshiradi; o‘lchangan bir lokal delivery-max 11.982ms. Oxirida barcha IDLE tasklar bekor qilinadi. Java hisobotlari `/tmp/c-trade-imap-benchmark.json` va `/tmp/c-trade-sidebar-benchmark.json`; reproduction testi `ImapPoolLoadTest`. Worker regressiyasi `test_ten_mailbox_fixture_fanout_with_five_idle_slots_reports_bounded_latency`.

#### C yakuni

C bosqichi shu checkoutda amalga oshirildi va barcha ta’sirlangan komponent final kodda tekshirildi. Mustaqil SPEC/QUALITY ko‘riklari va topilgan regression tuzatishlari yakunlandi. C boshlanishidagi 139 migratsiya hamda C’da qo‘llangan 10 yangi migratsiya hashiga nisbatan tahrir 0. Java test yaratgan yagona crypto fixture asl HEAD mazmuniga qaytarildi; undan keyingi worker full run ham 271/0 o‘tdi. Final client source/build hash taqqoslashida farq 0; `git diff --check` va yangi text fayllar whitespace tekshiruvi o‘tdi. Credential tekshiruvida faqat zaif RSA’ni rad etish testi uchun ochiq belgilangan test-only key bor; production siri qo‘shilmagan. Oldingi lokal o‘zgarishlar/assets saqlandi.

Natijalar lokal; remote CI da’vosi yo‘q. D–F boshlanmadi. Commit, push, PR yoki deploy qilinmadi. Jonli Mailcow/Konami sinovi bajarilmadi; tashqi mutation APIlari fixture, DKIM esa real RSA imzo va lokal DNS bilan tekshirildi. Unknown provisioning yoki noaniq delete natijasi resurs hisobidan yashirilmaydi va avtomatik destructive retry qilinmaydi.

### D. Saqlangan qidiruv va narx xabarlari

**Mavjud asos:** recommendation-service `match/MatchEngine.java`, `MatchRequestParser.java`, `projection/Snapshots.java`, `SnapshotConsumers.java`; marketplace listing snapshot produceri va notification oqimi. Yangi qidiruv moduli: `/Users/abdurahmoniy/Projects/personal/ef/ef-bazaar/backend/recommendation-service/src/main/java/uz/efbazaar/recommendation/watch/`. Narx kuzatuvi moduli: `/Users/abdurahmoniy/Projects/personal/ef/ef-bazaar/backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/pricewatch/`. Yangi UI: `/Users/abdurahmoniy/Projects/personal/ef/ef-bazaar/frontend/src/components/watch/`.

- [x] Search/price watch uchun egalik, 1/5 va 3/20 limitlari, parallel yaratish, duplicate/replay va obuna tugashidagi testlarni yozish.
- [x] Saqlangan qidiruv v1 mezonlari: o‘yinchi kartalari va narx oralig‘i. Platforma/text/dynamic filterlarni mavjud snapshotga qo‘shmasdan qo‘llab-quvvatlaymiz deb ko‘rsatmaslik. UI qo‘llab-quvvatlanadigan shartlarni aniq ko‘rsatadi.
- [x] Saqlash, ro‘yxat, o‘chirish, pause/resume va asosiy watch tanlash APIlarini qo‘shish. Free’ga tushganda ortiqcha watchlar o‘chmaydi, pauza qilinadi.
- [x] Dastlab narx kuzatuvi bilan umumiy notification yetkazish oqimini ishga tushirish, keyin saqlangan qidiruvni ulash. Narx o‘zgarishi listing mutatsiyasi bilan bir tranzaksiyada oldingi/yangi narx va versiya bilan yoziladi; oxirgi holatni beradigan recommendation snapshotdan to‘liq narx tarixi kutilmaydi. Favorites o‘zining bepul vazifasini saqlaydi, watch alohida opt-in bo‘ladi.
- [x] Yangi ACTIVE e’lonni aniqlash uchun haqiqiy publication vaqti/versiyasi va watch baseline saqlash. Snapshotdagi relay vaqti e’lonning chop etilgan vaqti deb olinmaydi. Birinchi snapshot/replay eski e’lonlar bo‘yicha ommaviy yangi xabar chiqarmaydi; boshlang‘ich holat faqat baseline bo‘ladi.
- [x] Pro uchun topilganda xabar; Free uchun Asia/Samarkand bo‘yicha har kuni 19:00 da bitta jamlanma. Bo‘sh jamlanma yuborilmaydi; foydalanuvchi xabarlarni o‘chira oladi.
- [x] Sotilgan/o‘chirilgan/bloklangan va o‘zining e’lonlarini yuborish vaqtida tekshirish. Navbatda turgan xabar uchun joriy entitlement va opt-in yana tekshiriladi. Bir e’lon bir nechta qidiruvga mos bo‘lsa foydalanuvchiga bitta xabar bilan sabablarni birlashtirish.
- [x] Ilova notificationlari va foydalanuvchi bog‘lagan Telegram orqali yetkazish. Notification intent va delivery holati DB’da saqlanadi; mavjud xotiradagi after-commit notification yo‘li ishonchli retry o‘rnini bosmaydi. Telegram identifikatsiyasi mavjud auth enrichment va bot servis chegaralari orqali olinadi, servislar boshqa servis DB’siga ulanmaydi. Broker replay’da notification bir marta yaratiladi; tashqi Telegram so‘rovi natijasi noma’lum qolgan timeout holati alohida qayd etiladi, mutlaq exactly-once va’da qilinmaydi.

**Qabul:** Free 2-qidiruv va 4-narx watchini, Pro 6-qidiruv va 21-watchni yarata olmaydi; e’lon tahriri o‘zgarmagan narx bo‘yicha xabar yubormaydi; replay spam qilmaydi; boshqa foydalanuvchining watchini ko‘rib/tahrirlab bo‘lmaydi.

#### D ijro tartibi (2026-10-20)

User D bosqichini shu checkoutda bajarishni tasdiqladi; E–F, commit/push/PR/deploy yo‘q. Oldingi A–C o‘zgarishlari/assets saqlanadi. D boshlanishidagi diff va 293 fayl hash’i `/tmp/ef-phase-d-start{.diff,-files.json}`, 149 immutable migration hash’i `/tmp/ef-phase-d-start-migrations.json`da olindi.

1. Payment canonical `R__plan_entitlements.sql` orqali yangi `watch.search_limit` (1/5), `watch.price_limit` (3/20), `watch.immediate` (`false`/`true`) grantlari. MAX tarixiy 5/20/instant; STAFF limitlari explicit null. Missing/malformed/stale grant cheksiz emas; yangi ajratish va delivery fail-closed.
2. Marketplace V80: listingning haqiqiy `publishedAt`/`publicationVersion`i (legacy 0), narx old/new/version tarixiy queue’si mutation bilan bir TX’da. `/api/v1/price-watches` owner CRUD, pause, `/priorities`, `/preferences`; scope global opt-in va Telegram opt-in bilan ajratiladi. Qatorlar downgrade’da saqlanadi, prioritetdan tashqarisi LIMIT-pause.
3. Recommendation V3: `/api/v1/saved-searches` owner CRUD/criteria/pause/opt-in/`/priorities`; v1 faqat matchCard/strictness/minPrice/maxPrice. Eski/missing metadata yoki watch boshlanishidan oldingi publication baseline; ishonchli yangi publication birinchi ko‘rilgan listing bo‘lsa ham watch boshlanishidan keyin candidate. Durable intent dispatcher `efbazaar.recommendation.watch-candidate` yuboradi; bir user/listing/publication uchun mos qidiruv sabablari birlashtiriladi.
4. Marketplace umumiy delivery authoritative listing status/egalik va fresh entitlementni tekshiradi. Search candidate’ning joriy opt-in/criteria holati faqat Kafka cache’ga tayanmaydi: marketplace → recommendation secret-protected `/internal/rec/v1/watches/authorize` HTTP tekshiradi; recommendation marketplace’ga HTTP chiqmaydi. Xato/503 bo‘lsa navbat saqlanadi. Free userga Samarkand 19:00 dan keyin kuniga bitta nonempty digest, Pro uchun bounded schedulerda tezkor xabar.
5. Marketplace durable in-app row va Telegram delivery holati saqlanadi. Telegram identity auth summary API’dan olinadi; bot DB’siz `/bot/internal/watches/dm` secret va bounded plain text tekshiradi/HTML escape qiladi. Marketplace tashqi chaqiruvdan oldin SENDING claimni commit qiladi; noaniq timeout avtomatik qayta yuborilmaydi. Exactly-once tashqi yuborish va’da qilinmaydi.
6. Frontend `/watches`, listingda Favorites’dan alohida opt-in, faqat qo‘llanadigan query filtrlarini saqlash, pause/primary/reorder/notify boshqaruvi va yangi in-app notification turlari. Limitlar/cadence backenddan; unknown holat aniq ko‘rsatiladi. Mobile/dark/keyboard/reduced-motion oqimlari tekshiriladi.
7. Har modulda meaningful red→green regressiyalar; Java 21 final `mvn -B -ntp clean verify` payment/marketplace/recommendation/bot va zarur event consumerlarda. Docker og‘ir tekshiruvlari ketma-ket. Frontend Node 22 typecheck/lint/full test/exact production build; foydalanuvchi localhost3000 serveri saqlanadi. Yangi endpoint/event/env/jadvallar README/Kafka docs’da, final diff va migration hash’lar tekshiriladi.

#### D integratsiya tuzatishlari

- Ikki capability alohida statementda o‘qilsa, concurrent downgrade eski Pro limitini yangi Free delivery rejimi bilan aralashtirishi mumkin edi. Recommendation va marketplace ko‘p-kalitli policy/freshnessni bitta SQL/MVCC snapshotdan oladi. Haqiqiy DB downgrade’ni ikki o‘qish orasiga kiritgan regressiya eski variantda `5:false` holatini qayta hosil qildi.
- Global opt-out chegarasi search intent yaratish/relay vaqtiga emas, haqiqiy `publishedAt`ga ham tekshiriladi. Pauza/resume va generation/baseline eski pending xabarni qayta tiriltirmaydi. Renewal qilingan user global 100-owner batchdan tashqarida bo‘lsa ham, unga tegishli price event processed bo‘lishidan oldin fresh policy tekshiriladi. Muammoli 100 eski pending user keyingi sog‘lom userni abadiy to‘sib qolmaydi.
- Telegram claim user preferences → delivery lock tartibida olinadi; tashqi so‘rovdan oldin commit bo‘ladi. Stale SENDING cleanup delivery yaratilgan vaqt emas, haqiqiy claim vaqtiga qaraydi. V81/V82 kerakli yangi metadata uchun qo‘shildi; applied V80 va avvalgi migrationlar tahrirlanmadi.
- Yangi, hali hech qachon pullik bo‘lmagan foydalanuvchida payment subscription qatori bo‘lmasligi D’da aniqlandi. Missing projectiondan Free huquqini taxmin qilish o‘rniga, authenticated `plans/me` va mavjud auth registration/login hodisalari payment’da idempotent authoritative Free identity yaratadi va durable versionli subscription snapshotini chiqaradi. Kechikkan/duplicate identity mavjud Pro/STAFF yoki paid tarixini almashtirmaydi. Frontend watch sahifasi canonical lookupni kutadi; to‘g‘ridan-to‘g‘ri listing opt-in projection-unavailable bo‘lsa bir marta bootstrap so‘raydi va explicit qayta urinishni ko‘rsatadi. To‘lov servisi xatosi hech qanday grant yasamaydi.
- Browserda yangi narx display’i Node `uz-UZ` locale NBSP va Chromium comma farqi sabab SSR hydration #418 berdi. Mavjud deterministic number formatter bilan tuzatildi; yakuniy real browserda hydration xatosi 0.

#### D yakuniy tekshiruv — 2026-10-20

D shu checkoutda to‘liq bajarildi. E–F boshlanmadi; commit/push/PR/deploy yo‘q. Yakuniy SPEC va quality review yangi Free bootstrap, priority USER-resume va umumiy D shartnomalarini PASS deb tasdiqladi. Oldingi A–C va foydalanuvchi assets saqlangan.

Har bir quyidagi Java modulida **Java 21** bilan `mvn -B -ntp clean verify` exit 0 bo‘ldi. Docker/Testcontainers mavjud; Surefire va Failsafe XML alohida sanaldi: failures/errors/skipped hammasi 0, dump/dumpstream yo‘q.

| Modul | Unit test | Integration test | Yakuniy log |
| --- | ---: | ---: | --- |
| payment-service | 91 | 270 | `/private/tmp/ef-d-payment-bootstrap-full-final.log` |
| marketplace-service | 708 | 163 | `/private/tmp/ef-d-market-full-user-resume-final.log` |
| recommendation-service | 72 | 59 | `/private/tmp/ef-d-rec-full-final.log` |
| trade-service — additive entitlement event consumer | 345 | 442 | `/private/tmp/ef-d-trade-full-final.log` |
| bot — modulda Failsafe IT yo‘q | 141 | — | `/private/tmp/ef-d-bot-full.log` |

Lokal Docker 29 compatibility: `JAVA_HOME=.../ms-21.0.10/Contents/Home`, `JAVA_TOOL_OPTIONS=-Dapi.version=1.44`, `DOCKER_HOST=unix:///Users/abdurahmoniy/.docker/run/docker.sock`, `TESTCONTAINERS_RYUK_CONTAINER_IMAGE=testcontainers/ryuk:0.12.0`. Hech qanday test/phase o‘chirilmagan. Kafka real-broker Free bootstrap fixture’i metadata kutishi uchun producer `max.block.ms=2000`ni ishlatadi. To‘liq suite’da uch eski test barcha listenerdan bitta partition kutgani yangi ikki-topic identity listenerda yiqildi; tayyorlik endi faqat testning o‘z listeneriga tekshiriladi, mavjud behavior assertionlari saqlangan. Focused `mvn -B -ntp -Dtest=PlanIdentityConsumerTest -Dit.test=CardCreditConsumerIT,CardDebitConsumerIT,HeartbeatConsumerIT,FreeWatchBootstrapIT verify` (3 unit + 11 IT) va undan keyingi to‘liq final suite o‘tdi. Birinchi failing full run yakuniy natija deb olinmadi.

Frontend **Node 22.23.3**: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` exit 0. To‘liq Vitest: **290 fayl / 2445 test**, fail/skip 0. Lint: 0 error, oldindan mavjud 27 warning. O‘zgarmagan lockfile va Node 22 muhitidagi oldin o‘rnatilgan dependencylar qayta ishlatildi. Asl `npm run build`/Turbopack physical `/private/tmp/ef-phase-d-frontend-build` nusxasida bajarildi; 1487 input fayl hash’i checkout bilan aynan mos, faqat shu ijro rejasi yakuniy natijalar uchun keyin yangilandi. Foydalanuvchining localhost:3000 serveri saqlangan va HTTP 200 bilan tekshirilgan.

Frontend loglari: `/private/tmp/ef-phase-d-frontend-{typecheck,lint,tests,build}-final.log`; jamlangan evidence `/private/tmp/ef-phase-d-frontend-evidence.json`. Haqiqiy Chromium fixture oqimlari: desktop 1280, mobile 390, dark, keyboard, reduced motion, Free primary/retained rows, paused stored-row limit va edit, v1 supported filters, unavailable/error/retry, Favorites’dan alohida price opt-in, notification reasons/price/overflow/read-ack va yangi identity bootstrap. Horizontal overflow va final hydration/pageerror 0. Tashqi Telegram/Mailcow chaqiruvlari yuborilmagan; tashqi Telegram natijasi noma’lum holatning avtomatik resend qilinmasligi testlangan.

`docker compose --env-file /private/tmp/ef-phase-d-compose-fixture.env config --quiet` exit 0; bu synthetic local env bilan config validation, deploy yoki production secret tekshiruvi emas. Trade testi yaratgan faqat ma’lum `smart-admin-worker/tests/fixtures/crypto_vectors.json` HEAD holatiga qaytarildi; Python 3.12 `python -m pytest -q -p no:cacheprovider tests/unit/test_field_encryptor.py` — 3 passed. Worker/mail/outbox source D’da o‘zgarmadi, ularning oldingi C tekshiruvlari D yangiligi deb ko‘rsatilmadi.

Final nazorat: 149 oldingi versioned migration + D’da qo‘llangan 4 yangi migration hash’i o‘zgarmagan; final code/config hash mismatch 0. D baseline’dan tashqari o‘zgarishlar D modullari va shartnoma/docs bilan chegaralangan; secrets/generated artifact yo‘q. `git diff --check` o‘tdi. Barcha natijalar lokal; remote CI/push/PR/deploy bajarilmagan.

### E. Sotuvchi uchun 90 kunlik hisobot

**Mavjud asos:** marketplace-service `service/ListingViewService.java`, listing/like/chat/trade ma’lumotlari. Yangi modul: `/Users/abdurahmoniy/Projects/personal/ef/ef-bazaar/backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/analytics/seller/`. Yangi UI: `/Users/abdurahmoniy/Projects/personal/ef/ef-bazaar/frontend/src/components/seller-analytics/`.

- [x] Kunlik o‘lchovlar ta’rifi va test fixturelarini yozish: ko‘rish, saqlash, listingga bog‘liq birinchi haqiqiy murojaat, platformada yakunlangan savdo. Mavjud `ChatAccountRequest`dagi listing va yaratilish vaqti tayanch sifatida olinadi; doimiy juftlik chatining `createdAt`i har e’lon uchun yangi murojaat deb hisoblanmaydi. Oddiy “chatni ochish” bosilishi ham savdo murojaati bo‘lmaydi.
- [x] Hozirgi lifetime unique view yozuvlaridan faqat birinchi ko‘rish tarixini olish. Kundalik qayta ko‘rish, o‘tgan like dinamikasi yoki eski murojaatlarni mavjud bo‘lmagan tarixdan yasamaslik.
- [x] Yangi eventlar, deduplication va kunlik agregatsiya qo‘shish; sotuvchi faqat o‘z ma’lumotini ko‘radi. Pul ko‘rsatkichlari uchun ishonchli yakunlangan savdo manbasi ishlatiladi, swap pul tushumi deb hisoblanmaydi.
- [x] 7/30/90 kun filtri, e’lon kesimi va CSV eksport. Yangi akkauntda “90 kunlik ma’lumot tayyor” deb ko‘rsatmaslik; yig‘ilish boshlangan sana va bo‘sh holat bo‘ladi.
- [x] Free’da asosiy mavjud sonlar qoladi. Pro’dagi keng tarix va eksport backendda ham tekshiriladi.

**Qabul:** duplicate event sonlarni ko‘paytirmaydi; vaqt chegaralari Samarkand kuni bilan mos; yashirilgan yoki boshqa sotuvchiga tegishli ma’lumot chiqmaydi; hisobot va eksport bir xil ma’lumotni beradi.

#### E ijro tartibi (2026-10-20)

User E bosqichini shu checkoutda to‘liq bajarish va tekshirishni tasdiqladi; F, commit/push/PR/deploy/worktree yo‘q. A–D va assets saqlanadi. E boshlanishidagi 366 modified/untracked fayl hash’i va binary diff `/private/tmp/ef-phase-e-start{.diff,-files.json}`, barcha 173 versioned migration hash’i `/private/tmp/ef-phase-e-start-migrations.json`da.

1. Backend test-first: payment `R__plan_entitlements.sql`da `analytics.history_days` (Free 0, Pro/MAX 90, STAFF explicit null) va `analytics.export` (Free false, paid/STAFF true); missing/malformed/stale projection pullik imkoniyat bermaydi. Trade SUCCESS ichida alohida durable completion fact/outbox: trade/listing/seller/buyer/kind/mode/frozen price va haqiqiy completion vaqti. Legacy listing-sold/succeeded shartnomalari saqlanadi. Failed settlement/rollback xabar yaratmaydi.
2. Marketplace `analytics/seller/`: event receipt va kunlik agregat bir tranzaksiyada, Samarkand local-day. `listing_views` faqat lifetime-first view; mavjud aniq timestamp backfill qilinadi. Yangi favorite INSERT saqlash qo‘shilishi (remove neti emas), faqat kolleksiya boshlanganidan; eski removed-like tarixi yaratilmaydi. Inquiry birinchi `(listing,requester)` haqiqiy `ChatAccountRequest`, uning aniq vaqti; chat GET/navigation va pair chat.createdAt manba emas. Faqat mavjud CAR tarixini backfill qilish mumkin. Swap turlari gross salesga kirmaydi; SALE gross agreed completed amount net wallet/profit deb ko‘rsatilmaydi. Eski savdo tarixi taxmin qilinmaydi.
3. Owner-only summary, 7/30/90 report, listing filtri, bir xil report dataset’dan CSV. Free summary saqlanadi; Pro tarix/eksport serverda tekshiriladi. So‘rov egasi faqat auth header’dan; ACTIVE/SOLD o‘z listinglari, DELETED/BLOCKED va begona listing/fact yo‘q. Collection start, metric history cheklovlari, partial/empty holat response’da; 90 kun avvaldan tayyor va’dasi yo‘q.
4. Frontend `/seller-analytics`, menyu/profil kirishi, mavjud uslubga mos cards, accessible daily/listing table, 7/30/90 filtri va server-authorized CSV. Unknown capability Free deb taxmin qilinmaydi; loading/error/retry, mobile/dark/keyboard/reduced-motion, export xatosi va bo‘sh/partial holat testlanadi. Avval canonical plans/me yangi Free identity’ni tayyorlaydi, lekin grants faqat marketplace projectionidan olinadi.
5. Har subtask meaningful red→green, SPEC so‘ng quality review. Java21/Docker full `mvn -B -ntp clean verify` barcha o‘zgargan servis/event consumerlarda; Node22 typecheck/lint/full test/asl production build. Docker-heavy testlar ketma-ket. Applied V migrationlar immutable, kerakli fix keyingi V’da. README/Kafka docs, final diff/check va baseline hash audit. F checkboxes tegilmaydi.

#### E backend yakuniy tekshiruv

Backend SPEC va quality review PASS. CSV Unicode/control prefix tuzatishidan keyingi alohida quality closure ham PASS. Yakuniy Java 21 `mvn -B -ntp clean verify` exit 0:

| Servis | Unit | Integration | Log |
| --- | ---: | ---: | --- |
| payment-service | 91 | 271 | `/private/tmp/ef-e-payment-full.log` |
| trade-service | 345 | 443 | `/private/tmp/ef-e-trade-full.log` |
| marketplace-service | 716 | 175 | `/private/tmp/ef-e-marketplace-full.log` |
| recommendation-service — qo‘shimcha entitlement xaritasi consumer mosligi | 72 | 59 | `/private/tmp/ef-e-rec-full.log` |

Jami 2172 test; Surefire/Failsafe XML’da failures/errors/skipped 0, dump/dumpstream yo‘q. Root natijalarni mustaqil o‘qidi; evidence `/private/tmp/ef-phase-e-java-verified.json`. Docker compatibility D’dagidek: Microsoft Java21.0.10, `JAVA_TOOL_OPTIONS=-Dapi.version=1.44`, mavjud Docker socket va Ryuk0.12.0. Trade uchun o‘zgarmagan shared outbox `mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests` bilan CI kabi o‘rnatildi; bu application verification o‘rnini bosmaydi. Outbox manbasi o‘zgarmadi. Trade Dockerfile allaqachon shu dependency’ni backend build context’dan o‘rnatadi; Dockerfile/infra o‘zgarmadi.

Test-first dalillari `/private/tmp/ef-e-*.log`: missing grant/endpoint/durable completion; first100 unresolved receipt starvation; seller ownership isolation; selected-range coverage; fractional/string/overflow numeric source rad etilishi; Unicode CSV formula escaping (red8test/3failure, green8pass). Birinchi payment full gate eski STAFF complete-map assertionida yangi `analytics.export=true`ni null deb kutdi; har ikkala boolean grant explicit true sifatida tekshiriladigan qilindi, qolgan budgetlar null assertioni saqlandi va full clean verify qayta o‘tdi. Trade focusedda null listingli fixture uchun fact kutilgani hamda persistent failure fixture tozalanmagani tuzatildi; product behavior yumshatilmadi. Report fixture Clock bilan boshqariladi.

V83 va V44 birinchi qo‘llangandan keyin tahrirlanmadi; `/private/tmp/ef-phase-e-applied-migrations.json` hash’lari va 173 boshlang‘ich migration hash’i mos. Backend final21fayl hash’i `/private/tmp/ef-phase-e-backend-final-hashes.json`da. Trade yaratgan ma’lum worker crypto fixture HEAD holatiga qaytarildi; Python3.12 `python -m pytest -q -p no:cacheprovider tests/unit/test_field_encryptor.py` 3 passed. Worker source E’da o‘zgarmadi.

#### E frontend va umumiy yakuniy tekshiruv — 2026-10-20

**E to‘liq bajarildi va tekshirildi.** `/seller-analytics` 7/30/90 kun, e’lon filtri, sahifalash va barcha filtrlangan e’lonlar CSV eksportini beradi. Free asosiy sonlari saqlanadi; Pro tarixi va eksport backenddan tekshiriladi. Source metadata va metric ta’riflari ma’lumot yig‘ilish sanasi va tarix cheklovlarini ochiq ko‘rsatadi. Frontend SPEC/quality, P2 closure va yakuniy cross-layer review PASS. So‘nggi mobile width tuzatishi alohida source review hamda haqiqiy browser bilan tasdiqlandi.

Frontend **Node 22.23.3** yakuniy kodda: `npm run typecheck`, `npm run lint`, `npm test`, asl `npm run build` — hammasi exit 0. To‘liq Vitest **294 fayl / 2485 test**, failures/skipped 0; lint 0 error va oldindan mavjud 27 warning. O‘zgarmagan package-lock va avval o‘rnatilgan shu Node22 dependencylari qayta ishlatildi, dependency manifestlari o‘zgarmadi. Build physical `/private/tmp/ef-phase-e-frontend-build` nusxasida asl Next16/Turbopack bilan bajarildi. Root 958 source/public/config/input faylini checkout va build nusxasida byte-for-byte tekshirdi: mismatch 0. Faqat ushbu reja builddan keyin yakuniy dalillar uchun yangilandi; production kodi o‘zgarmadi.

Yakuniy loglar: `/private/tmp/ef-e-frontend-{typecheck,lint,test,build}-final.log`; evidence `/private/tmp/ef-phase-e-frontend-evidence.json`, source manifest `/private/tmp/ef-phase-e-frontend-source-manifest.json`. Bir build Google Fonts Inter ulanish xatosida yiqildi (`ef-e-frontend-build-font-failure.log` saqlangan); actual CSS HEAD/GET 200 va haqiqiy sertifikat tekshiruvidan keyin asl buyruq o‘tdi. Font mock, TLS bypass, bundler almashtirish yoki skip ishlatilmadi. Yakuniy width tuzatishidan keyin barcha 4 check yana o‘tdi. Avvalgi test/build natijasi keyingi kod uchun proof deb olinmadi.

Frontend red→green: loadable stublarda 32 observable failure; malformed report 6 failure; oxirgi sahifa e’lonlari kamayganda refresh xatosi 1 failure, so‘ng focused 46 test pass. Refresh endi sahifani 0 ga qaytaradi, davr/e’lon filtrini saqlaydi va yangilangan summary kelguncha paid report kutadi. Haqiqiy 390px browserda document 838pxga kengayishi qayta hosil qilindi; faqat analytics root `w-full` bilan tuzatildi. Yakuniy 390pxda document overflow yo‘q, jadvallar o‘z ichida scroll qiladi; global shell o‘zgarmadi.

Haqiqiy Chromium (cached Playwright CLI0.1.22; wrapper offline metadata sabab mavjud CLI entry orqali) synthetic API fixture’lari bilan tekshirildi: authenticated Free/Pro/STAFF, canonical bootstrap tartibi, payment xatosida basic, signed-out redirect, 7/30/90, server limitlari, listing/reset/page, sahifadan mustaqil haqiqiy CSV download, exact `9007199254740993` summa, 403/503da download yo‘qligi va stale paid natijani tozalash, basic saqlanishi/retry, malformed/bo‘sh/qisman tarix, eski report/CSV javobini bekor qilish va kamaygan oxirgi sahifadan tiklanish. Desktop1280/mobile390, light/dark, reduced-motion, keyboard filter/table/menu, 44px targetlar va 568px qisqa viewportda menu ichki scroll/logout tekshirildi. Page/hydration error 0. Kutilgan failing HTTP va bloklangan tashqi resurs console yozuvlari application page error deb ko‘rsatilmadi.

Browser loglari: `/private/tmp/ef-e-frontend-browser-{filters,policy,races,layout}-final.log`. Root yakuniy desktop/mobile screenshotlarni mustaqil ko‘rdi: `/private/tmp/ef-phase-e-analytics-{desktop,mobile-dark}-final.png`. Hech qanday haqiqiy Telegram/Mailcow/to‘lov amali bajarilmadi; bu production smoke/deploy emas.

Task browser `e-ui`, own4322/4399 jarayonlari yopildi. Faqat ma’lum 6 ta E browser artefakti `/private/tmp/ef-phase-e-browser-artifacts`ga ko‘chirildi; repo’da generated CLI fayl qolmadi. Foydalanuvchi localhost3000/PID72587 saqlangan, HTTP200 mustaqil tekshirildi. Oldingi A–D, assets, 173 oldingi va 2 yangi applied migration hash’lari o‘zgarmagan; backend final21fayl hash’i mos. F bo‘limining to‘rtta checkboxi va matni o‘zgarmadi. `git diff --check` va final diff/source audit o‘tdi. E o‘zgarishlari shu checkoutda lokal, HEAD/branch saqlangan; commit/push/PR/deploy/remote CI bajarilmagan.

### F. Sotuvchi qulayliklari va profil

- [x] Marketplace-service ichida foydalanuvchiga tegishli javob shablonlari va shaxsiy qaydlar moduli, frontendda chat/listing bilan bog‘langan boshqaruv UI; boshqa tomon qaydlarni o‘qiy olmasligi regressiyasi birinchi yoziladi.
- [x] Bir nechta o‘z e’loniga amallar: nashrdan olish va narxni tahrirlash. Har e’lon egaligi/statusi serverda tekshiriladi; qisman xatolar foydalanuvchiga e’lon bo‘yicha ko‘rinadi. Cheksiz API bulk yo‘q.
- [x] Mavjud media oqimi orqali profil muqovasi va Pro a’zolik ko‘rinishi. Ishonch/review reytingiga aralashtirilmaydi; obuna tugaganda a’zolik belgisi yo‘qoladi.
- [x] Free’ga tushganda qayd va shablonlar yo‘q qilinmaydi; saqlangan foydalanuvchi ma’lumotini o‘qish/eksport qilish qoladi, pullik tahrirlash va ommaviy amallar yopiladi.

**Qabul:** boshqa egaga tegishli qayd, shablon yoki e’lonni boshqarib bo‘lmaydi; Pro tugashi ma’lumotni o‘chirmaydi; profil bezagi verifikatsiyaga o‘xshamaydi.

#### F bajarish tartibi (2026-10-20)

Shu checkoutda bajariladi; commit, push, PR va deploy qilinmaydi. A–E hamda foydalanuvchining avvalgi lokal o‘zgarishlari saqlanadi.

1. Backend test-first: marketplace ichida owner-only qayd/shablon CRUD, sahifalangan o‘qish va to‘liq JSON eksport. Qayd chat yoki o‘z e’loniga bog‘lanadi; ikkinchi chat ishtirokchisi uni ko‘rmaydi. Free’ga o‘tish saqlangan ma’lumotni o‘chirmaydi, o‘qish/eksport tarifdan mustaqil qoladi.
2. Payment mahsulot siyosatida `seller.tools`, `seller.bulk`, `profile.decoration` boolean huquqlari: Free false, Pro/tarixiy MAX/STAFF true. Missing, null, buzilgan yoki eskirgan huquq pullik amal bermaydi. Bulk bir so‘rovda ko‘pi bilan 50 ta takrorlanmagan ID; bu texnik chegara server capability javobida beriladi. Har element alohida tranzaksiyada, egalik va faol holatni tekshirib, mavjud listing/account lifecycle orqali bajariladi.
3. Marketplace profil bezagi mavjud Telegram media oqimini ishlatadi; yangi gamer/turnir funksiyasi ochilmaydi. Yagona muqova fayli haqiqiy format/hajm bo‘yicha tekshiriladi; yuklashdan oldin va saqlashdan oldin huquq tekshiriladi. Public javob faqat amaldagi bezak va uning amal muddatini beradi; saqlangan muqova downgrade’da egasi uchun qoladi. Pro a’zoligi trust/review yoki tasdiqlash belgisi emas.
4. Frontend: mavjud chat composeriga saqlangan javobni yubormasdan qo‘yish, chat/e’lon kontekstidagi shaxsiy qaydlar, boshqaruv sahifasi va per-listing bulk natijalari. Haqiqiy owner/public profilga muqova va alohida a’zolik ko‘rinishi; ochiq sahifada expiry/freshness deadline va yangilash xatosida bezak yashiriladi. Loading/error/retry, downgrade, mobile/dark/keyboard holatlari tekshiriladi.
5. Har implementatsiyadan so‘ng mustaqil SPEC → sifat ko‘rigi; yakunda Java 21 bilan ta’sirlangan servislar/consumerlarning `clean verify`, Node 22 bilan frontendning barcha to‘rtta gate’i va haqiqiy browser tekshiruvi. Yakuniy diff, versionli migratsiyalar va avvalgi assets hash auditidan keyingina F checkboxlari yopiladi.

#### F backend dalillari (2026-10-20)

Backend SPEC va sifat ko‘rigi PASS. Dastlabki ko‘riklar DB qulfini kutish vaqtida huquq bekor bo‘lishi mumkinligini topdi: bulk mutatsiyasi oldidan qulf olingach, qayd/shablon va muqova yozuvlarida esa DB yozuvidan so‘ng tranzaksiya qaytishidan oldin huquq qayta tekshiriladi. Rad javobi DB o‘zgarishlarini rollback qiladi. Deterministik PostgreSQL regressiyalari lock kutishini kuzatib, downgrade/stale projection’ni boshqa tranzaksiyada qo‘llaydi; qayd, shablon, muqova va e’lonning avvalgi holati saqlanishi tekshiriladi. Mavjud shared listing lock hisob yaratish/bulk unpublish poygasida e’lonni qayta tiklamaydi.

Java 21.0.10, `mvn -B -ntp clean verify`, servislar ketma-ket:

| Servis | Surefire | Failsafe IT | Failure/error/skipped |
|---|---:|---:|---|
| payment-service | 91 | 272 | 0/0/0 |
| marketplace-service | 716 | 195 | 0/0/0 |
| trade-service | 345 | 443 | 0/0/0 |
| recommendation-service | 72 | 59 | 0/0/0 |

Jami **2 193** test; barcha command exit code 0, XML hisobotlari tekshirildi, dump yo‘q. Loglar `/private/tmp/ef-f-{payment,marketplace,trade,recommendation}-full.log`; yig‘ma dalil `/private/tmp/ef-phase-f-backend-final-evidence.json`. O‘zgarmagan outbox kutubxonasi CI kabi `mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests` bilan o‘rnatildi. Lokal Docker compatibility: `JAVA_TOOL_OPTIONS=-Dapi.version=1.44`, foydalanuvchining Docker socket’i va `TESTCONTAINERS_RYUK_CONTAINER_IMAGE=testcontainers/ryuk:0.12.0`; test/fazalar o‘tkazib yuborilmadi.

Birinchi full payment tekshiruvi eski `UserRoleChangedConsumerIT`dagi STAFF xaritasining qolgan qiymatlarini faqat null deb kutuvchi assertion’da yiqildi. Uchta yangi boolean uchun explicit `true` assertion qo‘shildi; qolgan budgetlar uchun nonempty/null assertion saqlandi. Mustaqil ko‘rik va 8 focused IT PASS’dan keyin to‘rtta full gate qayta bajarildi. Birinchi failure dalili `/private/tmp/ef-f-payment-full-failed-staff.log`da saqlangan; tasodifiy rerun bilan yopilmadi.

175 ta boshlang‘ich versionli migratsiya o‘zgarmagan. `V84__seller_tools_and_profile_appearance.sql` ilk qo‘llangan SHA-256’i `e8b30291b181fada3f28fadc658df4a2755add9c782cab3e3dd7d9f292dbbfe7` saqlangan. Backendning 27 faylli freeze manifesti full gate’dan keyin ham mos. Trade testi yaratgan `smart-admin-worker/tests/fixtures/crypto_vectors.json` aynan testdan oldingi baytlarga qaytarildi; worker kodi o‘zgarmadi. Bu lokal natijalar; remote CI, commit, push, PR yoki deploy bajarilmadi. Frontendning yakuniy ko‘rik va tekshiruvlari quyida alohida qayd etiladi.

#### F frontend va yakuniy dalillar (2026-10-20)

F to‘liq bajarildi. Owner-only shablon/qayd boshqaruvi, kontekst havolalari va to‘liq JSON eksporti `/seller-tools`da ishlaydi. Chatdagi shablon tanlash mavjud draftni saqlab, matnni yubormasdan qo‘shadi; shaxsiy qayd composerga tushmaydi. Bulk amallar server limitiga rioya qiladi, decimal narxni aniqligini yo‘qotmasdan yuboradi va har e’lonning natijasini ko‘rsatadi. Free holatida ma’lumotni o‘qish/eksport qoladi, pullik mutatsiyalar yopiladi. Muqova va a’zolik owner/public profilga ulangan, expiry/freshness yoki yangilash xatosida public bezak yashiriladi; saqlangan muqova egasi uchun qoladi.

Mustaqil SPEC, sifat va yakuniy qatlamlararo ko‘riklar PASS. Ko‘rikda topilgan ikki holat regressiya bilan yopildi: sessiya egasi almashganda eski owner ma’lumoti/drafti va kechikkan so‘rovlari yangi owner UI’ga o‘tmaydi; muqova mutatsiyasining 403/503 javobidan keyin oldingi GET javobi pullik boshqaruvni qayta ochmaydi. GET abort signali unit regressiyasida, rad javobidan keyingi yopiq boshqaruv esa browserda tekshirildi. Dark rejimdagi uchta yangi havolaning kontrasti 2.69–2.75 dan 11.48–11.73 ga tuzatildi.

Node **22.23.3**, npm **10.9.9**, oxirgi production/test fayllari uchun:

| Tekshiruv | Natija |
|---|---|
| `npm ci --no-audit --no-fund --cache /private/tmp/ef-f-npm-cache` | Lockfile’dan 581 paket, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0; 0 error, avvalgi 27 warning, F’da yangi warning yo‘q |
| `npm test` | 301 faylda 2 519 test PASS, failure/skipped 0, exit 0 |
| `npm run build` | Next.js 16.2.9 Turbopack production build PASS, exit 0 |

Typecheck/lint/test shu checkoutda bajarildi. Oddiy `npm run build` yangi lockfile dependency install qilingan fizik nusxada (`/private/tmp/ef-phase-f-frontend-build`) bajarildi; source va nusxaning 909 ta build-manifest fayli hash bo‘yicha bir xil. Bundler almashtirilmadi, font mock/TLS bypass yoki phase skip ishlatilmadi. Yakuniy dalillar `/private/tmp/ef-f-frontend-final-evidence.json`, gate loglari `/private/tmp/ef-f-frontend-final-{typecheck,lint,test,build}.log`, nusxa solishtiruvi `/private/tmp/ef-f-frontend-final-build-sync.json`da.

Production UI haqiqiy browserda 1280×900 desktop va 390×844 mobile, light/dark, reduced-motion va klaviatura bilan tekshirildi. Sahifa tiklanishi, qisman bulk xatosi, Free read/export, unknown/retry, owner/public expiry, upload xatosida eski muqovaning saqlanishi, downgrade, kechikkan GET hamda chat draft/dialog holatlari PASS. API sintetik fixture edi: bu real backend bilan to‘liq E2E emas. Telegram/Yandex tashqi scriptlari bloklandi; real Telegram, Mailcow yoki payment amali bajarilmadi. Kutilgan fixture HTTP/WebSocket diagnostikasi tekshiruv cheklovi sifatida saqlandi. Screenshot va natijalar `/private/tmp/ef-f-browser/` hamda frontend dalil JSON’ida. F’ga tegishli browser, preview va fixture jarayonlari to‘xtatildi; boshqa jarayonlarga tegilmadi.

Yakuniy hash auditi backendning 27 va frontendning 26 freeze fayli o‘zgarmaganini, F deltasida faqat shu 53 fayl va ushbu reja borligini tekshiradi. Avvalgi assets hamda versionli migratsiyalar saqlangan; generated artefakt yoki secret nomzodi qo‘shilmagan. Yakuniy `git diff --check` PASS. Audit `/private/tmp/ef-phase-f-audit.json`, yig‘ma dalil `/private/tmp/ef-phase-f-final-verification.json`da. Application gate’laridan keyingi yagona o‘zgarish ushbu dalillarni qayd etuvchi Markdown reja; uning aniqligi, havolalari va diff’i alohida tekshirildi. Ta’sirlanmagan bot/mail/worker suite’lari F uchun qayta ishga tushirilmadi. O‘zgarishlar `azizbek` branchidagi shu checkoutda lokal qoldi; commit, push, PR, deploy yoki remote CI bajarilmadi.

### A–F yakuniy birgalikdagi ko‘rik (2026-10-20)

**Natija: A–F bir butun sifatida ko‘rib chiqildi, tasdiqlangan kamchiliklar tuzatildi va barcha ta’sirlangan komponentlar oxirgi kodda to‘liq tekshirildi.** Bu lokal yakunlash; commit, push, PR, deploy yoki remote CI bajarilmadi.

Ko‘rik A katalog/xarid/outbox/readiness, B umumiy mailbox kvotasi, C Grace/Recovery va Mailcow resource/provision/delete shartnomalari, D qidiruv/narx kuzatuvi hamda in-app/Telegram yetkazish, E analitika/completion/CSV va F shaxsiy ma’lumotlar/bulk/profil oqimlarini qamradi. Read-only mustaqil tekshiruvlar va tuzatishlarning qayta ko‘rigi o‘tdi; qolgan tasdiqlangan finding yo‘q.

Tuzatilgan holatlar:

- Custom mailbox yaratishda total/custom limitlari, domen tarifi va readiness turli katalog versiyalaridan qo‘shilib ketmasligi uchun bitta MVCC snapshot ishlatiladi. Ikki siyosatning hech biri ruxsat bermaydigan parallel holat real PostgreSQL regressiyasida avval RED, keyin GREEN bo‘ldi.
- Narx kuzatuvi vaqtincha UNAVAILABLE holatda hodisani yo‘qotmaydi. Saqlangan qidiruvlarda ham LIMIT sabab pauzadagi, keyinchalik haqiqiy Pro bilan tiklanadigan mosliklar durable candidate sifatida qoladi; huquq noma’lum paytda yetkazish ochilmaydi. Yetkazish va yangi narx kuzatuvi DB/HTTP kutishidan keyin joriy huquq bilan yana tekshiriladi.
- Haqiqiy obuna/grant o‘zgarish vaqti freshness/replay vaqtidan ajratildi: bir xil user va per-key grant snapshotlari effective `updated_at`ni siljitmaydi; freshness `plan_projection_state.occurred_at`dan tekshiriladi. Automatic renewal/recovery faqat tegishli grantdan keyingi hodisani tiklaydi. Qo‘lda pause/delete/priority/edit/opt-out eski tarixni qayta ochmaydi. To‘liq snapshotdan olib tashlangan kalitlar hamon o‘chiriladi. Profil `validUntil` freshness/expiry chegaralari saqlangan. Event formati va versionli migratsiyalar o‘zgarmadi.
- Hisob almashganda watches, analytics, profil mailbox ma’lumotlari, xarid holati, custom draft va listing kuzatuvi yangi owner uchun qayta yaratiladi; ayni owner refreshida draft saqlanadi. Eski custom claim yangi sessiyani redirect qilmaydi; eski CSV/ZIP yoki cleanup javobi navigatsiyadan keyin download/refresh qilmaydi. FAQ 30 kun Grace, keyin Recovery siyosatiga moslandi.

Har tuzatish uchun mazmunli RED → GREEN dalili saqlangan. Mustaqil ko‘rikdan o‘tgan freeze’lar: `/private/tmp/ef-af-mail-fix-hashes.json` (trade 5), `/private/tmp/ef-af-client-freeze-hashes.json` (frontend/mail 16), `/private/tmp/ef-review-d-freeze.json` (marketplace 7), `/private/tmp/ef-review-rec-freeze.json` (recommendation 7). Fokuslangan natijalar completion gate o‘rnida ishlatilmadi.

Java **21.0.10**, har komponentda aynan `mvn -B -ntp clean verify`, Docker mavjud:

| Komponent | Surefire | Failsafe IT | Failure/error/skipped | Exit |
|---|---:|---:|---|---:|
| payment-service | 91 | 272 | 0/0/0 | 0 |
| marketplace-service | 716 | 219 | 0/0/0 | 0 |
| trade-service | 345 | 444 | 0/0/0 | 0 |
| recommendation-service | 72 | 72 | 0/0/0 | 0 |
| bot | 141 | 0 | 0/0/0 | 0 |

Jami **2 372** test; final Surefire/Failsafe XML va dump yo‘qligi tekshirildi. Bot POM’ida Failsafe suite sozlanmagan; 0 IT test skip qilinganini anglatmaydi. Loglar `/private/tmp/ef-af-{payment,marketplace,trade,recommendation,bot}-full.log`, hisoblar `/private/tmp/ef-af-java-results.json`. O‘zgarmagan outbox CI kabi `mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests` bilan o‘rnatildi (`ef-af-outbox-install.log`); kutubxona manbasi o‘zgarmagani uchun uning alohida test suite’i qayta bajarilmadi. Lokal compatibility: `JAVA_TOOL_OPTIONS=-Dapi.version=1.44`, `DOCKER_HOST=unix:///Users/abdurahmoniy/.docker/run/docker.sock`, `TESTCONTAINERS_RYUK_CONTAINER_IMAGE=testcontainers/ryuk:0.12.0`; Docker daemon 29.3.1. Birinchi marketplace full gate hali tuzatilayotgan sakkiz promotion regressiyasini RED tasdiqladi; failure log/XML `/private/tmp/ef-af-marketplace-before-final-*`da saqlangan. So‘nggi effective-time tuzatishlaridan keyin marketplace va recommendation to‘liq qayta tekshirildi; eski koddagi PASS final kodga dalil qilinmadi.

Node **22.23.3**, npm **10.9.9**:

| Komponent | To‘liq tekshiruv | Natija |
|---|---|---|
| frontend | `npm ci --no-audit --no-fund`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` | Barchasi exit 0; 303 fayl / 2 528 test, failure/skipped 0; lint 0 error va avvalgi 27 warning |
| mail | `npm ci --no-audit --no-fund`, `npm run typecheck`, `npm run test`, `npm run build` | Barchasi exit 0; 15 fayl / 116 test, failure/skipped 0 |

Fresh lockfile install alohida `/private/tmp/ef-af-{frontend,mail}-build` nusxalarida `--cache /private/tmp/ef-af-npm-cache` bilan bajarildi (581 va 201 paket). Checkoutdagi installed package versiyalari ham lockfile bilan mos. Typecheck/lint/test checkoutda, asl Next.js/Turbopack production buildlar fizik nusxalarda bajarildi. Frontendning 912 va mailning 71 source/public/config inputi hash bo‘yicha mos; `.env*` yoki secret nusxalanmadi, bundler/faza almashtirilmadi. `/private/tmp/ef-af-client-gates.json`, `ef-af-builds.json`, `ef-af-build-source-manifests.json` va `ef-af-dependency-build-proof.json` exact buyruq/log/exit dalillarini saqlaydi.

Worker **Python 3.12.14**: fresh `/private/tmp/ef-af-worker-venv`da `python -m pip install -r requirements-dev.txt`, `ruff check smart_admin_worker/ tests/` va `python -m pytest -q` — exit 0; **271 test PASS**, failure/skipped 0. Kafka/Redis haqiqiy Testcontainers, tashqi Mailcow/Konami mocked. Avvalgi pytest-asyncio hamda Starlette/AnyIO deprecation warninglari saqlangan. Trade yaratgan ma’lum `crypto_vectors.json` testdan oldingi baytlarga qaytarildi; worker gate tekshirgan manba bilan aynan bir xil. Worker dalili `/private/tmp/ef-af-worker-evidence.json`. Worker Dockerfile’i o‘zgarmagan va CI worker image check’ini ataylab o‘tkazmaydi; bu ko‘rikda image build qilinmadi. Userbot, auth/access hamda outbox manbasi o‘zgarmagan va event shartnomasi kengaymagan, shu sabab ularning alohida gate’i qayta bajarilmadi. O‘zgargan compose konfiguratsiyasida `docker compose config --quiet` exit 0; lokal deploy envlari berilmagani haqidagi warninglar `ef-af-compose-config.log`da, bu real deploy/startup smoke emas.

Haqiqiy production browser: desktop 1280×900 light va mobile 390×844 dark/reduced-motion, keyboard va overflow tekshiruvlari PASS. Bir xil document ichida haqiqiy RSC refresh bilan owner A → B o‘tdi: private watches/draft, analytics/held CSV, custom draft/held claim, bir xil ID’dagi boshqa ownerga o‘tgan mailbox selection/held ZIP tozalandi. Eski CSV/ZIP bekor qilinib download bo‘lmadi; eski claim redirect qilmadi; ayni owner drafti refreshda saqlandi. FAQ klaviaturada ochilib Grace30/Recovery ko‘rindi. Plan purchase va listing opt-in identity holatlari route DOM regressiyalarida tekshirildi. Full frontend suite mavjud Mini App/Telegram bridge integratsion regressiyalarini ham qamradi; haqiqiy Telegram WebView/live auth alohida ishlatilmadi. Browser API faqat sintetik localhost fixture; real backend end-to-end, haqiqiy to‘lov/Telegram/Mailcow yoki production smoke bajarilmadi. Scoped page error massivlari bo‘sh; kutilgan bloklangan tashqi script va sintetik WebSocket diagnostikasi alohida. `/private/tmp/ef-af-browser-evidence.json`, olti final browser log va o‘nta screenshot saqlandi. Root uchta final screenshotni mustaqil ko‘rdi. Faqat shu ko‘rikning browser/preview/fixture jarayonlari yopildi; foydalanuvchi localhost3000 jarayoniga tegilmadi.

Yakuniy audit `/private/tmp/ef-af-final-verification.json`da: tekshirilgan/review qilingan fayl hash’lari mos, barcha 156 joriy checkout versionli migratsiyasi o‘zgarmagan, A–F va foydalanuvchining avvalgi assets/o‘zgarishlari saqlangan, kutilmagan deletion/generated artefakt/secret nomzodi yo‘q, `git diff --check` PASS. Application gate’laridan keyingi yagona source tahriri ushbu Markdown rejada natijalarni qayd etish bo‘ldi; uning aniqligi va diff’i alohida tekshirildi. Hammasi shu checkout va `azizbek` branchida lokal qolgan.

#### Commit/push/PR tayyorgarligi (2026-10-20)

Keyingi foydalanuvchi ko‘rsatmasi A–F commit/push, PR va oxirgi commit CI’ni tekshirishni ruxsat etdi; deploy ruxsat etilmadi. Yuqoridagi “lokal, commit/push yo‘q” qaydlari o‘sha ko‘rik yakunidagi tarixiy holatdir. Remote CI uchun dalil aynan PR head SHA’iga tegishli GitHub check/run bo‘ladi; lokal PASS uning o‘rnini bosmaydi.

425 ta rollout fayli aniq path ro‘yxati orqali stage qilindi. Oldingi 11 ta artwork/source materiali (`assets/`, `frontend/public/plans/`, ishlatilmaydigan eski `PlanArt` moduli va uning testi) lokal saqlandi. Yangi tarif kartalari bu modulga bog‘liq emas; amaldagi CSS esa commitga kiradi. Versionli migratsiyalar diffida faqat 24 ta yangi fayl bor, o‘zgartirish/o‘chirish yo‘q.

`git checkout-index`dan olingan aynan staged frontend daraxti yangi Node22 lockfile install bilan tekshirildi: original `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` — exit 0. **302 fayl / 2 522 test**, failure/skipped 0; lint 0 error va 23 existing warning. Farq yuqorida tekshirilgan workspace’dagi eski artwork’ning 6 testidan kelib chiqadi; failing test yoki assertion olib tashlanmadi. Tekshiruv dalili `/private/tmp/ef-af-staged-frontend-verification.json`, loglar `ef-af-staged-frontend-{build,typecheck,lint,test}.log`. Bu tekshiruvlardan keyin faqat ushbu Markdown qaydi yangilandi.

## 5. Bog‘liqlik va chiqarish tartibi

1. A backend katalogi va ishonchli hodisalar → B umumiy mailbox pool → C pochta davomiyligi va resurs hisobi. UI o‘zgarishi mavjud imkoniyatlar bilan birga yoqiladi.
2. A entitlementlari tayyor bo‘lgach D kuzatuvlar va E analitika ma’lumot yig‘ish qismini parallel bajarish mumkin. Analitika kolleksiyasi erta yoqiladi, pullik ekran tayyor bo‘lmaguncha va’da qilinmaydi.
3. A+B+C tugagach ichki/sinov guruhida mail asosidagi Pro ishlaydi. D tayyor bo‘lgach kengroq pullik pilot chiqariladi. E va F tugagach to‘liq paket mavjud bo‘ladi.
4. Avval yangi payloadlarni tushunadigan consumerlar, keyin producerlar, entitlement snapshotlari, projection readiness va eng oxirida ommaviy xarid UI yoqiladi. Vaqtincha eski/yangi servislar birga ishlashi test qilinadi.
5. Rollback’da yangi xarid va yangi ajratish vaqtincha yopilishi mumkin; oldin to‘langan huquqlar, ledger va mavjud inboxlar bekor qilinmaydi. Migratsiyani orqaga o‘chirish o‘rniga keyingi tuzatish migratsiyasi ishlatiladi.

Bosqichlar alohida PR bo‘lishi mumkin, lekin iste’molchi servislar to‘liq moslashmasdan faqat UI’dagi 10 sonini chiqarish tayyor natija hisoblanmaydi. Eski UI bo‘yicha lokal o‘zgarishlar va assets papkasi saqlanadi; ularni qayta ishlash aniq tegishli bosqich doirasida bajariladi.

## 6. Tekshirish buyruqlari va tugash mezoni

Manbalar: monorepo `AGENTS.md`, `.github/workflows/ci.yml`, `build.yml`, `deploy.yml`, tegishli package manifestlar. Quyidagilar amalga oshirish va yakuniy ko‘rikda bajariladigan tekshiruvlar; oxirgi lokal natijalar A–F yakuniy ko‘rik bo‘limida qayd etilgan.

| Qamrov | To‘liq tekshiruv |
|---|---|
| Har o‘zgargan Java servis va event consumer | Java 21, Docker; servis ichida `mvn -B -ntp clean verify`; Surefire va Failsafe hisobotlari |
| Outbox kutubxonasi o‘zgarsa | Kutubxonada `mvn -B -ntp clean verify`; monorepo ildizida `mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests`; barcha ta’sirlangan bog‘liq servislarni to‘liq verify |
| Frontend | Node 22; kerak bo‘lsa lockfile’dan `npm ci --no-audit --no-fund`; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` |
| Mail | Node 22; `npm ci --no-audit --no-fund`, `npm run test`, `npm run build` |
| Worker | Python 3.12; `pip install -r requirements-dev.txt`, `ruff check smart_admin_worker/ tests/`, `pytest -q` |
| Infra/image o‘zgarsa | Tegishli build/deploy workflow’dagi image va konfiguratsiya tekshiruvlari |

Fokuslangan birinchi regressiyani tekshirish misollari:

```bash
# payment-service ichida; bu to‘liq completion gate o‘rnini bosmaydi
mvn -B -ntp -Dit.test=PlanPurchaseIT verify

# frontend ichida
npm test -- src/lib/plans.test.ts src/components/plans/plans-view.test.ts

# smart-admin-worker ichida
pytest -q tests/unit/test_mailbox_delete_handler.py
```

- [x] Test-first regressiya kutilgan sabab bilan yiqilgan, minimal implementatsiyadan keyin o‘tgan.
- [x] Barcha ta’sirlangan servis va event consumerlar final kodda to‘liq tekshirilgan; boshqa servis path filteri uni o‘tkazib yuborishi tekshiruvni bekor qilmaydi.
- [x] Web/Mini App, mail subdomeni, mobil ekran, dark mode, klaviatura va reduced-motion oqimlari tekshirilgan.
- [x] Yangi endpoint, jadval, event va env o‘zgarishlari komponent README’lari va `docs/kafka-topics.md`da aks etgan.
- [x] `git diff --check`, final diff va generatsiya qilingan begona fayllar tekshirilgan; userning oldingi lokal o‘zgarishlari yo‘qolmagan.
- [x] Push ruxsat etilgan bo‘lsa oxirgi commit CI tekshirilishi shart. Lokal yakuniy ko‘rik vaqtida **N/A** edi: o‘sha paytda push/PR/deploy taqiqlangan, remote CI ishlatilmagan. Keyingi publish ruxsati va staged tekshiruv yuqorida alohida qayd etilgan; deploy hanuz yopiq.

## 7. Pilotda o‘lchanadigan ko‘rsatkichlar

- Birinchi to‘lov, keyingi oyga yangilanish va bekor qilish sababi; faol sotuvchi va bir martalik xaridor alohida ko‘riladi.
- Free/Pro/grace/recovery bo‘yicha haqiqiy qutilar, disk baytlari va yordamga ketgan vaqt.
- Obuna xarididan huquq qo‘llanishigacha kechikish, yetkazilmagan hodisalar va Mailcow reconciliation farqlari.
- Qidiruv/price xabari yetkazilishi, undan e’longa kirish, xabarni o‘chirish va shikoyat ko‘rsatkichlari.
- Obuna tushumi minus to‘lov xarajati, hosting, support va bepul/eski qutilar subsidiyasi. Savdo komissiyasidan hamkor/referal va operatsiya xarajatlari ayirilgan hissa alohida hisoblanadi.

Ikki-uch to‘lov davridan keyin yillik narx va qo‘shimcha qutilar alohida qaror qilinadi. 30 000 so‘mni foydali narx deb tasdiqlash uchun tushumning o‘zi yetarli emas; obuna yangilanishi va to‘liq xizmat xarajati birga ko‘riladi.
