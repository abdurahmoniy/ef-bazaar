# Transactional outbox — dizayn

Sana: 2026-09-30 · Holat: tasdiqlangan dizayn, reja yozilishi kutilmoqda
Bog'liq: [recommendation-service dizayni](2026-09-30-recommendation-service-design.md) shu ishga tayanadi.

## 1. Muammo

Barcha servislar Kafka'ga "yubordim-unutdim" uslubida yozadi: `kafkaTemplate.send(...)` natijasi
kutilmaydi yoki `afterCommit` ichida chaqiriladi. DB commit bo'ldi, lekin broker xatosi, restart yoki
tarmoq uzilishi bo'lsa — event jim yo'qoladi. Oqibatlar:

- trade `trade-succeeded` / `listing-sold` yo'qolsa — akkount xaridorga o'tmaydi, referal mukofoti yozilmaydi, e'lon sotuvda qoladi.
- payment `plan-entitlements` / `subscription-changed` yo'qolsa — trade'dagi tarif projection'i noto'g'ri.
- marketplace `partner-approved` yo'qolsa — PARTNER roli berilmaydi.
- humo-userbot kuzatuvni yubora olmasa — **kartaga pul tushgan, hamyonga yozilmagan** va hech qayerda iz qolmaydi.
- auth enricher'lari va bot jo'natmani kutmaydi — bildirishnomalar jim yo'qoladi.

## 2. Yechim qisqacha

- DB'si bor servislar (auth, marketplace, trade, payment): **transactional outbox** — event biznes
  o'zgarishi bilan bitta lokal tranzaksiyada `outbox_events` ga yoziladi, relay uni Kafka'ga yetkazadi.
  Outbox jadvali har servisning **o'z bazasida** (atomiklik faqat lokal tranzaksiyadan keladi); kod esa
  umumiy kutubxonada — `backend/libs/outbox`.
- DB'siz Java ishlab chiqaruvchilar (auth enricher'lari, bot): **sinxron yuborish** — tasdiq kelmaguncha
  manba (kiruvchi Kafka xabari yoki Telegram webhook) tasdiqlanmaydi.
- humo-userbot: **diskdagi navbat + catch-up**.

Kafolat: at-least-once. Takroriy xabar mumkin — consumer'lar idempotent bo'lishi shart.

## 3. Kutubxona `backend/libs/outbox`

| | |
|---|---|
| Koordinatalar | `uz.efbazaar:outbox`, paket `uz.efbazaar.outbox` |
| Shakl | Spring Boot auto-configuration (`OutboxAutoConfiguration`), servis faqat dependency qo'shadi |
| Bog'liqliklar | spring-boot-starter-jdbc, spring-kafka, micrometer (servislar allaqachon ishlatadi) |
| Sozlamalar | `outbox.relay.poll-interval` (500ms), `outbox.relay.batch-size` (100), `outbox.relay.send-timeout` (10s), `outbox.cleanup.retention` (7d), `outbox.cleanup.cron` |

### 3.1 Jadvallar (har servisda o'z V-migratsiyasi, SQL bir xil — kutubxonada `docs/outbox-schema.sql` namuna)

```sql
CREATE TABLE outbox_events (
    id           BIGSERIAL PRIMARY KEY,
    topic        TEXT        NOT NULL,
    message_key  TEXT,
    payload      BYTEA       NOT NULL,
    headers      JSONB       NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    attempts     INT         NOT NULL DEFAULT 0,
    last_error   TEXT
);
CREATE INDEX outbox_events_pending_idx ON outbox_events (id) WHERE published_at IS NULL;

-- faqat snapshot rejimi kerak bo'lgan servisda (marketplace):
CREATE TABLE outbox_snapshot_pending (
    source    TEXT        NOT NULL,
    entity_id TEXT        NOT NULL,
    marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source, entity_id)
);
CREATE SEQUENCE outbox_snapshot_version_seq;
```

### 3.2 API

