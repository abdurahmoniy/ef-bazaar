# Outbox 1-bosqich: kutubxona va build/CI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `backend/libs/outbox` umumiy kutubxonasini (transactional outbox + snapshot rejimi) o'z testlari bilan qurish va 4 Java servisning (auth, marketplace, trade, payment) build/CI yo'lini shu kutubxonani ko'radigan qilib o'zgartirish — servislar hali kutubxonani ulamaydi.

**Architecture:** Spring Boot auto-configuration kutubxonasi. `Outbox.publish` faol tranzaksiya ichida payload'ni servisning o'zida sozlangan value serializer bilan baytlarga aylantirib `outbox_events` ga yozadi va commit'dan keyin relay'ni uyg'otadi; relay `FOR UPDATE SKIP LOCKED` bilan partiya olib, baytlar va headerlarni o'zgartirmasdan Kafka'ga yuboradi. Snapshot rejimi `outbox_snapshot_pending` belgilaridan `SnapshotSource.build` orqali hozirgi holatni yuboradi. Docker build context `backend/` ga o'tadi, Dockerfile avval kutubxonani `mvn install` qiladi.

**Tech Stack:** Java 21, Spring Boot 3.3.4 (spring-kafka, spring-jdbc, micrometer), PostgreSQL 16, Kafka 3.7, Testcontainers 1.20.3, JUnit 5, Awaitility, GitHub Actions, Docker.

**Spec:** `docs/superpowers/specs/2026-09-30-transactional-outbox-design.md`

## Global Constraints

- Spring Boot parent `3.3.4`, Java `21`, Testcontainers BOM `1.20.3` — servislar bilan bir xil.
- Kutubxona koordinatalari: `uz.efbazaar:outbox:1.0.0-SNAPSHOT`, paket `uz.efbazaar.outbox`.
- `publish` va `markSnapshot` faqat faol tranzaksiyada; aks holda `IllegalTransactionStateException`.
- Sim ustidagi xabar (payload baytlari va headerlar) servisning `ProducerFactory` value serializer'i chiqaradigan bilan **bayt-ma-bayt bir xil**.
- Sozlamalar default'lari: `outbox.relay.poll-interval=500ms`, `outbox.relay.batch-size=100`, `outbox.relay.send-timeout=10s`, `outbox.cleanup.retention=7d`, `outbox.cleanup.cron=0 15 3 * * *`, `outbox.enabled=true`.
- Relay producer: `enable.idempotence=true`, `acks=all`.
- Metrikalar: `outbox.pending.count`, `outbox.pending.oldest.seconds`, `outbox.send.failures` (Prometheus: `outbox_pending_oldest_seconds` va h.k.). Alert: `outbox_pending_oldest_seconds > 300` 5 daqiqa.
- Bu bosqichda hech bir servis `uz.efbazaar:outbox` ga dependency qo'shmaydi.
- Flyway V-fayllarga tegilmaydi. Commit xabarlarida Claude imzosi / Co-Authored-By yo'q.
- Java testlari: `JAVA_HOME=~/.jdks/openjdk-21.0.2`, Testcontainers uchun `-DargLine="-Dapi.version=1.44"` (lokal muhit), `mvn -B -ntp clean verify` (IT'lar Failsafe'da).

## Review Focus

1. Servis `ProducerFactory` ni serializer **instansiyasi** bilan (class nomi emas) sozlagan — encoder aynan o'sha instansiyani ishlatishi kerak (Task 2 da test).
2. `publish` chaqirilgan tranzaksiya keyin rollback bo'ladi — yozuv ham, relay uyg'otilishi ham bo'lmasligi kerak (Task 3 da test).
3. Kafka `send` osilib qoladi — relay qulfni `send-timeout` dan uzoq ushlamasligi, yozuv `attempts++` bilan qolishi kerak (Task 4 da test).
4. Kalitsiz (`key = null`) xabar — qabul qilinadi va null kalit bilan yuboriladi (Task 4 da test).
5. Relay ichida kutilmagan exception — keyingi aylanish baribir ishlashi kerak, relay "o'lmasligi" kerak (Task 4 da test).

---

## File Structure

```
backend/libs/outbox/
├── pom.xml
├── README.md, CLAUDE.md
└── src/
    ├── main/java/uz/efbazaar/outbox/
    │   ├── Outbox.java                    — public API
    │   ├── SnapshotSource.java            — public SPI (servis beradi)
    │   ├── OutboxProperties.java          — @ConfigurationProperties("outbox")
    │   ├── OutboxAutoConfiguration.java   — bean'lar
    │   └── internal/
    │       ├── OutboxRow.java, SnapshotMark.java, EncodedMessage.java  — record'lar
    │       ├── OutboxRepository.java      — barcha SQL
    │       ├── HeaderCodec.java           — Kafka headers <-> JSON
    │       ├── MessageEncoder.java        — servis serializer'i bilan kodlash
    │       ├── DefaultOutbox.java         — Outbox implementatsiyasi
    │       ├── OutboxSender.java, KafkaOutboxSender.java  — yuborish (testda almashtiriladi)
    │       ├── OutboxRelay.java           — event va snapshot partiyalari
    │       ├── OutboxCleanup.java         — eski yozuvlarni o'chirish
    │       └── OutboxMetrics.java         — MeterBinder
    ├── main/resources/
    │   ├── META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
    │   └── uz/efbazaar/outbox/outbox-schema.sql   — servislar V-migratsiyasiga ko'chiradigan SQL
    └── test/
        ├── java/uz/efbazaar/outbox/it/…   — IT'lar va test ilovasi
        └── resources/application.yml
backend/.dockerignore                       — yangi (context endi backend/)
backend/{auth,marketplace,trade,payment}-service/Dockerfile   — lib install + yo'llar
docker-compose.yml                          — trade, payment build context
.github/workflows/build.yml, ci.yml         — context, lib filtri, lib install
infra/prometheus/rules/efbazaar.yml         — OutboxBacklog alert
AGENTS.md, README.md, CLAUDE.md             — hujjat
```

---

### Task 1: Kutubxona skeleti, sxema va repository

**Files:**
- Create: `backend/libs/outbox/pom.xml`
- Create: `backend/libs/outbox/src/main/resources/uz/efbazaar/outbox/outbox-schema.sql`
- Create: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/internal/OutboxRow.java`
- Create: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/internal/SnapshotMark.java`
- Create: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/internal/OutboxRepository.java`
- Create: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/it/OutboxTestApplication.java`
- Create: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/it/AbstractOutboxIT.java`
- Create: `backend/libs/outbox/src/test/resources/application.yml`
- Test: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/it/OutboxRepositoryIT.java`

**Interfaces:**
- Produces:
  - `record OutboxRow(long id, String topic, String key, byte[] payload, String headersJson)`
  - `record SnapshotMark(String source, String entityId, java.time.Instant markedAt)`
  - `OutboxRepository(JdbcTemplate jdbc)` with:
    `long insert(String topic, String key, byte[] payload, String headersJson)`,
    `List<OutboxRow> claimEvents(int limit)` (tranzaksiya ichida),
    `void markPublished(List<Long> ids)`,
    `void markFailed(long id, String error)`,
    `long pendingCount()`,
    `double oldestPendingAgeSeconds()`,
    `int deletePublishedBefore(Instant cutoff)`,
    `void mark(String source, String entityId)`,
    `List<SnapshotMark> claimSnapshots(int limit)` (tranzaksiya ichida),
    `void deleteSnapshot(SnapshotMark mark)`,
    `long nextSnapshotVersion()`
  - `AbstractOutboxIT` — Postgres + Kafka konteynerlari, `JdbcTemplate jdbc`, `truncate()`.

- [ ] **Step 1: pom.xml yozish**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.3.4</version>
        <relativePath/>
    </parent>

    <groupId>uz.efbazaar</groupId>
    <artifactId>outbox</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <name>outbox</name>
    <description>Transactional outbox for efBazaar services</description>

    <properties>
        <java.version>21</java.version>
        <testcontainers.version>1.20.3</testcontainers.version>
    </properties>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.testcontainers</groupId>
                <artifactId>testcontainers-bom</artifactId>
                <version>${testcontainers.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-autoconfigure</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-jdbc</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.kafka</groupId>
            <artifactId>spring-kafka</artifactId>
        </dependency>
        <dependency>
            <groupId>io.micrometer</groupId>
            <artifactId>micrometer-core</artifactId>
        </dependency>
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-databind</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-configuration-processor</artifactId>
            <optional>true</optional>
        </dependency>

        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.testcontainers</groupId>
            <artifactId>junit-jupiter</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.testcontainers</groupId>
            <artifactId>postgresql</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.testcontainers</groupId>
            <artifactId>kafka</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.awaitility</groupId>
            <artifactId>awaitility</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <!-- *IT.java — Testcontainers IT'lar. Failsafe bog'lanmasa `mvn verify` ularni jim o'tkazib yuboradi. -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-failsafe-plugin</artifactId>
                <executions>
                    <execution>
                        <goals>
                            <goal>integration-test</goal>
                            <goal>verify</goal>
                        </goals>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>
```

`spring-boot-maven-plugin` qo'shilmaydi — kutubxona oddiy jar (repackage kerak emas).

- [ ] **Step 2: Sxema SQL**

`backend/libs/outbox/src/main/resources/uz/efbazaar/outbox/outbox-schema.sql`:

```sql
-- Transactional outbox. Servis shu faylni o'z Flyway V-migratsiyasiga
-- ko'chiradi (uz.efbazaar:outbox README'si). IF NOT EXISTS — kutubxona
-- testlari bir necha Spring konteksti bilan ishlaganda ham xavfsiz.
CREATE TABLE IF NOT EXISTS outbox_events (
    id           BIGSERIAL PRIMARY KEY,
    topic        TEXT        NOT NULL,
    message_key  TEXT,
    payload      BYTEA       NOT NULL,
    headers      JSONB       NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    attempts     INT         NOT NULL DEFAULT 0,
    last_error   TEXT
);
CREATE INDEX IF NOT EXISTS outbox_events_pending_idx
    ON outbox_events (id) WHERE published_at IS NULL;

-- Snapshot rejimi: "shu entity o'zgardi" belgisi. Relay hozirgi holatni
-- SnapshotSource.build orqali o'qib yuboradi.
CREATE TABLE IF NOT EXISTS outbox_snapshot_pending (
    source    TEXT        NOT NULL,
    entity_id TEXT        NOT NULL,
    marked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (source, entity_id)
);
CREATE SEQUENCE IF NOT EXISTS outbox_snapshot_version_seq;
```

`marked_at` uchun `clock_timestamp()`: `now()` tranzaksiya boshlangan vaqtni qaytaradi — relay ishlayotganda boshqa tranzaksiya qo'ygan belgi eskiroq vaqt olib, relay uni noto'g'ri o'chirib yuborishi mumkin edi.

- [ ] **Step 3: Record'lar**

`OutboxRow.java`:
```java
package uz.efbazaar.outbox.internal;

/** outbox_events dan olingan, hali yuborilmagan yozuv. */
public record OutboxRow(long id, String topic, String key, byte[] payload, String headersJson) {
}
```

`SnapshotMark.java`:
```java
package uz.efbazaar.outbox.internal;

