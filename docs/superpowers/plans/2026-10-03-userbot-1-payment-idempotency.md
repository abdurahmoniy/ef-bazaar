# Userbot 1/3 — payment-service: akkount bo'yicha idempotency — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Karta kuzatuvlari (credit va debit) idempotency kaliti `telegram_message_id` dan `(userbot_telegram_id, telegram_message_id)` juftligiga o'tadi. Shunda payment kuzatuvi boshqa Telegram akkountga o'tkazilganda xabar id'lari to'qnashib, kirim jim tashlab yuborilmaydi.

**Architecture:** Kafka payload'lariga ixtiyoriy `userbotTelegramId` (Long) qo'shiladi. Eski userbot uni yubormaydi va `NULL` bo'lib qoladi. DB'da eski `UNIQUE (telegram_message_id)` o'rniga `UNIQUE (COALESCE(userbot_telegram_id, 0), telegram_message_id)` indeksi qo'yiladi. Servis tekshiruvi derived query orqali shu juftlik bo'yicha ishlaydi (Spring Data `null` parametrni `IS NULL` ga aylantiradi).

**Tech Stack:** Java 21, Spring Boot 3.3, Spring Data JPA, Flyway, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-10-02-userbot-management-design.md` (§2.4, §6, §9.1)

## Global Constraints

- `V<n>__*.sql` immutable; yangi fayl `V14__observation_userbot_account.sql` (`origin/main` dagi oxirgisi `V13`). Yozishdan oldin `git fetch && git ls-tree --name-only origin/main backend/payment-service/src/main/resources/db/migration/ | sort -V | tail -1` bilan qayta tekshiring — agar V14 band bo'lsa keyingi bo'sh raqamni oling.
- `userbotTelegramId` ixtiyoriy: u bo'lmagan xabar avvalgidek qabul qilinadi (eski userbot deploy tartibi §9.1).
- Maven: `JAVA_HOME=~/.jdks/openjdk-21.0.2`, ITlar uchun `mvn verify -DargLine="-Dapi.version=1.44"` (`mvn test` ITlarni jim o'tkazib yuboradi).
- Commit xabarlariga Claude imzosi / Co-Authored-By qo'shilmaydi.

## Review Focus

- Eski formatdagi (maydonsiz) xabar qayta kelsa — `NULL` juftlik bo'yicha takror deb topilishi kerak, ikkinchi kredit bo'lmasin (Task 2 testi).
- Ikki xil akkountdan bir xil `messageId` — ikkalasi ham saqlanadi (Task 2, Task 3 testlari).
- `userbotTelegramId` bor yangi xabar bilan bir xil `messageId` li eski `NULL` qator — ular har xil kalit, ikkalasi saqlanadi (Task 2 testi).
- JSON'da `userbotTelegramId` bilan kelgan bare-JSON xabar Jackson tomonidan to'g'ri o'qiladi — record'ga ikkinchi konstruktor qo'shilgani uchun bu alohida pinlanadi (Task 3).
- Migratsiyadan keyin eski unique constraint haqiqatan yo'qligi — aks holda ikki akkount testi DB darajasida yiqiladi (Task 2 testi shuni qamraydi).

---

### Task 1: Migratsiya va entity ustuni

**Files:**
- Create: `backend/payment-service/src/main/resources/db/migration/V14__observation_userbot_account.sql`
- Modify: `backend/payment-service/src/main/java/uz/efbazaar/payment/observation/domain/CardCreditObservation.java`
- Modify: `backend/payment-service/src/main/java/uz/efbazaar/payment/debit/domain/CardDebitObservation.java`

**Interfaces:**
- Produces: ikkala entity'da `private Long userbotTelegramId;` (Lombok getter/builder `userbotTelegramId(Long)`).

- [ ] **Step 1: Constraint nomlarini tekshirish**

Run:
```bash
cd backend/payment-service
grep -rn "telegram_message_id" src/main/resources/db/migration/
```
Expected: `V4` va `V11` da inline `NOT NULL UNIQUE` — Postgres ularni `card_credit_observations_telegram_message_id_key` va `card_debit_observations_telegram_message_id_key` deb nomlaydi. Boshqa migratsiyada qayta nomlanmagan bo'lishi kerak.

- [ ] **Step 2: Migratsiyani yozish**

`V14__observation_userbot_account.sql`:
```sql
-- payment-service V14 — kuzatuv qaysi Telegram akkountidan kelgani.
--
-- Shaxsiy chatdagi message.id faqat bitta akkount ichida noyob. Payment
-- kuzatuvi boshqa userbot akkountiga o'tkazilganda yangi akkountning
-- xabar id'lari eskisinikiga to'qnashadi va eski UNIQUE (telegram_message_id)
-- haqiqiy kirimni "takror" deb jim tashlab yuboradi. Kalit endi juftlik.
--
-- NULL = bu ustundan oldingi userbot yuborgan xabar. COALESCE(…, 0) NULL'larni
-- bitta guruhga yig'adi: eski formatdagi takroriy xabar baribir to'qnashadi.
-- Telegram user id hech qachon 0 bo'lmaydi.