```java
public interface Outbox {
    /** Faol tranzaksiya ichida chaqirilishi SHART (Propagation.MANDATORY). */
    void publish(String topic, String key, Object payload);

    /** Snapshot belgisi; takrorlangan belgi bittaga birlashadi. MANDATORY. */
    void markSnapshot(String source, String entityId);
}

public interface SnapshotSource {
    String source();                         // masalan "listing"
    String topic();
    /** Hozirgi holat; bo'sh bo'lsa belgi shunchaki o'chiriladi. */
    Optional<Object> build(String entityId, long version);
}
```

- `publish` payload'ni **servisning o'zida sozlangan value serializer** (Spring Boot `KafkaProperties`
  bo'yicha `JsonSerializer`) bilan shu zahoti baytlarga aylantiradi; serializer qo'shgan headerlar
  (`__TypeId__` va h.k.) `headers` ga yoziladi. Relay baytlar va headerlarni o'zgartirmasdan yuboradi —
  consumer'lar uchun sim ustidagi xabar hozirgi bilan bayt-ma-bayt bir xil.
- `publish` tranzaksiyaga `afterCommit` hook qo'shadi → relay darhol uyg'onadi (odatiy kechikish ~10–30 ms).
  500 ms polling — zaxira.

### 3.3 Relay

1. Tranzaksiya: `SELECT … FROM outbox_events WHERE published_at IS NULL ORDER BY id LIMIT :batch FOR UPDATE SKIP LOCKED`.
2. Hammasi ketma-ket `send` qilinadi (producer `enable.idempotence=true` — bir partition ichida tartib saqlanadi),
   keyin barcha future'lar `send-timeout` ichida kutiladi.
3. Muvaffaqiyatlilarga `published_at = now()`. Birinchi xatodan boshlab qolganlariga `attempts++`, `last_error`;
   ular keyingi aylanishda qayta (tartib buzilmasligi uchun xatodan keyingilar ham "yuborilmagan" qoladi).
4. Snapshot rejimi: `outbox_snapshot_pending` dan `FOR UPDATE SKIP LOCKED` bilan belgilar olinadi,
   `version = nextval('outbox_snapshot_version_seq')`, `SnapshotSource.build` → yuboriladi → belgi o'chiriladi.
   Relay ishlayotganda qo'yilgan yangi belgi (`marked_at` keyinroq) o'chirilmaydi — keyingi aylanishda yangi snapshot.

Bir nechta instansiya xavfsiz (`SKIP LOCKED`).

### 3.4 Tozalash va kuzatuv

- Kunlik: `DELETE FROM outbox_events WHERE published_at < now() - retention`.
- Metrikalar: `outbox_pending_count`, `outbox_pending_oldest_seconds`, `outbox_send_failures_total`.
- `infra/prometheus/rules`: `outbox_pending_oldest_seconds > 300` (5 daqiqa) → alert.
- Yuborish xatosi WARN log — `KafkaLogForwarder` orqali Telegram'ga (cheklov bilan).

## 4. Servislarga ulash

Qoida: event biznes o'zgarishi bilan bitta tranzaksiyada. `afterCommit` ichidagi `kafka.send` va
`@TransactionalEventListener(AFTER_COMMIT)` → tranzaksiya ichidagi `outbox.publish`
(yoki `@TransactionalEventListener(phase = BEFORE_COMMIT)`).

| Servis | Publisher'lar | Eslatma |
|---|---|---|
| payment | `PaymentEventPublisher`, `PlanEventPublisher` | `@TransactionalEventListener` → `BEFORE_COMMIT` |
| trade | `TradeEventPublisher`, `ChatChangePublisher` | `afterCommit` olib tashlanadi; tranzaksiyasiz chaqiruvlar tuzatiladi |
| auth | `AuthEventPublisher` | |
| marketplace | `MarketplaceEventPublisher`, `PartnerEventPublisher`, `PartnerAdEventPublisher`, `SupportKafkaPublisher` | snapshot rejimi — recommendation spec'ida |
| marketplace `EfhubSyncService` | `cards-added` | ma'lumot `efbazaar` DB'da: outbox'ga `efbazaar` commit'idan keyin darhol yoziladi (qisqa oraliq hujjatlashtiriladi) |

O'zgarmaydi: `KafkaErrorHandlingConfig` (DLT), `MockWorker`, `KafkaLogForwarder`,
Redis/WebSocket/broadcast'dagi Kafka bo'lmagan `afterCommit` lar.

Har servisda reja quyidagilarni o'z ichiga oladi: publisher'ning **barcha chaqiruv joylari ro'yxati** va
har biri tranzaksiya ichidaligining tekshiruvi; o'sha topic consumer'larining idempotentligi (takroriy
xabar ikkinchi qo'ng'iroqcha / ikkinchi DM / ikkinchi rol berish qilmasligi) — kerak joyda idempotency kaliti.

### 4.1 DB'siz Java ishlab chiqaruvchilar

- **auth enricher'lari** (`ChatCreatedEnricher`, `TradeActionEnricher`, `MailboxHandedOverEnricher`,
  `WalletCreditedEnricher`): `kafka.send(...).get(timeout)`. Xato → exception → kiruvchi xabar
  tasdiqlanmaydi → error handler qayta yetkazadi.
