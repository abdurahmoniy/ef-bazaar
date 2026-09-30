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
- Relay: `FOR UPDATE SKIP LOCKED` partiya, idempotent producer, birinchi xatoda to'xtaydi (tartib uchun),
  yozuv `attempts++` bilan qoladi.
- Snapshot rejimi: `outbox.markSnapshot(source, id)` yoki DB trigger `outbox_snapshot_pending` ga belgi
  qo'yadi; relay servisning `SnapshotSource` bean'i orqali hozirgi holatni quradi va yuboradi.

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

`outbox_pending_count`, `outbox_pending_oldest_seconds`, `outbox_send_failures_total`.
Alert `OutboxBacklog`: eng eski yetkazilmagan yozuv 5 daqiqadan eski.

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