import java.time.Instant;

/** "Shu entity o'zgardi" belgisi. markedAt — relay faqat o'zi ko'rgan belgini o'chirishi uchun. */
public record SnapshotMark(String source, String entityId, Instant markedAt) {
}
```

- [ ] **Step 4: Test infratuzilmasi**

`src/test/resources/application.yml`:
```yaml
spring:
  kafka:
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
  sql:
    init:
      mode: always
      schema-locations: classpath:uz/efbazaar/outbox/outbox-schema.sql
outbox:
  relay:
    send-timeout: 3s
    # Zaxira polling amalda o'chiq: yetkazish faqat commit'dagi uyg'otish yoki
    # testning drainNow() chaqiruvidan keladi. Barcha IT'lar AYNAN SHU sozlama bilan
    # bitta Spring kontekstini bo'lishadi — alohida kontekstlarning relay'lari bir-birining
    # "yiqilishi kerak" bo'lgan yozuvlarini yuborib yubormasligi uchun @TestPropertySource ishlatmang.
    poll-interval: 1h
```

`OutboxTestApplication.java`:
```java
package uz.efbazaar.outbox.it;

import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class OutboxTestApplication {
}
```

`AbstractOutboxIT.java`:
```java
package uz.efbazaar.outbox.it;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.utility.DockerImageName;

/** Butun test JVM uchun bitta Postgres va bitta Kafka (servislardagi AbstractIntegrationIT bilan bir xil uslub). */
@SpringBootTest(classes = OutboxTestApplication.class)
public abstract class AbstractOutboxIT {

    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"))
                    .withDatabaseName("outbox_test")
                    .withUsername("test")
                    .withPassword("test");

    protected static final KafkaContainer KAFKA =
            new KafkaContainer(DockerImageName.parse("apache/kafka:3.7.0"));

    static {
        POSTGRES.start();
        KAFKA.start();
    }

    @DynamicPropertySource
    static void register(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
        r.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
    }

    @Autowired
    protected JdbcTemplate jdbc;