ALTER TABLE card_credit_observations ADD COLUMN userbot_telegram_id BIGINT;
ALTER TABLE card_credit_observations
    DROP CONSTRAINT card_credit_observations_telegram_message_id_key;
CREATE UNIQUE INDEX ux_card_credit_obs_account_message
    ON card_credit_observations (COALESCE(userbot_telegram_id, 0), telegram_message_id);

ALTER TABLE card_debit_observations ADD COLUMN userbot_telegram_id BIGINT;
ALTER TABLE card_debit_observations
    DROP CONSTRAINT card_debit_observations_telegram_message_id_key;
CREATE UNIQUE INDEX ux_card_debit_obs_account_message
    ON card_debit_observations (COALESCE(userbot_telegram_id, 0), telegram_message_id);
```

- [ ] **Step 3: Entity'larga ustun qo'shish**

`CardCreditObservation.java` da `telegramMessageId` maydonidan keyin:
```java
    /**
     * Telegram user id of the userbot account that saw the message. Message ids
     * are only unique within one account, so this is half of the idempotency
     * key. NULL on rows from the userbot that predates the field.
     */
    @Column(name = "userbot_telegram_id", updatable = false)
    private Long userbotTelegramId;
```
`telegramMessageId` ustidagi izohni ham yangilang:
```java
    /** Idempotency key together with userbotTelegramId. A Kafka redelivery collides here and credits nothing. */
```
`CardDebitObservation.java` ga xuddi shu maydon va izoh (`telegramMessageId` dan keyin).

- [ ] **Step 4: Kompilyatsiya va migratsiya ishlashini tekshirish**

Run:
```bash
cd backend/payment-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44" -Dit.test=ByCardServiceIT -Dtest=none -Dsurefire.failIfNoSpecifiedTests=false
```
Expected: PASS (Flyway V14 ishlaydi, Hibernate `validate` yangi ustunni topadi).

- [ ] **Step 5: Commit**

```bash
git add backend/payment-service/src/main/resources/db/migration/V14__observation_userbot_account.sql \
        backend/payment-service/src/main/java/uz/efbazaar/payment/observation/domain/CardCreditObservation.java \
        backend/payment-service/src/main/java/uz/efbazaar/payment/debit/domain/CardDebitObservation.java
