# Recommendation A: marketplace tayyorgarligi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** marketplace-service recommendation-service uchun kerak bo'lgan hamma narsani chiqaradi — outbox orqali listing, like va karta snapshot'lari, "Katta bozor" `value_score` tartibi, `POST /listings/ranked` va replay — foydalanuvchi uchun hozirgi xatti-harakatni o'zgartirmasdan.

**Architecture:** marketplace `uz.efbazaar:outbox` kutubxonasini ulaydi. Snapshot'lar Postgres trigger'lari bilan `outbox_snapshot_pending` ga belgilanadi (bulk UPDATE'lar ham ushlanadi), relay esa marketplace'dagi `SnapshotSource` bean'lari orqali hozirgi holatni quradi. Kartalar `efbazaar` bazasida bo'lgani uchun ularning belgisi kod orqali, marketplace tranzaksiyasida qo'yiladi. `value_score` e'lon saqlanganda, META o'zgarganda va kunlik chegara job'ida qayta hisoblanadi; ustun yangilanishi trigger orqali yangi listing snapshot'ini keltirib chiqaradi.

**Tech Stack:** Java 21, Spring Boot 3.3.4, Spring Data JPA, JdbcTemplate, Flyway, PostgreSQL 16 (PL/pgSQL trigger), Kafka, Testcontainers 1.20.3, JUnit 5.

**Spec:** `docs/superpowers/specs/2026-09-30-recommendation-service-design.md` (§5, §7 1-bosqich); outbox: `docs/superpowers/specs/2026-09-30-transactional-outbox-design.md`.

## Global Constraints

- Topiclar: `efbazaar.marketplace.listing-snapshot` (kalit `listingId`), `efbazaar.marketplace.card-snapshot` (kalit `efhubId`), `efbazaar.marketplace.like-toggled` (kalit `listingId`).
- Snapshot source nomlari: `listing`, `card`, `like`. Like entity id: `<userId>:<listingId>`.
- `version` — `outbox_snapshot_version_seq` dan; `idempotencyKey` = `<source>:<entityId>:<version>`.
- `value_score` formulasi va konstantalari (hammasi `application.yml` da, `app.recommendation.value-score.*`):
  `karta_ball = max(0, overall_rating − 80) / 20 × tier_koef`; `tier_koef = NORMAL: 1.0 | faol META: 2.0 + 0.25 × meta_priority`;
  `kartalar_kuchi = min(1, Σ karta_ball / 15)`; `narx_ulushi = min(1, ln(narx / 5 000) / ln(50 000 000 / 5 000))` (narx ≤ 5 000 → 0);
  `value_score = 0.5 × narx_ulushi + 0.5 × kartalar_kuchi`.
- "Faol META": `meta_tier = 'META'` va `meta_active_from` null yoki ≤ hozir va `meta_active_until` null yoki > hozir.
- `POST /listings/ranked`: `ids` ≤ 1000, tartib saqlanadi, faqat `ACTIVE`, javob `PageResponse<ListingResponse>`.
- Flyway: yangi fayllar `V71`, `V72`, `V73` (origin/main'dagi oxirgisi `V70` — boshlashdan oldin `sort -V` va `origin/main` bilan qayta tekshiring). Mavjud V-fayllarga tegilmaydi.
- Mavjud topiclar (`listing-created/updated/deleted`, `cards-added`) va ularning publisher'lari o'zgarmaydi.
- Java: `JAVA_HOME=~/.jdks/openjdk-21.0.2`, Testcontainers uchun `-DargLine="-Dapi.version=1.44"`; kutubxonani avval `mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests`.
- GitHub Actions hozir ishlamaydi (billing) — har task'ning tekshiruvi lokal, yakunda CI bilan bir xil to'liq `mvn verify`.
- Commit xabarlarida Claude imzosi yo'q.

## Review Focus

1. Admin META'ni o'zgartiradi, `efbazaar` UPDATE muvaffaqiyatli, lekin marketplace tranzaksiyasi (value_score + belgi) yiqiladi — admin xato ko'rishi va qayta urinishi mumkin bo'lishi kerak; qayta urinish zararsiz (Task 7 da test).
2. `publish`/`markSnapshot` boshqa DataSource'ning tranzaksiyasi ichida (`CardSearchService.atomic` kabi) chaqiriladi — jim atomik bo'lmagan yozuv emas, xato bo'lishi kerak (Task 1 da test).
3. E'lon narxi 5 000 so'mdan past yoki kartasiz — `value_score` 0 bo'ladi, NaN/manfiy emas; `?sort=valueScore,desc` da `value_score` hali hisoblanmagan (null) e'lonlar oxirida (Task 5 va 8 da test).
4. `POST /listings/ranked` ga takroriy ID, mavjud bo'lmagan ID, 1000 dan ortiq ID yuboriladi — takror bir marta chiqadi, yo'g'i jim tushadi, 1000+ esa 400 (Task 9 da test).
5. Like bosiladi va darhol olib tashlanadi — oxirgi like-toggled `liked=false` bo'lishi kerak, oraliq holat muhim emas (Task 4 da test).

---

## File Structure

```
backend/libs/outbox/src/main/java/uz/efbazaar/outbox/
  internal/DefaultOutbox.java            — o'z DataSource'i tranzaksiyaga bog'langanini tekshiradi
  OutboxAutoConfiguration.java           — @ConditionalOnBean(ProducerFactory)
backend/marketplace-service/
  pom.xml                                — uz.efbazaar:outbox
  src/main/resources/application.yml     — app.recommendation.*, outbox.*
  src/main/resources/db/migration/
    V71__outbox.sql                      — outbox jadvallari
    V72__listing_value_score.sql         — listings.value_score + indeks
    V73__recommendation_snapshot_triggers.sql
  src/main/java/uz/efbazaar/marketplace/recommendation/
    RecommendationTopics.java            — topic va source nomlari
    RecommendationSnapshots.java         — payload record'lari
    CardFacts.java                       — kartaning reyting/META/o'yinchi ma'lumoti
    CardCatalogReader.java               — efbazaar'dan CardFacts o'qish
    ListingSnapshotSource.java, LikeSnapshotSource.java, CardSnapshotSource.java
    ValueScoreProperties.java, ValueScoreCalculator.java, ListingValueScorer.java
    ValueScoreBackfill.java              — startup'da null qatorlarni to'ldiradi
    CardChangeHandler.java               — META/sync'dan keyin: value_score + karta belgisi
    MetaBoundaryJob.java                 — kunlik META muddati chegaralari
    RecommendationReplayService.java, InternalRecommendationController.java
    RankedListingsRequest.java
  service/ListingPersistence.java        — saqlagandan keyin value_score
  service/LikeService.java               — like-toggled endi trigger orqali
  event/MarketplaceEventPublisher.java   — likeToggled olib tashlanadi
  domain/Listing.java                    — valueScore (faqat o'qish)
  service/ListingService.java            — valueScore sort barqarorligi, ranked()
  controller/ListingController.java      — POST /listings/ranked
  cards/AdminCardController.java         — META'dan keyin CardChangeHandler
  cards/sync/EfhubSyncService.java       — yangi kartalardan keyin CardChangeHandler
  src/test/java/uz/efbazaar/marketplace/MarketplaceApplicationTests.java — @MockBean Outbox
backend/marketplace-service/README.md, docs/kafka-topics.md, spec — hujjat
```

---

### Task 1: Kutubxona — to'g'ri DataSource tranzaksiyasi va ProducerFactory sharti

**Files:**
- Modify: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/internal/DefaultOutbox.java`
- Modify: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/OutboxAutoConfiguration.java`
- Test: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/it/OutboxPublishIT.java`
- Test: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/OutboxDisabledTest.java`

**Interfaces:**
- Produces: `DefaultOutbox(OutboxRepository repo, MessageEncoder encoder, Runnable wake, javax.sql.DataSource dataSource)`. `publish`/`markSnapshot` — `TransactionSynchronizationManager.hasResource(dataSource)` bo'lmasa `IllegalTransactionStateException`.
- Auto-config faqat `JdbcTemplate` **va** `ProducerFactory` bean'lari bo'lsa ishlaydi.

- [ ] **Step 1: Yiqiladigan testlar**

`OutboxPublishIT.java` oxiriga:
```java
    @Test
    void transactionOnAnotherDataSourceIsRejected() {
        // CardSearchService.atomic() kabi: boshqa DataSource ustida ochilgan tranzaksiya "faol",
        // lekin outbox yozuvi asosiy bazaga atomik bo'lmay tushardi.
        javax.sql.DataSource other = new org.springframework.jdbc.datasource.DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        TransactionTemplate otherTx = new TransactionTemplate(
                new org.springframework.jdbc.datasource.DataSourceTransactionManager(other));

        assertThatThrownBy(() -> otherTx.executeWithoutResult(s -> outbox.publish("t", "k", Map.of("a", 1))))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThatThrownBy(() -> otherTx.executeWithoutResult(s -> outbox.markSnapshot("listing", "L1")))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events", Long.class)).isZero();
    }
```

`OutboxDisabledTest.java` ga:
```java
    @Test
    void noBeansWithoutKafkaProducerFactory() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(DataSourceAutoConfiguration.class,
                        JdbcTemplateAutoConfiguration.class, OutboxAutoConfiguration.class))
                .withPropertyValues("spring.datasource.url=jdbc:postgresql://localhost:1/none")
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    assertThat(ctx).doesNotHaveBean(Outbox.class);
                });
    }
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dtest=OutboxDisabledTest -Dit.test=OutboxPublishIT -DargLine="-Dapi.version=1.44"`
Expected: `noBeansWithoutKafkaProducerFactory` — kontekst yiqiladi (`ProducerFactory` topilmadi); `transactionOnAnotherDataSourceIsRejected` — exception tashlanmaydi.

- [ ] **Step 3: Implementatsiya**

`DefaultOutbox.java`:
```java
package uz.efbazaar.outbox.internal;

import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import uz.efbazaar.outbox.Outbox;

import javax.sql.DataSource;

public class DefaultOutbox implements Outbox {

    private final OutboxRepository repo;
    private final MessageEncoder encoder;
    private final Runnable wake;
    private final DataSource dataSource;

    public DefaultOutbox(OutboxRepository repo, MessageEncoder encoder, Runnable wake, DataSource dataSource) {
        this.repo = repo;
        this.encoder = encoder;
        this.wake = wake;
        this.dataSource = dataSource;
    }

    @Override
    public void publish(String topic, String key, Object payload) {
        requireTransaction("publish");
        EncodedMessage message = encoder.encode(topic, payload);
        repo.insert(topic, key, message.payload(), message.headersJson());
        wakeAfterCommit();
    }

    @Override
    public void markSnapshot(String source, String entityId) {
        requireTransaction("markSnapshot");
        repo.mark(source, entityId);
        wakeAfterCommit();
    }

    /**
     * Faol tranzaksiya yetarli emas — u AYNAN outbox bazasi ustida bo'lishi kerak. Boshqa
     * DataSource tranzaksiyasi ichida yozuv autocommit bo'lib, biznes o'zgarishidan ajralib qolardi.
     */
    private void requireTransaction(String operation) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.hasResource(dataSource)) {
            throw new IllegalTransactionStateException(
                    "Outbox." + operation + " faqat outbox bazasi ustidagi faol tranzaksiya ichida chaqiriladi");
        }
    }

    private void wakeAfterCommit() {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                wake.run();
            }
        });
    }
}
```

`OutboxAutoConfiguration.java` — sinf izohlari ostiga `@ConditionalOnBean(ProducerFactory.class)` qo'shing (mavjud `@ConditionalOnBean(JdbcTemplate.class)` ni `@ConditionalOnBean({JdbcTemplate.class, ProducerFactory.class})` ga almashtiring) va `outbox` bean'ini:
```java
    @Bean
    Outbox outbox(OutboxRepository repo, MessageEncoder encoder, OutboxRelay relay, JdbcTemplate jdbc) {
        return new DefaultOutbox(repo, encoder, relay::wake, jdbc.getDataSource());
    }
```

- [ ] **Step 4: Butun kutubxona testlari**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp clean install -DargLine="-Dapi.version=1.44"`
Expected: barcha testlar PASS (JPA/`DataSourceTransactionManager` ikkalasi ham DataSource'ni bog'laydi — mavjud testlar o'tishi kerak); kutubxona lokal repoga o'rnatiladi.

- [ ] **Step 5: Commit**

```bash
git add backend/libs/outbox
git commit -m "fix(outbox): boshqa DataSource tranzaksiyasi rad etiladi; Kafka'siz kontekstda o'chadi"
```

---

### Task 2: marketplace — kutubxonani ulash va outbox jadvallari

**Files:**
- Modify: `backend/marketplace-service/pom.xml`
- Create: `backend/marketplace-service/src/main/resources/db/migration/V71__outbox.sql`
- Modify: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/MarketplaceApplicationTests.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/recommendation/OutboxMigrationIT.java`

**Interfaces:**
- Produces: marketplace kontekstida `uz.efbazaar.outbox.Outbox` bean'i; jadvallar `outbox_events`, `outbox_snapshot_pending`, sequence `outbox_snapshot_version_seq`.

- [ ] **Step 1: Yiqiladigan migratsiya testi**

`OutboxMigrationIT.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
class OutboxMigrationIT {

    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void createsOutboxTablesIdenticalToTheLibrarySchema() throws Exception {
        JdbcTemplate jdbc = new JdbcTemplate(new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
        jdbc.execute(Files.readString(Path.of("src/main/resources/db/migration/V71__outbox.sql")));

        assertThat(jdbc.queryForList("""
                SELECT column_name FROM information_schema.columns
                 WHERE table_name = 'outbox_events' ORDER BY ordinal_position
                """, String.class))
                .containsExactly("id", "topic", "message_key", "payload", "headers", "created_at",
                        "published_at", "attempts", "last_error", "parked_at");
        assertThat(jdbc.queryForObject("SELECT nextval('outbox_snapshot_version_seq')", Long.class)).isEqualTo(1L);
        jdbc.update("INSERT INTO outbox_snapshot_pending (source, entity_id) VALUES ('listing', 'x')");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isEqualTo(1L);
    }
}
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dtest=NoSuch -Dsurefire.failIfNoSpecifiedTests=false -Dit.test=OutboxMigrationIT -DargLine="-Dapi.version=1.44"`
Expected: FAIL — `NoSuchFileException: ...V71__outbox.sql`.

- [ ] **Step 3: Migratsiya, dependency, test konteksti**

`V71__outbox.sql` — `backend/libs/outbox/src/main/resources/uz/efbazaar/outbox/outbox-schema.sql` ning **aynan nusxasi** (izoh bilan):
```sql
-- Transactional outbox (uz.efbazaar:outbox). Manba: backend/libs/outbox/.../outbox-schema.sql.
-- Kutubxona sxemasi o'zgarsa — shu faylni emas, yangi V-migratsiyani yozing.
CREATE TABLE IF NOT EXISTS outbox_events (
    id           BIGSERIAL PRIMARY KEY,
    topic        TEXT        NOT NULL,
    message_key  TEXT,
    payload      BYTEA       NOT NULL,
    headers      JSONB       NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    attempts     INT         NOT NULL DEFAULT 0,
    last_error   TEXT,
    parked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS outbox_events_pending_idx
    ON outbox_events (id) WHERE published_at IS NULL AND parked_at IS NULL;

CREATE TABLE IF NOT EXISTS outbox_snapshot_pending (
    source    TEXT        NOT NULL,
    entity_id TEXT        NOT NULL,
    marked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (source, entity_id)
);
CREATE SEQUENCE IF NOT EXISTS outbox_snapshot_version_seq;
```
(Yozishdan oldin kutubxona faylini o'qib, ustunlar bir xilligini tekshiring.)

`pom.xml` `<dependencies>` ga:
```xml
        <dependency>
            <groupId>uz.efbazaar</groupId>
            <artifactId>outbox</artifactId>
            <version>1.0.0-SNAPSHOT</version>
        </dependency>
```

`MarketplaceApplicationTests.java` — boshqa `@MockBean` lar qatoriga:
```java
    @MockBean uz.efbazaar.outbox.Outbox outbox;
```
(Bu test Kafka auto-config'ini o'chiradi, shuning uchun Task 1 dagi shart bilan outbox bean'i yaratilmaydi; keyingi task'larda `Outbox` ga bog'liq bean'lar paydo bo'ladi.)

- [ ] **Step 4: Testlar**

Run:
```bash
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests
cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dtest=MarketplaceApplicationTests -Dit.test=OutboxMigrationIT -DargLine="-Dapi.version=1.44"
```
Expected: ikkalasi PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/marketplace-service/pom.xml backend/marketplace-service/src/main/resources/db/migration/V71__outbox.sql backend/marketplace-service/src/test
git commit -m "feat(marketplace): outbox kutubxonasi va jadvallari"
```

---

### Task 3: `value_score` ustuni va snapshot trigger'lari

**Files:**
- Create: `backend/marketplace-service/src/main/resources/db/migration/V72__listing_value_score.sql`
- Create: `backend/marketplace-service/src/main/resources/db/migration/V73__recommendation_snapshot_triggers.sql`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/recommendation/SnapshotTriggersMigrationIT.java`

**Interfaces:**
- Produces: `listings.value_score DOUBLE PRECISION NULL`; belgilar: `('listing', listings.id::text)`, `('like', user_id || ':' || listing_id)`.

- [ ] **Step 1: Yiqiladigan test**

`SnapshotTriggersMigrationIT.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
class SnapshotTriggersMigrationIT {

    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;

    @BeforeEach
    void schema() throws Exception {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);
        tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        jdbc.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
        jdbc.execute("""
                CREATE TABLE listings (
                    id UUID PRIMARY KEY, seller_id UUID NOT NULL, status VARCHAR(16) NOT NULL,
                    price NUMERIC(19,2) NOT NULL, description TEXT);
                CREATE TABLE listing_cards (
                    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
                    efhub_id BIGINT NOT NULL, player_id UUID NOT NULL, ordinal SMALLINT NOT NULL,
                    snapshot JSONB NOT NULL, PRIMARY KEY (listing_id, efhub_id));
                CREATE TABLE listing_likes (
                    id UUID PRIMARY KEY, listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL, UNIQUE (listing_id, user_id));
                """);
        for (String f : List.of("V71__outbox.sql", "V72__listing_value_score.sql",
                "V73__recommendation_snapshot_triggers.sql")) {
            jdbc.execute(Files.readString(Path.of("src/main/resources/db/migration/" + f)));
        }
    }

    private List<String> marks(String source) {
        return jdbc.queryForList("SELECT entity_id FROM outbox_snapshot_pending WHERE source = ? ORDER BY entity_id",
                String.class, source);
    }

    private void clear() {
        jdbc.execute("TRUNCATE outbox_snapshot_pending");
    }

    private UUID listing(UUID seller) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO listings VALUES (?, ?, 'ACTIVE', 100000, 'd')", id, seller);
        return id;
    }

    @Test
    void insertAndRelevantUpdatesMarkTheListing() {
        UUID id = listing(UUID.randomUUID());
        assertThat(marks("listing")).containsExactly(id.toString());

        clear();
        jdbc.update("UPDATE listings SET description = 'only text' WHERE id = ?", id);
        assertThat(marks("listing")).isEmpty();

        for (String sql : List.of("UPDATE listings SET price = 200000 WHERE id = ?",
                "UPDATE listings SET status = 'SOLD' WHERE id = ?",
                "UPDATE listings SET value_score = 0.5 WHERE id = ?")) {
            clear();
            jdbc.update(sql, id);
            assertThat(marks("listing")).as(sql).containsExactly(id.toString());
        }
    }

    @Test
    void bulkStatusUpdateMarksEveryRow() {
        UUID seller = UUID.randomUUID();
        UUID a = listing(seller);
        UUID b = listing(seller);
        clear();

        // TrustService.retagBySellerAndStatus bilan bir xil shakl
        jdbc.update("UPDATE listings SET status = 'BLOCKED' WHERE seller_id = ? AND status = 'ACTIVE'", seller);

        assertThat(marks("listing")).containsExactlyInAnyOrder(a.toString(), b.toString());
    }

    @Test
    void cardInventoryChangesMarkTheListing() {
        UUID id = listing(UUID.randomUUID());
        clear();
        jdbc.update("INSERT INTO listing_cards VALUES (?, 89001, ?, 0, '{}')", id, UUID.randomUUID());
        assertThat(marks("listing")).containsExactly(id.toString());
        clear();
        jdbc.update("DELETE FROM listing_cards WHERE listing_id = ?", id);
        assertThat(marks("listing")).containsExactly(id.toString());
    }

    @Test
    void likeAndUnlikeMarkTheLikePair() {
        UUID id = listing(UUID.randomUUID());
        UUID user = UUID.randomUUID();
        clear();
        jdbc.update("INSERT INTO listing_likes VALUES (?, ?, ?)", UUID.randomUUID(), id, user);
        assertThat(marks("like")).containsExactly(user + ":" + id);
        clear();
        jdbc.update("DELETE FROM listing_likes WHERE listing_id = ? AND user_id = ?", id, user);
        assertThat(marks("like")).containsExactly(user + ":" + id);
    }

    @Test
    void rolledBackChangeLeavesNoMark() {
        tx.executeWithoutResult(s -> {
            listing(UUID.randomUUID());
            s.setRollbackOnly();
        });
        assertThat(marks("listing")).isEmpty();
    }

    @Test
    void repeatedChangeRefreshesMarkedAt() throws Exception {
        UUID id = listing(UUID.randomUUID());
        java.sql.Timestamp first = jdbc.queryForObject(
                "SELECT marked_at FROM outbox_snapshot_pending WHERE entity_id = ?", java.sql.Timestamp.class, id.toString());
        Thread.sleep(5);
        jdbc.update("UPDATE listings SET price = 300000 WHERE id = ?", id);
        java.sql.Timestamp second = jdbc.queryForObject(
                "SELECT marked_at FROM outbox_snapshot_pending WHERE entity_id = ?", java.sql.Timestamp.class, id.toString());
        assertThat(second).isAfter(first);
    }
}
```

`repeatedChangeRefreshesMarkedAt` muhim: relay yuborayotgan paytda kelgan o'zgarish belgini **yangilashi** kerak (`marked_at <= seen` qo'riqchisi shunga tayanadi). Spec §5.1 dagi "ON CONFLICT DO NOTHING" shu sababli `DO UPDATE SET marked_at = clock_timestamp()` bo'ladi (kutubxonaning `mark()` bilan bir xil).

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dtest=NoSuch -Dsurefire.failIfNoSpecifiedTests=false -Dit.test=SnapshotTriggersMigrationIT -DargLine="-Dapi.version=1.44"`
Expected: FAIL — `NoSuchFileException: ...V72__listing_value_score.sql`.

- [ ] **Step 3: Migratsiyalar**

`V72__listing_value_score.sql`:
```sql
-- "Katta bozor" tartibi: narx + kartalar kuchi + META (formula: ValueScoreCalculator).
-- NULL — hali hisoblanmagan; ValueScoreBackfill startup'da to'ldiradi, sort'da oxirida turadi.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS value_score DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS idx_listings_value_score
    ON listings (value_score DESC NULLS LAST, id) WHERE status = 'ACTIVE';
```

`V73__recommendation_snapshot_triggers.sql`:
```sql
-- Recommendation snapshot'lari uchun belgilar (uz.efbazaar:outbox snapshot rejimi).
-- Trigger — Java'dagi har qanday yo'lni, jumladan bulk UPDATE'larni (TrustService, user-deleted)
-- ushlaydi. Belgi shu tranzaksiyada qo'yiladi; relay hozirgi holatni SnapshotSource orqali quradi.
-- marked_at yangilanadi (DO NOTHING emas): relay yuborayotgan paytdagi o'zgarish yo'qolmasin.

CREATE OR REPLACE FUNCTION rec_mark(p_source TEXT, p_entity TEXT) RETURNS void AS $$
BEGIN
    INSERT INTO outbox_snapshot_pending (source, entity_id)
    VALUES (p_source, p_entity)
    ON CONFLICT (source, entity_id) DO UPDATE SET marked_at = clock_timestamp();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rec_mark_listing() RETURNS trigger AS $$
BEGIN
    PERFORM rec_mark('listing', NEW.id::text);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rec_mark_listing_cards() RETURNS trigger AS $$
BEGIN
    PERFORM rec_mark('listing', COALESCE(NEW.listing_id, OLD.listing_id)::text);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rec_mark_like() RETURNS trigger AS $$
BEGIN
    PERFORM rec_mark('like', COALESCE(NEW.user_id, OLD.user_id)::text || ':'
                             || COALESCE(NEW.listing_id, OLD.listing_id)::text);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_rec_snapshot
    AFTER INSERT OR UPDATE OF status, price, seller_id, value_score ON listings
    FOR EACH ROW EXECUTE FUNCTION rec_mark_listing();

CREATE TRIGGER listing_cards_rec_snapshot
    AFTER INSERT OR DELETE ON listing_cards
    FOR EACH ROW EXECUTE FUNCTION rec_mark_listing_cards();

CREATE TRIGGER listing_likes_rec_snapshot
    AFTER INSERT OR DELETE ON listing_likes
    FOR EACH ROW EXECUTE FUNCTION rec_mark_like();
```

- [ ] **Step 4: Testlar**

Run: Step 2 buyrug'i. Expected: 6 test PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/marketplace-service/src/main/resources/db/migration/V72__listing_value_score.sql backend/marketplace-service/src/main/resources/db/migration/V73__recommendation_snapshot_triggers.sql backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/recommendation/SnapshotTriggersMigrationIT.java
git commit -m "feat(marketplace): value_score ustuni va recommendation snapshot trigger'lari"
```

---

### Task 4: Listing va like snapshot manbalari; like-toggled trigger orqali

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/RecommendationTopics.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/RecommendationSnapshots.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/ListingSnapshotSource.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/LikeSnapshotSource.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/LikeService.java` (`events.likeToggled(...)` qatori olib tashlanadi)
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/event/MarketplaceEventPublisher.java` (`likeToggled` metodi olib tashlanadi)
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/recommendation/SnapshotSourcesIT.java`

**Interfaces:**
- Consumes: `uz.efbazaar.outbox.SnapshotSource` (`source()`, `topic()`, `key(String)`, `Optional<Object> build(String entityId, long version)`).
- Produces:
  - `RecommendationTopics`: `LISTING_SNAPSHOT = "efbazaar.marketplace.listing-snapshot"`, `CARD_SNAPSHOT = "efbazaar.marketplace.card-snapshot"`, `LIKE_TOGGLED = MarketplaceEvents.TOPIC_LIKE_TOGGLED`, `SOURCE_LISTING = "listing"`, `SOURCE_CARD = "card"`, `SOURCE_LIKE = "like"`, `static String idempotencyKey(String source, String entityId, long version)`.
  - `RecommendationSnapshots.ListingSnapshot(String idempotencyKey, UUID listingId, UUID sellerId, String status, BigDecimal price, Double valueScore, List<CardRef> cards, long version, Instant occurredAt)`, `CardRef(long efhubId, UUID playerId)`, `LikeSnapshot(String idempotencyKey, UUID listingId, UUID userId, boolean liked, long version, Instant occurredAt)`, `CardSnapshot(String idempotencyKey, long efhubId, UUID playerId, String type, Integer overallRating, String metaTier, int metaPriority, Instant activeFrom, Instant activeUntil, long version, Instant occurredAt)`.
  - `ListingSnapshotSource(JdbcTemplate jdbc)` (`@Component`, primary JdbcTemplate); `LikeSnapshotSource(JdbcTemplate jdbc)`.

- [ ] **Step 1: Yiqiladigan test**

`SnapshotSourcesIT.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.CardRef;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.LikeSnapshot;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.ListingSnapshot;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
class SnapshotSourcesIT {

    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private JdbcTemplate jdbc;

    @BeforeEach
    void schema() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
        jdbc.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
        jdbc.execute("""
                CREATE TABLE listings (id UUID PRIMARY KEY, seller_id UUID NOT NULL, status VARCHAR(16) NOT NULL,
                    price NUMERIC(19,2) NOT NULL, value_score DOUBLE PRECISION);
                CREATE TABLE listing_cards (listing_id UUID NOT NULL, efhub_id BIGINT NOT NULL,
                    player_id UUID NOT NULL, ordinal SMALLINT NOT NULL);
                CREATE TABLE listing_likes (listing_id UUID NOT NULL, user_id UUID NOT NULL);
                """);
    }

    @Test
    void listingSnapshotCarriesCurrentStateAndOrderedCards() {
        UUID id = UUID.randomUUID(), seller = UUID.randomUUID(), p1 = UUID.randomUUID(), p2 = UUID.randomUUID();
        jdbc.update("INSERT INTO listings VALUES (?, ?, 'ACTIVE', 150000, 0.42)", id, seller);
        jdbc.update("INSERT INTO listing_cards VALUES (?, 89002, ?, 1), (?, 89001, ?, 0)", id, p2, id, p1);

        ListingSnapshot s = (ListingSnapshot) new ListingSnapshotSource(jdbc).build(id.toString(), 7).orElseThrow();

        assertThat(s.listingId()).isEqualTo(id);
        assertThat(s.sellerId()).isEqualTo(seller);
        assertThat(s.status()).isEqualTo("ACTIVE");
        assertThat(s.price()).isEqualByComparingTo(new BigDecimal("150000"));
        assertThat(s.valueScore()).isEqualTo(0.42);
        assertThat(s.cards()).containsExactly(new CardRef(89001, p1), new CardRef(89002, p2));
        assertThat(s.version()).isEqualTo(7);
        assertThat(s.idempotencyKey()).isEqualTo("listing:" + id + ":7");
    }

    @Test
    void hardDeletedListingProducesNoSnapshot() {
        assertThat(new ListingSnapshotSource(jdbc).build(UUID.randomUUID().toString(), 1)).isEmpty();
    }

    @Test
    void likeSnapshotReflectsWhetherTheLikeExistsNow() {
        UUID listing = UUID.randomUUID(), user = UUID.randomUUID();
        LikeSnapshotSource source = new LikeSnapshotSource(jdbc);
        String entity = user + ":" + listing;

        jdbc.update("INSERT INTO listing_likes VALUES (?, ?)", listing, user);
        LikeSnapshot liked = (LikeSnapshot) source.build(entity, 3).orElseThrow();
        assertThat(liked.liked()).isTrue();
        assertThat(liked.listingId()).isEqualTo(listing);
        assertThat(liked.userId()).isEqualTo(user);

        // bosildi va darhol olib tashlandi — relay faqat oxirgi holatni ko'radi
        jdbc.update("DELETE FROM listing_likes");
        assertThat(((LikeSnapshot) source.build(entity, 4).orElseThrow()).liked()).isFalse();
        assertThat(source.key(entity)).isEqualTo(listing.toString());
    }

    @Test
    void malformedLikeEntityIsDropped() {
        assertThat(new LikeSnapshotSource(jdbc).build("garbage", 1)).isEmpty();
    }
}
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dtest=NoSuch -Dsurefire.failIfNoSpecifiedTests=false -Dit.test=SnapshotSourcesIT -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR — `ListingSnapshotSource` va boshqalar yo'q.

- [ ] **Step 3: Implementatsiya**

`RecommendationTopics.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import uz.efbazaar.marketplace.event.MarketplaceEvents;

/** recommendation-service uchun chiqadigan snapshot'lar. Katalog: docs/kafka-topics.md. */
public final class RecommendationTopics {

    public static final String LISTING_SNAPSHOT = "efbazaar.marketplace.listing-snapshot";
    public static final String CARD_SNAPSHOT = "efbazaar.marketplace.card-snapshot";
    public static final String LIKE_TOGGLED = MarketplaceEvents.TOPIC_LIKE_TOGGLED;

    public static final String SOURCE_LISTING = "listing";
    public static final String SOURCE_CARD = "card";
    public static final String SOURCE_LIKE = "like";

    private RecommendationTopics() {
    }

    public static String idempotencyKey(String source, String entityId, long version) {
        return source + ":" + entityId + ":" + version;
    }
}
```

`RecommendationSnapshots.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Snapshot payload'lari — har biri entity'ning TO'LIQ hozirgi holati. Consumer oxirgi
 * version'ni saqlaydi va eskisini e'tiborsiz qoldiradi.
 */
public final class RecommendationSnapshots {

    private RecommendationSnapshots() {
    }

    public record CardRef(long efhubId, UUID playerId) {}

    public record ListingSnapshot(String idempotencyKey, UUID listingId, UUID sellerId, String status,
                                  BigDecimal price, Double valueScore, List<CardRef> cards,
                                  long version, Instant occurredAt) {}

    public record LikeSnapshot(String idempotencyKey, UUID listingId, UUID userId, boolean liked,
                               long version, Instant occurredAt) {}

    public record CardSnapshot(String idempotencyKey, long efhubId, UUID playerId, String type,
                               Integer overallRating, String metaTier, int metaPriority,
                               Instant activeFrom, Instant activeUntil, long version, Instant occurredAt) {}
}
```

`ListingSnapshotSource.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.CardRef;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.ListingSnapshot;
import uz.efbazaar.outbox.SnapshotSource;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** listings + listing_cards ning hozirgi holati. Qator o'chirilgan bo'lsa — hech narsa yuborilmaydi. */
@Component
public class ListingSnapshotSource implements SnapshotSource {

    private final JdbcTemplate jdbc;

    public ListingSnapshotSource(@Qualifier("marketplaceJdbcTemplate") JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String source() {
        return RecommendationTopics.SOURCE_LISTING;
    }

    @Override
    public String topic() {
        return RecommendationTopics.LISTING_SNAPSHOT;
    }

    @Override
    public Optional<Object> build(String entityId, long version) {
        UUID id = UUID.fromString(entityId);
        List<CardRef> cards = jdbc.query(
                "SELECT efhub_id, player_id FROM listing_cards WHERE listing_id = ? ORDER BY ordinal",
                (rs, n) -> new CardRef(rs.getLong("efhub_id"), rs.getObject("player_id", UUID.class)), id);
        return jdbc.query("SELECT seller_id, status, price, value_score FROM listings WHERE id = ?",
                (rs, n) -> (Object) new ListingSnapshot(
                        RecommendationTopics.idempotencyKey(source(), entityId, version), id,
                        rs.getObject("seller_id", UUID.class), rs.getString("status"),
                        rs.getBigDecimal("price"), (Double) rs.getObject("value_score"),
                        cards, version, Instant.now()), id)
                .stream().findFirst();
    }
}
```

`LikeSnapshotSource.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.LikeSnapshot;
import uz.efbazaar.outbox.SnapshotSource;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** entityId = "<userId>:<listingId>"; liked — hozir listing_likes da qator bormi. Kalit — listingId. */
@Component
public class LikeSnapshotSource implements SnapshotSource {

    private final JdbcTemplate jdbc;

    public LikeSnapshotSource(@Qualifier("marketplaceJdbcTemplate") JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String source() {
        return RecommendationTopics.SOURCE_LIKE;
    }

    @Override
    public String topic() {
        return RecommendationTopics.LIKE_TOGGLED;
    }

    @Override
    public String key(String entityId) {
        int colon = entityId.indexOf(':');
        return colon < 0 ? entityId : entityId.substring(colon + 1);
    }

    @Override
    public Optional<Object> build(String entityId, long version) {
        String[] parts = entityId.split(":");
        if (parts.length != 2) {
            return Optional.empty();
        }
        UUID userId;
        UUID listingId;
        try {
            userId = UUID.fromString(parts[0]);
            listingId = UUID.fromString(parts[1]);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        Boolean liked = jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM listing_likes WHERE user_id = ? AND listing_id = ?)",
                Boolean.class, userId, listingId);
        return Optional.of(new LikeSnapshot(RecommendationTopics.idempotencyKey(source(), entityId, version),
                listingId, userId, Boolean.TRUE.equals(liked), version, Instant.now()));
    }
}
```

`LikeService.java` — `events.likeToggled(listingId, userId, nowLiked);` qatorini olib tashlang va o'rniga izoh:
```java
        // like-toggled endi listing_likes trigger'i + outbox relay orqali chiqadi (V73) —
        // tranzaksiya bilan atomik, qo'lda yuborish ikkinchi nusxa bo'lardi.
```
`MarketplaceEventPublisher.java` — `likeToggled(...)` metodini olib tashlang. Agar `events` maydoni `LikeService` da boshqa ishlatilmasa, maydonni va import'ni ham olib tashlang. `MarketplaceEvents.LikeToggled` record'i va `TOPIC_LIKE_TOGGLED` qoladi.

Run: `grep -rn "likeToggled" backend/marketplace-service/src` — Expected: hech qanday natija.

- [ ] **Step 4: Testlar**

Run: Step 2 buyrug'i, keyin `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest='LikeService*,MarketplaceApplicationTests'` (like testlari bo'lmasa `-Dsurefire.failIfNoSpecifiedTests=false`).
Expected: `SnapshotSourcesIT` 4 test PASS; mavjud testlar PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/marketplace-service/src
git commit -m "feat(marketplace): listing va like snapshot manbalari; like-toggled outbox orqali"
```

---

### Task 5: `value_score` hisoblagichi (sof formula)

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/CardFacts.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/ValueScoreProperties.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/ValueScoreCalculator.java`
- Modify: `backend/marketplace-service/src/main/resources/application.yml`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/recommendation/ValueScoreCalculatorTest.java`

**Interfaces:**
- Produces:
  - `record CardFacts(long efhubId, String type, UUID playerId, Integer overallRating, String metaTier, int metaPriority, Instant activeFrom, Instant activeUntil)` + `boolean metaActiveAt(Instant now)`.
  - `@ConfigurationProperties("app.recommendation.value-score") record ValueScoreProperties(int ratingFloor, int ratingSpan, double metaBase, double metaPriorityStep, double cardCap, BigDecimal priceFloor, BigDecimal priceCap, double priceWeight)`.
  - `@Component ValueScoreCalculator(ValueScoreProperties)`: `double score(BigDecimal price, Collection<CardFacts> cards, Instant now)`.

- [ ] **Step 1: Yiqiladigan test**

`ValueScoreCalculatorTest.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class ValueScoreCalculatorTest {

    private static final Instant NOW = Instant.parse("2026-10-01T12:00:00Z");
    private final ValueScoreCalculator calc = new ValueScoreCalculator(new ValueScoreProperties(
            80, 20, 2.0, 0.25, 15, new BigDecimal("5000"), new BigDecimal("50000000"), 0.5));

    private static CardFacts normal(int rating) {
        return new CardFacts(89001, "bigtime", null, rating, "NORMAL", 0, null, null);
    }

    private static CardFacts meta(int rating, int priority, Instant from, Instant until) {
        return new CardFacts(89002, "bigtime", null, rating, "META", priority, from, until);
    }

    @Test
    void priceAtOrBelowFloorAndNoCardsIsZero() {
        assertThat(calc.score(new BigDecimal("5000"), List.of(), NOW)).isZero();
        assertThat(calc.score(new BigDecimal("1000"), List.of(), NOW)).isZero();
        assertThat(calc.score(null, Collections.emptyList(), NOW)).isZero();
    }

    @Test
    void priceShareIsLogarithmicAndCapped() {
        // ln(500000/5000) / ln(50000000/5000) = ln(100)/ln(10000) = 0.5  → 0.5 * 0.5
        assertThat(calc.score(new BigDecimal("500000"), List.of(), NOW)).isCloseTo(0.25, within(1e-9));
        assertThat(calc.score(new BigDecimal("900000000"), List.of(), NOW)).isCloseTo(0.5, within(1e-9));
    }

    @Test
    void cardStrengthUsesRatingAboveFloorAndCaps() {
        // (100-80)/20 = 1.0 per card, 3 cards → 3/15 = 0.2 → 0.5 * 0.2
        assertThat(calc.score(new BigDecimal("5000"), List.of(normal(100), normal(100), normal(100)), NOW))
                .isCloseTo(0.1, within(1e-9));
        assertThat(calc.score(new BigDecimal("5000"), List.of(normal(75), normal(80)), NOW)).isZero();
        assertThat(calc.score(new BigDecimal("5000"), Collections.nCopies(40, normal(100)), NOW))
                .isCloseTo(0.5, within(1e-9));
    }

    @Test
    void activeMetaMultipliesAndExpiredMetaDoesNot() {
        // (90-80)/20 = 0.5; META priority 4 → ×(2.0 + 1.0) = 1.5 → 1.5/15 = 0.1 → 0.05
        assertThat(calc.score(new BigDecimal("5000"), List.of(meta(90, 4, null, null)), NOW))
                .isCloseTo(0.05, within(1e-9));
        CardFacts expired = meta(90, 4, null, NOW.minusSeconds(1));
        CardFacts future = meta(90, 4, NOW.plusSeconds(60), null);
        // NORMAL bilan bir xil: 0.5/15 → 0.5 * 0.0333…
        double normalScore = calc.score(new BigDecimal("5000"), List.of(normal(90)), NOW);
        assertThat(calc.score(new BigDecimal("5000"), List.of(expired), NOW)).isCloseTo(normalScore, within(1e-9));
        assertThat(calc.score(new BigDecimal("5000"), List.of(future), NOW)).isCloseTo(normalScore, within(1e-9));
    }

    @Test
    void missingRatingCountsAsZero() {
        CardFacts unrated = new CardFacts(89003, "bigtime", null, null, "META", 10, null, null);
        assertThat(calc.score(new BigDecimal("5000"), List.of(unrated), NOW)).isZero();
    }
}
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest=ValueScoreCalculatorTest`
Expected: COMPILATION ERROR.

- [ ] **Step 3: Implementatsiya**

`CardFacts.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import java.time.Instant;
import java.util.UUID;

/** efbazaar katalogidagi kartaning value_score va snapshot uchun kerakli ma'lumoti. */
public record CardFacts(long efhubId, String type, UUID playerId, Integer overallRating,
                        String metaTier, int metaPriority, Instant activeFrom, Instant activeUntil) {

    public boolean metaActiveAt(Instant now) {
        return "META".equals(metaTier)
                && (activeFrom == null || !activeFrom.isAfter(now))
                && (activeUntil == null || activeUntil.isAfter(now));
    }
}
```

`ValueScoreProperties.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;

/** "Katta bozor" formulasi konstantalari — spec §5.4. */
@ConfigurationProperties("app.recommendation.value-score")
public record ValueScoreProperties(int ratingFloor, int ratingSpan, double metaBase, double metaPriorityStep,
                                   double cardCap, BigDecimal priceFloor, BigDecimal priceCap,
                                   double priceWeight) {
}
```

`ValueScoreCalculator.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;

/**
 * value_score = w × narx_ulushi + (1 − w) × kartalar_kuchi, ikkalasi 0..1.
 * Qat'iy chegaralar (percentile emas): yangi e'lon boshqalarning balini o'zgartirmaydi.
 */
@Component
public class ValueScoreCalculator {

    private final ValueScoreProperties p;

    public ValueScoreCalculator(ValueScoreProperties p) {
        this.p = p;
    }

    public double score(BigDecimal price, Collection<CardFacts> cards, Instant now) {
        return p.priceWeight() * priceShare(price) + (1 - p.priceWeight()) * cardStrength(cards, now);
    }

    private double priceShare(BigDecimal price) {
        if (price == null || price.compareTo(p.priceFloor()) <= 0) {
            return 0;
        }
        double share = Math.log(price.doubleValue() / p.priceFloor().doubleValue())
                / Math.log(p.priceCap().doubleValue() / p.priceFloor().doubleValue());
        return Math.min(1, share);
    }

    private double cardStrength(Collection<CardFacts> cards, Instant now) {
        double sum = 0;
        for (CardFacts card : cards) {
            if (card.overallRating() == null) {
                continue;
            }
            double base = Math.max(0, card.overallRating() - p.ratingFloor()) / (double) p.ratingSpan();
            double tier = card.metaActiveAt(now) ? p.metaBase() + p.metaPriorityStep() * card.metaPriority() : 1.0;
            sum += base * tier;
        }
        return Math.min(1, sum / p.cardCap());
    }
}
```

`application.yml` — `app:` ostiga (mavjud `app:` blokiga qo'shing):
```yaml
  recommendation:
    value-score:
      rating-floor: 80
      rating-span: 20
      meta-base: 2.0
      meta-priority-step: 0.25
      card-cap: 15
      price-floor: 5000
      price-cap: 50000000
      price-weight: 0.5
      backfill-enabled: ${VALUE_SCORE_BACKFILL_ENABLED:true}
```
`ValueScoreProperties` ni ro'yxatdan o'tkazish: `MarketplaceApplication` da `@ConfigurationPropertiesScan` bo'lmasa, `ValueScoreCalculator` ustiga `@org.springframework.boot.context.properties.EnableConfigurationProperties(ValueScoreProperties.class)` qo'yiladigan konfiguratsiya sinfi kerak — `recommendation/RecommendationConfig.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(ValueScoreProperties.class)
class RecommendationConfig {
}
```
(`backfill-enabled` ni `ValueScoreProperties` ga qo'shmang — u `ValueScoreBackfill` da `@ConditionalOnProperty` bilan o'qiladi.)

- [ ] **Step 4: Testlar**

Run: Step 2 buyrug'i. Expected: 5 test PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/marketplace-service/src
git commit -m "feat(marketplace): Katta bozor value_score formulasi"
```

---

### Task 6: `value_score` ni saqlash — katalog o'qish, qayta hisoblash, backfill

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/CardCatalogReader.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/ListingValueScorer.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/ValueScoreBackfill.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/ListingPersistence.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/domain/Listing.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/recommendation/ListingValueScorerIT.java`

**Interfaces:**
- Consumes: `ValueScoreCalculator.score`, `CardFacts`, `CardType.fromEfhubId(long)`, `CardType.tableName()`.
- Produces:
  - `CardCatalogReader(@Qualifier("efbazaarJdbcTemplate") JdbcTemplate)`: `Map<Long, CardFacts> read(Collection<Long> efhubIds)`, `List<Long> allIds()`, `List<Long> metaBoundariesBetween(Instant from, Instant to)`.
  - `ListingValueScorer(@Qualifier("marketplaceJdbcTemplate") JdbcTemplate, CardCatalogReader, ValueScoreCalculator, Clock)`: `int recompute(Collection<UUID> listingIds)`, `int recomputeForCards(Collection<Long> efhubIds)`, `int backfillBatch(int limit)`.
  - `Listing.getValueScore()` — `Double`, faqat o'qish.

- [ ] **Step 1: Yiqiladigan test**

`ListingValueScorerIT.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

@Testcontainers(disabledWithoutDocker = true)
class ListingValueScorerIT {

    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private static final Instant NOW = Instant.parse("2026-10-01T12:00:00Z");

    private JdbcTemplate jdbc;
    private ListingValueScorer scorer;

    @BeforeEach
    void schema() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
        jdbc.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
        // Bitta Postgres ikkala bazani ham o'ynaydi — testda jadvallar to'qnashmaydi.
        jdbc.execute("""
                CREATE TABLE listings (id UUID PRIMARY KEY, status VARCHAR(16) NOT NULL,
                    price NUMERIC(19,2) NOT NULL, value_score DOUBLE PRECISION);
                CREATE TABLE listing_cards (listing_id UUID NOT NULL, efhub_id BIGINT NOT NULL,
                    player_id UUID NOT NULL, ordinal SMALLINT NOT NULL);
                CREATE TABLE bigtime (efhub_id BIGINT PRIMARY KEY, overall_rating SMALLINT,
                    meta_tier TEXT NOT NULL DEFAULT 'NORMAL', meta_priority SMALLINT NOT NULL DEFAULT 0,
                    meta_active_from TIMESTAMPTZ, meta_active_until TIMESTAMPTZ);
                CREATE TABLE epic (LIKE bigtime INCLUDING ALL);
                CREATE TABLE showtime (LIKE bigtime INCLUDING ALL);
                CREATE TABLE card_player_identities (efhub_id BIGINT PRIMARY KEY, player_id UUID NOT NULL);
                """);
        ValueScoreCalculator calc = new ValueScoreCalculator(new ValueScoreProperties(
                80, 20, 2.0, 0.25, 15, new BigDecimal("5000"), new BigDecimal("50000000"), 0.5));
        scorer = new ListingValueScorer(jdbc, new CardCatalogReader(jdbc), calc,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private UUID listing(String price, long... efhubIds) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO listings (id, status, price) VALUES (?, 'ACTIVE', ?)", id, new BigDecimal(price));
        for (int i = 0; i < efhubIds.length; i++) {
            jdbc.update("INSERT INTO listing_cards VALUES (?, ?, ?, ?)", id, efhubIds[i], UUID.randomUUID(), i);
        }
        return id;
    }

    private Double score(UUID id) {
        return jdbc.queryForObject("SELECT value_score FROM listings WHERE id = ?", Double.class, id);
    }

    @Test
    void recomputeWritesFormulaResultFromCatalog() {
        jdbc.update("INSERT INTO bigtime (efhub_id, overall_rating) VALUES (8900000001, 100)");
        UUID id = listing("500000", 8900000001L);

        assertThat(scorer.recompute(List.of(id))).isEqualTo(1);

        // 0.5 × 0.5 (narx) + 0.5 × (1/15)
        assertThat(score(id)).isCloseTo(0.25 + 0.5 / 15, within(1e-9));
    }

    @Test
    void unchangedScoreIsNotRewritten() {
        UUID id = listing("500000");
        scorer.recompute(List.of(id));
        assertThat(scorer.recompute(List.of(id))).isZero();
    }

    @Test
    void cardChangeRecomputesOnlyListingsHoldingThatCard() {
        jdbc.update("INSERT INTO bigtime (efhub_id, overall_rating) VALUES (8900000001, 90)");
        UUID holder = listing("5000", 8900000001L);
        UUID other = listing("5000");
        scorer.recompute(List.of(holder, other));
        double before = score(holder);

        jdbc.update("UPDATE bigtime SET meta_tier = 'META', meta_priority = 4 WHERE efhub_id = 8900000001");
        assertThat(scorer.recomputeForCards(List.of(8900000001L))).isEqualTo(1);

        assertThat(score(holder)).isGreaterThan(before);
    }

    @Test
    void backfillFillsOnlyNullRowsInBatches() {
        UUID a = listing("500000");
        UUID b = listing("500000");
        UUID c = listing("500000");

        assertThat(scorer.backfillBatch(2)).isEqualTo(2);
        assertThat(scorer.backfillBatch(2)).isEqualTo(1);
        assertThat(scorer.backfillBatch(2)).isZero();
        assertThat(List.of(score(a), score(b), score(c))).allMatch(s -> s != null && s > 0);
    }

    @Test
    void cardMissingFromCatalogCountsAsZero() {
        UUID id = listing("5000", 8999999999L);
        scorer.recompute(List.of(id));
        assertThat(score(id)).isZero();
    }
}
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dtest=NoSuch -Dsurefire.failIfNoSpecifiedTests=false -Dit.test=ListingValueScorerIT -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR.

- [ ] **Step 3: Implementatsiya**

`CardCatalogReader.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.cards.CardType;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** efbazaar karta katalogidan (bigtime/epic/showtime + card_player_identities) o'qish. */
@Component
public class CardCatalogReader {

    private final JdbcTemplate jdbc;

    public CardCatalogReader(@Qualifier("efbazaarJdbcTemplate") JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<Long, CardFacts> read(Collection<Long> efhubIds) {
        Map<CardType, List<Long>> byType = new EnumMap<>(CardType.class);
        for (Long id : efhubIds) {
            CardType type = id == null ? null : CardType.fromEfhubId(id);
            if (type != null) { // null — noma'lum prefiks yoki juda qisqa ID: katalogda yo'q
                byType.computeIfAbsent(type, t -> new ArrayList<>()).add(id);
            }
        }
        Map<Long, CardFacts> out = new HashMap<>();
        byType.forEach((type, ids) -> {
            String in = ids.stream().map(i -> "?").collect(Collectors.joining(", "));
            jdbc.query("""
                    SELECT c.efhub_id, c.overall_rating, c.meta_tier, c.meta_priority,
                           c.meta_active_from, c.meta_active_until, i.player_id
                      FROM %s c LEFT JOIN card_player_identities i ON i.efhub_id = c.efhub_id
                     WHERE c.efhub_id IN (%s)
                    """.formatted(type.tableName(), in),
                    rs -> {
                        long id = rs.getLong("efhub_id");
                        out.put(id, new CardFacts(id, type.tableName(),
                                rs.getObject("player_id", java.util.UUID.class),
                                (Integer) rs.getObject("overall_rating", Integer.class),
                                rs.getString("meta_tier"), rs.getInt("meta_priority"),
                                instant(rs.getTimestamp("meta_active_from")),
                                instant(rs.getTimestamp("meta_active_until"))));
                    }, ids.toArray());
        });
        return out;
    }

    public List<Long> allIds() {
        List<Long> ids = new ArrayList<>();
        for (CardType type : CardType.values()) {
            ids.addAll(jdbc.queryForList("SELECT efhub_id FROM " + type.tableName(), Long.class));
        }
        return ids;
    }

    /** META oynasi (from/until) (from, to] oralig'ida boshlangan yoki tugagan kartalar. */
    public List<Long> metaBoundariesBetween(Instant from, Instant to) {
        List<Long> ids = new ArrayList<>();
        for (CardType type : CardType.values()) {
            ids.addAll(jdbc.queryForList("""
                    SELECT efhub_id FROM %s
                     WHERE meta_tier = 'META'
                       AND ((meta_active_from  > ? AND meta_active_from  <= ?)
                         OR (meta_active_until > ? AND meta_active_until <= ?))
                    """.formatted(type.tableName()), Long.class,
                    Timestamp.from(from), Timestamp.from(to), Timestamp.from(from), Timestamp.from(to)));
        }
        return ids;
    }

    private static Instant instant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }
}
```

`ListingValueScorer.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * listings.value_score ni hisoblab yozadi. Faqat o'zgargan qator yoziladi — V73 trigger'i
 * har yozuvda listing snapshot'ini belgilaydi, keraksiz snapshot'lar chiqmasin.
 * Chaqiruvchining tranzaksiyasida ishlaydi (bo'lsa).
 */
@Component
public class ListingValueScorer {

    private final JdbcTemplate jdbc;
    private final CardCatalogReader catalog;
    private final ValueScoreCalculator calculator;
    private final Clock clock;

    @Autowired
    public ListingValueScorer(@Qualifier("marketplaceJdbcTemplate") JdbcTemplate jdbc, CardCatalogReader catalog,
                              ValueScoreCalculator calculator) {
        this(jdbc, catalog, calculator, Clock.systemUTC());
    }

    ListingValueScorer(JdbcTemplate jdbc, CardCatalogReader catalog, ValueScoreCalculator calculator, Clock clock) {
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.calculator = calculator;
        this.clock = clock;
    }

    public int recompute(Collection<UUID> listingIds) {
        if (listingIds.isEmpty()) {
            return 0;
        }
        List<UUID> ids = List.copyOf(new HashSet<>(listingIds));
        String in = ids.stream().map(i -> "?").collect(Collectors.joining(", "));
        record Row(UUID id, BigDecimal price, Double current) {}
        List<Row> rows = jdbc.query("SELECT id, price, value_score FROM listings WHERE id IN (" + in + ")",
                (rs, n) -> new Row(rs.getObject("id", UUID.class), rs.getBigDecimal("price"),
                        (Double) rs.getObject("value_score")), ids.toArray());
        Map<UUID, List<Long>> cardsByListing = new HashMap<>();
        jdbc.query("SELECT listing_id, efhub_id FROM listing_cards WHERE listing_id IN (" + in + ")",
                rs -> {
                    cardsByListing.computeIfAbsent(rs.getObject("listing_id", UUID.class), k -> new ArrayList<>())
                            .add(rs.getLong("efhub_id"));
                }, ids.toArray());
        Set<Long> allCards = cardsByListing.values().stream().flatMap(List::stream).collect(Collectors.toSet());
        Map<Long, CardFacts> facts = catalog.read(allCards);
        Instant now = clock.instant();

        int written = 0;
        for (Row row : rows) {
            List<CardFacts> cards = cardsByListing.getOrDefault(row.id(), List.of()).stream()
                    .map(facts::get).filter(Objects::nonNull).toList();
            double score = calculator.score(row.price(), cards, now);
            if (row.current() == null || Math.abs(row.current() - score) > 1e-12) {
                written += jdbc.update("UPDATE listings SET value_score = ? WHERE id = ?", score, row.id());
            }
        }
        return written;
    }

    public int recomputeForCards(Collection<Long> efhubIds) {
        if (efhubIds.isEmpty()) {
            return 0;
        }
        String in = efhubIds.stream().map(i -> "?").collect(Collectors.joining(", "));
        List<UUID> listings = jdbc.queryForList(
                "SELECT DISTINCT listing_id FROM listing_cards WHERE efhub_id IN (" + in + ")",
                UUID.class, efhubIds.toArray());
        return recompute(listings);
    }

    public int backfillBatch(int limit) {
        List<UUID> ids = jdbc.queryForList(
                "SELECT id FROM listings WHERE value_score IS NULL ORDER BY id LIMIT ?", UUID.class, limit);
        return recompute(ids);
    }
}
```

`recompute` natijasi 0 bo'lsa ham `backfillBatch` bo'sh bo'lmagan partiyada yangi qiymat yozadi (null → son), shuning uchun sanog'i partiya hajmiga teng.

`ValueScoreBackfill.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** V72 dan keyingi birinchi start'da (va xavfsiz qayta) — value_score IS NULL qatorlarni to'ldiradi. */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "app.recommendation.value-score", name = "backfill-enabled",
        havingValue = "true", matchIfMissing = true)
public class ValueScoreBackfill implements ApplicationRunner {

    private static final int BATCH = 500;
    private final ListingValueScorer scorer;

    @Override
    public void run(ApplicationArguments args) {
        int total = 0;
        int batch;
        do {
            batch = scorer.backfillBatch(BATCH);
            total += batch;
        } while (batch == BATCH);
        if (total > 0) {
            log.info("value_score backfill: {} e'lon hisoblandi", total);
        }
    }
}
```

`Listing.java` — `updatedAt` maydonidan keyin:
```java
    /**
     * "Katta bozor" bali — faqat ListingValueScorer yozadi (JdbcTemplate). JPA saqlash
     * uni ustidan yozib yubormasligi uchun faqat o'qish.
     */
    @Column(name = "value_score", insertable = false, updatable = false)
    private Double valueScore;
```

`ListingPersistence.java` — `ListingValueScorer` ni inject qiling va `inventory.replace(...)` dan keyin, `return saved;` dan oldin:
```java
        // value_score kartalar va narxga bog'liq — shu tranzaksiyada qayta hisoblanadi.
        valueScorer.recompute(java.util.List.of(saved.getId()));
```
(`private final uz.efbazaar.marketplace.recommendation.ListingValueScorer valueScorer;` maydoni.)

- [ ] **Step 4: Testlar**

Run: Step 2 buyrug'i, keyin `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest='ListingPersistence*,ListingService*,MarketplaceApplicationTests' -Dsurefire.failIfNoSpecifiedTests=false`.
Expected: `ListingValueScorerIT` 5 PASS; mavjud `ListingPersistence`/`ListingService` testlari — agar konstruktor mock'lari yiqilsa, `@Mock ListingValueScorer` qo'shib tuzating (xatti-harakatni o'zgartirmasdan); PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/marketplace-service/src
git commit -m "feat(marketplace): value_score saqlanganda hisoblanadi, startup backfill"
```

---

### Task 7: Karta snapshot'i, META o'zgarishi, sync va kunlik chegara job'i

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/CardSnapshotSource.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/CardChangeHandler.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/MetaBoundaryJob.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/AdminCardController.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards/sync/EfhubSyncService.java`
- Modify: `backend/marketplace-service/src/main/resources/application.yml`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/recommendation/CardChangeHandlerTest.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/recommendation/CardSnapshotSourceIT.java`

**Interfaces:**
- Consumes: `CardCatalogReader.read/metaBoundariesBetween`, `ListingValueScorer.recomputeForCards`, `Outbox.markSnapshot`.
- Produces:
  - `CardSnapshotSource(CardCatalogReader)` — source `card`, topic `CARD_SNAPSHOT`.
  - `CardChangeHandler(Outbox, ListingValueScorer, PlatformTransactionManager)`: `void cardsChanged(Collection<Long> efhubIds)` — **marketplace** tranzaksiyasida: value_score qayta hisoblash + har karta uchun `markSnapshot("card", id)`.
  - `MetaBoundaryJob.run()` — `@Scheduled(cron = "${app.recommendation.meta-boundary-cron:0 5 0 * * *}", zone = "UTC")`.

- [ ] **Step 1: Yiqiladigan testlar**

`CardChangeHandlerTest.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.TransactionDefinition;
import uz.efbazaar.outbox.Outbox;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.*;

class CardChangeHandlerTest {

    /** Haqiqiy DB'siz: faqat tranzaksiya chegarasi va commit/rollback'ni kuzatadi. */
    static class RecordingTxManager extends AbstractPlatformTransactionManager {
        int commits;
        int rollbacks;
        @Override protected Object doGetTransaction() { return new Object(); }
        @Override protected void doBegin(Object tx, TransactionDefinition def) { }
        @Override protected void doCommit(DefaultTransactionStatus status) { commits++; }
        @Override protected void doRollback(DefaultTransactionStatus status) { rollbacks++; }
    }

    @Test
    void recomputesListingsAndMarksEveryCardInOneMarketplaceTransaction() {
        Outbox outbox = mock(Outbox.class);
        ListingValueScorer scorer = mock(ListingValueScorer.class);
        RecordingTxManager tm = new RecordingTxManager();

        new CardChangeHandler(outbox, scorer, tm).cardsChanged(List.of(8900000001L, 8900000002L));

        verify(scorer).recomputeForCards(List.of(8900000001L, 8900000002L));
        verify(outbox).markSnapshot("card", "8900000001");
        verify(outbox).markSnapshot("card", "8900000002");
        assertThat(tm.commits).isEqualTo(1);
    }

    @Test
    void failureRollsBackAndSurfacesToCaller() {
        Outbox outbox = mock(Outbox.class);
        ListingValueScorer scorer = mock(ListingValueScorer.class);
        when(scorer.recomputeForCards(anyCollection())).thenThrow(new IllegalStateException("db down"));
        RecordingTxManager tm = new RecordingTxManager();

        assertThatThrownBy(() -> new CardChangeHandler(outbox, scorer, tm).cardsChanged(List.of(8900000001L)))
                .hasMessageContaining("db down");
        assertThat(tm.rollbacks).isEqualTo(1);
        verifyNoInteractions(outbox);
    }

    @Test
    void emptyChangeDoesNothing() {
        Outbox outbox = mock(Outbox.class);
        ListingValueScorer scorer = mock(ListingValueScorer.class);
        new CardChangeHandler(outbox, scorer, new RecordingTxManager()).cardsChanged(List.of());
        verifyNoInteractions(outbox, scorer);
    }
}
```

`CardSnapshotSourceIT.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.CardSnapshot;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
class CardSnapshotSourceIT {

    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private JdbcTemplate jdbc;

    @BeforeEach
    void schema() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
        jdbc.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
        jdbc.execute("""
                CREATE TABLE bigtime (efhub_id BIGINT PRIMARY KEY, overall_rating SMALLINT,
                    meta_tier TEXT NOT NULL DEFAULT 'NORMAL', meta_priority SMALLINT NOT NULL DEFAULT 0,
                    meta_active_from TIMESTAMPTZ, meta_active_until TIMESTAMPTZ);
                CREATE TABLE epic (LIKE bigtime INCLUDING ALL);
                CREATE TABLE showtime (LIKE bigtime INCLUDING ALL);
                CREATE TABLE card_player_identities (efhub_id BIGINT PRIMARY KEY, player_id UUID NOT NULL);
                """);
    }

    @Test
    void buildsCardSnapshotWithPlayerAndMeta() {
        UUID player = UUID.randomUUID();
        jdbc.update("INSERT INTO bigtime VALUES (8900000001, 95, 'META', 3, NULL, '2026-12-01T00:00:00Z')");
        jdbc.update("INSERT INTO card_player_identities VALUES (8900000001, ?)", player);

        CardSnapshot s = (CardSnapshot) new CardSnapshotSource(new CardCatalogReader(jdbc))
                .build("8900000001", 11).orElseThrow();

        assertThat(s.efhubId()).isEqualTo(8900000001L);
        assertThat(s.playerId()).isEqualTo(player);
        assertThat(s.type()).isEqualTo("bigtime");
        assertThat(s.overallRating()).isEqualTo(95);
        assertThat(s.metaTier()).isEqualTo("META");
        assertThat(s.metaPriority()).isEqualTo(3);
        assertThat(s.activeUntil()).isNotNull();
        assertThat(s.idempotencyKey()).isEqualTo("card:8900000001:11");
    }

    @Test
    void unknownOrNonNumericCardProducesNothing() {
        CardSnapshotSource source = new CardSnapshotSource(new CardCatalogReader(jdbc));
        assertThat(source.build("8900000999", 1)).isEmpty();
        assertThat(source.build("not-a-number", 1)).isEmpty();
    }
}
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dtest=CardChangeHandlerTest -Dit.test=CardSnapshotSourceIT -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR.

- [ ] **Step 3: Implementatsiya**

`CardSnapshotSource.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.CardSnapshot;
import uz.efbazaar.outbox.SnapshotSource;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** efbazaar katalogidagi kartaning hozirgi holati (reyting, o'yinchi, META oynasi). */
@Component
public class CardSnapshotSource implements SnapshotSource {

    private final CardCatalogReader catalog;

    public CardSnapshotSource(CardCatalogReader catalog) {
        this.catalog = catalog;
    }

    @Override
    public String source() {
        return RecommendationTopics.SOURCE_CARD;
    }

    @Override
    public String topic() {
        return RecommendationTopics.CARD_SNAPSHOT;
    }

    @Override
    public Optional<Object> build(String entityId, long version) {
        long efhubId;
        try {
            efhubId = Long.parseLong(entityId);
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
        CardFacts f = catalog.read(List.of(efhubId)).get(efhubId);
        if (f == null) {
            return Optional.empty();
        }
        return Optional.of(new CardSnapshot(RecommendationTopics.idempotencyKey(source(), entityId, version),
                f.efhubId(), f.playerId(), f.type(), f.overallRating(), f.metaTier(), f.metaPriority(),
                f.activeFrom(), f.activeUntil(), version, Instant.now()));
    }
}
```

`CardChangeHandler.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.Outbox;

import java.util.Collection;
import java.util.List;

/**
 * efbazaar'da karta o'zgargandan KEYIN chaqiriladi (META, yangi karta, META chegarasi).
 *
 * <p>Karta boshqa bazada, shuning uchun o'zgarish bilan atomik emas: efbazaar commit bo'ldi,
 * keyin shu yerda MARKETPLACE tranzaksiyasi ochiladi — tegishli e'lonlarning value_score'i
 * (V73 trigger listing snapshot'larini belgilaydi) va karta belgilari birga yoziladi.
 * Yiqilsa exception chaqiruvchiga chiqadi (admin xatoni ko'radi va qayta urinadi — ikkala
 * qadam ham idempotent); zaxira — replay.
 */
@Component
public class CardChangeHandler {

    private final Outbox outbox;
    private final ListingValueScorer scorer;
    private final TransactionTemplate tx;

    public CardChangeHandler(Outbox outbox, ListingValueScorer scorer, PlatformTransactionManager txManager) {
        this.outbox = outbox;
        this.scorer = scorer;
        this.tx = new TransactionTemplate(txManager);
    }

    public void cardsChanged(Collection<Long> efhubIds) {
        if (efhubIds.isEmpty()) {
            return;
        }
        List<Long> ids = List.copyOf(efhubIds);
        tx.executeWithoutResult(status -> {
            scorer.recomputeForCards(ids);
            ids.forEach(id -> outbox.markSnapshot(RecommendationTopics.SOURCE_CARD, Long.toString(id)));
        });
    }
}
```
`PlatformTransactionManager` — marketplace'dagi yagona (JPA) transaction manager; `efbazaar` uchun bean yo'q, shuning uchun qo'shimcha qualifier kerak emas.

`MetaBoundaryJob.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * META oynasi o'z-o'zidan ochiladi/yopiladi (admin hech narsa bosmaydi) — value_score va karta
 * snapshot'i shunda ham yangilanishi kerak. Oxirgi 25 soat: kunlik job bir marta o'tkazib
 * yuborilsa ham chegara yo'qolmaydi; takror zararsiz.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MetaBoundaryJob {

    private static final Duration WINDOW = Duration.ofHours(25);
    private final CardCatalogReader catalog;
    private final CardChangeHandler handler;

    @Scheduled(cron = "${app.recommendation.meta-boundary-cron:0 5 0 * * *}", zone = "UTC")
    public void run() {
        Instant now = Instant.now();
        List<Long> crossed = catalog.metaBoundariesBetween(now.minus(WINDOW), now);
        if (!crossed.isEmpty()) {
            handler.cardsChanged(crossed);
            log.info("META chegarasi: {} karta yangilandi", crossed.size());
        }
    }
}
```

`AdminCardController.java` — `CardChangeHandler cardChangeHandler` maydonini qo'shing (`private final`), `setMetaTier` va `expireMeta` da `cardSearchService...` chaqiruvidan keyin:
```java
        cardChangeHandler.cardsChanged(request.efhubIds());
```
(Metodlarning qolgan qismi o'zgarmaydi. `efbazaar` UPDATE commit bo'lgandan keyin chaqiriladi — `CardSearchService.atomic` tugagan.)

`EfhubSyncService.java` — `CardChangeHandler cardChangeHandler` ni inject qiling (konstruktor), `publish(added);` chaqirilgan joydan keyin (yangi kartalar bo'lsa):
```java
            cardChangeHandler.cardsChanged(added.stream().map(CardsAddedEvent.Added::efhubId).toList());
```
(`CardsAddedEvent.Added` maydon nomini fayldan tasdiqlang — `efhubId`.)

`application.yml` — `app.recommendation` ostiga:
```yaml
    meta-boundary-cron: ${META_BOUNDARY_CRON:0 5 0 * * *}
```

Mavjud `AdminCardController`/`EfhubSyncService` testlari konstruktor o'zgarishi bilan yiqilsa — `mock(CardChangeHandler.class)` qo'shing.

- [ ] **Step 4: Testlar**

Run: Step 2 buyrug'i, keyin `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest='AdminCard*,EfhubSync*,MarketplaceApplicationTests' -Dsurefire.failIfNoSpecifiedTests=false`.
Expected: yangi 5 test va mavjud testlar PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/marketplace-service/src
git commit -m "feat(marketplace): karta snapshot'i; META, sync va META chegarasi value_score'ni yangilaydi"
```

---

### Task 8: `?sort=valueScore,desc` — barqaror tartib

**Files:**
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/ListingService.java` (`browse`)
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/recommendation/ValueScoreSortIT.java`

**Interfaces:**
- Produces: `ListingService.browse` — sort'da `valueScore` bo'lsa: `valueScore` (so'ralgan yo'nalish, NULLS LAST) + `id ASC`.

- [ ] **Step 1: Yiqiladigan test**

`ValueScoreSortIT.java` (`UserDeletedConsumerIT` uslubidagi `@DataJpaTest` + Testcontainers):
```java
package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.service.ListingSorts;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(ValueScoreSortIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class ValueScoreSortIT {

    @Container @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired ListingRepository listings;
    @Autowired JdbcTemplate jdbc;

    private UUID listing(Double score) {
        Listing saved = listings.save(Listing.builder().sellerId(UUID.randomUUID()).description("d")
                .price(new BigDecimal("100000")).priceNegotiable(false).status(ListingStatus.ACTIVE).build());
        listings.flush();
        jdbc.update("UPDATE listings SET value_score = ? WHERE id = ?", score, saved.getId());
        return saved.getId();
    }

    @Test
    void highestFirstNullsLastAndTiesStableById() {
        UUID low = listing(0.1);
        UUID nul = listing(null);
        UUID tieA = listing(0.5);
        UUID tieB = listing(0.5);
        UUID high = listing(0.9);

        Page<Listing> page = listings.findAll(
                ListingSorts.stable(PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "valueScore"))));

        UUID firstTie = tieA.compareTo(tieB) < 0 ? tieA : tieB;
        UUID secondTie = firstTie.equals(tieA) ? tieB : tieA;
        assertThat(page.getContent()).extracting(Listing::getId)
                .containsExactly(high, firstTie, secondTie, low, nul);
    }

    @org.springframework.boot.autoconfigure.domain.EntityScan(basePackageClasses = Listing.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(basePackageClasses = ListingRepository.class)
    static class Config {}
}
```
(Postgres UUID tartibi Java `UUID.compareTo` bilan bir xil bo'lmasligi mumkin — agar tie tartibi to'g'ri kelmasa, test ikki tie'ni `ORDER BY id` bilan DB'dan o'qib solishtirsin: `jdbc.queryForList("SELECT id FROM listings WHERE value_score = 0.5 ORDER BY id", UUID.class)`.)

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dtest=NoSuch -Dsurefire.failIfNoSpecifiedTests=false -Dit.test=ValueScoreSortIT -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR — `ListingSorts` yo'q.

- [ ] **Step 3: Implementatsiya**

`backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/ListingSorts.java`:
```java
package uz.efbazaar.marketplace.service;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.ArrayList;
import java.util.List;

/**
 * "Katta bozor" (?sort=valueScore,desc) sahifalari barqaror bo'lishi uchun: hisoblanmagan
 * (null) e'lonlar oxirida, teng ballar id bo'yicha — aks holda sahifalar orasida e'lonlar
 * takrorlanib yoki tushib qolishi mumkin.
 */
public final class ListingSorts {

    private ListingSorts() {
    }

    public static Pageable stable(Pageable pageable) {
        Sort.Order byScore = pageable.getSort().getOrderFor("valueScore");
        if (byScore == null) {
            return pageable;
        }
        List<Sort.Order> orders = new ArrayList<>();
        for (Sort.Order o : pageable.getSort()) {
            orders.add(o.getProperty().equals("valueScore") ? o.nullsLast() : o);
        }
        if (pageable.getSort().getOrderFor("id") == null) {
            orders.add(Sort.Order.asc("id"));
        }
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), Sort.by(orders));
    }
}
```

`ListingRepository` da `findAll(Pageable)` mavjud (JpaRepository). `ListingService.browse` boshida:
```java
        pageable = ListingSorts.stable(pageable);