    @BeforeEach
    void truncate() {
        jdbc.execute("TRUNCATE outbox_events, outbox_snapshot_pending");
    }
}
```

- [ ] **Step 5: Yiqiladigan repository testi**

`OutboxRepositoryIT.java`:
```java
package uz.efbazaar.outbox.it;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.internal.OutboxRepository;
import uz.efbazaar.outbox.internal.OutboxRow;
import uz.efbazaar.outbox.internal.SnapshotMark;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class OutboxRepositoryIT extends AbstractOutboxIT {

    @Autowired OutboxRepository repo;
    @Autowired TransactionTemplate tx;

    private long insert(String topic) {
        return repo.insert(topic, "k", "{}".getBytes(StandardCharsets.UTF_8), "[]");
    }

    @Test
    void claimsPendingInIdOrderAndSkipsPublished() {
        long a = insert("t1");
        long b = insert("t2");
        repo.markPublished(List.of(a));

        List<OutboxRow> rows = tx.execute(s -> repo.claimEvents(10));

        assertThat(rows).extracting(OutboxRow::id).containsExactly(b);
        assertThat(rows.get(0).topic()).isEqualTo("t2");
        assertThat(rows.get(0).key()).isEqualTo("k");
    }

    @Test
    void twoConcurrentClaimersNeverGetTheSameRow() throws Exception {
        for (int i = 0; i < 6; i++) insert("t");
        CountDownLatch firstHolds = new CountDownLatch(1);
        CountDownLatch secondDone = new CountDownLatch(1);

        CompletableFuture<List<OutboxRow>> first = CompletableFuture.supplyAsync(() ->
                tx.execute(s -> {
                    List<OutboxRow> rows = repo.claimEvents(3);
                    firstHolds.countDown();
                    await(secondDone);
                    return rows;
                }));
        firstHolds.await(10, TimeUnit.SECONDS);
        List<OutboxRow> second = tx.execute(s -> repo.claimEvents(10));
        secondDone.countDown();

        assertThat(first.get(10, TimeUnit.SECONDS)).extracting(OutboxRow::id)
                .doesNotContainAnyElementsOf(second.stream().map(OutboxRow::id).toList());
        assertThat(first.get().size() + second.size()).isEqualTo(6);
    }

    @Test
    void markFailedIncrementsAttemptsAndKeepsRowPending() {
        long id = insert("t");
        repo.markFailed(id, "boom");
        repo.markFailed(id, "boom again");

        assertThat(jdbc.queryForObject("SELECT attempts FROM outbox_events WHERE id = ?", Integer.class, id)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT last_error FROM outbox_events WHERE id = ?", String.class, id)).isEqualTo("boom again");
        assertThat(repo.pendingCount()).isEqualTo(1);
    }

    @Test
    void oldestPendingAgeIsZeroWhenEmptyAndGrowsWithOldRows() {
        assertThat(repo.oldestPendingAgeSeconds()).isZero();
        long id = insert("t");
        jdbc.update("UPDATE outbox_events SET created_at = now() - interval '10 minutes' WHERE id = ?", id);
        assertThat(repo.oldestPendingAgeSeconds()).isGreaterThanOrEqualTo(600);
    }

    @Test
    void deletesOnlyPublishedRowsOlderThanCutoff() {
        long oldPublished = insert("t");
        long oldPending = insert("t");
        repo.markPublished(List.of(oldPublished));
        jdbc.update("UPDATE outbox_events SET published_at = now() - interval '8 days', created_at = now() - interval '8 days' WHERE id = ?", oldPublished);

        int deleted = repo.deletePublishedBefore(Instant.now().minusSeconds(7 * 24 * 3600));

        assertThat(deleted).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT id FROM outbox_events", Long.class)).containsExactly(oldPending);
    }

    @Test
    void markCoalescesAndDeleteSkipsNewerMark() {
        repo.mark("listing", "L1");
        repo.mark("listing", "L1");
        SnapshotMark seen = tx.execute(s -> repo.claimSnapshots(10)).get(0);

        repo.mark("listing", "L1");      // relay ko'rgandan keyin yangi o'zgarish
        repo.deleteSnapshot(seen);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isEqualTo(1);
    }

    @Test
    void snapshotVersionsAreMonotonic() {
        long v1 = repo.nextSnapshotVersion();
        long v2 = repo.nextSnapshotVersion();
        assertThat(v2).isGreaterThan(v1);
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

`OutboxRepository` hali yo'q va auto-configuration ham yo'q — test konteksti bean topolmaydi. Vaqtincha test ilovasiga bean qo'shish o'rniga Task 1 da repository bean'ini auto-configuration orqali beramiz (Step 7).

- [ ] **Step 6: Testni ishga tushirib yiqilishini ko'rish**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dit.test=OutboxRepositoryIT -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR — `OutboxRepository` topilmadi.

- [ ] **Step 7: Repository va minimal auto-configuration**

`OutboxRepository.java`:
```java
package uz.efbazaar.outbox.internal;

import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/** Outbox'ning barcha SQL'i shu yerda. claim* metodlari chaqiruvchining tranzaksiyasida ishlaydi. */
public class OutboxRepository {

    private final JdbcTemplate jdbc;

    public OutboxRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long insert(String topic, String key, byte[] payload, String headersJson) {
        Long id = jdbc.queryForObject("""
                INSERT INTO outbox_events (topic, message_key, payload, headers)
                VALUES (?, ?, ?, ?::jsonb)
                RETURNING id
                """, Long.class, topic, key, payload, headersJson);
        return id == null ? -1 : id;
    }

    public List<OutboxRow> claimEvents(int limit) {
        return jdbc.query("""
                SELECT id, topic, message_key, payload, headers::text AS headers
                  FROM outbox_events
                 WHERE published_at IS NULL
                 ORDER BY id
                 LIMIT ?
                   FOR UPDATE SKIP LOCKED
                """, (rs, n) -> new OutboxRow(rs.getLong("id"), rs.getString("topic"),
                rs.getString("message_key"), rs.getBytes("payload"), rs.getString("headers")), limit);
    }

    public void markPublished(List<Long> ids) {
        if (ids.isEmpty()) {
            return;
        }
        jdbc.update("UPDATE outbox_events SET published_at = now() WHERE id = ANY (?)",
                (Object) ids.toArray(Long[]::new));
    }

    public void markFailed(long id, String error) {
        jdbc.update("UPDATE outbox_events SET attempts = attempts + 1, last_error = ? WHERE id = ?",
                error, id);
    }

    public long pendingCount() {
        Long n = jdbc.queryForObject(
                "SELECT count(*) FROM outbox_events WHERE published_at IS NULL", Long.class);
        return n == null ? 0 : n;
    }

    public double oldestPendingAgeSeconds() {
        Double age = jdbc.queryForObject("""
                SELECT COALESCE(EXTRACT(EPOCH FROM now() - min(created_at)), 0)
                  FROM outbox_events WHERE published_at IS NULL
                """, Double.class);
        return age == null ? 0 : age;
    }

    public int deletePublishedBefore(Instant cutoff) {
        return jdbc.update("DELETE FROM outbox_events WHERE published_at < ?", Timestamp.from(cutoff));
    }

    public void mark(String source, String entityId) {
        jdbc.update("""
                INSERT INTO outbox_snapshot_pending (source, entity_id)
                VALUES (?, ?)
                ON CONFLICT (source, entity_id) DO UPDATE SET marked_at = clock_timestamp()
                """, source, entityId);
    }

    public List<SnapshotMark> claimSnapshots(int limit) {
        return jdbc.query("""
                SELECT source, entity_id, marked_at
                  FROM outbox_snapshot_pending
                 ORDER BY marked_at
                 LIMIT ?
                   FOR UPDATE SKIP LOCKED
                """, (rs, n) -> new SnapshotMark(rs.getString("source"), rs.getString("entity_id"),
                rs.getTimestamp("marked_at").toInstant()), limit);
    }

    public void deleteSnapshot(SnapshotMark mark) {
        jdbc.update("""
                DELETE FROM outbox_snapshot_pending
                 WHERE source = ? AND entity_id = ? AND marked_at <= ?
                """, mark.source(), mark.entityId(), Timestamp.from(mark.markedAt()));
    }

    public long nextSnapshotVersion() {
        Long v = jdbc.queryForObject("SELECT nextval('outbox_snapshot_version_seq')", Long.class);
        return v == null ? 0 : v;
    }
}
```

`markCoalescesAndDeleteSkipsNewerMark` testida ikkinchi `mark` relay'ning tranzaksiyasi tugagandan keyin keladi (`tx.execute` qaytgan) — qulf yo'q, `ON CONFLICT DO UPDATE` `marked_at` ni yangilaydi va `deleteSnapshot` uni o'chirmaydi.

`OutboxAutoConfiguration.java` (minimal — keyingi task'larda to'ldiriladi):
```java
package uz.efbazaar.outbox;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.jdbc.JdbcTemplateAutoConfiguration;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.outbox.internal.OutboxRepository;

@AutoConfiguration(after = {JdbcTemplateAutoConfiguration.class, KafkaAutoConfiguration.class})
@ConditionalOnProperty(prefix = "outbox", name = "enabled", havingValue = "true", matchIfMissing = true)
@ConditionalOnBean(JdbcTemplate.class)
@EnableConfigurationProperties(OutboxProperties.class)
public class OutboxAutoConfiguration {

    @Bean
    OutboxRepository outboxRepository(JdbcTemplate jdbc) {
        return new OutboxRepository(jdbc);
    }
}
```

`OutboxProperties.java`:
```java
package uz.efbazaar.outbox;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("outbox")
public class OutboxProperties {

    /** false bo'lsa hech bir outbox bean'i yaratilmaydi. */
    private boolean enabled = true;
    private final Relay relay = new Relay();
    private final Cleanup cleanup = new Cleanup();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Relay getRelay() { return relay; }
    public Cleanup getCleanup() { return cleanup; }

    public static class Relay {
        /** Zaxira polling; odatda relay commit'da uyg'onadi. */
        private Duration pollInterval = Duration.ofMillis(500);
        private int batchSize = 100;
        /** Bitta yozuvning Kafka tasdig'ini kutish chegarasi — qulf shundan uzoq ushlanmaydi. */
        private Duration sendTimeout = Duration.ofSeconds(10);

        public Duration getPollInterval() { return pollInterval; }
        public void setPollInterval(Duration pollInterval) { this.pollInterval = pollInterval; }
        public int getBatchSize() { return batchSize; }
        public void setBatchSize(int batchSize) { this.batchSize = batchSize; }
        public Duration getSendTimeout() { return sendTimeout; }
        public void setSendTimeout(Duration sendTimeout) { this.sendTimeout = sendTimeout; }
    }

    public static class Cleanup {
        private Duration retention = Duration.ofDays(7);
        private String cron = "0 15 3 * * *";

        public Duration getRetention() { return retention; }
        public void setRetention(Duration retention) { this.retention = retention; }
        public String getCron() { return cron; }
        public void setCron(String cron) { this.cron = cron; }
    }
}
```

`src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`:
```
uz.efbazaar.outbox.OutboxAutoConfiguration
```

- [ ] **Step 8: Testlar o'tishini tekshirish**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dit.test=OutboxRepositoryIT -DargLine="-Dapi.version=1.44"`
Expected: `OutboxRepositoryIT` — 7 test PASS, BUILD SUCCESS.

- [ ] **Step 9: Commit**

```bash
git add backend/libs/outbox
git commit -m "feat(outbox): kutubxona skeleti, sxema va repository"
```

---

### Task 2: Xabarni servis serializer'i bilan kodlash

**Files:**
- Create: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/internal/EncodedMessage.java`
- Create: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/internal/HeaderCodec.java`
- Create: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/internal/MessageEncoder.java`
- Modify: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/OutboxAutoConfiguration.java`
- Test: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/internal/HeaderCodecTest.java`
- Test: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/internal/MessageEncoderTest.java`

**Interfaces:**
- Consumes: —
- Produces:
  - `record EncodedMessage(byte[] payload, String headersJson)`
  - `HeaderCodec`: `static String toJson(org.apache.kafka.common.header.Headers headers)`, `static List<org.apache.kafka.common.header.Header> fromJson(String json)`
  - `MessageEncoder(ProducerFactory<?, ?> producerFactory)`: `EncodedMessage encode(String topic, Object payload)`

- [ ] **Step 1: Yiqiladigan testlar**

`HeaderCodecTest.java`:
```java
package uz.efbazaar.outbox.internal;

import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class HeaderCodecTest {

    @Test
    void roundTripsNamesValuesOrderAndDuplicates() {
        RecordHeaders headers = new RecordHeaders();
        headers.add("__TypeId__", "uz.efbazaar.X".getBytes(StandardCharsets.UTF_8));
        headers.add("dup", new byte[]{1, 2});
        headers.add("dup", new byte[]{3});
        headers.add("nullValue", null);

        List<Header> back = HeaderCodec.fromJson(HeaderCodec.toJson(headers));

        assertThat(back).extracting(Header::key).containsExactly("__TypeId__", "dup", "dup", "nullValue");
        assertThat(back.get(0).value()).isEqualTo("uz.efbazaar.X".getBytes(StandardCharsets.UTF_8));
        assertThat(back.get(1).value()).containsExactly(1, 2);
        assertThat(back.get(2).value()).containsExactly(3);
        assertThat(back.get(3).value()).isNull();
    }

    @Test
    void emptyHeadersEncodeAsEmptyArray() {
        assertThat(HeaderCodec.toJson(new RecordHeaders())).isEqualTo("[]");
        assertThat(HeaderCodec.fromJson("[]")).isEmpty();
    }
}
```

`MessageEncoderTest.java`:
```java
package uz.efbazaar.outbox.internal;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class MessageEncoderTest {

    public record Sample(String name, int n) {}

    @Test
    void usesSerializerConfiguredByClassName() {
        DefaultKafkaProducerFactory<String, Object> pf = new DefaultKafkaProducerFactory<>(Map.of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:1",
                ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class,
                ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class));

        EncodedMessage encoded = new MessageEncoder(pf).encode("t", new Sample("a", 1));

        RecordHeaders expectedHeaders = new RecordHeaders();
        byte[] expected;
        try (JsonSerializer<Object> reference = new JsonSerializer<>()) {
            expected = reference.serialize("t", expectedHeaders, new Sample("a", 1));
        }
        assertThat(encoded.payload()).isEqualTo(expected);
        assertThat(HeaderCodec.fromJson(encoded.headersJson())).extracting(Header::key)
                .containsExactly("__TypeId__");
        assertThat(new String(HeaderCodec.fromJson(encoded.headersJson()).get(0).value(), StandardCharsets.UTF_8))
                .isEqualTo(Sample.class.getName());
    }

    @Test
    void usesSerializerInstanceWhenFactoryHasOne() {
        JsonSerializer<Object> custom = new JsonSerializer<>();
        custom.setAddTypeInfo(false);
        DefaultKafkaProducerFactory<String, Object> pf = new DefaultKafkaProducerFactory<>(Map.of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:1"),
                new StringSerializer(), custom);

        EncodedMessage encoded = new MessageEncoder(pf).encode("t", new Sample("a", 1));

        assertThat(HeaderCodec.fromJson(encoded.headersJson())).isEmpty();
        assertThat(new String(encoded.payload(), StandardCharsets.UTF_8)).isEqualTo("{\"name\":\"a\",\"n\":1}");
    }
}
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest='HeaderCodecTest,MessageEncoderTest'`
Expected: COMPILATION ERROR — `HeaderCodec`, `MessageEncoder`, `EncodedMessage` yo'q.

- [ ] **Step 3: Implementatsiya**

`EncodedMessage.java`:
```java
package uz.efbazaar.outbox.internal;

/** Serializer chiqargan baytlar va u qo'shgan headerlar (JSON). */
public record EncodedMessage(byte[] payload, String headersJson) {
}
```

`HeaderCodec.java`:
```java
package uz.efbazaar.outbox.internal;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.header.Headers;
import org.apache.kafka.common.header.internals.RecordHeader;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/**
 * Kafka headerlari JSON massiv sifatida: [{"k": "...", "v": "<base64>|null"}].
 * Massiv — chunki header nomi takrorlanishi mumkin va tartib muhim.
 */
public final class HeaderCodec {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private record Entry(String k, String v) {}

    private HeaderCodec() {
    }

    public static String toJson(Headers headers) {
        List<Entry> entries = new ArrayList<>();
        for (Header h : headers) {
            entries.add(new Entry(h.key(), h.value() == null ? null : Base64.getEncoder().encodeToString(h.value())));
        }
        try {
            return MAPPER.writeValueAsString(entries);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Kafka headerlarini JSON'ga aylantirib bo'lmadi", e);
        }
    }

    public static List<Header> fromJson(String json) {
        try {
            List<Entry> entries = MAPPER.readValue(json, new TypeReference<List<Entry>>() {});
            List<Header> headers = new ArrayList<>(entries.size());
            for (Entry e : entries) {
                headers.add(new RecordHeader(e.k(), e.v() == null ? null : Base64.getDecoder().decode(e.v())));
            }
            return headers;
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("outbox headers JSON'i buzilgan: " + json, e);
        }
    }
}
```

`MessageEncoder.java`:
```java
package uz.efbazaar.outbox.internal;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.apache.kafka.common.serialization.Serializer;
import org.springframework.beans.BeanUtils;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.util.ClassUtils;

import java.util.Map;

/**
 * Payload'ni servisning O'ZI sozlagan value serializer bilan kodlaydi.
 *
 * <p>Maqsad — relay yuboradigan xabar hozirgi {@code kafkaTemplate.send} chiqaradigan
 * xabar bilan bayt-ma-bayt bir xil bo'lishi: consumer'lar outbox'ga o'tilganini sezmasin.
 * Shuning uchun serializer servisning {@link ProducerFactory} sidan olinadi — instansiya
 * berilgan bo'lsa o'sha, bo'lmasa sozlamadagi klass o'sha sozlamalar bilan.
 */
public class MessageEncoder {

    private final Serializer<Object> serializer;

    public MessageEncoder(ProducerFactory<?, ?> producerFactory) {
        this.serializer = resolve(producerFactory);
    }

    public EncodedMessage encode(String topic, Object payload) {
        RecordHeaders headers = new RecordHeaders();
        byte[] bytes = serializer.serialize(topic, headers, payload);
        return new EncodedMessage(bytes, HeaderCodec.toJson(headers));
    }

    @SuppressWarnings("unchecked")
    private static Serializer<Object> resolve(ProducerFactory<?, ?> pf) {
        // Factory serializer INSTANSIYASI bilan qurilgan bo'lsa — aynan o'sha (maxsus ObjectMapper va h.k.).
        Serializer<?> instance = pf.getValueSerializer();
        if (instance != null) {
            return (Serializer<Object>) instance;
        }
        Map<String, Object> config = pf.getConfigurationProperties();
        Object configured = config.get(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG);
        if (configured == null) {
            throw new IllegalStateException("spring.kafka.producer.value-serializer sozlanmagan");
        }
        Class<?> type = configured instanceof Class<?> c
                ? c
                : ClassUtils.resolveClassName(configured.toString(), MessageEncoder.class.getClassLoader());
        Serializer<Object> serializer = (Serializer<Object>) BeanUtils.instantiateClass(type);
        serializer.configure(config, false);
        return serializer;
    }
}
```

`OutboxAutoConfiguration` ga qo'shish:
```java
    @Bean
    MessageEncoder outboxMessageEncoder(org.springframework.kafka.core.ProducerFactory<?, ?> producerFactory) {
        return new MessageEncoder(producerFactory);
    }
```
(import: `uz.efbazaar.outbox.internal.MessageEncoder`)

- [ ] **Step 4: Testlar o'tishi**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest='HeaderCodecTest,MessageEncoderTest'`
Expected: 4 test PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/libs/outbox
git commit -m "feat(outbox): xabarni servis serializer'i bilan kodlash"
```

---

### Task 3: `Outbox` API — tranzaksiya talabi va commit'da uyg'otish

**Files:**
- Create: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/Outbox.java`
- Create: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/SnapshotSource.java`
- Create: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/internal/DefaultOutbox.java`
- Modify: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/OutboxAutoConfiguration.java`
- Test: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/it/OutboxPublishIT.java`

**Interfaces:**
- Consumes: `OutboxRepository.insert/mark`, `MessageEncoder.encode`
- Produces:
  - `interface Outbox { void publish(String topic, String key, Object payload); void markSnapshot(String source, String entityId); }`
  - `interface SnapshotSource { String source(); String topic(); default String key(String entityId) { return entityId; } Optional<Object> build(String entityId, long version); }`
  - `DefaultOutbox(OutboxRepository repo, MessageEncoder encoder, Runnable wake)`
  - Auto-config bean `Outbox outbox(...)` — `wake` Task 4 da relay'ga ulanadi; bu task'da `() -> {}`.

- [ ] **Step 1: Yiqiladigan test**

`OutboxPublishIT.java`:
```java
package uz.efbazaar.outbox.it;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.Outbox;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OutboxPublishIT extends AbstractOutboxIT {

    @Autowired Outbox outbox;
    @Autowired TransactionTemplate tx;

    @Test
    void publishOutsideTransactionIsRejected() {
        assertThatThrownBy(() -> outbox.publish("t", "k", Map.of("a", 1)))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThatThrownBy(() -> outbox.markSnapshot("listing", "L1"))
                .isInstanceOf(IllegalTransactionStateException.class);
    }

    @Test
    void committedPublishIsStored() {
        tx.executeWithoutResult(s -> outbox.publish("t", "k", Map.of("a", 1)));

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM outbox_events WHERE topic = 't' AND message_key = 'k'", Long.class))
                .isEqualTo(1);
    }

    @Test
    void rolledBackPublishLeavesNothing() {
        tx.executeWithoutResult(s -> {
            outbox.publish("t", "k", Map.of("a", 1));
            outbox.markSnapshot("listing", "L1");
            s.setRollbackOnly();
        });

        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isZero();
    }

    @Test
    void nullKeyIsAccepted() {
        tx.executeWithoutResult(s -> outbox.publish("t", null, Map.of("a", 1)));

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM outbox_events WHERE message_key IS NULL", Long.class)).isEqualTo(1);
    }
}
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dit.test=OutboxPublishIT -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR — `Outbox` yo'q.

- [ ] **Step 3: Implementatsiya**

`Outbox.java`:
```java
package uz.efbazaar.outbox;

/**
 * Kafka'ga ishonchli yozish. Ikkala metod ham FAOL TRANZAKSIYA ichida chaqirilishi shart —
 * event biznes o'zgarishi bilan birga commit bo'ladi yoki birga bekor bo'ladi.
 * Tranzaksiyasiz chaqiruv {@link org.springframework.transaction.IllegalTransactionStateException} beradi.
 */
public interface Outbox {

    /** Payload servisning sozlangan value serializer'i bilan kodlanadi; kalit null bo'lishi mumkin. */
    void publish(String topic, String key, Object payload);

    /** "Shu entity o'zgardi" — relay {@link SnapshotSource} orqali hozirgi holatni yuboradi. */
    void markSnapshot(String source, String entityId);
}
```

`SnapshotSource.java`:
```java
package uz.efbazaar.outbox;

import java.util.Optional;

/** Servis beradigan bean: belgilangan entity'ning hozirgi holatini quradi. */
public interface SnapshotSource {

    /** outbox_snapshot_pending.source qiymati, masalan "listing". */
    String source();

    String topic();

    /** Kafka kaliti; default — entityId. */
    default String key(String entityId) {
        return entityId;
    }

    /** Bo'sh bo'lsa hech narsa yuborilmaydi va belgi o'chiriladi. version — monoton. */
    Optional<Object> build(String entityId, long version);
}
```

`DefaultOutbox.java`:
```java
package uz.efbazaar.outbox.internal;

import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import uz.efbazaar.outbox.Outbox;

public class DefaultOutbox implements Outbox {

    private final OutboxRepository repo;
    private final MessageEncoder encoder;
    private final Runnable wake;

    public DefaultOutbox(OutboxRepository repo, MessageEncoder encoder, Runnable wake) {
        this.repo = repo;
        this.encoder = encoder;
        this.wake = wake;
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

    private static void requireTransaction(String operation) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalTransactionStateException(
                    "Outbox." + operation + " faqat faol tranzaksiya ichida chaqiriladi");
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

`OutboxAutoConfiguration` ga qo'shish (Task 4 da `wake` relay'ga almashtiriladi):
```java
    @Bean
    Outbox outbox(OutboxRepository repo, MessageEncoder encoder) {
        return new DefaultOutbox(repo, encoder, () -> { });
    }
```
(import: `uz.efbazaar.outbox.internal.DefaultOutbox`)

Test uchun `TransactionTemplate` bean'i Spring Boot `TransactionAutoConfiguration` dan keladi (`spring-boot-starter-jdbc` `DataSourceTransactionManager` beradi).

- [ ] **Step 4: Testlar o'tishi**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dit.test='OutboxPublishIT,OutboxRepositoryIT' -DargLine="-Dapi.version=1.44"`
Expected: 11 test PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/libs/outbox
git commit -m "feat(outbox): Outbox API — tranzaksiya talabi va commit'dan keyingi hook"
```

---

### Task 4: Relay — event partiyalari

**Files:**
- Create: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/internal/OutboxSender.java`
- Create: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/internal/KafkaOutboxSender.java`
- Create: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/internal/OutboxRelay.java`
- Modify: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/OutboxAutoConfiguration.java`
- Create: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/it/ControllableSender.java`
- Test: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/it/OutboxRelayIT.java`

**Interfaces:**
- Consumes: `OutboxRepository.claimEvents/markPublished/markFailed`, `HeaderCodec.fromJson`
- Produces:
  - `interface OutboxSender { CompletableFuture<?> send(String topic, String key, byte[] payload, List<Header> headers); }`
  - `KafkaOutboxSender(ProducerFactory<?, ?> servicePf)` — idempotent producer, `StringSerializer`/`ByteArraySerializer`, `destroy()`
  - `OutboxRelay(OutboxRepository repo, OutboxSender sender, TransactionTemplate tx, OutboxProperties props, List<SnapshotSource> sources, MessageEncoder encoder, io.micrometer.core.instrument.MeterRegistry registry)`:
    `void wake()`, `void poll()` (`@Scheduled`), `void drainNow()` (testlar uchun sinxron), `void shutdown()`
  - Snapshot qismi Task 5 da; bu task'da `sources` bo'sh ro'yxat bo'lishi mumkin.

- [ ] **Step 1: Test uchun boshqariladigan sender**

`ControllableSender.java`:
```java
package uz.efbazaar.outbox.it;

import org.apache.kafka.common.header.Header;
import uz.efbazaar.outbox.internal.OutboxSender;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;

/** Haqiqiy sender'ni o'raydi; testda yiqilish yoki osilish rejimini yoqish mumkin. */
public class ControllableSender implements OutboxSender {

    public enum Mode { PASS, FAIL, HANG, THROW }

    private final OutboxSender delegate;
    private final AtomicReference<Mode> mode = new AtomicReference<>(Mode.PASS);
    private final java.util.concurrent.atomic.AtomicInteger failures = new java.util.concurrent.atomic.AtomicInteger();

    public ControllableSender(OutboxSender delegate) {
        this.delegate = delegate;
    }

    public void mode(Mode m) {
        mode.set(m);
        failures.set(0);
    }

    /** Oxirgi mode() dan beri FAIL/HANG/THROW bilan qaytarilgan yuborishlar. */
    public int failuresSeen() {
        return failures.get();
    }

    @Override
    public CompletableFuture<?> send(String topic, String key, byte[] payload, List<Header> headers) {
        Mode current = mode.get();
        if (current != Mode.PASS) {
            failures.incrementAndGet();
        }
        return switch (current) {
            case PASS -> delegate.send(topic, key, payload, headers);
            case FAIL -> CompletableFuture.failedFuture(new IllegalStateException("broker down"));
            case HANG -> new CompletableFuture<>();
            case THROW -> throw new IllegalStateException("unexpected");
        };
    }
}
```

`OutboxTestApplication.java` ga test konfiguratsiyasi qo'shiladi:
```java
package uz.efbazaar.outbox.it;

import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.kafka.core.ProducerFactory;
import uz.efbazaar.outbox.internal.KafkaOutboxSender;

@SpringBootApplication
public class OutboxTestApplication {

    @Bean
    KafkaOutboxSender realSender(ProducerFactory<?, ?> pf) {
        return new KafkaOutboxSender(pf);
    }

    @Bean
    @Primary
    ControllableSender controllableSender(KafkaOutboxSender real) {
        return new ControllableSender(real);
    }
}
```

- [ ] **Step 2: Yiqiladigan relay testlari**

`OutboxRelayIT.java`:
```java
package uz.efbazaar.outbox.it;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.Outbox;
import uz.efbazaar.outbox.internal.OutboxRelay;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

class OutboxRelayIT extends AbstractOutboxIT {

    public record Sample(String name, int n) {}

    @Autowired Outbox outbox;
    @Autowired OutboxRelay relay;
    @Autowired TransactionTemplate tx;
    @Autowired ControllableSender sender;
    @Autowired KafkaTemplate<Object, Object> directTemplate;

    @AfterEach
    void reset() {
        sender.mode(ControllableSender.Mode.PASS);
    }

    private String topic() {
        return "it-" + UUID.randomUUID();
    }

    private List<ConsumerRecord<String, byte[]>> consume(String topic, int expected) {
        Map<String, Object> props = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "it-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class);
        List<ConsumerRecord<String, byte[]>> out = new ArrayList<>();
        try (KafkaConsumer<String, byte[]> consumer = new KafkaConsumer<>(props)) {
            consumer.subscribe(List.of(topic));
            long deadline = System.currentTimeMillis() + 15_000;
            while (out.size() < expected && System.currentTimeMillis() < deadline) {
                consumer.poll(Duration.ofMillis(200)).forEach(out::add);
            }
        }
        return out;
    }

    @Test
    void deliversOnCommitWithoutWaitingForPoll() {
        String topic = topic();
        long start = System.nanoTime();
        tx.executeWithoutResult(s -> outbox.publish(topic, "k1", new Sample("a", 1)));

        await().atMost(Duration.ofSeconds(5)).until(() -> relay.pendingIsEmpty());
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(2));
        assertThat(consume(topic, 1)).hasSize(1);
    }

    @Test
    void wireFormatIsIdenticalToDirectSend() throws Exception {
        String viaOutbox = topic();
        String direct = topic();
        tx.executeWithoutResult(s -> outbox.publish(viaOutbox, "k", new Sample("a", 1)));
        directTemplate.send(direct, "k", new Sample("a", 1)).get();

        ConsumerRecord<String, byte[]> a = consume(viaOutbox, 1).get(0);
        ConsumerRecord<String, byte[]> b = consume(direct, 1).get(0);

        assertThat(a.key()).isEqualTo(b.key());
        assertThat(a.value()).isEqualTo(b.value());
        assertThat(new String(a.headers().lastHeader("__TypeId__").value(), StandardCharsets.UTF_8))
                .isEqualTo(new String(b.headers().lastHeader("__TypeId__").value(), StandardCharsets.UTF_8));
    }

    @Test
    void keepsPerKeyOrder() {
        String topic = topic();
        for (int i = 0; i < 20; i++) {
            int n = i;
            tx.executeWithoutResult(s -> outbox.publish(topic, "same", new Sample("x", n)));
        }
        List<ConsumerRecord<String, byte[]>> got = consume(topic, 20);
        assertThat(got).hasSize(20);
        for (int i = 0; i < 20; i++) {
            assertThat(new String(got.get(i).value(), StandardCharsets.UTF_8)).contains("\"n\":" + i);
        }
    }

    @Test
    void nullKeyIsSentWithNullKey() {
        String topic = topic();
        tx.executeWithoutResult(s -> outbox.publish(topic, null, new Sample("a", 1)));
        assertThat(consume(topic, 1).get(0).key()).isNull();
    }

    @Test
    void failedSendStaysPendingAndIsDeliveredLaterInOrder() {
        String topic = topic();
        sender.mode(ControllableSender.Mode.FAIL);
        tx.executeWithoutResult(s -> outbox.publish(topic, "k", new Sample("first", 1)));
        tx.executeWithoutResult(s -> outbox.publish(topic, "k", new Sample("second", 2)));
        relay.drainNow();

        // commit'dagi uyg'otish ham parallel ishlaydi — uning tranzaksiyasi tugashini kutamiz
        await().atMost(Duration.ofSeconds(5)).until(() ->
                jdbc.queryForObject("SELECT max(attempts) FROM outbox_events", Integer.class) >= 1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE published_at IS NULL", Long.class)).isEqualTo(2);

        sender.mode(ControllableSender.Mode.PASS);
        relay.drainNow();

        List<ConsumerRecord<String, byte[]>> got = consume(topic, 2);
        assertThat(got).extracting(r -> new String(r.value(), StandardCharsets.UTF_8))
                .satisfiesExactly(v -> assertThat(v).contains("first"), v -> assertThat(v).contains("second"));
    }

    @Test
    void hangingBrokerIsBoundedBySendTimeout() {
        String topic = topic();
        sender.mode(ControllableSender.Mode.HANG);
        tx.executeWithoutResult(s -> outbox.publish(topic, "k", new Sample("a", 1)));

        // Uyg'otilgan relay send-timeout (3 s) tugagach yozuvni attempts=1 bilan qo'yib yuborishi kerak —
        // qulf cheksiz ushlanmaydi.
        await().atMost(Duration.ofSeconds(8)).until(() ->
                jdbc.queryForObject("SELECT attempts FROM outbox_events", Integer.class) >= 1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE published_at IS NULL", Long.class)).isEqualTo(1);
    }

    @Test
    void relaySurvivesUnexpectedExceptionAndKeepsWorking() {
        String topic = topic();
        sender.mode(ControllableSender.Mode.THROW);
        tx.executeWithoutResult(s -> outbox.publish(topic, "k", new Sample("a", 1)));
        relay.drainNow();

        sender.mode(ControllableSender.Mode.PASS);
        relay.wake();

        await().atMost(Duration.ofSeconds(5)).until(() -> relay.pendingIsEmpty());
        assertThat(consume(topic, 1)).hasSize(1);
    }
}
```

`hangingBrokerIsBoundedBySendTimeout`: `application.yml` da `outbox.relay.send-timeout: 3s` — 8 s chegarasi shu bilan.

- [ ] **Step 3: Yiqilishini ko'rish**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dit.test=OutboxRelayIT -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR — `OutboxSender`, `KafkaOutboxSender`, `OutboxRelay` yo'q.

- [ ] **Step 4: Sender'lar**

`OutboxSender.java`:
```java
package uz.efbazaar.outbox.internal;

import org.apache.kafka.common.header.Header;

import java.util.List;
import java.util.concurrent.CompletableFuture;

/** Relay'ning Kafka bilan yagona aloqasi — testda almashtirish uchun interfeys. */
public interface OutboxSender {

    CompletableFuture<?> send(String topic, String key, byte[] payload, List<Header> headers);
}
```

`KafkaOutboxSender.java`:
```java
package uz.efbazaar.outbox.internal;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Tayyor baytlarni yuboradi. Servis producer sozlamalarini (bootstrap, xavfsizlik) oladi,
 * lekin serializer'lar bayt uchun almashtiriladi va idempotentlik yoqiladi —
 * bir partition ichida tartib qayta urinishlarda ham saqlansin.
 */
public class KafkaOutboxSender implements OutboxSender {

    private final DefaultKafkaProducerFactory<String, byte[]> factory;
    private final KafkaTemplate<String, byte[]> template;

    public KafkaOutboxSender(ProducerFactory<?, ?> servicePf) {
        Map<String, Object> props = new HashMap<>(servicePf.getConfigurationProperties());
        props.remove(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG);
        props.remove(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG);
        props.remove(ProducerConfig.TRANSACTIONAL_ID_CONFIG);
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        this.factory = new DefaultKafkaProducerFactory<>(props, new StringSerializer(), new ByteArraySerializer());
        this.template = new KafkaTemplate<>(factory);
    }

    @Override
    public CompletableFuture<?> send(String topic, String key, byte[] payload, List<Header> headers) {
        return template.send(new ProducerRecord<>(topic, null, key, payload, headers));
    }

    public void destroy() {
        factory.destroy();
    }
}
```

- [ ] **Step 5: Relay**

`OutboxRelay.java`:
```java
package uz.efbazaar.outbox.internal;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.OutboxProperties;
import uz.efbazaar.outbox.SnapshotSource;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * outbox_events va snapshot belgilarini Kafka'ga yetkazadi.
 *
 * <p>Hammasi bitta ishchi ipda: commit'dagi uyg'otish ham, zaxira polling ham shu ipga
 * navbat qo'yadi, shuning uchun bir instansiya ichida ikki partiya parallel yurmaydi.
 * Instansiyalar orasini FOR UPDATE SKIP LOCKED ajratadi.
 */
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

    private final OutboxRepository repo;
    private final OutboxSender sender;
    private final TransactionTemplate tx;
    private final OutboxProperties props;
    private final Map<String, SnapshotSource> sources;
    private final MessageEncoder encoder;
    private final Counter failures;
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "outbox-relay");
        t.setDaemon(true);
        return t;
    });
    private final AtomicBoolean queued = new AtomicBoolean();

    public OutboxRelay(OutboxRepository repo, OutboxSender sender, TransactionTemplate tx,
                       OutboxProperties props, List<SnapshotSource> sources, MessageEncoder encoder,
                       MeterRegistry registry) {
        this.repo = repo;
        this.sender = sender;
        this.tx = tx;
        this.props = props;
        this.sources = sources.stream().collect(Collectors.toMap(SnapshotSource::source, Function.identity()));
        this.encoder = encoder;
        this.failures = Counter.builder("outbox.send.failures").register(registry);
    }

    /** Commit'dan keyin chaqiriladi; navbatda turgan partiya bo'lsa ikkinchisini qo'shmaydi. */
    public void wake() {
        if (queued.compareAndSet(false, true)) {
            worker.execute(() -> {
                queued.set(false);
                drainNow();
            });
        }
    }

    @Scheduled(fixedDelayString = "${outbox.relay.poll-interval:500ms}")
    public void poll() {
        wake();
    }

    /** Navbat bo'shaguncha yoki birinchi xatogacha. Hech qachon exception tashlamaydi. */
    public void drainNow() {
        try {
            while (true) {
                BatchResult events = sendEventBatch();
                BatchResult snapshots = sendSnapshotBatch();
                if (events.failed() || snapshots.failed() || (events.sent() == 0 && snapshots.sent() == 0)) {
                    return;
                }
            }
        } catch (RuntimeException e) {
            failures.increment();
            log.warn("outbox relay aylanishi yiqildi, keyingi aylanishda qayta: {}", e.toString());
        }
    }

    public boolean pendingIsEmpty() {
        return repo.pendingCount() == 0;
    }

    public void shutdown() {
        worker.shutdownNow();
    }

    private BatchResult sendEventBatch() {
        BatchResult result = tx.execute(status -> {
            List<OutboxRow> rows = repo.claimEvents(props.getRelay().getBatchSize());
            if (rows.isEmpty()) {
                return BatchResult.EMPTY;
            }
            List<CompletableFuture<?>> futures = new ArrayList<>(rows.size());
            for (OutboxRow row : rows) {
                futures.add(sendSafely(row.topic(), row.key(), row.payload(), row.headersJson()));
            }
            List<Long> sent = new ArrayList<>();
            for (int i = 0; i < rows.size(); i++) {
                String error = await(futures.get(i));
                if (error != null) {
                    repo.markPublished(sent);
                    repo.markFailed(rows.get(i).id(), error);
                    return new BatchResult(sent.size(), true, error);
                }
                sent.add(rows.get(i).id());
            }
            repo.markPublished(sent);
            return new BatchResult(sent.size(), false, null);
        });
        if (result != null && result.failed()) {
            failures.increment();
            log.warn("outbox: yuborish yiqildi, yozuv navbatda qoldi: {}", result.error());
        }
        return result == null ? BatchResult.EMPTY : result;
    }

    private BatchResult sendSnapshotBatch() {
        return BatchResult.EMPTY; // Task 5
    }

    private CompletableFuture<?> sendSafely(String topic, String key, byte[] payload, String headersJson) {
        try {
            return sender.send(topic, key, payload, HeaderCodec.fromJson(headersJson));
        } catch (RuntimeException e) {
            return CompletableFuture.failedFuture(e);
        }
    }

    /** null — muvaffaqiyat; aks holda xato matni. */
    private String await(CompletableFuture<?> future) {
        try {
            future.get(props.getRelay().getSendTimeout().toMillis(), TimeUnit.MILLISECONDS);
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "interrupted";
        } catch (Exception e) {
            Throwable cause = e.getCause() == null ? e : e.getCause();
            return cause.getClass().getSimpleName() + ": " + cause.getMessage();
        }
    }

    record BatchResult(int sent, boolean failed, String error) {
        static final BatchResult EMPTY = new BatchResult(0, false, null);
    }
}
```

`relaySurvivesUnexpectedExceptionAndKeepsWorking`: `THROW` rejimida `sender.send` exception tashlaydi — `sendSafely` uni yiqilgan future'ga aylantiradi, yozuv `attempts++` bilan qoladi, keyingi `wake` yetkazadi.

- [ ] **Step 6: Auto-configuration'ni to'ldirish**

`OutboxAutoConfiguration` — `outbox` bean'ini almashtirish va relay qo'shish:
```java
package uz.efbazaar.outbox;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.jdbc.JdbcTemplateAutoConfiguration;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.boot.autoconfigure.transaction.TransactionAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.internal.DefaultOutbox;
import uz.efbazaar.outbox.internal.KafkaOutboxSender;
import uz.efbazaar.outbox.internal.MessageEncoder;
import uz.efbazaar.outbox.internal.OutboxRelay;
import uz.efbazaar.outbox.internal.OutboxRepository;
import uz.efbazaar.outbox.internal.OutboxSender;

@AutoConfiguration(after = {JdbcTemplateAutoConfiguration.class, KafkaAutoConfiguration.class,
        TransactionAutoConfiguration.class})
@ConditionalOnProperty(prefix = "outbox", name = "enabled", havingValue = "true", matchIfMissing = true)
@ConditionalOnBean(JdbcTemplate.class)
@EnableConfigurationProperties(OutboxProperties.class)
@EnableScheduling
public class OutboxAutoConfiguration {

    @Bean
    OutboxRepository outboxRepository(JdbcTemplate jdbc) {
        return new OutboxRepository(jdbc);
    }

    @Bean
    MessageEncoder outboxMessageEncoder(ProducerFactory<?, ?> producerFactory) {
        return new MessageEncoder(producerFactory);
    }

    @Bean(destroyMethod = "destroy")
    @ConditionalOnMissingBean(OutboxSender.class)
    KafkaOutboxSender outboxSender(ProducerFactory<?, ?> producerFactory) {
        return new KafkaOutboxSender(producerFactory);
    }

    @Bean(destroyMethod = "shutdown")
    OutboxRelay outboxRelay(OutboxRepository repo, OutboxSender sender, PlatformTransactionManager txManager,
                            OutboxProperties props, ObjectProvider<SnapshotSource> sources,
                            MessageEncoder encoder, ObjectProvider<MeterRegistry> registry) {
        return new OutboxRelay(repo, sender, new TransactionTemplate(txManager), props,
                sources.orderedStream().toList(), encoder,
                registry.getIfAvailable(SimpleMeterRegistry::new));
    }

    @Bean
    Outbox outbox(OutboxRepository repo, MessageEncoder encoder, OutboxRelay relay) {
        return new DefaultOutbox(repo, encoder, relay::wake);
    }
}
```

Test ilovasi `KafkaOutboxSender` va `@Primary ControllableSender` ni o'zi beradi — `@ConditionalOnMissingBean(OutboxSender.class)` sababli auto-config sender'i yaratilmaydi; relay `@Primary` ni oladi. `realSender` bean'ini test ilovasida `destroyMethod = "destroy"` bilan e'lon qiling:
```java
    @Bean(destroyMethod = "destroy")
    KafkaOutboxSender realSender(ProducerFactory<?, ?> pf) {
        return new KafkaOutboxSender(pf);
    }
```

- [ ] **Step 7: Testlar o'tishi (butun kutubxona)**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp clean verify -DargLine="-Dapi.version=1.44"`
Expected: barcha unit va IT testlar PASS (`OutboxRelayIT` — 7, `OutboxPublishIT` — 4, `OutboxRepositoryIT` — 7, unit — 4). Surefire va Failsafe hisobotlarida skipped = 0.

- [ ] **Step 8: Commit**

```bash
git add backend/libs/outbox
git commit -m "feat(outbox): relay — commit'da uyg'otish, partiya, tartib va xatoga chidamlilik"
```

---

### Task 5: Relay — snapshot rejimi

**Files:**
- Modify: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/internal/OutboxRelay.java` (`sendSnapshotBatch`)
- Create: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/it/TestSnapshotSource.java`
- Modify: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/it/OutboxTestApplication.java`
- Test: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/it/OutboxSnapshotIT.java`

**Interfaces:**
- Consumes: `OutboxRepository.claimSnapshots/deleteSnapshot/nextSnapshotVersion`, `SnapshotSource`, `MessageEncoder.encode`, `OutboxSender.send`
- Produces: snapshot yuborish xatti-harakati (API o'zgarmaydi).

- [ ] **Step 1: Test uchun SnapshotSource**

`TestSnapshotSource.java`:
```java
package uz.efbazaar.outbox.it;

import uz.efbazaar.outbox.SnapshotSource;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/** "Holat" xotirada: state.get(id) == null — entity yo'q (build bo'sh qaytaradi). */
public class TestSnapshotSource implements SnapshotSource {

    public static final String TOPIC = "it-snapshots";

    public record Snap(String id, String value, long version) {}

    public final Map<String, String> state = new ConcurrentHashMap<>();
    public final AtomicInteger builds = new AtomicInteger();

    @Override
    public String source() {
        return "thing";
    }

    @Override
    public String topic() {
        return TOPIC;
    }

    @Override
    public String key(String entityId) {
        return "key-" + entityId;
    }

    @Override
    public Optional<Object> build(String entityId, long version) {
        builds.incrementAndGet();
        String value = state.get(entityId);
        return value == null ? Optional.empty() : Optional.of(new Snap(entityId, value, version));
    }
}
```

`OutboxTestApplication` ga:
```java
    @Bean
    TestSnapshotSource testSnapshotSource() {
        return new TestSnapshotSource();
    }
```

- [ ] **Step 2: Yiqiladigan test**

`OutboxSnapshotIT.java`:
```java
package uz.efbazaar.outbox.it;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.Outbox;
import uz.efbazaar.outbox.internal.OutboxRelay;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

class OutboxSnapshotIT extends AbstractOutboxIT {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired Outbox outbox;
    @Autowired OutboxRelay relay;
    @Autowired TransactionTemplate tx;
    @Autowired TestSnapshotSource source;
    @Autowired ControllableSender sender;

    private KafkaConsumer<String, byte[]> consumer;

    @BeforeEach
    void subscribe() {
        consumer = new KafkaConsumer<>(Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "snap-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class));
        consumer.subscribe(List.of(TestSnapshotSource.TOPIC));
        consumer.poll(Duration.ofSeconds(2)); // partition biriktirilishi uchun
        source.state.clear();
        source.builds.set(0);
    }

    @AfterEach
    void close() {
        consumer.close();
        sender.mode(ControllableSender.Mode.PASS);
    }

    private List<ConsumerRecord<String, byte[]>> read(int expected) {
        List<ConsumerRecord<String, byte[]>> out = new ArrayList<>();
        long deadline = System.currentTimeMillis() + 10_000;
        while (out.size() < expected && System.currentTimeMillis() < deadline) {
            consumer.poll(Duration.ofMillis(200)).forEach(out::add);
        }
        return out;
    }

    private JsonNode json(ConsumerRecord<String, byte[]> r) throws Exception {
        return JSON.readTree(r.value());
    }

    @Test
    void severalMarksCollapseIntoOneCurrentSnapshot() throws Exception {
        source.state.put("A", "v1");
        tx.executeWithoutResult(s -> {
            outbox.markSnapshot("thing", "A");
            outbox.markSnapshot("thing", "A");
            source.state.put("A", "v2");
        });
        relay.drainNow();

        List<ConsumerRecord<String, byte[]>> got = read(1);
        assertThat(got).hasSize(1);
        assertThat(got.get(0).key()).isEqualTo("key-A");
        assertThat(json(got.get(0)).get("value").asText()).isEqualTo("v2");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isZero();
    }

    @Test
    void versionsGrowAcrossSnapshots() throws Exception {
        source.state.put("A", "v1");
        tx.executeWithoutResult(s -> outbox.markSnapshot("thing", "A"));
        relay.drainNow();
        tx.executeWithoutResult(s -> outbox.markSnapshot("thing", "A"));
        relay.drainNow();

        List<ConsumerRecord<String, byte[]>> got = read(2);
        assertThat(json(got.get(1)).get("version").asLong()).isGreaterThan(json(got.get(0)).get("version").asLong());
    }

    @Test
    void emptyBuildDropsMarkWithoutSending() {
        tx.executeWithoutResult(s -> outbox.markSnapshot("thing", "missing"));
        relay.drainNow();

        assertThat(source.builds.get()).isEqualTo(1);
        assertThat(read(1)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isZero();
    }

    @Test
    void unknownSourceMarkIsDropped() {
        tx.executeWithoutResult(s -> outbox.markSnapshot("nobody-owns-this", "X"));
        relay.drainNow();

        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isZero();
    }

    @Test
    void failedSendKeepsMarkForNextRound() {
        source.state.put("A", "v1");
        sender.mode(ControllableSender.Mode.FAIL);
        tx.executeWithoutResult(s -> outbox.markSnapshot("thing", "A"));
        relay.drainNow();
        await().atMost(Duration.ofSeconds(5)).until(() -> sender.failuresSeen() >= 1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isEqualTo(1);

        sender.mode(ControllableSender.Mode.PASS);
        relay.drainNow();
        assertThat(read(1)).hasSize(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isZero();
    }
}
```

- [ ] **Step 3: Yiqilishini ko'rish**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dit.test=OutboxSnapshotIT -DargLine="-Dapi.version=1.44"`
Expected: FAIL — `severalMarksCollapseIntoOneCurrentSnapshot` da 0 ta xabar (Task 4 da `sendSnapshotBatch` bo'sh).

- [ ] **Step 4: `sendSnapshotBatch` implementatsiyasi**

`OutboxRelay.java` dagi stub o'rniga:
```java
    private BatchResult sendSnapshotBatch() {
        BatchResult result = tx.execute(status -> {
            List<SnapshotMark> marks = repo.claimSnapshots(props.getRelay().getBatchSize());
            if (marks.isEmpty()) {
                return BatchResult.EMPTY;
            }
            int sent = 0;
            for (SnapshotMark mark : marks) {
                SnapshotSource source = sources.get(mark.source());
                if (source == null) {
                    log.warn("outbox: '{}' uchun SnapshotSource yo'q, belgi tashlab yuborildi", mark.source());
                    repo.deleteSnapshot(mark);
                    continue;
                }
                long version = repo.nextSnapshotVersion();
                java.util.Optional<Object> payload = source.build(mark.entityId(), version);
                if (payload.isEmpty()) {
                    repo.deleteSnapshot(mark);
                    continue;
                }
                EncodedMessage message = encoder.encode(source.topic(), payload.get());
                String error = await(sendSafely(source.topic(), source.key(mark.entityId()),
                        message.payload(), message.headersJson()));
                if (error != null) {
                    return new BatchResult(sent, true, error);
                }
                repo.deleteSnapshot(mark);
                sent++;
            }
            return new BatchResult(sent, false, null);
        });
        if (result != null && result.failed()) {
            failures.increment();
            log.warn("outbox: snapshot yuborilmadi, belgi navbatda qoldi: {}", result.error());
        }
        return result == null ? BatchResult.EMPTY : result;
    }
```

Snapshot'lar birma-bir kutiladi: har biri `build` bilan DB'dan o'qiladi, partiyani parallellashtirish foyda bermaydi, tartib esa soddalashadi.

- [ ] **Step 5: Testlar o'tishi**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp clean verify -DargLine="-Dapi.version=1.44"`
Expected: barcha testlar PASS, skipped = 0.

- [ ] **Step 6: Commit**

```bash
git add backend/libs/outbox
git commit -m "feat(outbox): snapshot rejimi — belgilarni hozirgi holat bilan yuborish"
```

---

### Task 6: Tozalash, metrikalar va `outbox.enabled=false`

**Files:**
- Create: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/internal/OutboxCleanup.java`
- Create: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/internal/OutboxMetrics.java`
- Modify: `backend/libs/outbox/src/main/java/uz/efbazaar/outbox/OutboxAutoConfiguration.java`
- Test: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/it/OutboxHousekeepingIT.java`
- Test: `backend/libs/outbox/src/test/java/uz/efbazaar/outbox/OutboxDisabledTest.java`

**Interfaces:**
- Consumes: `OutboxRepository.deletePublishedBefore/pendingCount/oldestPendingAgeSeconds`
- Produces: `OutboxCleanup(OutboxRepository, OutboxProperties)` — `void run()` (`@Scheduled(cron = "${outbox.cleanup.cron:0 15 3 * * *}")`); `OutboxMetrics(OutboxRepository) implements MeterBinder`.

- [ ] **Step 1: Yiqiladigan testlar**

`OutboxHousekeepingIT.java`:
```java
package uz.efbazaar.outbox.it;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import uz.efbazaar.outbox.internal.OutboxCleanup;
import uz.efbazaar.outbox.internal.OutboxMetrics;
import uz.efbazaar.outbox.internal.OutboxRepository;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class OutboxHousekeepingIT extends AbstractOutboxIT {

    @Autowired OutboxRepository repo;
    @Autowired OutboxCleanup cleanup;
    @Autowired OutboxMetrics metrics;

    @Test
    void cleanupRemovesOnlyOldPublishedRows() {
        long oldDone = repo.insert("t", "k", new byte[]{1}, "[]");
        long freshDone = repo.insert("t", "k", new byte[]{1}, "[]");
        long pending = repo.insert("t", "k", new byte[]{1}, "[]");
        repo.markPublished(List.of(oldDone, freshDone));
        jdbc.update("UPDATE outbox_events SET published_at = now() - interval '8 days' WHERE id = ?", oldDone);

        cleanup.run();

        assertThat(jdbc.queryForList("SELECT id FROM outbox_events ORDER BY id", Long.class))
                .containsExactly(freshDone, pending);
    }

    @Test
    void metricsReportPendingCountAndOldestAge() {
        MeterRegistry registry = new SimpleMeterRegistry();
        metrics.bindTo(registry);
        long id = repo.insert("t", "k", new byte[]{1}, "[]");
        jdbc.update("UPDATE outbox_events SET created_at = now() - interval '6 minutes' WHERE id = ?", id);

        assertThat(registry.get("outbox.pending.count").gauge().value()).isEqualTo(1.0);
        assertThat(registry.get("outbox.pending.oldest.seconds").gauge().value()).isGreaterThanOrEqualTo(360.0);
    }
}
```

`OutboxDisabledTest.java`:
```java
package uz.efbazaar.outbox;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.JdbcTemplateAutoConfiguration;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class OutboxDisabledTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(DataSourceAutoConfiguration.class,
                    JdbcTemplateAutoConfiguration.class, KafkaAutoConfiguration.class,
                    OutboxAutoConfiguration.class))
            .withPropertyValues("spring.datasource.url=jdbc:postgresql://localhost:1/none",
                    "spring.kafka.producer.value-serializer=org.springframework.kafka.support.serializer.JsonSerializer");

    @Test
    void noBeansWhenDisabled() {
        runner.withPropertyValues("outbox.enabled=false")
                .run(ctx -> assertThat(ctx).doesNotHaveBean(Outbox.class));
    }
}
```

`OutboxDisabledTest` DB'ga ulanmaydi — `outbox.enabled=false` bo'lsa kontekst hech qanday outbox bean'ini yaratmasligi kerak (datasource bean lazily ulanadi).

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dtest=OutboxDisabledTest -Dit.test=OutboxHousekeepingIT -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR — `OutboxCleanup`, `OutboxMetrics` yo'q.

- [ ] **Step 3: Implementatsiya**

`OutboxCleanup.java`:
```java
package uz.efbazaar.outbox.internal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import uz.efbazaar.outbox.OutboxProperties;

import java.time.Instant;

/** Faqat YUBORILGAN yozuvlarni o'chiradi — yuborilmagani qancha eski bo'lsa ham qoladi. */
public class OutboxCleanup {

    private static final Logger log = LoggerFactory.getLogger(OutboxCleanup.class);

    private final OutboxRepository repo;
    private final OutboxProperties props;

    public OutboxCleanup(OutboxRepository repo, OutboxProperties props) {
        this.repo = repo;
        this.props = props;
    }

    @Scheduled(cron = "${outbox.cleanup.cron:0 15 3 * * *}")
    public void run() {
        int deleted = repo.deletePublishedBefore(Instant.now().minus(props.getCleanup().getRetention()));
        if (deleted > 0) {
            log.info("outbox: {} ta eski yuborilgan yozuv o'chirildi", deleted);
        }
    }
}
```

`OutboxMetrics.java`:
```java
package uz.efbazaar.outbox.internal;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;

/** Prometheus: outbox_pending_count, outbox_pending_oldest_seconds (alert > 300). */
public class OutboxMetrics implements MeterBinder {

    private final OutboxRepository repo;

    public OutboxMetrics(OutboxRepository repo) {
        this.repo = repo;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        Gauge.builder("outbox.pending.count", repo, r -> r.pendingCount())
                .description("Kafka'ga hali yetkazilmagan outbox yozuvlari")
                .register(registry);
        Gauge.builder("outbox.pending.oldest.seconds", repo, r -> r.oldestPendingAgeSeconds())
                .description("Eng eski yetkazilmagan yozuvning yoshi")
                .register(registry);
    }
}
```

`OutboxAutoConfiguration` ga:
```java
    @Bean
    OutboxCleanup outboxCleanup(OutboxRepository repo, OutboxProperties props) {
        return new OutboxCleanup(repo, props);
    }

    @Bean
    OutboxMetrics outboxMetrics(OutboxRepository repo) {
        return new OutboxMetrics(repo);
    }
```
(import'lar: `uz.efbazaar.outbox.internal.OutboxCleanup`, `uz.efbazaar.outbox.internal.OutboxMetrics`). Spring Boot actuator bor servisda `MeterBinder` bean'lari registry'ga avtomatik bog'lanadi.

- [ ] **Step 4: Butun kutubxona testlari**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp clean verify -DargLine="-Dapi.version=1.44"`
Expected: barcha testlar PASS; Surefire va Failsafe hisobotlarida failures = errors = skipped = 0.

- [ ] **Step 5: Commit**

```bash
git add backend/libs/outbox
git commit -m "feat(outbox): tozalash, metrikalar, outbox.enabled"
```

---

### Task 7: Kutubxona hujjatlari

**Files:**
- Create: `backend/libs/outbox/README.md`
- Create: `backend/libs/outbox/CLAUDE.md`
- Modify: `README.md` (Komponentlar jadvali va "Mahalliy ishlab chiqish")
- Modify: `AGENTS.md` (tekshiruv jadvali)

**Interfaces:** —

- [ ] **Step 1: `backend/libs/outbox/README.md`**

````markdown
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
````

- [ ] **Step 2: `backend/libs/outbox/CLAUDE.md`**

```markdown
# outbox

Bu komponentning vazifasi, API, ulash tartibi va ehtiyot bo'ladigan joylari:

@README.md

API yoki sxema o'zgarsa README.md ni shu commit'da yangilang. Sxema o'zgarishi har ulangan servisda
yangi V-migratsiya talab qiladi — mavjud V-fayllarni tahrirlamang.
```

- [ ] **Step 3: Root `README.md`**

Komponentlar jadvaliga `humo-userbot` qatoridan keyin qo'shing:
```markdown
| outbox (kutubxona) | `backend/libs/outbox` | Java 21, Spring Boot auto-config | — | — | [README](backend/libs/outbox/README.md) |
```

"Mahalliy ishlab chiqish va testlar" bo'limidagi Java misolini almashtiring:
```bash
# Java servis (backend/* yoki bot/) — avval umumiy kutubxona
mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests
cd backend/marketplace-service && mvn -B -ntp clean verify   # *IT testlar Failsafe'da — `mvn test` yetarli emas
```

- [ ] **Step 4: `AGENTS.md` jadvali**

Jadvalga qator qo'shing (Java servis qatoridan keyin):
```markdown
| `backend/libs/outbox/` (va unga bog'liq servislar) | Java 21, `mvn -B -ntp clean verify` in `backend/libs/outbox`; shu kutubxonaga bog'liq har servis uchun avval `mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests`, keyin servisda `mvn -B -ntp clean verify`. |
```

- [ ] **Step 5: Havolalarni tekshirish va commit**

Run:
```bash
python3 - <<'EOF'
import re,os
for f in ['README.md','AGENTS.md','backend/libs/outbox/README.md']:
    s=open(f).read()
    for m in re.finditer(r'\]\(([^)#\s]+)(#[^)]*)?\)',s):
        t=m.group(1)
        if t.startswith('http'): continue
        p=os.path.normpath(os.path.join(os.path.dirname(f),t))
        print('OK' if os.path.exists(p) else 'BROKEN', f, t)
EOF
git diff --check
```
Expected: faqat `OK`, `git diff --check` bo'sh.

```bash
git add backend/libs/outbox/README.md backend/libs/outbox/CLAUDE.md README.md AGENTS.md
git commit -m "docs(outbox): kutubxona README, ulash tartibi, AGENTS tekshiruvi"
```

---

### Task 8: Docker build context `backend/`

**Files:**
- Create: `backend/.dockerignore`
- Modify: `backend/auth-service/Dockerfile`, `backend/marketplace-service/Dockerfile`, `backend/trade-service/Dockerfile`, `backend/payment-service/Dockerfile`
- Modify: `docker-compose.yml` (trade-service va payment-service `build:` bloklari)

**Interfaces:**
- Produces: 4 servisning image'i `docker build -f backend/<svc>/Dockerfile backend` bilan quriladi (Task 9 CI shunga tayanadi).

- [ ] **Step 1: Hozirgi build yangi context bilan yiqilishini ko'rish**

Run: `docker build -f backend/payment-service/Dockerfile -t outbox-ctx-check backend`
Expected: FAIL — `COPY pom.xml .` : `"/pom.xml": not found` (context ildizida pom yo'q).

- [ ] **Step 2: `backend/.dockerignore`**

Servis papkalaridagi `.dockerignore` context `backend/` bo'lganda ishlamaydi — shuning uchun ildizda:
```
**/target/
**/.mvn/
**/.idea/
**/*.iml
**/.git/
**/.gitignore
**/*.md
recommendation-service/
```

- [ ] **Step 3: Dockerfile'lar**

Har to'rt Dockerfile'da (`auth`, `marketplace`, `trade`, `payment`) build bosqichidagi quyidagi ikki joy o'zgaradi. `<svc>` — `auth-service`, `marketplace-service`, `trade-service`, `payment-service`.

`COPY pom.xml .` qatoridan **oldin** qo'shing:
```dockerfile
# Umumiy kutubxonalar (build context — backend/). Servis pom'i ulardan
# oldin o'rnatilgan bo'lishi kerak: aks holda go-offline ularni Maven
# Central'dan qidirib yiqiladi.
COPY libs/outbox/pom.xml libs/outbox/pom.xml
COPY libs/outbox/src libs/outbox/src
RUN n=0; until mvn -B -ntp -f libs/outbox/pom.xml install -DskipTests; do \
      n=$((n+1)); \
      if [ "$n" -ge 5 ]; then echo "Maven 5 urinishdan keyin ham yiqildi"; exit 1; fi; \
      echo "Maven yiqildi (urinish $n/5) — $((n*20))s dan keyin qayta"; \
      sleep $((n*20)); \
    done
```

Va yo'llarni almashtiring:
```dockerfile
COPY <svc>/pom.xml .
```
(avval `COPY pom.xml .`) hamda
```dockerfile
COPY <svc>/src ./src
```
(avval `COPY src ./src`).

`auth-service/Dockerfile` da `ENV MAVEN_OPTS=...` yo'q — uni boshqalardagidek `WORKDIR /workspace` dan keyin qo'shing:
```dockerfile
ENV MAVEN_OPTS="-Dmaven.wagon.http.retryHandler.count=5 \
                -Dmaven.wagon.http.retryHandler.requestSentEnabled=true \
                -Dmaven.wagon.httpconnectionManager.ttlSeconds=120"
```

Faylning yuqori izohiga bir qator qo'shing: `# Build context: backend/ (docker build -f backend/<svc>/Dockerfile backend).`

- [ ] **Step 4: `docker-compose.yml`**

```yaml
  trade-service:
    build:
      context: ./backend
      dockerfile: trade-service/Dockerfile
```
```yaml
  payment-service:
    build:
      context: ./backend
      dockerfile: payment-service/Dockerfile
```
(auth va marketplace'da `build:` yo'q — faqat `image:`, o'zgarmaydi.)

- [ ] **Step 5: Hammasini qurish**

Run:
```bash
for s in auth marketplace trade payment; do
  docker build -f backend/$s-service/Dockerfile -t outbox-ctx-$s backend || exit 1
done
docker compose config -q && echo compose-ok
```
Expected: 4 image muvaffaqiyatli quriladi; `compose-ok`.

- [ ] **Step 6: Image ichida kutubxona borligini emas, servis ishlashini tekshirish**

Run: `docker run --rm --entrypoint sh outbox-ctx-payment -c 'ls /app 2>/dev/null || ls'`
Expected: layered jar papkalari (`BOOT-INF`/`org`/`META-INF` yoki hozirgi Dockerfile'dagi tuzilma) — image avvalgidek. Kutubxona servis jar'iga kirmaydi (servis hali dependency qo'shmagan).

- [ ] **Step 7: Commit**

```bash
git add backend/.dockerignore backend/*-service/Dockerfile docker-compose.yml
git commit -m "build: Java servislar image'i backend/ context'dan, umumiy kutubxona bilan"
```

---

### Task 9: CI — `build.yml` va `ci.yml`

**Files:**
- Modify: `.github/workflows/build.yml`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 8 dagi Dockerfile/context shakli.

- [ ] **Step 1: `build.yml` — filtr va matritsa**

`dorny/paths-filter` filtrlariga qo'shing:
```yaml
            libs:
              - 'backend/libs/**'
              - '!**/*.md'
```

`build-matrix` qadamidagi `ITEMS=()` dan boshlab `if [ ${#ITEMS[@]} -eq 0 ]` gacha bo'lgan qismni to'liq quyidagiga almashtiring. `add` endi to'rt argument oladi: `name context file image`. To'rt Java servis kutubxona o'zgarganda ham quriladi.
```bash
          LIBS_CHANGED="${{ steps.filter.outputs.libs }}"
          ITEMS=()
          add() {
            local name="$1" context="$2" file="$3" image="$4"
            ITEMS+=("{\"name\":\"$name\",\"context\":\"$context\",\"file\":\"$file\",\"image\":\"$image\"}")
          }
          changed()    { [[ "$FORCE_ALL" == "true" || "$1" == "true" ]]; }
          uses_libs()  { [[ "$FORCE_ALL" == "true" || "$LIBS_CHANGED" == "true" || "$1" == "true" ]]; }
          if uses_libs "${{ steps.filter.outputs.auth }}";        then add auth-service        backend backend/auth-service/Dockerfile        auth-service;        fi
          if uses_libs "${{ steps.filter.outputs.marketplace }}"; then add marketplace-service backend backend/marketplace-service/Dockerfile marketplace-service; fi
          if uses_libs "${{ steps.filter.outputs.trade }}";       then add trade-service       backend backend/trade-service/Dockerfile       trade-service;       fi
          if uses_libs "${{ steps.filter.outputs.payment }}";     then add payment-service     backend backend/payment-service/Dockerfile     payment-service;     fi
          if changed "${{ steps.filter.outputs.access }}";                 then add access-service     backend/access-service backend/access-service/Dockerfile access-service;     fi
          if changed "${{ steps.filter.outputs.bot }}";                    then add bot                bot                    bot/Dockerfile                    bot;                fi
          if changed "${{ steps.filter.outputs.frontend }}";               then add frontend           frontend               frontend/Dockerfile               frontend;           fi
          if changed "${{ steps.filter.outputs.mail }}";                   then add mail-frontend      mail                   mail/Dockerfile                   mail-frontend;      fi
          if changed "${{ steps.filter.outputs.nginx }}";                  then add nginx              nginx                  nginx/Dockerfile                  nginx;              fi
          if changed "${{ steps.filter.outputs['smart-admin'] }}";         then add smart-admin-worker smart-admin-worker     smart-admin-worker/Dockerfile     smart-admin-worker; fi
          if changed "${{ steps.filter.outputs['humo-userbot'] }}";        then add humo-userbot       humo-userbot           humo-userbot/Dockerfile           humo-userbot;       fi
```
`workflow` filtri (build.yml o'zgarishi) avvalgidek `FORCE_ALL=true` qiladi — bu qator o'zgarmaydi.

`Build & push` qadamiga:
```yaml
          context: ${{ matrix.context }}
          file: ${{ matrix.file }}
```

- [ ] **Step 2: `ci.yml` — o'zgarish aniqlash va test job**

"Detect changed services via git" qadamiga qo'shing:
```bash
          set_output libs           'backend/libs/'
```
`precheck.outputs` ga `libs: ${{ steps.filter.outputs.libs }}`.

"Build test matrices" qadamidagi Java qismini almashtiring:
```bash
          LIBS="${{ steps.filter.outputs.libs }}"
          JAVA=()
          add_java() { JAVA+=("{\"name\":\"$1\",\"path\":\"$2\"}"); }
          if [ "$LIBS" = "true" ]; then add_java outbox-lib backend/libs/outbox; fi
          if [ "${{ steps.filter.outputs.auth }}" = "true" ] || [ "$LIBS" = "true" ]; then add_java auth-service        backend/auth-service; fi
          if [ "${{ steps.filter.outputs.marketplace }}" = "true" ] || [ "$LIBS" = "true" ]; then add_java marketplace-service backend/marketplace-service; fi
          if [ "${{ steps.filter.outputs.trade }}" = "true" ] || [ "$LIBS" = "true" ]; then add_java trade-service       backend/trade-service; fi
          if [ "${{ steps.filter.outputs.payment }}" = "true" ] || [ "$LIBS" = "true" ]; then add_java payment-service     backend/payment-service; fi
          if [ "${{ steps.filter.outputs.access }}" = "true" ]; then add_java access-service      backend/access-service; fi
          if [ "${{ steps.filter.outputs.bot }}" = "true" ]; then add_java bot                 bot; fi
          emit java "${JAVA[@]}"
```

`test-java` job'ida `Build & test` dan oldin:
```yaml
      - name: Install shared libraries
        run: mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests
```

- [ ] **Step 3: Workflow'larni tekshirish**

Run:
```bash
python3 -c "import yaml;[yaml.safe_load(open(f)) for f in ['.github/workflows/build.yml','.github/workflows/ci.yml']];print('yaml OK')"
# ci.yml filtrini simulyatsiya: lib o'zgargan deb faraz qilib matritsa skriptini quruq ishlatish
files='backend/libs/outbox/pom.xml'; printf "%s\n" "$files" | grep -q '^backend/libs/' && echo libs=true
```
Expected: `yaml OK`, `libs=true`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/build.yml .github/workflows/ci.yml
git commit -m "ci: umumiy kutubxona — o'zgarsa 4 servis test va build; Java job lib'ni o'rnatadi"
```

---

### Task 10: Prometheus alert

**Files:**
- Modify: `infra/prometheus/rules/efbazaar.yml`

**Interfaces:**
- Consumes: Task 6 metrikasi `outbox_pending_oldest_seconds`.

- [ ] **Step 1: Qoida qo'shish**

`rules:` ro'yxatiga:
```yaml
      - alert: OutboxBacklog
        expr: outbox_pending_oldest_seconds > 300
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.instance }} — outbox Kafka'ga yetkazolmayapti"
          description: "Eng eski yetkazilmagan event {{ $value | humanizeDuration }} oldin yozilgan. Kafka yoki relay'ni tekshiring; event'lar yo'qolmagan, navbatda turibdi."
```

- [ ] **Step 2: Sintaksisni tekshirish**

Run: `docker run --rm -v "$PWD/infra/prometheus/rules:/rules" --entrypoint promtool prom/prometheus:latest check rules /rules/efbazaar.yml`
Expected: `SUCCESS: N rules found`.

- [ ] **Step 3: Commit**

```bash
git add infra/prometheus/rules/efbazaar.yml
git commit -m "feat(observability): OutboxBacklog alert"
```

---

### Task 11: Yakuniy tekshiruv (AGENTS.md)

- [ ] **Step 1: Kutubxona**

Run: `cd backend/libs/outbox && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp clean verify -DargLine="-Dapi.version=1.44"`
Expected: BUILD SUCCESS; `target/surefire-reports` va `target/failsafe-reports` da failures = errors = skipped = 0.

- [ ] **Step 2: Build yo'li o'zgargan 4 servis**

Run (har biri uchun; lib avval o'rnatilgan):
```bash
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp -f backend/libs/outbox/pom.xml install -DskipTests
for s in auth marketplace trade payment; do
  (cd backend/$s-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp clean verify -DargLine="-Dapi.version=1.44") || exit 1
done
```
Expected: 4 servis ham BUILD SUCCESS (kod o'zgarmagan — regressiya yo'qligini tasdiqlaydi).

- [ ] **Step 3: Image'lar**

Task 8 Step 5 buyrug'ini qayta ishga tushiring. Expected: 4 image quriladi.

- [ ] **Step 4: Diff**

Run: `git diff origin/main --stat && git diff origin/main --check`
Expected: faqat rejadagi fayllar; `--check` bo'sh; secret yo'q.

- [ ] **Step 5: Push va CI** (foydalanuvchi ruxsati bilan)

PR ochilgach `gh pr checks` — `test-java` matritsasida `outbox-lib` va 4 servis, hammasi yashil. Merge'dan keyin `build.yml` 4 servis image'ini yangi context bilan quradi — birinchi deploy'dan keyin `docker compose ps` da 4 servis `healthy`.
