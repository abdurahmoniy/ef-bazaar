# outbox (`uz.efbazaar:outbox`)

Transactional outbox: Kafka event'i biznes o'zgarishi bilan **bitta DB tranzaksiyasida** yoziladi
va relay uni Kafka'ga yetkazadi. Broker o'chiq, restart yoki tarmoq uzilishi event'ni yo'qotmaydi.
Kafolat — at-least-once: consumer'lar idempotent bo'lishi shart.

Dizayn: `docs/superpowers/specs/2026-09-30-transactional-outbox-design.md`.

## Servisga ulash

1. `pom.xml`:
   ```xml
   <dependency>
       <groupId>uz.efbazaar</groupId>
       <artifactId>outbox</artifactId>
       <version>1.0.0-SNAPSHOT</version>
   </dependency>
   ```
2. Yangi Flyway V-migratsiya — `src/main/resources/uz/efbazaar/outbox/outbox-schema.sql` mazmuni.
   **Migratsiya qo'shilmasdan dependency qo'shmang** — relay jadvalni topolmay har aylanishda yiqiladi.
3. `kafkaTemplate.send(...)` o'rniga tranzaksiya ichida:
   ```java
   outbox.publish(TOPIC, key, payload);
   ```
   Tranzaksiyasiz chaqiruv `IllegalTransactionStateException` beradi — bu ataylab.

## Qanday ishlaydi

- `publish` payload'ni servisning `ProducerFactory` value serializer'i bilan shu zahoti baytlarga
  aylantiradi va serializer qo'shgan headerlarni saqlaydi — sim ustidagi xabar `kafkaTemplate.send`
  chiqaradigan bilan bayt-ma-bayt bir xil.
- Commit'dan keyin relay darhol uyg'onadi (odatda +10–30 ms); `outbox.relay.poll-interval` — zaxira.
- Relay: `FOR UPDATE SKIP LOCKED` partiya, idempotent producer (`max.block.ms` = `send-timeout`),
  vaqtinchalik xatoda to'xtaydi (tartib uchun), yozuv `attempts++` bilan qoladi.
- **Park:** Kafka hech qachon qabul qilmaydigan yozuv (`RecordTooLargeException`, `InvalidTopicException`,
  `TopicAuthorizationException`, `SerializationException`) `parked_at` bilan navbatdan chiqadi — qolganlari
  davom etadi. Vaqtinchalik xatolar (broker o'chiq, timeout) hech qachon park qilinmaydi.
- **Backoff:** ketma-ket yiqilishlarda relay 1 s, 2 s, 4 s … 60 s kutadi; birinchi muvaffaqiyatda nolga qaytadi.
- Snapshot rejimi: `outbox.markSnapshot(source, id)` yoki DB trigger `outbox_snapshot_pending` ga belgi
  qo'yadi; relay belgilarni **qulfsiz** o'qib, servisning `SnapshotSource` bean'i orqali hozirgi holatni
  quradi va yuboradi — biznes tranzaksiyasi relay'ni hech qachon kutmaydi. Doimiy rad etilgan snapshot
  belgisi ERROR log bilan tashlanadi (holat keyingi o'zgarishda yoki replay orqali qayta ketadi).

## Sozlamalar

| Kalit | Default |
|---|---|
| `outbox.enabled` | `true` |
| `outbox.relay.poll-interval` | `500ms` |
| `outbox.relay.batch-size` | `100` |
| `outbox.relay.send-timeout` | `10s` |
| `outbox.cleanup.retention` | `7d` |
| `outbox.cleanup.cron` | `0 15 3 * * *` |

## Kuzatuv

`outbox_pending_count`, `outbox_pending_oldest_seconds`, `outbox_parked_count`,
`outbox_send_failures_total`, `outbox_parked_total`.

| Alert | Qachon | Ma'nosi |
|---|---|---|
| `OutboxBacklog` | eng eski yetkazilmagan yozuv > 5 daqiqa, 5 daqiqa davomida (amalda ~10 daqiqa) | Kafka yoki relay ishlamayapti; event'lar navbatda, yo'qolmagan |
| `OutboxParked` | park qilingan yozuv bor, 1 daqiqa | Kafka doimiy rad etgan event — odam ko'rishi kerak |

## `OutboxBacklog` — navbat yetkazilmayapti

1. Birinchi yetkazilmagan yozuvlar va xato sababi:
   ```sql
   SELECT id, topic, message_key, attempts, last_error, created_at
     FROM outbox_events WHERE published_at IS NULL AND parked_at IS NULL ORDER BY id LIMIT 5;
   ```
2. `last_error` vaqtinchalik (broker o'chiq, timeout, `max.block.ms`) — Kafka'ni tiklang, relay backoff
   tugashi bilan o'zi davom etadi.

## `OutboxParked` — Kafka doimiy rad etgan event

1. Park qilinganlar:
   ```sql
   SELECT id, topic, message_key, last_error, parked_at, octet_length(payload) AS bytes
     FROM outbox_events WHERE parked_at IS NOT NULL AND published_at IS NULL ORDER BY id;
   ```
2. Sababni tuzating (payload hajmi, topic nomi, ruxsat). Event consumer'ga baribir kerak bo'lsa —
   sababni tuzatgandan keyin qayta navbatga qo'ying:
   ```sql
   UPDATE outbox_events SET parked_at = NULL, attempts = 0 WHERE id = :id;
   ```
3. Kerak bo'lmasa — yopib qo'ying (tozalash job'i 7 kundan keyin o'chiradi):
   ```sql
   UPDATE outbox_events SET published_at = now(), last_error = 'dismissed: ' || last_error WHERE id = :id;
   ```

Park qilingan yozuvdan keyingi, xuddi shu kalitli event'lar oldinga o'tib ketgan bo'ladi — butun servisni
to'xtatishdan ko'ra bu kichik yomonlik. Qayta navbatga qo'yilgan event consumer'ga kechikib keladi.

## Build

Kutubxona servislar Docker image'iga manba sifatida kiradi: servis Dockerfile'lari build context
`backend/` dan `libs/outbox` ni `mvn install` qiladi. Lokal ishlab chiqishda servisdan oldin bir marta:

```bash
mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests
```

## Test

```bash
cd backend/libs/outbox && mvn -B -ntp clean verify   # Testcontainers: Postgres + Kafka
```