```
(mavjud `effectivePageable` mantig'i undan keyin o'zgarmasdan ishlaydi.)

- [ ] **Step 4: Testlar**

Run: Step 2 buyrug'i; keyin `mvn -B -ntp test -Dtest='ListingService*' -Dsurefire.failIfNoSpecifiedTests=false`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/marketplace-service/src
git commit -m "feat(marketplace): ?sort=valueScore — null'lar oxirida, teng ballar id bo'yicha"
```

---

### Task 9: `POST /api/v1/listings/ranked`

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/RankedListingsRequest.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/ListingService.java` (`ranked`)
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/controller/ListingController.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/recommendation/RankedListingsIT.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/controller/RankedListingsControllerTest.java`

**Interfaces:**
- Consumes: `ListingSpecifications.withFilter(ListingFilter)`, `ListingService.sanitizeRangeFilters`, `ListingViewAssembler.assembleAll(Collection<Listing>, UUID)`.
- Produces:
  - `record RankedListingsRequest(@NotNull @Size(max = 1000) List<UUID> ids, BigDecimal minPrice, BigDecimal maxPrice, Boolean priceNegotiable, String search, Map<String, Object> attributes, @Min(0) int page, @Min(1) @Max(100) int size)`.
  - `ListingService.ranked(List<UUID> ids, ListingFilter filter, int page, int size) → Page<Listing>`.