- **bot** (`bot.*` topiclar: `MediaUploadController`, `UserPhotoUploaderConsumer`, `UpdateHandler`,
  `SupportMessageConsumer`): sinxron yuborish. Kafka consumer ichida — exception; webhook yo'lida —
  Telegram'ga 5xx (Telegram update'ni qayta yuboradi); HTTP ichki API'da — 5xx chaqiruvchiga.

### 4.2 humo-userbot

- `TELEGRAM_SESSION_DIR` volume'ida SQLite: `pending(message_id INTEGER PRIMARY KEY, topic, payload, created_at)`
  va `state(key PRIMARY KEY, value)` (`last_message_id`).
- Xabar kelganda: **avval** `pending` ga yoziladi, keyin yuboriladi, muvaffaqiyatda o'chiriladi va
  `last_message_id` yangilanadi. Fon vazifasi har 5 s `pending` ni qayta yuboradi.
- Startda catch-up: Humo chatining tarixidan `last_message_id` dan keyingi xabarlar o'qilib, oddiy
  parser orqali `pending` ga qo'yiladi.
- Takrorlanish xavfsiz: payment `telegram_message_id UNIQUE`.
- `_reporting_ok` (heartbeat) — `pending` bo'shatib bo'lmasa `False`.

## 5. Build va CI

- `backend/libs/outbox/pom.xml` — `spring-boot-starter-parent` 3.3.4 (servislar bilan bir xil), Java 21.
- 4 servis `pom.xml` ga `uz.efbazaar:outbox` dependency.
- 4 servis Dockerfile'i: build context `backend/`; build bosqichida `COPY libs/outbox` → `mvn install`,
  keyin `COPY <svc>/pom.xml`, `<svc>/src` → `mvn package`.
- `build.yml`: shu 4 servis uchun `context: backend`, `file: backend/<svc>/Dockerfile`;
  `backend/libs/**` o'zgarsa shu 4 servis quriladi.
- `ci.yml`: Java job'ida servisdan oldin `mvn -B -ntp -f backend/libs/outbox install`;
  `backend/libs/` o'zgarsa 4 servis va lib testlari ishga tushadi.