git commit -m "feat(payment): kuzatuvlarda userbot akkounti ustuni, idempotency juftlik bo'yicha"
```

### Task 2: Event va servis idempotency'si

**Files:**
- Modify: `backend/payment-service/src/main/java/uz/efbazaar/payment/observation/service/ByCardService.java:58-77,92-95`
- Modify: `backend/payment-service/src/main/java/uz/efbazaar/payment/observation/repository/CardCreditObservationRepository.java:19`
- Modify: `backend/payment-service/src/main/java/uz/efbazaar/payment/debit/service/ByCardDebitService.java:47-68,82-84`
- Modify: `backend/payment-service/src/main/java/uz/efbazaar/payment/debit/repository/CardDebitObservationRepository.java:14`
- Test: `backend/payment-service/src/test/java/uz/efbazaar/payment/observation/ByCardServiceIT.java`
- Test: `backend/payment-service/src/test/java/uz/efbazaar/payment/debit/ByCardDebitServiceIT.java`

**Interfaces:**
- Consumes: Task 1 entity maydoni `userbotTelegramId`.
- Produces:
  - `record CardCreditEvent(Long telegramMessageId, String cardLast4, Long amountTiyin, Long cardBalanceTiyin, Instant observedAt, String rawText, Long userbotTelegramId)` + eski 6 parametrli konstruktor (`userbotTelegramId = null`).
  - `record CardDebitEvent(Long telegramMessageId, String cardLast4, Long amountTiyin, Long commissionTiyin, Long cardBalanceTiyin, String description, Instant observedAt, String rawText, Long userbotTelegramId)` + eski 8 parametrli konstruktor.
  - `Optional<CardCreditObservation> findByUserbotTelegramIdAndTelegramMessageId(Long userbotTelegramId, long telegramMessageId)`; debit repository'da xuddi shunday.

- [ ] **Step 1: Credit uchun yiqiluvchi testlar**

`ByCardServiceIT.java` ga qo'shing (fayldagi mavjud `ourCard()`/fixture uslubidan foydalaning; quyidagi kod shu fayldagi yordamchilarni nazarda tutadi — agar nomi boshqacha bo'lsa, faylni o'qib moslang, lekin assertion'larni o'zgartirmang):
```java
    private CardCreditEvent eventFrom(Long account, long messageId, String last4, long amountTiyin) {
        return new CardCreditEvent(messageId, last4, amountTiyin, 3_165_916L,
                Instant.parse("2026-10-01T10:00:00Z"), "To'ldirish ➕ karta *" + last4, account);
    }

    @Test
    void theSameMessageIdFromTwoDifferentAccountsIsTwoObservations() {
        PlatformCard card = ourCard();

        byCard.ingest(eventFrom(111L, 500L, card.getLast4(), 1_000_000L));
        byCard.ingest(eventFrom(222L, 500L, card.getLast4(), 2_000_000L));

        assertThat(observations.findAll()).hasSize(2);
    }

    @Test
    void aRedeliveryFromTheSameAccountIsIngestedOnce() {
        PlatformCard card = ourCard();

        byCard.ingest(eventFrom(111L, 501L, card.getLast4(), 1_000_000L));
        byCard.ingest(eventFrom(111L, 501L, card.getLast4(), 1_000_000L));

        assertThat(observations.findAll()).hasSize(1);
    }

    @Test
    void aLegacyEventWithoutAnAccountIsStillIdempotent() {
        PlatformCard card = ourCard();

        byCard.ingest(eventFrom(null, 502L, card.getLast4(), 1_000_000L));
        byCard.ingest(eventFrom(null, 502L, card.getLast4(), 1_000_000L));

        assertThat(observations.findAll()).hasSize(1);
        assertThat(observations.findAll().get(0).getUserbotTelegramId()).isNull();
    }

    @Test
    void aLegacyRowDoesNotSwallowANewAccountsMessageWithTheSameId() {
        PlatformCard card = ourCard();

        byCard.ingest(eventFrom(null, 503L, card.getLast4(), 1_000_000L));
        byCard.ingest(eventFrom(111L, 503L, card.getLast4(), 1_000_000L));

        assertThat(observations.findAll()).hasSize(2);
    }
```

- [ ] **Step 2: Testlar yiqilishini tekshirish**

Run:
```bash
cd backend/payment-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44" -Dit.test=ByCardServiceIT -Dtest=none -Dsurefire.failIfNoSpecifiedTests=false
```
Expected: kompilyatsiya xatosi — `CardCreditEvent` 7 argumentli konstruktorga ega emas.

- [ ] **Step 3: Credit event, repository va servis**

`ByCardService.java` dagi record:
```java
    /**
     * @param userbotTelegramId Telegram user id of the account that saw the
     *        message; null from a userbot that predates the field. Message ids
     *        are per-account, so this is half of the idempotency key.
     */
    public record CardCreditEvent(
            Long telegramMessageId,
            String cardLast4,
            Long amountTiyin,
            Long cardBalanceTiyin,
            Instant observedAt,
            String rawText,
            Long userbotTelegramId) {

        /** The pre-userbot-panel shape; in-process callers and tests that do not care about the account. */
        public CardCreditEvent(Long telegramMessageId, String cardLast4, Long amountTiyin,
                               Long cardBalanceTiyin, Instant observedAt, String rawText) {
            this(telegramMessageId, cardLast4, amountTiyin, cardBalanceTiyin, observedAt, rawText, null);
        }
    }
```
`ingest` boshida:
```java
        Optional<CardCreditObservation> seen = observations.findByUserbotTelegramIdAndTelegramMessageId(
                event.userbotTelegramId(), event.telegramMessageId());
        if (seen.isPresent()) {
            log.debug("Telegram message {} from account {} already ingested",
                    event.telegramMessageId(), event.userbotTelegramId());
            return seen.get();
        }
```
Builder'da `.telegramMessageId(event.telegramMessageId())` dan keyin `.userbotTelegramId(event.userbotTelegramId())`.

`CardCreditObservationRepository.java:19` dagi metodni almashtiring:
```java
    /** Spring Data turns a null userbotTelegramId into IS NULL, which is what legacy rows need. */
    Optional<CardCreditObservation> findByUserbotTelegramIdAndTelegramMessageId(
            Long userbotTelegramId, long telegramMessageId);