- [ ] **Step 1: Yiqiladigan testlar**

`RankedListingsIT.java` (`ValueScoreSortIT` bilan bir xil `@DataJpaTest` sozlamasi; `ListingService` o'rniga faqat repository va sof yordamchi ishlatiladi):
```java
package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingFilter;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.service.RankedListings;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(RankedListingsIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class RankedListingsIT {

    @Container @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired ListingRepository listings;

    private UUID listing(String price, ListingStatus status) {
        return listings.saveAndFlush(Listing.builder().sellerId(UUID.randomUUID()).description("d")
                .price(new BigDecimal(price)).priceNegotiable(false).status(status).build()).getId();
    }

    private static ListingFilter noFilter() {
        return new ListingFilter(null, null, null, null, Map.of(), false);
    }

    @Test
    void keepsCallerOrderDropsNonActiveMissingAndDuplicates() {
        UUID a = listing("100000", ListingStatus.ACTIVE);
        UUID sold = listing("100000", ListingStatus.SOLD);
        UUID b = listing("100000", ListingStatus.ACTIVE);
        UUID c = listing("100000", ListingStatus.ACTIVE);

        Page<Listing> page = RankedListings.page(listings,
                List.of(c, sold, UUID.randomUUID(), a, c, b), noFilter(), 0, 10);

        assertThat(page.getContent()).extracting(Listing::getId).containsExactly(c, a, b);
        assertThat(page.getTotalElements()).isEqualTo(3);
    }

    @Test
    void appliesFiltersAndPaginatesAfterFiltering() {
        UUID cheap = listing("50000", ListingStatus.ACTIVE);
        UUID p1 = listing("200000", ListingStatus.ACTIVE);
        UUID p2 = listing("300000", ListingStatus.ACTIVE);
        UUID p3 = listing("400000", ListingStatus.ACTIVE);
        ListingFilter minPrice = new ListingFilter(new BigDecimal("100000"), null, null, null, Map.of(), false);

        Page<Listing> second = RankedListings.page(listings, List.of(p3, cheap, p1, p2), minPrice, 1, 2);

        assertThat(second.getContent()).extracting(Listing::getId).containsExactly(p2);
        assertThat(second.getTotalElements()).isEqualTo(3);
        assertThat(second.getTotalPages()).isEqualTo(2);
    }

    @org.springframework.boot.autoconfigure.domain.EntityScan(basePackageClasses = Listing.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(basePackageClasses = ListingRepository.class)
    static class Config {}
}
```

`RankedListingsControllerTest.java` — mavjud `ListingController` WebMvc testlari uslubida (`src/test/java/uz/efbazaar/marketplace/controller/` dagi mavjud `@WebMvcTest(ListingController.class)` testini ochib, uning `@MockBean` va security sozlamasini nusxalang):
```java
    @Test
    void rejectsMoreThanThousandIds() throws Exception {
        String ids = java.util.stream.IntStream.range(0, 1001)
                .mapToObj(i -> "\"" + java.util.UUID.randomUUID() + "\"")
                .collect(java.util.stream.Collectors.joining(","));
        mvc.perform(post("/api/v1/listings/ranked").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[" + ids + "],\"page\":0,\"size\":20}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void returnsAssembledPageInRankedOrder() throws Exception {
        UUID a = UUID.randomUUID(), b = UUID.randomUUID();
        Listing la = Listing.builder().id(a).build();
        Listing lb = Listing.builder().id(b).build();
        when(listingService.ranked(eq(List.of(b, a)), any(), eq(0), eq(20)))
                .thenReturn(new PageImpl<>(List.of(lb, la), PageRequest.of(0, 20), 2));
        when(assembler.assembleAll(eq(List.of(lb, la)), any()))
                .thenReturn(List.of(responseWithId(b), responseWithId(a)));

        mvc.perform(post("/api/v1/listings/ranked").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[\"" + b + "\",\"" + a + "\"],\"page\":0,\"size\":20}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(b.toString()))
                .andExpect(jsonPath("$.content[1].id").value(a.toString()))
                .andExpect(jsonPath("$.totalElements").value(2));
    }
```
(`responseWithId` — mavjud testdagi `ListingResponse` yasovchi yordamchidan foydalaning yoki barcha maydonlari null bo'lgan `new ListingResponse(id, ...)` qaytaradigan kichik metod yozing.)

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dtest=RankedListingsControllerTest -Dit.test=RankedListingsIT -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR.

- [ ] **Step 3: Implementatsiya**

`backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/RankedListings.java`:
```java
package uz.efbazaar.marketplace.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.dto.ListingFilter;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * recommendation-service tartiblagan ID'lar ustida marketplace filtrlarini qo'llaydi.
 * Filtr mantig'i bitta joyda qoladi (ListingSpecifications) — recommendation uni takrorlamaydi.
 * ID'lar ≤ 1000, shuning uchun tartib va sahifalash xotirada.
 */
public final class RankedListings {

    private RankedListings() {
    }

    public static Page<Listing> page(ListingRepository repo, List<UUID> ids, ListingFilter filter,
                                     int page, int size) {
        List<UUID> unique = List.copyOf(new LinkedHashSet<>(ids));
        if (unique.isEmpty()) {
            return Page.empty(PageRequest.of(page, size));
        }
        ListingFilter activeOnly = new ListingFilter(filter.minPrice(), filter.maxPrice(),
                filter.priceNegotiable(), filter.search(), filter.attributes(), false);
        Specification<Listing> idIn = (root, query, cb) -> root.get("id").in(unique);
        Map<UUID, Listing> found = repo.findAll(ListingSpecifications.withFilter(activeOnly).and(idIn)).stream()
                .collect(Collectors.toMap(Listing::getId, Function.identity()));
        List<Listing> ordered = unique.stream().map(found::get).filter(java.util.Objects::nonNull).toList();
        int from = Math.min(page * size, ordered.size());
        int to = Math.min(from + size, ordered.size());
        return new PageImpl<>(ordered.subList(from, to), PageRequest.of(page, size), ordered.size());
    }
}
```

`ListingService.java` ga:
```java
    @Transactional(readOnly = true)
    public Page<Listing> ranked(List<UUID> ids, ListingFilter filter, int page, int size) {
        return RankedListings.page(listings, ids, sanitizeRangeFilters(filter), page, size);
    }
```

`RankedListingsRequest.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** recommendation tartiblagan ID'lar + bozor filtrlari. ids ≤ 1000. */
public record RankedListingsRequest(
        @NotNull @Size(max = 1000) List<UUID> ids,
        BigDecimal minPrice,
        BigDecimal maxPrice,
        Boolean priceNegotiable,
        String search,
        Map<String, Object> attributes,
        @Min(0) int page,
        @Min(1) @Max(100) int size) {
}
```

`ListingController.java` ga (browse'dan keyin):
```java
    /**
     * recommendation-service tartiblagan e'lonlar — marketplace filtrlari va sahifalash bilan,
     * tartib saqlanadi, faqat ACTIVE. Frontend: rec'dan ID'lar → shu endpoint.
     */
    @PostMapping("/ranked")
    public PageResponse<ListingResponse> ranked(@AuthenticationPrincipal AuthenticatedUser viewer,
                                                @Valid @RequestBody RankedListingsRequest request) {
        ListingFilter filter = new ListingFilter(request.minPrice(), request.maxPrice(),
                request.priceNegotiable(), request.search(),
                request.attributes() == null ? Map.of() : request.attributes(), false);
        Page<Listing> page = listingService.ranked(request.ids(), filter, request.page(), request.size());
        UUID viewerId = viewer == null ? null : viewer.userId();
        return new PageResponse<>(assembler.assembleAll(page.getContent(), viewerId),
                page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
    }
```
(`@PostMapping`, `@Valid`, `@RequestBody`, `RankedListingsRequest` import'lari. `SecurityConfig` da `/api/v1/listings/**` POST anonim uchun yopiq bo'lsa, `/api/v1/listings/ranked` POST ni `permitAll` ga qo'shing — mehmon ham "Katta bozor"/tavsiyani ko'radi; buni `RankedListingsControllerTest` da anonim so'rov bilan tekshiring.)

- [ ] **Step 4: Testlar**

Run: Step 2 buyrug'i. Expected: `RankedListingsIT` 2 PASS, controller testlari PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/marketplace-service/src
git commit -m "feat(marketplace): POST /listings/ranked — recommendation tartibi ustida filtr va sahifalash"
```

---

### Task 10: Replay endpoint

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/RecommendationReplayService.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/recommendation/InternalRecommendationController.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/recommendation/RecommendationReplayServiceIT.java`

**Interfaces:**
- Consumes: `Outbox.markSnapshot`, `CardCatalogReader.allIds()`.
- Produces: `RecommendationReplayService.replay() → ReplayResult(int listings, int likes, int cards)`; `POST /internal/marketplace/v1/rec/replay` (`X-Internal-Secret`, `InternalSecretFilter` orqali).

- [ ] **Step 1: Yiqiladigan test**

`RecommendationReplayServiceIT.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.outbox.Outbox;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@Testcontainers(disabledWithoutDocker = true)
class RecommendationReplayServiceIT {

    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private JdbcTemplate jdbc;
    private DataSourceTransactionManager tm;

    @BeforeEach
    void schema() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);
        tm = new DataSourceTransactionManager(ds);
        jdbc.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
        jdbc.execute("""
                CREATE TABLE listings (id UUID PRIMARY KEY);
                CREATE TABLE listing_likes (listing_id UUID NOT NULL, user_id UUID NOT NULL);
                """);
    }

    @Test
    void marksEveryListingLikeAndCardInsideTransactions() {
        UUID l1 = UUID.randomUUID(), l2 = UUID.randomUUID(), user = UUID.randomUUID();
        jdbc.update("INSERT INTO listings VALUES (?), (?)", l1, l2);
        jdbc.update("INSERT INTO listing_likes VALUES (?, ?)", l1, user);
        Outbox outbox = mock(Outbox.class);
        CardCatalogReader catalog = mock(CardCatalogReader.class);
        when(catalog.allIds()).thenReturn(List.of(8900000001L, 8800000002L));

        var result = new RecommendationReplayService(jdbc, catalog, outbox, tm).replay();

        assertThat(result).isEqualTo(new RecommendationReplayService.ReplayResult(2, 1, 2));
        verify(outbox).markSnapshot("listing", l1.toString());
        verify(outbox).markSnapshot("listing", l2.toString());
        verify(outbox).markSnapshot("like", user + ":" + l1);
        verify(outbox).markSnapshot("card", "8900000001");
        verify(outbox).markSnapshot("card", "8800000002");
    }
}
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dtest=NoSuch -Dsurefire.failIfNoSpecifiedTests=false -Dit.test=RecommendationReplayServiceIT -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR.

- [ ] **Step 3: Implementatsiya**

`RecommendationReplayService.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.Outbox;

import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * Hamma e'lon, like va karta uchun snapshot belgisi — recommendation birinchi ishga tushganda
 * yoki qo'lda tuzatishda. Belgi o'zi yuborilmaydi — relay odatdagidek. Takror chaqirish zararsiz.
 */
@Slf4j
@Service
public class RecommendationReplayService {

    private static final int BATCH = 1000;

    private final JdbcTemplate jdbc;
    private final CardCatalogReader catalog;
    private final Outbox outbox;
    private final TransactionTemplate tx;

    public RecommendationReplayService(@Qualifier("marketplaceJdbcTemplate") JdbcTemplate jdbc,
                                       CardCatalogReader catalog, Outbox outbox,
                                       PlatformTransactionManager txManager) {
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.outbox = outbox;
        this.tx = new TransactionTemplate(txManager);
    }

    public record ReplayResult(int listings, int likes, int cards) {}

    public ReplayResult replay() {
        List<String> listings = jdbc.queryForList("SELECT id FROM listings ORDER BY id", UUID.class)
                .stream().map(UUID::toString).toList();
        List<String> likes = jdbc.query("SELECT user_id, listing_id FROM listing_likes ORDER BY listing_id, user_id",
                (rs, n) -> rs.getObject("user_id", UUID.class) + ":" + rs.getObject("listing_id", UUID.class));
        List<String> cards = catalog.allIds().stream().map(String::valueOf).toList();

        markAll(listings, id -> outbox.markSnapshot(RecommendationTopics.SOURCE_LISTING, id));
        markAll(likes, id -> outbox.markSnapshot(RecommendationTopics.SOURCE_LIKE, id));
        markAll(cards, id -> outbox.markSnapshot(RecommendationTopics.SOURCE_CARD, id));
        ReplayResult result = new ReplayResult(listings.size(), likes.size(), cards.size());
        log.info("recommendation replay: {}", result);
        return result;
    }

    private void markAll(List<String> ids, Consumer<String> mark) {
        for (int from = 0; from < ids.size(); from += BATCH) {
            List<String> batch = ids.subList(from, Math.min(from + BATCH, ids.size()));
            tx.executeWithoutResult(status -> batch.forEach(mark));
        }
    }
}
```

`InternalRecommendationController.java`:
```java
package uz.efbazaar.marketplace.recommendation;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** /internal/** — InternalSecretFilter (X-Internal-Secret) himoyalaydi; nginx tashqariga chiqarmaydi. */
@RestController
@RequestMapping("/internal/marketplace/v1/rec")
@RequiredArgsConstructor
public class InternalRecommendationController {

    private final RecommendationReplayService replay;

    @PostMapping("/replay")
    public RecommendationReplayService.ReplayResult replay() {
        return replay.replay();
    }
}
```

- [ ] **Step 4: Testlar**

Run: Step 2 buyrug'i, keyin `mvn -B -ntp test -Dtest='MarketplaceApplicationTests,InternalSecretFilter*' -Dsurefire.failIfNoSpecifiedTests=false`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/marketplace-service/src
git commit -m "feat(marketplace): recommendation replay — barcha snapshot'larni qayta belgilash"
```

---

### Task 11: Hujjatlar va yakuniy tekshiruv

**Files:**
- Modify: `backend/marketplace-service/README.md`, `docs/kafka-topics.md`, `docs/superpowers/specs/2026-09-30-recommendation-service-design.md`

- [ ] **Step 1: Hujjatlar**

`docs/kafka-topics.md` — marketplace jadvaliga:
```markdown
| `efbazaar.marketplace.listing-snapshot` | marketplace (outbox snapshot, trigger) — `{ idempotencyKey, listingId, sellerId, status, price, valueScore, cards: [{efhubId, playerId}], version, occurredAt }` | recommendation (B bosqichidan) |
| `efbazaar.marketplace.card-snapshot` | marketplace (outbox snapshot; META/sync/chegara job) — `{ idempotencyKey, efhubId, playerId, type, overallRating, metaTier, metaPriority, activeFrom, activeUntil, version, occurredAt }` | recommendation (B bosqichidan) |
```
va `like-toggled` qatorini yangilang: producer "marketplace (listing_likes trigger + outbox) — `{ idempotencyKey, listingId, userId, liked, version, occurredAt }`".

`backend/marketplace-service/README.md` — "Kafka" bo'limiga: outbox (`uz.efbazaar:outbox`), V73 trigger'lari, `listing-snapshot`/`card-snapshot`, like-toggled endi outbox orqali; "Asosiy API" ga `POST /listings/ranked` va `?sort=valueScore,desc`; "Ichki" ga `POST /internal/marketplace/v1/rec/replay`; "Rejali job'lar" ga `MetaBoundaryJob` (`META_BOUNDARY_CRON`, `0 5 0 * * *` UTC); "Ma'lumotlar" ga `listings.value_score`, `outbox_*`; konfiguratsiyaga `app.recommendation.value-score.*`, `VALUE_SCORE_BACKFILL_ENABLED`.

Spec §5.4 dagi `GET /listings?sort=value` ni `GET /listings?sort=valueScore,desc` ga; §5.1 dagi "`ON CONFLICT DO NOTHING`" ni "`ON CONFLICT DO UPDATE SET marked_at = clock_timestamp()` (relay yuborayotgan paytdagi o'zgarish yo'qolmasin)" ga almashtiring; §5.2 like payload'iga `idempotencyKey` qo'shing.

- [ ] **Step 2: To'liq tekshiruv (AGENTS.md; CI hozir ishlamaydi — lokal)**

```bash
export JAVA_HOME=~/.jdks/openjdk-21.0.2
(cd backend/libs/outbox && mvn -B -ntp clean install -DargLine="-Dapi.version=1.44")
(cd backend/marketplace-service && mvn -B -ntp clean verify -DargLine="-Dapi.version=1.44")
docker build -f backend/marketplace-service/Dockerfile -t rec-a-check backend
git diff origin/main --check
```
Expected: kutubxona va marketplace BUILD SUCCESS, Surefire/Failsafe failures = errors = skipped (yangi) = 0; image quriladi; `--check` bo'sh. Test yaratgan artefaktlar (masalan `smart-admin-worker/tests/fixtures/crypto_vectors.json`) bo'lsa — faqat ularni tiklang.

- [ ] **Step 3: Commit**

```bash
git add backend/marketplace-service/README.md docs/kafka-topics.md docs/superpowers/specs/2026-09-30-recommendation-service-design.md
git commit -m "docs(marketplace): recommendation snapshot'lari, value_score, ranked, replay"
```