- `docker-compose.yml`: shu 4 servisning `build:` bloklari (bo'lsa) yangi context'ga.
- AGENTS.md tekshiruv jadvaliga lib qo'shiladi; README/CLAUDE.md va `docs/kafka-topics.md`
  (at-least-once eslatmasi) yangilanadi.

## 6. Bosqichlar (har biri alohida PR)

1. Kutubxona + build/CI (4 image CI'da qurilishi shart).
2. payment.
3. trade.
4. auth + bot.
5. marketplace (recommendation snapshot'lari shu yerda yoki recommendation A rejasida).
6. humo-userbot — 1-bosqich bilan parallel ham bo'lishi mumkin.

## 7. Test

**Kutubxona** (Testcontainers Postgres + Kafka):
- rollback → yozuv yo'q; commit → yetkaziladi;
- moslik: outbox orqali ketgan xabar baytlari va headerlari to'g'ridan-to'g'ri `JsonSerializer` bilan bir xil;
- tranzaksiyasiz `publish` → `IllegalTransactionStateException`;
- Kafka o'chiq → kutadi, `attempts` o'sadi, keyin yetkaziladi; bir kalit ichida tartib saqlanadi;
- commit'da uyg'otish: polling oralig'i katta bo'lsa ham event < 200 ms;
- ikki relay parallel — dublikat olinmaydi;
- tozalash, metrikalar;
- snapshot: bir necha belgi → bitta snapshot, `version` monoton, `build` bo'sh → belgi o'chadi,
  relay ishlayotganda qo'yilgan belgi yo'qolmaydi.

**Servislar:** mavjud publisher/consumer IT'lari o'zgarmasdan o'tadi; publisher chaqiruv joylarini qamrab
oluvchi oqim testlari (tranzaksiyasiz yo'l `MANDATORY` bilan yiqiladi); idempotentligi qo'shilgan consumer'lar
uchun "ikki marta kelgan xabar" testi.

**DB'siz:** enricher — yuborish yiqilsa exception; bot — yuborish yiqilsa webhook 5xx.

**humo-userbot (pytest):** navbatga yozish yuborishdan oldin; qayta urinish; restart'da navbat qayta
yuboriladi; `last_message_id` dan catch-up; takroriy xabar zararsiz.

**Build:** 4 servis image'i yangi context bilan lokal va CI'da quriladi.

## 8. Xavflar

| Xavf | Yumshatish |
|---|---|
| Testlar qamramagan tranzaksiyasiz yo'l prod'da `MANDATORY` sababli foydalanuvchi amalini sindiradi | Rejada har chaqiruv joyi ro'yxati; servislar bittadan chiqariladi; deploy'dan keyin loglar |
| At-least-once: takroriy xabar | Har consumer idempotentligi tekshiriladi, kerak joyda kalit |
| Build context o'zgarishi deploy'ni sindiradi | 1-bosqichda 4 image CI'da quriladi |
| Kafka uzoq o'chiq — jadval o'sadi | 5 daqiqalik alert; faqat yuborilganlar tozalanadi |
| Kechikish | commit'da uyg'otish — odatda +10–30 ms |

## 9. 1-bosqich review'dan keyingi ochiq masalalar

- **Snapshot belgilari yuborish paytida qulflangan (5-bosqichdan oldin hal qilinadi).** Relay
  `outbox_snapshot_pending` qatorlarini `FOR UPDATE` bilan olib, build + send davomida ushlab turadi.
  Kafka o'chiq bo'lsa, shu entity'ga `markSnapshot` qiladigan biznes tranzaksiyasi (marketplace
  e'lon tahriri) `send-timeout` gacha kutadi — broker nosozligi foydalanuvchi kechikishiga aylanadi.
  Yechim: belgini qulfsiz o'qish (bitta relay uchun advisory lock), commit, build + send, keyin
  `DELETE … WHERE marked_at <= seen` — `marked_at` qo'riqchisi aynan shu uchun bor.
- **Kafka hech qachon qabul qilmaydigan yozuv (2-bosqichdan oldin).** Hozir qo'lda runbook
  (kutubxona README'si). Kerak: doimiy xatolarni tasniflab `parked` holatga o'tkazish va takroriy
  xatoda eksponensial kutish.
- **Boshqa DataSource tranzaksiyasi.** `publish` faqat "faol tranzaksiya bormi" ni tekshiradi;
  marketplace'ning `efbazaar` tranzaksiyasi ichida chaqirilsa yozuv asosiy bazaga atomik bo'lmay
  tushadi. 5-bosqichda `TransactionSynchronizationManager.hasResource(dataSource)` tekshiruvi.