```
Keyin eski `findByTelegramMessageId` ni boshqa joy ishlatmasligini tekshiring:
```bash
grep -rn "findByTelegramMessageId" backend/payment-service/src
```
Testlarda ishlatilsa, ularni `findByUserbotTelegramIdAndTelegramMessageId(null, id)` ga o'zgartiring.

- [ ] **Step 4: Credit testlari o'tishini tekshirish**

Run: Step 2 dagi buyruq.
Expected: PASS (yangi 4 test va mavjudlari).

- [ ] **Step 5: Debit uchun yiqiluvchi testlar**

`ByCardDebitServiceIT.java` ga:
```java
    private CardDebitEvent eventFrom(Long account, long messageId, String last4, long amountTiyin) {
        return new CardDebitEvent(messageId, last4, amountTiyin, 0L, 4_400_000L,
                "Openbank P2P HUMO OT", OBSERVED_AT, "💸 Amaliyot ➖ 10.000,00 UZS", account);
    }

    @Test
    void theSameMessageIdFromTwoDifferentAccountsIsTwoDebits() {
        PlatformCard card = ourCard();

        debits.ingest(eventFrom(111L, 600L, card.getLast4(), 1_000_000L));
        debits.ingest(eventFrom(222L, 600L, card.getLast4(), 1_000_000L));

        assertThat(repo.findAll()).hasSize(2);
    }

    @Test
    void aDebitRedeliveryFromTheSameAccountIsRecordedOnce() {
        PlatformCard card = ourCard();

        debits.ingest(eventFrom(111L, 601L, card.getLast4(), 1_000_000L));
        debits.ingest(eventFrom(111L, 601L, card.getLast4(), 1_000_000L));

        assertThat(repo.findAll()).hasSize(1);
        assertThat(repo.findAll().get(0).getUserbotTelegramId()).isEqualTo(111L);
    }

    @Test
    void aLegacyDebitWithoutAnAccountIsStillIdempotent() {
        PlatformCard card = ourCard();

        debits.ingest(eventFrom(null, 602L, card.getLast4(), 1_000_000L));
        debits.ingest(eventFrom(null, 602L, card.getLast4(), 1_000_000L));

        assertThat(repo.findAll()).hasSize(1);
    }
```

- [ ] **Step 6: Yiqilishini tekshirish**

Run:
```bash
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44" -Dit.test=ByCardDebitServiceIT -Dtest=none -Dsurefire.failIfNoSpecifiedTests=false
```
Expected: kompilyatsiya xatosi — 9 argumentli `CardDebitEvent` yo'q.

- [ ] **Step 7: Debit event, repository va servis**

`ByCardDebitService.java` dagi record:
```java
    /** @param userbotTelegramId see {@link uz.efbazaar.payment.observation.service.ByCardService.CardCreditEvent} */
    public record CardDebitEvent(
            Long telegramMessageId,
            String cardLast4,
            Long amountTiyin,
            Long commissionTiyin,
            Long cardBalanceTiyin,
            String description,
            Instant observedAt,
            String rawText,
            Long userbotTelegramId) {

        public CardDebitEvent(Long telegramMessageId, String cardLast4, Long amountTiyin,
                              Long commissionTiyin, Long cardBalanceTiyin, String description,
                              Instant observedAt, String rawText) {
            this(telegramMessageId, cardLast4, amountTiyin, commissionTiyin, cardBalanceTiyin,
                    description, observedAt, rawText, null);
        }
    }
```
`ingest` boshida:
```java
        Optional<CardDebitObservation> seen = debits.findByUserbotTelegramIdAndTelegramMessageId(
                event.userbotTelegramId(), event.telegramMessageId());
        if (seen.isPresent()) {
            log.debug("Telegram message {} from account {} already ingested",
                    event.telegramMessageId(), event.userbotTelegramId());
            return seen.get();
        }
```
Builder'ga `.userbotTelegramId(event.userbotTelegramId())`.

`CardDebitObservationRepository.java:14`:
```java
    /** Spring Data turns a null userbotTelegramId into IS NULL, which is what legacy rows need. */
    Optional<CardDebitObservation> findByUserbotTelegramIdAndTelegramMessageId(
            Long userbotTelegramId, long telegramMessageId);
```

- [ ] **Step 8: O'tishini tekshirish**

Run: Step 6 dagi buyruq. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/payment-service/src
git commit -m "feat(payment): kuzatuv idempotency'si (akkount, xabar) juftligi bo'yicha"
```

### Task 3: Bare-JSON consumer testi va hujjatlar

**Files:**
- Test: `backend/payment-service/src/test/java/uz/efbazaar/payment/kafka/CardCreditConsumerIT.java`
- Test: `backend/payment-service/src/test/java/uz/efbazaar/payment/kafka/CardDebitConsumerIT.java`
- Modify: `backend/payment-service/README.md` (payload jadvali)
- Modify: `humo-userbot/README.md` (payload jadvalidagi misol — maydon hali yuborilmaydi, faqat izoh)
- Modify: `docs/kafka-topics.md:107-108`

**Interfaces:**
- Consumes: Task 2 record'lari.

- [ ] **Step 1: Yiqiluvchi consumer testi (credit)**

`CardCreditConsumerIT.java` ga mavjud `aBareJsonCardCreditFromTheNonJavaProducerCreditsTheWallet` testining nusxasi sifatida (shu fayldagi `publishRaw`, `allocator`, `observations` ishlatiladi):
```java
    @Test
    void theAccountIdInBareJsonReachesTheObservation() {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);

        publishRaw(("""
                {"telegramMessageId":77002,"cardLast4":"0101","amountTiyin":%d,\
                "cardBalanceTiyin":3165916,"observedAt":"2026-08-10T20:41:00Z",\
                "rawText":"Xaridingiz uchun rahmat! Karta *0101","userbotTelegramId":5550001}"""
                .formatted(inv.getTransferAmountTiyin()))
                .getBytes(StandardCharsets.UTF_8));

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() ->
                assertThat(observations.findByUserbotTelegramIdAndTelegramMessageId(5550001L, 77002L))
                        .hasValueSatisfying(o -> assertThat(o.getStatus()).isEqualTo(ObservationStatus.MATCHED)));
    }
```
(`ObservationStatus` dagi muvaffaqiyatli holat nomi faylda boshqacha bo'lsa — mavjud testdagi assertion'dan oling.)

Mavjud testdagi `observations.findByTelegramMessageId(...)` chaqiruvlari bo'lsa, ularni `findByUserbotTelegramIdAndTelegramMessageId(null, ...)` ga o'zgartiring.

- [ ] **Step 2: Debit consumer testi**

`CardDebitConsumerIT.java` dagi mavjud bare-JSON testini nusxalab, JSON'ga `"userbotTelegramId":5550001` qo'shing va assertion'ni `repo.findByUserbotTelegramIdAndTelegramMessageId(5550001L, <shu testdagi id>)` ning `isPresent()` ga qarating.

- [ ] **Step 3: Consumer testlari va butun modulni ishga tushirish**

Run:
```bash
cd backend/payment-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"
```
Expected: barcha unit va IT testlar PASS. Agar Jackson record'ni o'qiy olmasa (`Conflicting property-based creators`), canonical konstruktorni record ichida aniq yozib, unga `@com.fasterxml.jackson.annotation.JsonCreator` qo'ying va qayta ishga tushiring.

- [ ] **Step 4: Hujjatlar**

`docs/kafka-topics.md` 107–108 qatorlaridan keyin izoh:
```markdown
`card-credit-observed` va `card-debit-observed` payload'larida ixtiyoriy `userbotTelegramId` (Long) —
kuzatgan Telegram akkountining id'si. Idempotency kaliti `(userbotTelegramId, telegramMessageId)`:
xabar id'lari faqat bitta akkount ichida noyob. Maydonsiz xabar eski userbotdan, `NULL` sifatida saqlanadi.
```
`backend/payment-service/README.md` dagi payload jadvali/misoliga `"userbotTelegramId": 5550001` va bir qatorli tushuntirish qo'shing (fayldagi mavjud jadval formatida). `humo-userbot/README.md` "What it publishes" jadvaliga: `userbotTelegramId` hozircha yuborilmaydi, userbot-service rejasida qo'shiladi.

- [ ] **Step 5: Commit**

```bash
git add backend/payment-service docs/kafka-topics.md humo-userbot/README.md
git commit -m "test(payment): bare JSON'dagi userbotTelegramId kuzatuvga yetadi; hujjatlar"
```

### Task 4: To'liq CI-ekvivalent tekshiruv

- [ ] **Step 1: AGENTS.md dagi payment-service tekshiruv buyruqlarini ishga tushirish**

Run:
```bash
cd /home/mukhiddinov/IdeaProjects/ef-bazaar
grep -n "payment" AGENTS.md
```
Ko'rsatilgan barcha buyruqlarni (build, verify, migration guard) ishga tushiring. `git fetch && git rebase origin/main` dan keyin yana bir marta `mvn verify` (CI birlashtirilgan holatni quradi).
Expected: hammasi yashil; migration guard V14 ni yangi fayl sifatida qabul qiladi.
