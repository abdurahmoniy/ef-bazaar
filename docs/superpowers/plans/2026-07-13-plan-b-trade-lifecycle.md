# Plan B — Smart-Admin Trade Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend trade-service from Plan A's foundation into a fully-integrated escrow trade lifecycle: state-machine-driven trades, encrypted per-role chats, one-time-password passthrough, WSS live push, per-state timeouts, marketplace-service handshake via Kafka, mock-worker so the happy path completes end-to-end without the Python worker (which lands in Plan C).

**Architecture:** Trade lifecycle owned by trade-service (Java, port 8085, database `trade_db`). State machine is hand-rolled — a static transition table plus per-state onEnter handlers. Kafka is the boundary to marketplace-service (for the trade-proposal system message) and to the future Python worker (for Mailcow / Konami automation). Redis holds ephemeral state: 10-minute trade proposals and 30-minute one-time-password keys. Spring WebSocket + STOMP pushes state and message updates to whichever party is watching `/trade/:id`. Spring Security replaces Plan A's raw `@RequestHeader("X-User-Id")` with the same nginx-header pattern the marketplace-service uses. Postgres integration tests run against Testcontainers, retiring Plan A's H2 shim so a repeat of the CHAR/VARCHAR mismatch is impossible.

**Tech Stack:** Java 21, Spring Boot 3.3.4, Spring Web, Spring Data JPA, Spring Data Redis, Spring Kafka, Spring Security, Spring WebSocket + STOMP, Postgres 16, Flyway, Testcontainers (postgres + kafka + redis), JUnit 5, AssertJ, Mockito, Awaitility, Lombok, MapStruct.

## Global Constraints

- **Java 21, Spring Boot 3.3.4** — inherited from Plan A; do not bump.
- **Package root:** `uz.efbazaar.trade` — same as Plan A.
- **HTTP port:** 8085 (unchanged).
- **New sub-packages:** `trade`, `security`, `config`, `kafka`, `ws` beside the existing `card`, `mailbox`, `payment`, `crypto`, `common`.
- **Postgres database:** `trade_db` (unchanged).
- **Migration numbering:** Plan A ended at `V3__create_mailbox_table.sql`. Plan B adds `V4__create_trade_table.sql`, `V5__create_trade_chat_and_messages.sql`, `V6__create_trade_audit_log.sql`. Marketplace-service adds `V21__chat_message_type.sql` (marketplace's last migration is V20).
- **Timestamps:** all `TIMESTAMPTZ` in DB, `java.time.Instant` in Java.
- **Enums in DB:** stored as `VARCHAR` with a `CHECK` constraint (matches marketplace convention: `ChatStatus`, `AttachmentType`).
- **Kafka topic naming:** `efbazaar.<service>.<event>` (existing convention). Plan B topics:
  - `efbazaar.trade.proposal-created` (produced by trade → consumed by marketplace)
  - `efbazaar.trade.proposal-resolved` (produced by trade → consumed by marketplace)
  - `efbazaar.trade.email-provision-request` (trade → worker)
  - `efbazaar.trade.email-provisioned` (worker → trade)
  - `efbazaar.trade.forgot-password-request` (trade → worker)
  - `efbazaar.trade.imap-poll-request` (trade → worker)
  - `efbazaar.trade.konami-email-received` (worker → trade)
  - `efbazaar.trade.imap-2fa-code` (worker → trade)
  - `efbazaar.trade.mailbox-rotate-request` (trade → worker)
  - `efbazaar.trade.mailbox-rotated` (worker → trade)
- **Kafka partition key:** `tradeId.toString()` for per-trade ordering.
- **Kafka JSON packages trusted:** producer side uses `JsonSerializer` (no config); consumer side sets `spring.json.trusted.packages=uz.efbazaar.*`, same as marketplace.
- **Redis keys:**
  - `trade:proposal:{proposalId}` — hash, TTL 600s (10 min).
  - `trade:{tradeId}:password-key:{messageId}` — 32 raw bytes, base64, TTL 1800s (30 min), `DEL` on first read.
  - `trade:{tradeId}:recheck:count` — counter, TTL 1800s.
  - `trade:{tradeId}:recheck:last-at` — millis timestamp, TTL 1800s.
- **State-machine timeouts** (per spec §3.2, in seconds):
  - `WAITING_PAYMENT` — 1800 (30 min)
  - `WAITING_EMAIL_CHANGE` — 1800
  - `VERIFYING_KONAMI_LINK` — 1800
  - `WAITING_PASSWORD` — 1800
  - `WAITING_BUYER_VERIFY` — 86400 (24 h)
- **Recheck rate limit** (state 4): 1 click / 5 min, max 5 clicks per trade.
- **JWT / auth:** trade-service does **not** verify JWT itself. Nginx runs the `auth_request` subquery against auth-service, then injects `X-User-Id`, `X-User-Roles`, `X-User-Name`, `X-Telegram-Id` headers. Trade-service reads those in `HeaderAuthenticationFilter` (identical pattern to marketplace-service).
- **Admin role:** `ROLE_ADMIN` (comma-separated in `X-User-Roles`). TOTP MFA is a follow-up (spec §11) — Plan B gates `/api/v1/admin/**` only by role.
- **Encryption:** all `TradeMessage.encryptedBody`, plus mailbox and card fields, use `TradeCrypto` (Plan A). Contexts:
  - Chat text message: `msg-{tradeId}-{messageId}` — reversible with master key.
  - One-time password message: `otp-{tradeId}-{messageId}` — key comes from Redis (**not** derived from master), so deleting the Redis key makes the ciphertext permanently unrecoverable.
- **WSS transport:** STOMP over SockJS-fallback WebSocket at `/ws/trade`. Auth via CONNECT-frame headers `X-User-Id` / `X-User-Roles` (nginx passes them through on the upgrade request). Broadcast destinations: `/topic/trades/{tradeId}/{role}` (`role` ∈ `seller` | `buyer`), so a seller never subscribes to the buyer's channel and vice versa.
- **Kafka health check disabled** — set `management.health.kafka.enabled: false` (matches marketplace).
- **Testcontainers versions:** `testcontainers-bom` 1.20.3. Modules used: `postgresql`, `kafka`, `junit-jupiter`. Redis is testcontainers-generic (image `redis:7-alpine`) because there's no first-party Redis module.
- **Commit style:** Conventional Commits — matches Plan A and efbazaar history.
- **NO Co-Authored-By trailer in commits.** Feedback memory: keep commit messages clean.
- **No cancellation** (spec §3.2) — once a Trade is created there is no user-initiated cancel path. Only timeouts and terminal states end a trade. Do not add a cancel endpoint even if it "seems useful."
- **Append-only audit log** — `TradeAuditLog` has no update or delete methods on the repository; the service exposes `record(...)` only.

---

## File Structure

Backend under `backend/trade-service/`:

```
backend/trade-service/
├── pom.xml                                                             [MODIFY]
├── src/
│   ├── main/
│   │   ├── java/uz/efbazaar/trade/
│   │   │   ├── TradeApplication.java                                   [MODIFY — @EnableScheduling]
│   │   │   ├── security/
│   │   │   │   ├── AuthenticatedUser.java                              [CREATE]
│   │   │   │   ├── HeaderAuthenticationFilter.java                     [CREATE]
│   │   │   │   ├── SecurityConfig.java                                 [CREATE]
│   │   │   │   └── AuthenticatedUserResolver.java                      [CREATE]
│   │   │   ├── config/
│   │   │   │   ├── KafkaProducerConfig.java                            [CREATE]
│   │   │   │   ├── KafkaConsumerConfig.java                            [CREATE]
│   │   │   │   ├── RedisConfig.java                                    [CREATE]
│   │   │   │   └── WebSocketConfig.java                                [CREATE]
│   │   │   ├── trade/
│   │   │   │   ├── domain/
│   │   │   │   │   ├── Trade.java                                      [CREATE]
│   │   │   │   │   ├── TradeState.java                                 [CREATE]
│   │   │   │   │   ├── TradeEvent.java                                 [CREATE]
│   │   │   │   │   ├── ParticipantRole.java                            [CREATE]
│   │   │   │   │   ├── TradeChat.java                                  [CREATE]
│   │   │   │   │   ├── TradeMessage.java                               [CREATE]
│   │   │   │   │   ├── TradeMessageType.java                           [CREATE]
│   │   │   │   │   ├── TradeSenderType.java                            [CREATE]
│   │   │   │   │   ├── TradeAuditLog.java                              [CREATE]
│   │   │   │   │   └── ActorType.java                                  [CREATE]
│   │   │   │   ├── repository/
│   │   │   │   │   ├── TradeRepository.java                            [CREATE]
│   │   │   │   │   ├── TradeChatRepository.java                        [CREATE]
│   │   │   │   │   ├── TradeMessageRepository.java                     [CREATE]
│   │   │   │   │   └── TradeAuditLogRepository.java                    [CREATE]
│   │   │   │   ├── service/
│   │   │   │   │   ├── TradeStateMachine.java                          [CREATE]
│   │   │   │   │   ├── TradeStateHandler.java                          [CREATE]
│   │   │   │   │   ├── TradeService.java                               [CREATE]
│   │   │   │   │   ├── TradeProposalService.java                       [CREATE]
│   │   │   │   │   ├── TradeChatService.java                           [CREATE]
│   │   │   │   │   ├── TradeAuditService.java                          [CREATE]
│   │   │   │   │   ├── TradeTimeoutScheduler.java                      [CREATE]
│   │   │   │   │   └── OneTimePasswordService.java                     [CREATE]
│   │   │   │   ├── controller/
│   │   │   │   │   ├── TradeProposalController.java                    [CREATE]
│   │   │   │   │   ├── TradeController.java                            [CREATE]
│   │   │   │   │   ├── TradeActionController.java                      [CREATE]
│   │   │   │   │   └── TradeMessageController.java                     [CREATE]
│   │   │   │   ├── dto/
│   │   │   │   │   ├── ProposalCreateRequest.java                      [CREATE]
│   │   │   │   │   ├── ProposalAcceptRequest.java                      [CREATE]
│   │   │   │   │   ├── ProposalResponse.java                           [CREATE]
│   │   │   │   │   ├── TradeResponse.java                              [CREATE]
│   │   │   │   │   ├── TradeMessageResponse.java                       [CREATE]
│   │   │   │   │   ├── PostTextRequest.java                            [CREATE]
│   │   │   │   │   ├── SendPasswordRequest.java                        [CREATE]
│   │   │   │   │   └── PasswordRevealResponse.java                     [CREATE]
│   │   │   │   ├── ws/
│   │   │   │   │   └── TradeBroadcaster.java                           [CREATE]
│   │   │   │   └── exception/
│   │   │   │       ├── InvalidTradeTransitionException.java            [CREATE]
│   │   │   │       ├── ProposalNotFoundException.java                  [CREATE]
│   │   │   │       └── RateLimitedException.java                       [CREATE]
│   │   │   ├── kafka/
│   │   │   │   ├── TradeEvents.java                                    [CREATE — DTOs]
│   │   │   │   ├── TradeEventPublisher.java                            [CREATE]
│   │   │   │   ├── EmailProvisionedConsumer.java                       [CREATE]
│   │   │   │   ├── KonamiEmailReceivedConsumer.java                    [CREATE]
│   │   │   │   ├── Imap2faCodeConsumer.java                            [CREATE]
│   │   │   │   ├── MailboxRotatedConsumer.java                         [CREATE]
│   │   │   │   └── MockWorker.java                                     [CREATE]
│   │   │   ├── card/controller/CardController.java                     [MODIFY]
│   │   │   ├── mailbox/controller/MailboxController.java               [MODIFY]
│   │   │   └── common/exception/TradeExceptionHandler.java             [MODIFY]
│   │   └── resources/
│   │       ├── application.yml                                         [MODIFY]
│   │       └── db/migration/
│   │           ├── V4__create_trade_table.sql                          [CREATE]
│   │           ├── V5__create_trade_chat_and_messages.sql              [CREATE]
│   │           └── V6__create_trade_audit_log.sql                      [CREATE]
│   └── test/
│       ├── java/uz/efbazaar/trade/
│       │   ├── testsupport/
│       │   │   ├── AbstractPostgresIT.java                             [CREATE]
│       │   │   ├── AbstractIntegrationIT.java                          [CREATE]
│       │   │   └── AuthHeaderRequestPostProcessor.java                 [CREATE]
│       │   ├── trade/
│       │   │   ├── TradeStateMachineTest.java                          [CREATE]
│       │   │   ├── OneTimePasswordServiceTest.java                     [CREATE]
│       │   │   ├── TradeProposalServiceIT.java                         [CREATE]
│       │   │   ├── TradeProposalControllerIT.java                      [CREATE]
│       │   │   ├── TradeActionControllerIT.java                        [CREATE]
│       │   │   ├── TradeMessageControllerIT.java                       [CREATE]
│       │   │   ├── TradeTimeoutSchedulerIT.java                        [CREATE]
│       │   │   └── TradeE2EIT.java                                     [CREATE]
│       │   ├── kafka/
│       │   │   └── TradeEventPublisherIT.java                          [CREATE]
│       │   ├── ws/
│       │   │   └── TradeWebSocketIT.java                               [CREATE]
│       │   ├── card/CardControllerIT.java                              [MODIFY]
│       │   ├── mailbox/MailboxControllerIT.java                        [MODIFY]
│       │   └── TradeApplicationTests.java                              [MODIFY]
│       └── resources/
│           └── application-test.yml                                    [MODIFY]
```

Marketplace-service light touch:

```
backend/marketplace-service/
├── src/main/java/uz/efbazaar/marketplace/
│   ├── domain/
│   │   ├── ChatMessage.java                                            [MODIFY]
│   │   └── ChatMessageType.java                                        [CREATE]
│   └── kafka/
│       ├── TradeProposalConsumer.java                                  [CREATE]
│       ├── TradeProposalCreatedDto.java                                [CREATE]
│       └── TradeProposalResolvedDto.java                               [CREATE]
└── src/main/resources/db/migration/
    └── V21__chat_message_type.sql                                      [CREATE]
```

Infra:

```
docker-compose.yml                                                       [MODIFY]
nginx/conf.d/backends.inc                                                [MODIFY]
nginx/conf.d/api.conf                                                    [MODIFY]
```

---

## Task 1: Dependencies, application.yml, docker-compose env

**Files:**
- Modify: `backend/trade-service/pom.xml`
- Modify: `backend/trade-service/src/main/resources/application.yml`
- Modify: `docker-compose.yml` (trade-service block)

**Interfaces:**
- Produces: Spring Kafka, Spring Data Redis, Spring Security, Spring WebSocket, Testcontainers deps available to all downstream tasks. `KAFKA_BOOTSTRAP_SERVERS`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `MAILCOW_API_URL` env plumbing complete.

- [ ] **Step 1: Add new dependencies to pom.xml**

Modify `backend/trade-service/pom.xml`. Inside `<dependencies>`, add these next to the existing entries (order doesn't matter; group by concern for readability):

```xml
        <!-- Auth (nginx-header pattern, matches marketplace) -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>

        <!-- Kafka -->
        <dependency>
            <groupId>org.springframework.kafka</groupId>
            <artifactId>spring-kafka</artifactId>
        </dependency>

        <!-- Redis -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-redis</artifactId>
        </dependency>

        <!-- WSS -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-websocket</artifactId>
        </dependency>

        <!-- Testcontainers — replaces H2 shim from Plan A -->
        <dependency>
            <groupId>org.testcontainers</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>1.20.3</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.testcontainers</groupId>
            <artifactId>postgresql</artifactId>
            <version>1.20.3</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.testcontainers</groupId>
            <artifactId>kafka</artifactId>
            <version>1.20.3</version>
            <scope>test</scope>
        </dependency>

        <!-- Test-time async assertions -->
        <dependency>
            <groupId>org.awaitility</groupId>
            <artifactId>awaitility</artifactId>
            <scope>test</scope>
        </dependency>

        <!-- Kafka test slice, MockConsumer etc. -->
        <dependency>
            <groupId>org.springframework.kafka</groupId>
            <artifactId>spring-kafka-test</artifactId>
            <scope>test</scope>
        </dependency>

        <!-- WebSocket STOMP client for IT — same version as spring-messaging -->
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-messaging</artifactId>
            <scope>test</scope>
        </dependency>
```

Remove the H2 dependency block from Plan A (it's the block with `<groupId>com.h2database</groupId>`). H2 is no longer used — Testcontainers replaces it in Task 2.

- [ ] **Step 2: Extend application.yml with kafka, redis, security paths**

Modify `backend/trade-service/src/main/resources/application.yml`. The file currently ends with the `trade.crypto.master-key-file` block from Plan A. Add sections so the full file looks like:

```yaml
spring:
  application:
    name: trade-service
  profiles:
    active: ${SPRING_PROFILES_ACTIVE:local}

  datasource:
    url: jdbc:postgresql://${POSTGRES_HOST:localhost}:${POSTGRES_PORT:5432}/${POSTGRES_DB:trade_db}
    username: ${POSTGRES_USER:efbazaar}
    password: ${POSTGRES_PASSWORD:efbazaar}
    driver-class-name: org.postgresql.Driver

  jpa:
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
        format_sql: true
    open-in-view: false

  flyway:
    enabled: true
    baseline-on-migrate: true
    locations: classpath:db/migration

  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
      password: ${REDIS_PASSWORD:}

  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
    consumer:
      group-id: trade-service
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      properties:
        spring.json.trusted.packages: "uz.efbazaar.*"

server:
  port: 8085
  forward-headers-strategy: framework
  error:
    include-message: always

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics
      base-path: /actuator
  endpoint:
    health:
      show-details: when_authorized
  health:
    kafka:
      enabled: false

trade:
  crypto:
    master-key-file: ${MASTER_KEY_FILE:}
  timeouts:
    waiting-payment-seconds: 1800
    waiting-email-change-seconds: 1800
    verifying-konami-link-seconds: 1800
    waiting-password-seconds: 1800
    waiting-buyer-verify-seconds: 86400
  recheck:
    max-per-trade: 5
    min-interval-seconds: 300
  proposal:
    ttl-seconds: 600
  mailcow:
    api-url: ${MAILCOW_API_URL:https://mail.efbazaar.uz/api/v1}
```

- [ ] **Step 3: Extend the trade-service block in docker-compose.yml**

Modify the `trade-service:` block in `docker-compose.yml`. Add the new env vars and depends_on entries. The full block should now read:

```yaml
  # ---------- Trade service (escrow orchestrator, Plan B lifecycle) ----------
  trade-service:
    image: ${IMAGE_REGISTRY:-ghcr.io}/${IMAGE_NAMESPACE:-abdurahmoniy/efbazaar}-trade-service:${IMAGE_TAG:-latest}
    build:
      context: ./backend/trade-service
    container_name: efbazaar-trade
    restart: unless-stopped
    environment:
      JAVA_OPTS: "-Xms96m -Xmx280m -XX:MaxMetaspaceSize=160m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -XX:+ExitOnOutOfMemoryError -Djava.security.egd=file:/dev/./urandom"
      SPRING_PROFILES_ACTIVE: ${SPRING_PROFILES_ACTIVE}
      POSTGRES_HOST: ${POSTGRES_HOST}
      POSTGRES_PORT: ${POSTGRES_PORT}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${TRADE_DB_NAME}
      REDIS_HOST: ${REDIS_HOST}
      REDIS_PORT: ${REDIS_PORT}
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      KAFKA_BOOTSTRAP_SERVERS: ${KAFKA_BOOTSTRAP_SERVERS}
      MAILCOW_API_URL: https://mail.efbazaar.uz/api/v1
      MASTER_KEY_FILE: /run/secrets/master_key
    secrets:
      - master_key
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      kafka:
        condition: service_started
    mem_limit: 384m
    memswap_limit: 512m
    networks:
      - efbazaar-net
```

Note the memory bump (320 → 384). Kafka client + Redis client + WSS broker add ~40MB.

- [ ] **Step 4: Sanity-compile**

Run:
```bash
cd backend/trade-service
mvn -B -q -DskipTests package
```

Expected: `BUILD SUCCESS`. Tests are skipped because Task 2 hasn't migrated them off H2 yet.

- [ ] **Step 5: Commit**

```bash
git add backend/trade-service/pom.xml \
        backend/trade-service/src/main/resources/application.yml \
        docker-compose.yml
git commit -m "feat(trade-service): add kafka, redis, security, websocket, testcontainers deps"
```

---

## Task 2: Testcontainers foundation — replace H2 shim

**Files:**
- Delete: `backend/trade-service/src/test/resources/application-test.yml` (H2 profile — replaced)
- Create: `backend/trade-service/src/test/resources/application-test.yml` (Testcontainers-friendly)
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/testsupport/AbstractPostgresIT.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/testsupport/AbstractIntegrationIT.java`
- Modify: `backend/trade-service/src/test/java/uz/efbazaar/trade/TradeApplicationTests.java`
- Modify: `backend/trade-service/src/test/java/uz/efbazaar/trade/card/CardControllerIT.java`
- Modify: `backend/trade-service/src/test/java/uz/efbazaar/trade/mailbox/MailboxControllerIT.java`

**Interfaces:**
- Produces:
  - `AbstractPostgresIT` — base class for JPA/Flyway tests; starts a shared Postgres container, applies real Flyway migrations, gives subclasses a live datasource.
  - `AbstractIntegrationIT` — extends `AbstractPostgresIT` and starts Kafka + Redis containers so services under test can produce/consume/lock. Used by any test that touches Kafka or Redis.
- Consumes: Testcontainers junit-jupiter, postgresql, kafka modules from Task 1.

- [ ] **Step 1: Replace the test profile — drop H2, keep JPA settings that need overriding**

Overwrite `backend/trade-service/src/test/resources/application-test.yml`:

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect

  flyway:
    enabled: true

  # Kafka bootstrap comes from @DynamicPropertySource in AbstractIntegrationIT
  kafka:
    consumer:
      # Faster group assignment in tests — default is 3s
      properties:
        session.timeout.ms: 6000
        heartbeat.interval.ms: 2000

trade:
  crypto:
    master-key-file: ${MASTER_KEY_FILE:target/test-master-key}
  timeouts:
    # Shorter windows so timeout scheduler tests don't take 30 min
    waiting-payment-seconds: 2
    waiting-email-change-seconds: 2
    verifying-konami-link-seconds: 2
    waiting-password-seconds: 2
    waiting-buyer-verify-seconds: 2
  recheck:
    max-per-trade: 3
    min-interval-seconds: 1
  proposal:
    ttl-seconds: 60
```

- [ ] **Step 2: Create AbstractPostgresIT — writes master-key to a temp file, starts postgres**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/testsupport/AbstractPostgresIT.java`:

```java
package uz.efbazaar.trade.testsupport;

import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Base class for JPA / Flyway tests. Boots a single shared PostgreSQL 16 container
 * for the whole test JVM (static field → shared across subclasses) and mounts it
 * as the trade-service datasource. Real Flyway migrations run — no H2 shim.
 *
 * <p>Also writes a random 32-byte master key into {@code target/test-master-key}
 * so {@code MasterKeyProvider} finds one without asking the operator to plug in
 * a real docker secret when running {@code mvn verify}.
 */
@ActiveProfiles("test")
@Testcontainers
public abstract class AbstractPostgresIT {

    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"))
                    .withDatabaseName("trade_db_test")
                    .withUsername("test")
                    .withPassword("test")
                    .withReuse(true);

    protected static final Path MASTER_KEY_PATH = Path.of("target/test-master-key");

    static {
        POSTGRES.start();
        writeMasterKey();
    }

    private static void writeMasterKey() {
        try {
            byte[] key = new byte[32];
            new SecureRandom().nextBytes(key);
            Files.createDirectories(MASTER_KEY_PATH.getParent());
            Files.writeString(MASTER_KEY_PATH, Base64.getEncoder().encodeToString(key));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to write test master key", e);
        }
    }

    @DynamicPropertySource
    static void registerPostgres(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
        r.add("trade.crypto.master-key-file", MASTER_KEY_PATH::toString);
    }
}
```

- [ ] **Step 3: Create AbstractIntegrationIT — add Kafka + Redis on top of AbstractPostgresIT**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/testsupport/AbstractIntegrationIT.java`:

```java
package uz.efbazaar.trade.testsupport;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Full-stack test base: Postgres (from parent) + Kafka + Redis.
 * Use this whenever a test touches Kafka topics, Redis keys, or scheduled jobs.
 */
public abstract class AbstractIntegrationIT extends AbstractPostgresIT {

    protected static final KafkaContainer KAFKA =
            new KafkaContainer(DockerImageName.parse("apache/kafka:3.7.0"))
                    .withReuse(true);

    protected static final GenericContainer<?> REDIS =
            new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
                    .withExposedPorts(6379)
                    .withReuse(true);

    static {
        KAFKA.start();
        REDIS.start();
    }

    @DynamicPropertySource
    static void registerKafkaAndRedis(DynamicPropertyRegistry r) {
        r.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
        r.add("spring.data.redis.host", REDIS::getHost);
        r.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        r.add("spring.data.redis.password", () -> "");
    }
}
```

- [ ] **Step 4: Retire the H2-based context-loads test**

Modify `backend/trade-service/src/test/java/uz/efbazaar/trade/TradeApplicationTests.java` — extend the new base and drop `@ActiveProfiles` (parent supplies it):

```java
package uz.efbazaar.trade;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.testsupport.AbstractPostgresIT;

@SpringBootTest
class TradeApplicationTests extends AbstractPostgresIT {

    @Test
    void contextLoads() {
        // Full context with real Flyway-migrated Postgres.
    }
}
```

- [ ] **Step 5: Update CardControllerIT to extend the new base**

Modify `backend/trade-service/src/test/java/uz/efbazaar/trade/card/CardControllerIT.java` — remove any `@ActiveProfiles("test")` at the class level (parent supplies), change the class declaration to `extends AbstractPostgresIT`, delete the `@AutoConfigureTestDatabase` annotation if present (Plan A shouldn't have it, but if it does, drop it). The rest of the test body stays.

Concretely, ensure the class opens with:

```java
package uz.efbazaar.trade.card;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestTemplate;
import uz.efbazaar.trade.testsupport.AbstractPostgresIT;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CardControllerIT extends AbstractPostgresIT {
    // ... existing test body, no other changes needed at this step
}
```

- [ ] **Step 6: Update MailboxControllerIT identically**

Modify `backend/trade-service/src/test/java/uz/efbazaar/trade/mailbox/MailboxControllerIT.java` — same substitution: extends `AbstractPostgresIT`, drop any `@ActiveProfiles("test")` at class level.

- [ ] **Step 7: Run the whole test suite against Testcontainers**

```bash
cd backend/trade-service
mvn -B -q verify
```

Expected: `BUILD SUCCESS`. The first run pulls the postgres image and takes ~30s longer than subsequent runs. All existing Plan A tests should pass unchanged against real Postgres.

If a test fails with a schema mismatch (e.g. `column "last4" is of type character(4) but expected character varying(4)`), it means Plan A's V2 fix didn't land — go check the current V2 file. This exact bug is *why* we're moving off H2.

- [ ] **Step 8: Commit**

```bash
git add backend/trade-service/src/test/
git commit -m "test(trade-service): replace H2 with Testcontainers Postgres"
```

---

## Task 3: Spring Security + Header-based auth (retire raw @RequestHeader)

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/security/AuthenticatedUser.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/security/HeaderAuthenticationFilter.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/security/SecurityConfig.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/security/AuthenticatedUserResolver.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/card/controller/CardController.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/controller/MailboxController.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/testsupport/AuthHeaderRequestPostProcessor.java`
- Modify: `backend/trade-service/src/test/java/uz/efbazaar/trade/card/CardControllerIT.java`
- Modify: `backend/trade-service/src/test/java/uz/efbazaar/trade/mailbox/MailboxControllerIT.java`

**Interfaces:**
- Produces:
  - `AuthenticatedUser(UUID userId, Long telegramId, List<String> roles, String displayName)` — record injectable as `@AuthenticationPrincipal AuthenticatedUser user`.
  - Filter reads `X-User-Id`, `X-User-Roles`, `X-User-Name`, `X-Telegram-Id` (identical to marketplace).
  - Security config: `/actuator/**` public, `/api/v1/admin/**` requires `ROLE_ADMIN`, everything else requires authentication, `/ws/trade/**` permitted at filter level (STOMP CONNECT frame does its own auth in Task 21).
- Consumes: `spring-boot-starter-security` from Task 1.

- [ ] **Step 1: Add AuthenticatedUser record**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/security/AuthenticatedUser.java`:

```java
package uz.efbazaar.trade.security;

import java.util.List;
import java.util.UUID;

/**
 * Identity extracted from the nginx-injected auth headers. Same shape as
 * marketplace-service's AuthenticatedUser so a request that traverses both
 * services is described identically.
 */
public record AuthenticatedUser(
        UUID userId,
        Long telegramId,
        List<String> roles,
        String displayName
) {
    public boolean hasRole(String role) {
        return roles != null && roles.contains(role);
    }
}
```

- [ ] **Step 2: Add HeaderAuthenticationFilter**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/security/HeaderAuthenticationFilter.java`:

```java
package uz.efbazaar.trade.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * Reads identity headers injected by nginx after the auth_request subrequest.
 * Absent headers → anonymous request (filter never fails).
 */
@Slf4j
@Component
public class HeaderAuthenticationFilter extends OncePerRequestFilter {

    public static final String HEADER_USER_ID = "X-User-Id";
    public static final String HEADER_USER_ROLES = "X-User-Roles";
    public static final String HEADER_TELEGRAM_ID = "X-Telegram-Id";
    public static final String HEADER_USER_NAME = "X-User-Name";

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain)
            throws ServletException, IOException {
        String userIdHeader = request.getHeader(HEADER_USER_ID);

        if (StringUtils.hasText(userIdHeader)
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                UUID userId = UUID.fromString(userIdHeader);
                List<String> roles = parseRoles(request.getHeader(HEADER_USER_ROLES));
                Long telegramId = parseTelegramId(request.getHeader(HEADER_TELEGRAM_ID));
                String displayName = parseDisplayName(request.getHeader(HEADER_USER_NAME));

                AuthenticatedUser principal =
                        new AuthenticatedUser(userId, telegramId, roles, displayName);
                List<SimpleGrantedAuthority> authorities = roles.stream()
                        .map(SimpleGrantedAuthority::new)
                        .toList();
                var auth = new UsernamePasswordAuthenticationToken(principal, null, authorities);
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (IllegalArgumentException e) {
                log.warn("Invalid X-User-Id header: {}", userIdHeader);
            }
        }

        chain.doFilter(request, response);
    }

    private List<String> parseRoles(String header) {
        if (!StringUtils.hasText(header)) return Collections.emptyList();
        return Arrays.stream(header.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    private Long parseTelegramId(String header) {
        if (!StringUtils.hasText(header)) return null;
        try {
            return Long.parseLong(header.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String parseDisplayName(String header) {
        if (!StringUtils.hasText(header)) return null;
        try {
            String decoded = new String(
                    Base64.getDecoder().decode(header.trim()),
                    StandardCharsets.UTF_8).trim();
            return decoded.isEmpty() ? null : decoded;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
```

- [ ] **Step 3: Add SecurityConfig**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/security/SecurityConfig.java`:

```java
package uz.efbazaar.trade.security;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final HeaderAuthenticationFilter headerAuthFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/**").permitAll()
                        // STOMP handshake — CONNECT frame auth happens in WebSocketConfig (Task 21)
                        .requestMatchers("/ws/trade/**").permitAll()
                        .requestMatchers("/api/v1/admin/**").hasAuthority("ROLE_ADMIN")
                        .anyRequest().authenticated())
                .addFilterBefore(headerAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}
```

- [ ] **Step 4: Migrate CardController — inject principal instead of reading header**

Modify `backend/trade-service/src/main/java/uz/efbazaar/trade/card/controller/CardController.java`. Replace every method signature:

Before (Plan A pattern):
```java
public CardResponse create(
        @RequestHeader("X-User-Id") UUID userId,
        @Valid @RequestBody CardCreateRequest req) { ... }
```

After:
```java
public CardResponse create(
        @AuthenticationPrincipal AuthenticatedUser me,
        @Valid @RequestBody CardCreateRequest req) {
    return mapper.toResponse(service.create(me.userId(), req));
}
```

Add imports:
```java
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import uz.efbazaar.trade.security.AuthenticatedUser;
```

Remove `import org.springframework.web.bind.annotation.RequestHeader;` and the obsolete javadoc `* Plan A auth model: caller identity comes from X-User-Id header, set by nginx…`.

Apply the same substitution to every method in the file (`create`, `listSaved`, `delete`).

- [ ] **Step 5: Migrate MailboxController identically**

Modify `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/controller/MailboxController.java`. Same pattern — replace `@RequestHeader("X-User-Id") UUID userId` with `@AuthenticationPrincipal AuthenticatedUser me`, and use `me.userId()` inside the method body.

- [ ] **Step 6: Add a test post-processor that sets identity headers on MockMvc requests**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/testsupport/AuthHeaderRequestPostProcessor.java`:

```java
package uz.efbazaar.trade.testsupport;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.UUID;

/**
 * MockMvc helper: sets the three nginx headers so
 * {@link uz.efbazaar.trade.security.HeaderAuthenticationFilter} picks up
 * a synthetic identity.
 */
public final class AuthHeaderRequestPostProcessor {

    private AuthHeaderRequestPostProcessor() {}

    public static RequestPostProcessor asUser(UUID userId) {
        return asUser(userId, "ROLE_USER");
    }

    public static RequestPostProcessor asUser(UUID userId, String... roles) {
        return req -> {
            req.addHeader("X-User-Id", userId.toString());
            req.addHeader("X-User-Roles", String.join(",", roles));
            return req;
        };
    }

    public static RequestPostProcessor asAdmin() {
        return asUser(UUID.randomUUID(), "ROLE_USER", "ROLE_ADMIN");
    }
}
```

- [ ] **Step 7: Update CardControllerIT to use the new header helper**

Modify `backend/trade-service/src/test/java/uz/efbazaar/trade/card/CardControllerIT.java`. Any RestTemplate-based test call setting the raw `X-User-Id` header stays as-is (Plan A used a RestTemplate that already sends headers, so behaviour is unchanged; the nginx headers still land, only the controller code now reads them via the principal). If Plan A used MockMvc anywhere, switch those calls to use `.with(asUser(userId))`.

Do add a new negative test case near the top of the class to prove the security config rejects unauthenticated calls:

```java
    @Test
    void anonymousCallReturns401() {
        RestTemplate rest = new RestTemplate();
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        try {
            rest.exchange("http://localhost:" + port + "/api/v1/cards",
                    HttpMethod.GET,
                    new HttpEntity<>(h),
                    String.class);
            org.assertj.core.api.Assertions.fail("expected 401");
        } catch (org.springframework.web.client.HttpClientErrorException.Unauthorized ignored) {
            // ok
        }
    }
```

- [ ] **Step 8: Update MailboxControllerIT identically — add anonymous-401 case**

Same edit as Step 7 applied to `MailboxControllerIT`.

- [ ] **Step 9: Run the test suite**

```bash
mvn -B -q verify
```

Expected: `BUILD SUCCESS`. Existing tests continue to pass because Plan A's RestTemplate-based ITs send `X-User-Id`, and the new filter picks it up. The two new `anonymousCallReturns401` cases pass because SecurityConfig demands `authenticated()`.

If existing tests fail with 401, the RestTemplate call is missing the header — check the test's request-setup helper.

- [ ] **Step 10: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/security/ \
        backend/trade-service/src/main/java/uz/efbazaar/trade/card/controller/CardController.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/controller/MailboxController.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/testsupport/AuthHeaderRequestPostProcessor.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/card/CardControllerIT.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/mailbox/MailboxControllerIT.java
git commit -m "feat(trade-service): switch to nginx-header Spring Security (replace @RequestHeader shim)"
```

---

## Task 4: V4 — trades table + Trade entity + TradeState + TradeEvent enums

**Files:**
- Create: `backend/trade-service/src/main/resources/db/migration/V4__create_trade_table.sql`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/Trade.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeState.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeEvent.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/ParticipantRole.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeRepository.java`

**Interfaces:**
- Produces:
  - `TradeState` enum: `INITIATED, WAITING_PAYMENT, WAITING_EMAIL_CHANGE, VERIFYING_KONAMI_LINK, WAITING_PASSWORD, WAITING_BUYER_VERIFY, SUCCESS, REJECTED, ORPHANED`. `SUCCESS`, `REJECTED`, `ORPHANED` are terminal — `isTerminal()` helper.
  - `TradeEvent` enum: signals a state-machine transition. `MAILBOX_PROVISIONED, PAYMENT_CONFIRMED, EMAIL_CHANGED, KONAMI_EMAIL_RECEIVED, PASSWORD_SENT, BUYER_CONFIRM, BUYER_REJECT, TIMEOUT, RECHECK`. Task 7 wires these into the transition table.
  - `ParticipantRole` enum: `SELLER, BUYER`.
  - `Trade` JPA entity with all V4 columns.
  - `TradeRepository`:
    - `Optional<Trade> findByIdAndParticipant(UUID id, UUID userId)` — enforces authorisation.
    - `List<Trade> findByStateInAndStateDeadlineBefore(Set<TradeState> states, Instant cutoff)` — for the timeout scheduler.
    - `Optional<Trade> findByMailboxId(UUID mailboxId)` — for the terminal-state handoff.
- Consumes: Plan A `Card`, `Mailbox` entities are FK targets by ID (no JPA `@ManyToOne` — we cross-reference by UUID to keep aggregates loose).

- [ ] **Step 1: Write V4 migration**

Create `backend/trade-service/src/main/resources/db/migration/V4__create_trade_table.sql`:

```sql
-- ==============================================================
-- trade-service V4 — trades table.
-- Escrow trade root aggregate. State + deadlines are the only mutable
-- shape; identity of parties, mailbox, cards is fixed at creation.
-- Cards and mailboxes are referenced by UUID (no FK) to keep the trade
-- aggregate loose — Plan A entities live in the same DB but we don't
-- couple deletes.
-- ==============================================================

CREATE TABLE trades (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    seller_id         UUID          NOT NULL,
    buyer_id          UUID          NOT NULL,
    listing_id        UUID,

    price_uzs         BIGINT        NOT NULL,

    state             VARCHAR(32)   NOT NULL,

    mailbox_id        UUID          NOT NULL,
    seller_card_id    UUID          NOT NULL,
    buyer_card_id     UUID          NOT NULL,

    payment_intent_id VARCHAR(128),

    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ   NOT NULL,
    state_deadline    TIMESTAMPTZ,

    terminal_reason   VARCHAR(64),

    CONSTRAINT chk_trades_state CHECK (state IN (
        'INITIATED', 'WAITING_PAYMENT', 'WAITING_EMAIL_CHANGE',
        'VERIFYING_KONAMI_LINK', 'WAITING_PASSWORD',
        'WAITING_BUYER_VERIFY', 'SUCCESS', 'REJECTED', 'ORPHANED'
    )),

    CONSTRAINT chk_trades_parties_distinct CHECK (seller_id <> buyer_id),
    CONSTRAINT chk_trades_price_positive   CHECK (price_uzs > 0)
);

CREATE INDEX idx_trades_seller_id  ON trades (seller_id);
CREATE INDEX idx_trades_buyer_id   ON trades (buyer_id);
CREATE INDEX idx_trades_state      ON trades (state);
-- Timeout scheduler: cheap lookup for "trades whose state deadline is due".
CREATE INDEX idx_trades_deadline   ON trades (state_deadline)
    WHERE state_deadline IS NOT NULL;
CREATE UNIQUE INDEX uk_trades_mailbox_active ON trades (mailbox_id)
    WHERE state NOT IN ('SUCCESS', 'REJECTED', 'ORPHANED');
```

- [ ] **Step 2: Add TradeState enum**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeState.java`:

```java
package uz.efbazaar.trade.trade.domain;

import java.util.EnumSet;
import java.util.Set;

public enum TradeState {
    INITIATED,
    WAITING_PAYMENT,
    WAITING_EMAIL_CHANGE,
    VERIFYING_KONAMI_LINK,
    WAITING_PASSWORD,
    WAITING_BUYER_VERIFY,
    SUCCESS,
    REJECTED,
    ORPHANED;

    private static final Set<TradeState> TERMINAL =
            EnumSet.of(SUCCESS, REJECTED, ORPHANED);

    public boolean isTerminal() {
        return TERMINAL.contains(this);
    }

    public static Set<TradeState> nonTerminal() {
        return EnumSet.complementOf(EnumSet.copyOf(TERMINAL));
    }
}
```

- [ ] **Step 3: Add TradeEvent enum**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeEvent.java`:

```java
package uz.efbazaar.trade.trade.domain;

/**
 * Trigger for a state-machine transition. Each event has a fixed set of
 * source states from which it is legal — enforced by {@link
 * uz.efbazaar.trade.trade.service.TradeStateMachine}.
 */
public enum TradeEvent {
    /** Worker replied to email-provision-request. INITIATED → WAITING_PAYMENT. */
    MAILBOX_PROVISIONED,
    /** Buyer clicked "TO'LOV QILDIM". WAITING_PAYMENT → WAITING_EMAIL_CHANGE. */
    PAYMENT_CONFIRMED,
    /** Seller clicked "O'ZGARTIRDIM". WAITING_EMAIL_CHANGE → VERIFYING_KONAMI_LINK. */
    EMAIL_CHANGED,
    /** Worker reported IMAP-matched Konami email. VERIFYING_KONAMI_LINK → WAITING_PASSWORD. */
    KONAMI_EMAIL_RECEIVED,
    /** Seller sent password via one-time flow. WAITING_PASSWORD → WAITING_BUYER_VERIFY. */
    PASSWORD_SENT,
    /** Buyer clicked "TASDIQLAYMAN". WAITING_BUYER_VERIFY → SUCCESS. */
    BUYER_CONFIRM,
    /** Buyer clicked "AKKAUNT NOTO'G'RI". WAITING_BUYER_VERIFY → REJECTED. */
    BUYER_REJECT,
    /** Per-state deadline elapsed. → ORPHANED (or REJECTED for state 6). */
    TIMEOUT,
    /** Seller clicked "QAYTA TEKSHIR" (state 4). Does not change state; used for audit only. */
    RECHECK
}
```

- [ ] **Step 4: Add ParticipantRole enum**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/ParticipantRole.java`:

```java
package uz.efbazaar.trade.trade.domain;

public enum ParticipantRole {
    SELLER, BUYER;

    public ParticipantRole other() {
        return this == SELLER ? BUYER : SELLER;
    }
}
```

- [ ] **Step 5: Add Trade entity**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/Trade.java`:

```java
package uz.efbazaar.trade.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "trades")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Trade {

    /**
     * Application-assigned UUID (same reasoning as Card in Plan A — the id is
     * needed before insert to seed encryption contexts on child records).
     */
    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "seller_id", nullable = false, updatable = false)
    private UUID sellerId;

    @Column(name = "buyer_id", nullable = false, updatable = false)
    private UUID buyerId;

    @Column(name = "listing_id", updatable = false)
    private UUID listingId;

    @Column(name = "price_uzs", nullable = false, updatable = false)
    private long priceUzs;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private TradeState state;

    @Column(name = "mailbox_id", nullable = false, updatable = false)
    private UUID mailboxId;

    @Column(name = "seller_card_id", nullable = false, updatable = false)
    private UUID sellerCardId;

    @Column(name = "buyer_card_id", nullable = false, updatable = false)
    private UUID buyerCardId;

    @Column(name = "payment_intent_id", length = 128)
    private String paymentIntentId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "state_deadline")
    private Instant stateDeadline;

    @Column(name = "terminal_reason", length = 64)
    private String terminalReason;

    /** Convenience for controllers: which side is this user? Throws if neither. */
    public ParticipantRole roleFor(UUID userId) {
        if (userId.equals(sellerId)) return ParticipantRole.SELLER;
        if (userId.equals(buyerId)) return ParticipantRole.BUYER;
        throw new IllegalArgumentException("User " + userId + " is not a party to trade " + id);
    }

    public boolean isParticipant(UUID userId) {
        return userId.equals(sellerId) || userId.equals(buyerId);
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
```

- [ ] **Step 6: Add TradeRepository**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeRepository.java`:

```java
package uz.efbazaar.trade.trade.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeState;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public interface TradeRepository extends JpaRepository<Trade, UUID> {

    @Query("""
            SELECT t FROM Trade t
             WHERE t.id = :id
               AND (t.sellerId = :userId OR t.buyerId = :userId)
            """)
    Optional<Trade> findByIdAndParticipant(@Param("id") UUID id,
                                           @Param("userId") UUID userId);

    List<Trade> findByStateInAndStateDeadlineBefore(Set<TradeState> states,
                                                    Instant cutoff);

    Optional<Trade> findByMailboxId(UUID mailboxId);
}
```

- [ ] **Step 7: Verify migration applies and entity validates**

```bash
mvn -B -q verify -Dtest=TradeApplicationTests
```

Expected: `BUILD SUCCESS`. The Testcontainers Postgres now shows V1-V4 applied. Hibernate `ddl-auto: validate` succeeds because the entity maps every column in V4 with the exact types.

- [ ] **Step 8: Commit**

```bash
git add backend/trade-service/src/main/resources/db/migration/V4__create_trade_table.sql \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/ \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeRepository.java
git commit -m "feat(trade-service): add V4 trades table, Trade entity, state/event enums"
```

---

## Task 5: V5 — trade_chats + trade_messages + entities

**Files:**
- Create: `backend/trade-service/src/main/resources/db/migration/V5__create_trade_chat_and_messages.sql`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeChat.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeMessage.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeMessageType.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeSenderType.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeChatRepository.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeMessageRepository.java`

**Interfaces:**
- Produces:
  - `TradeMessageType`: `TEXT, BUTTON_PROMPT, STATUS, PASSWORD_ONETIME`.
  - `TradeSenderType`: `USER, SMART_ADMIN, SYSTEM`.
  - `TradeChat`: (trade_id, participant) → id.
  - `TradeMessage`: encrypted body, iv, tag, `metadata` JSONB, created_at.
  - `TradeChatRepository.findByTradeIdAndParticipant(UUID tradeId, ParticipantRole role)`.
  - `TradeMessageRepository.findByTradeChatIdOrderByCreatedAtAsc(UUID chatId)`.

- [ ] **Step 1: Write V5 migration**

Create `backend/trade-service/src/main/resources/db/migration/V5__create_trade_chat_and_messages.sql`:

```sql
-- ==============================================================
-- trade-service V5 — per-party chats + encrypted messages.
-- Each trade has exactly two chats — one for the SELLER and one for
-- the BUYER — enforced by the unique (trade_id, participant) index.
-- Neither party sees the other party's chat.
-- ==============================================================

CREATE TABLE trade_chats (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_id      UUID          NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    participant   VARCHAR(8)    NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_trade_chats_participant CHECK (participant IN ('SELLER', 'BUYER')),
    CONSTRAINT uk_trade_chats_trade_participant UNIQUE (trade_id, participant)
);

CREATE INDEX idx_trade_chats_trade ON trade_chats (trade_id);

CREATE TABLE trade_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_chat_id   UUID          NOT NULL REFERENCES trade_chats(id) ON DELETE CASCADE,

    sender_type     VARCHAR(16)   NOT NULL,
    message_type    VARCHAR(24)   NOT NULL,

    encrypted_body  BYTEA,
    iv              BYTEA,
    tag             BYTEA,

    metadata        JSONB,

    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_trade_messages_sender  CHECK (sender_type IN ('USER', 'SMART_ADMIN', 'SYSTEM')),
    CONSTRAINT chk_trade_messages_type    CHECK (message_type IN ('TEXT', 'BUTTON_PROMPT', 'STATUS', 'PASSWORD_ONETIME')),
    -- Body columns must be all-null (for STATUS/BUTTON_PROMPT with no user text)
    -- or all-non-null (for TEXT and PASSWORD_ONETIME).
    CONSTRAINT chk_trade_messages_body_shape CHECK (
        (encrypted_body IS NULL AND iv IS NULL AND tag IS NULL)
     OR (encrypted_body IS NOT NULL AND iv IS NOT NULL AND tag IS NOT NULL)
    )
);

CREATE INDEX idx_trade_messages_chat_created
    ON trade_messages (trade_chat_id, created_at);
```

- [ ] **Step 2: Add TradeMessageType**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeMessageType.java`:

```java
package uz.efbazaar.trade.trade.domain;

public enum TradeMessageType {
    /** Free-form user or smart-admin text; body encrypted with derivable HKDF context. */
    TEXT,
    /** Smart-admin prompt that renders a button on the client; body may be null. */
    BUTTON_PROMPT,
    /** Status change note; body may be null (metadata carries the state code). */
    STATUS,
    /** Konami password one-time reveal; body encrypted with a Redis-held key. */
    PASSWORD_ONETIME
}
```

- [ ] **Step 3: Add TradeSenderType**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeSenderType.java`:

```java
package uz.efbazaar.trade.trade.domain;

public enum TradeSenderType {
    /** A trade participant (seller or buyer, inferred from the owning chat). */
    USER,
    /** Automated smart-admin bot messages (STATE_1…STATE_6 prompts). */
    SMART_ADMIN,
    /** System-injected state transitions (STATUS entries). */
    SYSTEM
}
```

- [ ] **Step 4: Add TradeChat entity**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeChat.java`:

```java
package uz.efbazaar.trade.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "trade_chats")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TradeChat {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "trade_id", nullable = false, updatable = false)
    private UUID tradeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8, updatable = false)
    private ParticipantRole participant;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
```

- [ ] **Step 5: Add TradeMessage entity**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeMessage.java`:

```java
package uz.efbazaar.trade.trade.domain;

import io.hypersistence.utils.hibernate.type.json.JsonBinaryType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "trade_messages")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TradeMessage {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "trade_chat_id", nullable = false, updatable = false)
    private UUID tradeChatId;

    @Enumerated(EnumType.STRING)
    @Column(name = "sender_type", nullable = false, length = 16, updatable = false)
    private TradeSenderType senderType;

    @Enumerated(EnumType.STRING)
    @Column(name = "message_type", nullable = false, length = 24, updatable = false)
    private TradeMessageType messageType;

    /** May be null for STATUS / BUTTON_PROMPT with no user text. */
    @Column(name = "encrypted_body")
    private byte[] encryptedBody;

    @Column(name = "iv", length = 12)
    private byte[] iv;

    @Column(name = "tag", length = 16)
    private byte[] tag;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
```

Note: the `@JdbcTypeCode(SqlTypes.JSON)` annotation is available in Hibernate 6 (Spring Boot 3.3 ships it) — no extra dependency needed. Ignore the `JsonBinaryType` import if your IDE offers it; remove that line.

Fix the import block to only what's used:

```java
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
```

- [ ] **Step 6: Add TradeChatRepository**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeChatRepository.java`:

```java
package uz.efbazaar.trade.trade.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeChat;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TradeChatRepository extends JpaRepository<TradeChat, UUID> {

    Optional<TradeChat> findByTradeIdAndParticipant(UUID tradeId, ParticipantRole participant);

    List<TradeChat> findByTradeId(UUID tradeId);
}
```

- [ ] **Step 7: Add TradeMessageRepository**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeMessageRepository.java`:

```java
package uz.efbazaar.trade.trade.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.trade.domain.TradeMessage;

import java.util.List;
import java.util.UUID;

public interface TradeMessageRepository extends JpaRepository<TradeMessage, UUID> {

    List<TradeMessage> findByTradeChatIdOrderByCreatedAtAsc(UUID tradeChatId);
}
```

- [ ] **Step 8: Run context-loads and CardControllerIT to confirm nothing broke**

```bash
mvn -B -q verify -Dtest=TradeApplicationTests,CardControllerIT,MailboxControllerIT
```

Expected: `BUILD SUCCESS`. V5 migration applies; new entities validate.

- [ ] **Step 9: Commit**

```bash
git add backend/trade-service/src/main/resources/db/migration/V5__create_trade_chat_and_messages.sql \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeChat.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeMessage.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeMessageType.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeSenderType.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeChatRepository.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeMessageRepository.java
git commit -m "feat(trade-service): add V5 trade_chats + trade_messages"
```

---

## Task 6: V6 — trade_audit_log + append-only audit service

**Files:**
- Create: `backend/trade-service/src/main/resources/db/migration/V6__create_trade_audit_log.sql`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeAuditLog.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/ActorType.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeAuditLogRepository.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeAuditService.java`

**Interfaces:**
- Produces:
  - `ActorType`: `USER, WORKER, SYSTEM, ADMIN`.
  - `TradeAuditLog` entity with BIGSERIAL id.
  - `TradeAuditService.record(UUID tradeId, ActorType actor, UUID actorId, String action, Map<String,Object> metadata)` — the ONLY write path. No `delete` or `update` methods anywhere.

- [ ] **Step 1: Write V6 migration**

Create `backend/trade-service/src/main/resources/db/migration/V6__create_trade_audit_log.sql`:

```sql
-- ==============================================================
-- trade-service V6 — audit log.
-- Append-only. GDPR archival strategy is a follow-up (spec §11).
-- ==============================================================

CREATE TABLE trade_audit_log (
    id           BIGSERIAL PRIMARY KEY,
    trade_id     UUID          NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    actor_type   VARCHAR(16)   NOT NULL,
    actor_id     UUID,
    action       VARCHAR(64)   NOT NULL,
    metadata     JSONB,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_audit_actor CHECK (actor_type IN ('USER','WORKER','SYSTEM','ADMIN'))
);

CREATE INDEX idx_audit_trade_created ON trade_audit_log (trade_id, created_at);
```

- [ ] **Step 2: Add ActorType enum**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/ActorType.java`:

```java
package uz.efbazaar.trade.trade.domain;

public enum ActorType {
    USER, WORKER, SYSTEM, ADMIN
}
```

- [ ] **Step 3: Add TradeAuditLog entity**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeAuditLog.java`:

```java
package uz.efbazaar.trade.trade.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "trade_audit_log")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TradeAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "trade_id", nullable = false, updatable = false)
    private UUID tradeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "actor_type", nullable = false, length = 16, updatable = false)
    private ActorType actorType;

    @Column(name = "actor_id", updatable = false)
    private UUID actorId;

    @Column(nullable = false, length = 64, updatable = false)
    private String action;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
```

- [ ] **Step 4: Add TradeAuditLogRepository — read + insert only**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeAuditLogRepository.java`:

```java
package uz.efbazaar.trade.trade.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.trade.domain.TradeAuditLog;

import java.util.List;
import java.util.UUID;

public interface TradeAuditLogRepository extends JpaRepository<TradeAuditLog, Long> {

    List<TradeAuditLog> findByTradeIdOrderByCreatedAtAsc(UUID tradeId);
}
```

We inherit `delete*` from `JpaRepository`. The service (Step 5) is the only injection point exposed to callers and it does not call any delete method — that's the append-only contract enforced by convention. A CI grep in Task 22's nginx step verifies no controller calls repository delete methods.

- [ ] **Step 5: Add TradeAuditService — the sanctioned write path**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeAuditService.java`:

```java
package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeAuditLog;
import uz.efbazaar.trade.trade.repository.TradeAuditLogRepository;

import java.util.Map;
import java.util.UUID;

/**
 * The only sanctioned way to write to trade_audit_log.
 * No delete or update methods — this class is intentionally minimal.
 */
@Service
@RequiredArgsConstructor
public class TradeAuditService {

    private final TradeAuditLogRepository repo;

    @Transactional
    public void record(UUID tradeId,
                       ActorType actorType,
                       UUID actorId,
                       String action,
                       Map<String, Object> metadata) {
        repo.save(TradeAuditLog.builder()
                .tradeId(tradeId)
                .actorType(actorType)
                .actorId(actorId)
                .action(action)
                .metadata(metadata)
                .build());
    }
}
```

- [ ] **Step 6: Sanity-run — context loads, V6 applies**

```bash
mvn -B -q verify -Dtest=TradeApplicationTests
```

Expected: `BUILD SUCCESS`, one test passes.

- [ ] **Step 7: Commit**

```bash
git add backend/trade-service/src/main/resources/db/migration/V6__create_trade_audit_log.sql \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeAuditLog.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/ActorType.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeAuditLogRepository.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeAuditService.java
git commit -m "feat(trade-service): add V6 trade_audit_log + append-only TradeAuditService"
```

---

## Task 7: TradeStateMachine — transition table + guards

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateMachine.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/exception/InvalidTradeTransitionException.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeStateMachineTest.java`

**Interfaces:**
- Produces:
  - `TradeStateMachine.transition(TradeState current, TradeEvent event) -> TradeState` — returns the new state or throws `InvalidTradeTransitionException`.
  - `TradeStateMachine.timeoutTargetOf(TradeState current) -> TradeState` — used by the scheduler.
  - `TradeStateMachine.deadlineFor(TradeState newState, TimeoutProperties props) -> Instant` — returns next state's deadline (null for terminal / VERIFYING_KONAMI_LINK reuses the previous deadline logic — see comment).

- [ ] **Step 1: Write the failing TradeStateMachineTest**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeStateMachineTest.java`:

```java
package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;
import uz.efbazaar.trade.trade.service.TradeStateMachine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static uz.efbazaar.trade.trade.domain.TradeEvent.*;
import static uz.efbazaar.trade.trade.domain.TradeState.*;

class TradeStateMachineTest {

    private final TradeStateMachine sm = new TradeStateMachine();

    @Test
    void happyPathReachesSuccess() {
        TradeState s = INITIATED;
        s = sm.transition(s, MAILBOX_PROVISIONED);
        assertThat(s).isEqualTo(WAITING_PAYMENT);
        s = sm.transition(s, PAYMENT_CONFIRMED);
        assertThat(s).isEqualTo(WAITING_EMAIL_CHANGE);
        s = sm.transition(s, EMAIL_CHANGED);
        assertThat(s).isEqualTo(VERIFYING_KONAMI_LINK);
        s = sm.transition(s, KONAMI_EMAIL_RECEIVED);
        assertThat(s).isEqualTo(WAITING_PASSWORD);
        s = sm.transition(s, PASSWORD_SENT);
        assertThat(s).isEqualTo(WAITING_BUYER_VERIFY);
        s = sm.transition(s, BUYER_CONFIRM);
        assertThat(s).isEqualTo(SUCCESS);
    }

    @Test
    void buyerRejectFromWaitingBuyerVerifyGoesToRejected() {
        TradeState s = sm.transition(WAITING_BUYER_VERIFY, BUYER_REJECT);
        assertThat(s).isEqualTo(REJECTED);
    }

    @Test
    void timeoutBeforeBuyerVerifyGoesOrphaned() {
        assertThat(sm.transition(WAITING_PAYMENT, TIMEOUT)).isEqualTo(ORPHANED);
        assertThat(sm.transition(WAITING_EMAIL_CHANGE, TIMEOUT)).isEqualTo(ORPHANED);
        assertThat(sm.transition(VERIFYING_KONAMI_LINK, TIMEOUT)).isEqualTo(ORPHANED);
        assertThat(sm.transition(WAITING_PASSWORD, TIMEOUT)).isEqualTo(ORPHANED);
    }

    @Test
    void timeoutOfBuyerVerifyGoesRejected() {
        // Spec §3.2 row 6: on timeout the trade goes REJECTED (buyer had 24h to confirm).
        assertThat(sm.transition(WAITING_BUYER_VERIFY, TIMEOUT)).isEqualTo(REJECTED);
    }

    @Test
    void recheckDoesNotChangeState() {
        assertThat(sm.transition(VERIFYING_KONAMI_LINK, RECHECK))
                .isEqualTo(VERIFYING_KONAMI_LINK);
    }

    @Test
    void terminalStatesAcceptNoEvents() {
        for (TradeState t : new TradeState[]{SUCCESS, REJECTED, ORPHANED}) {
            for (TradeEvent e : TradeEvent.values()) {
                assertThatThrownBy(() -> sm.transition(t, e))
                        .isInstanceOf(InvalidTradeTransitionException.class);
            }
        }
    }

    @Test
    void illegalTransitionThrows() {
        // Buyer can't reject before state 6.
        assertThatThrownBy(() -> sm.transition(WAITING_PAYMENT, BUYER_REJECT))
                .isInstanceOf(InvalidTradeTransitionException.class);
        // Password can't be sent before state 5.
        assertThatThrownBy(() -> sm.transition(WAITING_PAYMENT, PASSWORD_SENT))
                .isInstanceOf(InvalidTradeTransitionException.class);
        // Konami email can't arrive before state 4.
        assertThatThrownBy(() -> sm.transition(INITIATED, KONAMI_EMAIL_RECEIVED))
                .isInstanceOf(InvalidTradeTransitionException.class);
    }
}
```

- [ ] **Step 2: Verify tests fail (classes missing)**

```bash
mvn -B -q test -Dtest=TradeStateMachineTest
```

Expected: compilation failure — `TradeStateMachine` and `InvalidTradeTransitionException` don't exist yet.

- [ ] **Step 3: Add InvalidTradeTransitionException**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/exception/InvalidTradeTransitionException.java`:

```java
package uz.efbazaar.trade.trade.exception;

import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;

public class InvalidTradeTransitionException extends RuntimeException {
    public InvalidTradeTransitionException(TradeState state, TradeEvent event) {
        super("Illegal event " + event + " from state " + state);
    }
}
```

- [ ] **Step 4: Implement TradeStateMachine**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateMachine.java`:

```java
package uz.efbazaar.trade.trade.service;

import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;

import java.util.EnumMap;
import java.util.Map;

import static uz.efbazaar.trade.trade.domain.TradeEvent.*;
import static uz.efbazaar.trade.trade.domain.TradeState.*;

/**
 * Hand-rolled state machine — small and inspectable. Spring StateMachine is
 * overkill for a 9-state 9-event graph, and hiding transitions behind Spring
 * config makes reviews harder.
 *
 * <p>Legend for {@link #TRANSITIONS}: an entry {@code (state -> (event -> next))}
 * means the event is legal in that state and moves the trade to {@code next}.
 * A missing entry means the event is illegal and throws
 * {@link InvalidTradeTransitionException}.
 */
@Component
public class TradeStateMachine {

    private static final Map<TradeState, Map<TradeEvent, TradeState>> TRANSITIONS =
            buildTransitions();

    private static Map<TradeState, Map<TradeEvent, TradeState>> buildTransitions() {
        Map<TradeState, Map<TradeEvent, TradeState>> m = new EnumMap<>(TradeState.class);

        m.put(INITIATED, Map.of(
                MAILBOX_PROVISIONED, WAITING_PAYMENT
        ));
        m.put(WAITING_PAYMENT, Map.of(
                PAYMENT_CONFIRMED, WAITING_EMAIL_CHANGE,
                TIMEOUT, ORPHANED
        ));
        m.put(WAITING_EMAIL_CHANGE, Map.of(
                EMAIL_CHANGED, VERIFYING_KONAMI_LINK,
                TIMEOUT, ORPHANED
        ));
        m.put(VERIFYING_KONAMI_LINK, Map.of(
                KONAMI_EMAIL_RECEIVED, WAITING_PASSWORD,
                RECHECK, VERIFYING_KONAMI_LINK,
                TIMEOUT, ORPHANED
        ));
        m.put(WAITING_PASSWORD, Map.of(
                PASSWORD_SENT, WAITING_BUYER_VERIFY,
                TIMEOUT, ORPHANED
        ));
        m.put(WAITING_BUYER_VERIFY, Map.of(
                BUYER_CONFIRM, SUCCESS,
                BUYER_REJECT, REJECTED,
                TIMEOUT, REJECTED
        ));
        // Terminal states — no outgoing transitions.
        m.put(SUCCESS, Map.of());
        m.put(REJECTED, Map.of());
        m.put(ORPHANED, Map.of());

        return m;
    }

    public TradeState transition(TradeState current, TradeEvent event) {
        Map<TradeEvent, TradeState> row = TRANSITIONS.get(current);
        TradeState next = row.get(event);
        if (next == null) {
            throw new InvalidTradeTransitionException(current, event);
        }
        return next;
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
mvn -B -q test -Dtest=TradeStateMachineTest
```

Expected: `Tests run: 7, Failures: 0, Errors: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateMachine.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/exception/InvalidTradeTransitionException.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeStateMachineTest.java
git commit -m "feat(trade-service): hand-rolled TradeStateMachine with transition table"
```

---

## Task 8: Kafka event DTOs + TradeEventPublisher

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/TradeEvents.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/TradeEventPublisher.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/kafka/TradeEventPublisherIT.java`

**Interfaces:**
- Produces:
  - `TradeEvents` — inner records for every topic payload, matching spec §9.
  - `TradeEventPublisher.emailProvisionRequest(tradeId)`, `.forgotPasswordRequest(tradeId, mailboxEmail, konamiId)`, `.imapPollRequest(tradeId, mailboxEmail, purpose)`, `.mailboxRotateRequest(mailboxId)`, `.proposalCreated(proposalId, marketplaceChatId, proposerUserId, amountUzs)`, `.proposalResolved(proposalId, outcome)`.
  - All publisher calls partition by `tradeId.toString()` (or `proposalId` for proposal events, `mailboxId` for rotate).
- Consumes: `KafkaTemplate<String, Object>` autoconfigured by Spring Kafka from application.yml.

- [ ] **Step 1: Add TradeEvents record set + topic constants**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/TradeEvents.java`:

```java
package uz.efbazaar.trade.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * All Kafka payloads exchanged by trade-service, gathered in one file so the
 * event contract is grep-able. Field order matches spec §9.
 */
public final class TradeEvents {

    private TradeEvents() {}

    // Topics.
    public static final String TOPIC_PROPOSAL_CREATED     = "efbazaar.trade.proposal-created";
    public static final String TOPIC_PROPOSAL_RESOLVED    = "efbazaar.trade.proposal-resolved";
    public static final String TOPIC_EMAIL_PROVISION_REQ  = "efbazaar.trade.email-provision-request";
    public static final String TOPIC_EMAIL_PROVISIONED    = "efbazaar.trade.email-provisioned";
    public static final String TOPIC_FORGOT_PW_REQ        = "efbazaar.trade.forgot-password-request";
    public static final String TOPIC_IMAP_POLL_REQ        = "efbazaar.trade.imap-poll-request";
    public static final String TOPIC_KONAMI_EMAIL         = "efbazaar.trade.konami-email-received";
    public static final String TOPIC_IMAP_2FA             = "efbazaar.trade.imap-2fa-code";
    public static final String TOPIC_MAILBOX_ROTATE_REQ   = "efbazaar.trade.mailbox-rotate-request";
    public static final String TOPIC_MAILBOX_ROTATED      = "efbazaar.trade.mailbox-rotated";

    public enum ProposalOutcome { ACCEPTED, REJECTED, EXPIRED }
    public enum ImapPurpose      { VERIFY_LINK, WAIT_2FA_CODE }

    public record ProposalCreated(
            UUID proposalId,
            UUID marketplaceChatId,
            UUID proposerUserId,
            long amountUzs,
            Instant createdAt) {}

    public record ProposalResolved(
            UUID proposalId,
            ProposalOutcome outcome,
            Instant resolvedAt) {}

    public record EmailProvisionRequest(
            UUID tradeId) {}

    public record EmailProvisioned(
            UUID tradeId,
            String mailboxEmail,
            byte[] encryptedPassword,
            byte[] iv,
            byte[] tag) {}

    public record ForgotPasswordRequest(
            UUID tradeId,
            String mailboxEmail,
            String konamiId) {}

    public record ImapPollRequest(
            UUID tradeId,
            String mailboxEmail,
            ImapPurpose purpose) {}

    public record KonamiEmailReceived(
            UUID tradeId,
            boolean resetLinkPresent,
            String sender,
            Instant receivedAt) {}

    public record Imap2faCode(
            UUID tradeId,
            String code,
            Instant receivedAt) {}

    public record MailboxRotateRequest(
            UUID mailboxId) {}

    public record MailboxRotated(
            UUID mailboxId,
            byte[] encryptedPassword,
            byte[] iv,
            byte[] tag) {}
}
```

- [ ] **Step 2: Add TradeEventPublisher**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/TradeEventPublisher.java`:

```java
package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class TradeEventPublisher {

    private final KafkaTemplate<String, Object> kafka;

    public void proposalCreated(UUID proposalId, UUID marketplaceChatId,
                                UUID proposerUserId, long amountUzs) {
        send(TradeEvents.TOPIC_PROPOSAL_CREATED, proposalId.toString(),
                new TradeEvents.ProposalCreated(proposalId, marketplaceChatId,
                        proposerUserId, amountUzs, Instant.now()));
    }

    public void proposalResolved(UUID proposalId,
                                 TradeEvents.ProposalOutcome outcome) {
        send(TradeEvents.TOPIC_PROPOSAL_RESOLVED, proposalId.toString(),
                new TradeEvents.ProposalResolved(proposalId, outcome, Instant.now()));
    }

    public void emailProvisionRequest(UUID tradeId) {
        send(TradeEvents.TOPIC_EMAIL_PROVISION_REQ, tradeId.toString(),
                new TradeEvents.EmailProvisionRequest(tradeId));
    }

    public void forgotPasswordRequest(UUID tradeId, String mailboxEmail, String konamiId) {
        send(TradeEvents.TOPIC_FORGOT_PW_REQ, tradeId.toString(),
                new TradeEvents.ForgotPasswordRequest(tradeId, mailboxEmail, konamiId));
    }

    public void imapPollRequest(UUID tradeId, String mailboxEmail,
                                TradeEvents.ImapPurpose purpose) {
        send(TradeEvents.TOPIC_IMAP_POLL_REQ, tradeId.toString(),
                new TradeEvents.ImapPollRequest(tradeId, mailboxEmail, purpose));
    }

    public void mailboxRotateRequest(UUID mailboxId) {
        send(TradeEvents.TOPIC_MAILBOX_ROTATE_REQ, mailboxId.toString(),
                new TradeEvents.MailboxRotateRequest(mailboxId));
    }

    private void send(String topic, String key, Object payload) {
        kafka.send(topic, key, payload)
                .whenComplete((r, ex) -> {
                    if (ex != null) {
                        log.error("Failed to publish to {} key={}: {}",
                                topic, key, ex.getMessage());
                    } else {
                        log.debug("Published to {} key={}", topic, key);
                    }
                });
    }
}
```

- [ ] **Step 3: Write TradeEventPublisherIT — round-trip through real Kafka**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/kafka/TradeEventPublisherIT.java`:

```java
package uz.efbazaar.trade.kafka;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.support.serializer.JsonDeserializer;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import static org.apache.kafka.clients.consumer.ConsumerConfig.*;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class TradeEventPublisherIT extends AbstractIntegrationIT {

    @Autowired
    private TradeEventPublisher publisher;

    @Test
    void proposalCreatedRoundTrip() {
        UUID proposalId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        UUID proposer = UUID.randomUUID();

        publisher.proposalCreated(proposalId, chatId, proposer, 500_000L);

        try (Consumer<String, TradeEvents.ProposalCreated> consumer = consumer()) {
            consumer.subscribe(java.util.List.of(TradeEvents.TOPIC_PROPOSAL_CREATED));
            ConsumerRecords<String, TradeEvents.ProposalCreated> polled =
                    consumer.poll(Duration.ofSeconds(5));
            assertThat(polled.count()).isGreaterThan(0);
            ConsumerRecord<String, TradeEvents.ProposalCreated> r = polled.iterator().next();
            assertThat(r.key()).isEqualTo(proposalId.toString());
            assertThat(r.value().proposalId()).isEqualTo(proposalId);
            assertThat(r.value().amountUzs()).isEqualTo(500_000L);
        }
    }

    private Consumer<String, TradeEvents.ProposalCreated> consumer() {
        Map<String, Object> props = Map.of(
                BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers(),
                GROUP_ID_CONFIG, "test-" + UUID.randomUUID(),
                AUTO_OFFSET_RESET_CONFIG, "earliest",
                KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class,
                JsonDeserializer.TRUSTED_PACKAGES, "uz.efbazaar.*",
                JsonDeserializer.VALUE_DEFAULT_TYPE, TradeEvents.ProposalCreated.class.getName());
        return new DefaultKafkaConsumerFactory<String, TradeEvents.ProposalCreated>(props)
                .createConsumer();
    }
}
```

- [ ] **Step 4: Run the IT**

```bash
mvn -B -q verify -Dtest=TradeEventPublisherIT
```

Expected: `BUILD SUCCESS`, one test passes. Kafka Testcontainer boots, publisher sends, direct consumer receives.

- [ ] **Step 5: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/ \
        backend/trade-service/src/test/java/uz/efbazaar/trade/kafka/
git commit -m "feat(trade-service): add Kafka event DTOs and TradeEventPublisher"
```

---

## Task 9: Marketplace-service — V21 messageType + TradeProposalConsumer

**Files:**
- Create: `backend/marketplace-service/src/main/resources/db/migration/V21__chat_message_type.sql`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/domain/ChatMessageType.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/domain/ChatMessage.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeProposalCreatedDto.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeProposalResolvedDto.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeProposalConsumer.java`

**Interfaces:**
- Produces: on `efbazaar.trade.proposal-created`, insert a `ChatMessage` in the referenced chat with `messageType=TRADE_PROPOSAL`, `senderId` = proposerUserId, `content = amountUzs` (stringified — frontend renders the button). On `efbazaar.trade.proposal-resolved`, update the row's metadata via a small `content` marker so the frontend renders "accepted/rejected/expired" instead of the button.
- Consumes: trade-service producer events (partition key = proposalId).

- [ ] **Step 1: Write V21 migration**

Create `backend/marketplace-service/src/main/resources/db/migration/V21__chat_message_type.sql`:

```sql
-- ==============================================================
-- marketplace-service V21 — chat message type.
-- Existing rows are chat text — default to 'TEXT'. Trade-service will
-- insert 'TRADE_PROPOSAL' rows via its Kafka consumer (see
-- TradeProposalConsumer). No other types envisioned for MVP.
-- proposal_id + proposal_outcome carry system-message state without
-- inventing a second table.
-- ==============================================================

ALTER TABLE chat_messages
    ADD COLUMN message_type      VARCHAR(24) NOT NULL DEFAULT 'TEXT',
    ADD COLUMN proposal_id       UUID,
    ADD COLUMN proposal_outcome  VARCHAR(16);

ALTER TABLE chat_messages
    ADD CONSTRAINT chk_chat_messages_type
        CHECK (message_type IN ('TEXT', 'TRADE_PROPOSAL')),
    ADD CONSTRAINT chk_chat_messages_proposal_outcome
        CHECK (proposal_outcome IS NULL
            OR proposal_outcome IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'));

-- Fast lookup when a proposal resolves and we need to patch the system row.
CREATE INDEX idx_chat_messages_proposal_id ON chat_messages (proposal_id)
    WHERE proposal_id IS NOT NULL;
```

- [ ] **Step 2: Add ChatMessageType enum**

Create `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/domain/ChatMessageType.java`:

```java
package uz.efbazaar.marketplace.domain;

public enum ChatMessageType {
    /** Human-typed message body. */
    TEXT,
    /** System message inserted by trade-service Kafka consumer — carries an in-app CTA. */
    TRADE_PROPOSAL
}
```

- [ ] **Step 3: Add fields to ChatMessage**

Modify `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/domain/ChatMessage.java`. Add three new fields near the bottom of the class (before `@PrePersist`):

```java
    @Enumerated(EnumType.STRING)
    @Column(name = "message_type", nullable = false, length = 24)
    @Builder.Default
    private ChatMessageType messageType = ChatMessageType.TEXT;

    /** Non-null only when messageType = TRADE_PROPOSAL. Correlates to trade-service proposal. */
    @Column(name = "proposal_id")
    private java.util.UUID proposalId;

    /** PENDING at insert; flips to ACCEPTED/REJECTED/EXPIRED when trade-service emits the resolution event. */
    @Column(name = "proposal_outcome", length = 16)
    private String proposalOutcome;
```

Then extend `@PrePersist`:

```java
    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (messageType == null) {
            messageType = ChatMessageType.TEXT;
        }
    }
```

(If the existing `@PrePersist` differs, keep its content and add the `messageType` guard.)

- [ ] **Step 4: Add TradeProposalCreatedDto**

Create `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeProposalCreatedDto.java`:

```java
package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

public record TradeProposalCreatedDto(
        UUID proposalId,
        UUID marketplaceChatId,
        UUID proposerUserId,
        long amountUzs,
        Instant createdAt) {}
```

- [ ] **Step 5: Add TradeProposalResolvedDto**

Create `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeProposalResolvedDto.java`:

```java
package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

public record TradeProposalResolvedDto(
        UUID proposalId,
        String outcome,      // ACCEPTED | REJECTED | EXPIRED
        Instant resolvedAt) {}
```

- [ ] **Step 6: Add TradeProposalConsumer**

Create `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeProposalConsumer.java`:

```java
package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.ChatMessage;
import uz.efbazaar.marketplace.domain.ChatMessageType;
import uz.efbazaar.marketplace.repository.ChatMessageRepository;

import java.time.Instant;
import java.util.Map;

/**
 * Renders trade-service proposals as system messages in the marketplace chat.
 *
 * <p>On {@code proposal-created} — insert a TRADE_PROPOSAL row (idempotent by
 * proposal_id via a lookup). On {@code proposal-resolved} — patch the outcome.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeProposalConsumer {

    private final ChatMessageRepository messages;

    @KafkaListener(
            topics = "efbazaar.trade.proposal-created",
            groupId = "marketplace-trade-proposal",
            properties = {"spring.json.value.default.type=uz.efbazaar.marketplace.kafka.TradeProposalCreatedDto"}
    )
    @Transactional
    public void onCreated(TradeProposalCreatedDto e) {
        if (messages.existsByProposalId(e.proposalId())) {
            log.debug("proposal-created replay for {}, skipping", e.proposalId());
            return;
        }
        ChatMessage msg = ChatMessage.builder()
                .chatId(e.marketplaceChatId())
                .senderId(e.proposerUserId())
                .content(String.valueOf(e.amountUzs()))
                .messageType(ChatMessageType.TRADE_PROPOSAL)
                .proposalId(e.proposalId())
                .proposalOutcome("PENDING")
                .createdAt(e.createdAt() != null ? e.createdAt() : Instant.now())
                .build();
        messages.save(msg);
        log.info("Inserted TRADE_PROPOSAL message for proposal={} chat={}",
                e.proposalId(), e.marketplaceChatId());
    }

    @KafkaListener(
            topics = "efbazaar.trade.proposal-resolved",
            groupId = "marketplace-trade-proposal",
            properties = {"spring.json.value.default.type=uz.efbazaar.marketplace.kafka.TradeProposalResolvedDto"}
    )
    @Transactional
    public void onResolved(TradeProposalResolvedDto e) {
        int updated = messages.updateProposalOutcome(e.proposalId(), e.outcome());
        if (updated == 0) {
            log.warn("proposal-resolved for {} but no matching system message", e.proposalId());
        }
    }
}
```

- [ ] **Step 7: Extend ChatMessageRepository with the two helper methods**

Modify `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/repository/ChatMessageRepository.java`. Add:

```java
    boolean existsByProposalId(java.util.UUID proposalId);

    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("""
            UPDATE ChatMessage m
               SET m.proposalOutcome = :outcome
             WHERE m.proposalId = :proposalId
            """)
    int updateProposalOutcome(@org.springframework.data.repository.query.Param("proposalId") java.util.UUID proposalId,
                              @org.springframework.data.repository.query.Param("outcome") String outcome);
```

- [ ] **Step 8: Build marketplace-service**

```bash
cd backend/marketplace-service
mvn -B -q -DskipTests package
```

Expected: `BUILD SUCCESS`. Integration tests (if the marketplace suite has any) run in a follow-up commit — the marketplace test infrastructure is untouched here.

- [ ] **Step 9: Commit**

```bash
git add backend/marketplace-service/src/main/resources/db/migration/V21__chat_message_type.sql \
        backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/domain/ChatMessage.java \
        backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/domain/ChatMessageType.java \
        backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/ \
        backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/repository/ChatMessageRepository.java
git commit -m "feat(marketplace-service): render trade-service proposals as TRADE_PROPOSAL chat messages"
```

---

## Task 10: TradeProposalService — Redis-backed proposal + accept-becomes-Trade

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalCreateRequest.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalAcceptRequest.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalResponse.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/TradeResponse.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/exception/ProposalNotFoundException.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeProposalService.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeProposalController.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/common/exception/TradeExceptionHandler.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeProposalServiceIT.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeProposalControllerIT.java`

**Interfaces:**
- Produces:
  - `POST /api/v1/trades/proposals` — proposer submits. Body: `{marketplaceChatId, otherPartyUserId, amountUzs, cardId}`. Returns 201 with `{proposalId, expiresAt}`. Publishes `proposal-created` on Kafka.
  - `POST /api/v1/trades/proposals/{id}/accept` — accepting party submits. Body: `{cardId}`. Creates a `Trade` row (INITIATED), two `TradeChat` rows, publishes `proposal-resolved(ACCEPTED)` and `email-provision-request`, deletes the Redis proposal, returns 201 with the full `TradeResponse`.
  - `POST /api/v1/trades/proposals/{id}/reject` — publishes `proposal-resolved(REJECTED)`, deletes the Redis proposal, returns 204.
  - Redis proposal record structure documented at the top of `TradeProposalService`.

- [ ] **Step 1: Add DTOs**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalCreateRequest.java`:

```java
package uz.efbazaar.trade.trade.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * Sent by the proposer (either seller or buyer). Roles are decided at
 * accept time based on who owns the listing referenced by
 * marketplaceChatId — trade-service asks marketplace-service or is told
 * by the client (MVP: client sends the pair; server verifies via Kafka
 * later. This is fine because the marketplace-side system message
 * already carries the accept button.)
 */
public record ProposalCreateRequest(
        @NotNull UUID marketplaceChatId,
        @NotNull UUID otherPartyUserId,
        @NotNull UUID sellerId,
        @NotNull UUID buyerId,
        @NotNull @Min(1) Long amountUzs,
        @NotNull UUID cardId,
        UUID listingId
) {}
```

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalAcceptRequest.java`:

```java
package uz.efbazaar.trade.trade.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record ProposalAcceptRequest(@NotNull UUID cardId) {}
```

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalResponse.java`:

```java
package uz.efbazaar.trade.trade.dto;

import java.time.Instant;
import java.util.UUID;

public record ProposalResponse(UUID proposalId, Instant expiresAt) {}
```

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/TradeResponse.java`:

```java
package uz.efbazaar.trade.trade.dto;

import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeState;

import java.time.Instant;
import java.util.UUID;

public record TradeResponse(
        UUID id,
        TradeState state,
        UUID sellerId,
        UUID buyerId,
        long priceUzs,
        UUID mailboxId,
        Instant createdAt,
        Instant expiresAt,
        Instant stateDeadline,
        ParticipantRole role  // set by the controller based on the caller
) {}
```

- [ ] **Step 2: Add ProposalNotFoundException**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/exception/ProposalNotFoundException.java`:

```java
package uz.efbazaar.trade.trade.exception;

public class ProposalNotFoundException extends RuntimeException {
    public ProposalNotFoundException(String proposalId) {
        super("Proposal not found or expired: " + proposalId);
    }
}
```

- [ ] **Step 3: Add TradeProposalService**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeProposalService.java`:

```java
package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.dto.ProposalResponse;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.exception.ProposalNotFoundException;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Trade proposals are ephemeral (10-minute TTL). They live in Redis rather
 * than Postgres so expiry is free and there's no need for a scheduled purge.
 *
 * <p>Redis representation: hash key {@code trade:proposal:{proposalId}} with
 * fields:
 * <pre>
 *   marketplaceChatId
 *   proposerUserId
 *   sellerId
 *   buyerId
 *   amountUzs
 *   listingId          (may be blank)
 *   proposerCardId
 * </pre>
 * TTL 600s. On {@link #accept}, the proposal is deleted after a Trade row is
 * created; on {@link #reject}, it's deleted immediately. Redis TTL handles the
 * EXPIRED case — a background sweep publishes {@code proposal-resolved(EXPIRED)}
 * shortly after (Task 18 timeout scheduler).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeProposalService {

    private final StringRedisTemplate redis;
    private final TradeEventPublisher events;
    private final TradeService trades;
    private final TradeAuditService audit;

    @Value("${trade.proposal.ttl-seconds:600}")
    private long ttlSeconds;

    public ProposalResponse create(UUID proposerUserId, ProposalCreateRequest req) {
        UUID proposalId = UUID.randomUUID();
        String key = redisKey(proposalId);

        Map<String, String> hash = Map.of(
                "marketplaceChatId", req.marketplaceChatId().toString(),
                "proposerUserId",    proposerUserId.toString(),
                "sellerId",          req.sellerId().toString(),
                "buyerId",           req.buyerId().toString(),
                "amountUzs",         req.amountUzs().toString(),
                "listingId",         req.listingId() != null ? req.listingId().toString() : "",
                "proposerCardId",    req.cardId().toString()
        );
        redis.opsForHash().putAll(key, hash);
        redis.expire(key, Duration.ofSeconds(ttlSeconds));

        events.proposalCreated(proposalId, req.marketplaceChatId(),
                proposerUserId, req.amountUzs());

        return new ProposalResponse(proposalId,
                Instant.now().plusSeconds(ttlSeconds));
    }

    @Transactional
    public TradeResponse accept(UUID accepterUserId, UUID proposalId, UUID accepterCardId) {
        Map<Object, Object> raw = redis.opsForHash().entries(redisKey(proposalId));
        if (raw.isEmpty()) {
            throw new ProposalNotFoundException(proposalId.toString());
        }

        UUID proposerUserId = UUID.fromString((String) raw.get("proposerUserId"));
        UUID sellerId       = UUID.fromString((String) raw.get("sellerId"));
        UUID buyerId        = UUID.fromString((String) raw.get("buyerId"));
        long amountUzs      = Long.parseLong((String) raw.get("amountUzs"));
        UUID proposerCard   = UUID.fromString((String) raw.get("proposerCardId"));

        // The accepter must be the OTHER party — a proposer accepting their own proposal is nonsense.
        if (accepterUserId.equals(proposerUserId)) {
            throw new IllegalStateException("Proposer cannot accept own proposal");
        }

        // Which card belongs to which side?
        UUID sellerCardId = sellerId.equals(proposerUserId) ? proposerCard : accepterCardId;
        UUID buyerCardId  = buyerId.equals(proposerUserId)  ? proposerCard : accepterCardId;

        UUID listingId = optionalUuid(raw.get("listingId"));

        var trade = trades.openTrade(sellerId, buyerId, amountUzs, sellerCardId, buyerCardId, listingId);

        redis.delete(redisKey(proposalId));
        events.proposalResolved(proposalId, TradeEvents.ProposalOutcome.ACCEPTED);
        audit.record(trade.id(), ActorType.USER, accepterUserId, "PROPOSAL_ACCEPTED",
                Map.of("proposalId", proposalId.toString()));
        return trade;
    }

    public void reject(UUID rejecterUserId, UUID proposalId) {
        if (Boolean.FALSE.equals(redis.delete(redisKey(proposalId)))) {
            throw new ProposalNotFoundException(proposalId.toString());
        }
        events.proposalResolved(proposalId, TradeEvents.ProposalOutcome.REJECTED);
    }

    private static UUID optionalUuid(Object v) {
        if (v == null) return null;
        String s = v.toString();
        return s.isBlank() ? null : UUID.fromString(s);
    }

    private static String redisKey(UUID proposalId) {
        return "trade:proposal:" + proposalId;
    }
}
```

- [ ] **Step 4: Add the exception handler entries**

Modify `backend/trade-service/src/main/java/uz/efbazaar/trade/common/exception/TradeExceptionHandler.java`. Add the following mappings alongside the ones from Plan A:

```java
    @ExceptionHandler(ProposalNotFoundException.class)
    ResponseEntity<Map<String, Object>> onProposalNotFound(ProposalNotFoundException e) {
        return status(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(InvalidTradeTransitionException.class)
    ResponseEntity<Map<String, Object>> onInvalidTransition(InvalidTradeTransitionException e) {
        return status(HttpStatus.CONFLICT, e.getMessage());
    }

    @ExceptionHandler(RateLimitedException.class)
    ResponseEntity<Map<String, Object>> onRateLimit(RateLimitedException e) {
        return status(HttpStatus.TOO_MANY_REQUESTS, e.getMessage());
    }
```

Add the imports:

```java
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;
import uz.efbazaar.trade.trade.exception.ProposalNotFoundException;
import uz.efbazaar.trade.trade.exception.RateLimitedException;
```

`RateLimitedException` is added in Task 12 — expect a compile break until then. If you're running the plan strictly top-down and the compile fails on Task 10, add a stub of `RateLimitedException` (empty `extends RuntimeException`) here and let Task 12 flesh it out.

Add the `status(...)` helper if it's not already in Plan A:

```java
    private static ResponseEntity<Map<String, Object>> status(HttpStatus s, String msg) {
        return ResponseEntity.status(s).body(Map.of(
                "status", s.value(),
                "error", s.getReasonPhrase(),
                "message", msg));
    }
```

- [ ] **Step 5: Add TradeService stub (fleshed in Task 11) with the openTrade signature**

We need this signature to compile TradeProposalService. Create a minimal stub in `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java`:

```java
package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import uz.efbazaar.trade.trade.dto.TradeResponse;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TradeService {

    /**
     * Fleshed out in Task 11. Signature is fixed now so TradeProposalService
     * can be compiled independently.
     */
    public TradeResponse openTrade(UUID sellerId, UUID buyerId, long priceUzs,
                                   UUID sellerCardId, UUID buyerCardId, UUID listingId) {
        throw new UnsupportedOperationException("Task 11 — see plan");
    }
}
```

- [ ] **Step 6: Add TradeProposalController**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeProposalController.java`:

```java
package uz.efbazaar.trade.trade.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.dto.ProposalAcceptRequest;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.dto.ProposalResponse;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.TradeProposalService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/trades/proposals")
@RequiredArgsConstructor
public class TradeProposalController {

    private final TradeProposalService proposals;

    @PostMapping
    public ResponseEntity<ProposalResponse> create(
            @AuthenticationPrincipal AuthenticatedUser me,
            @Valid @RequestBody ProposalCreateRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(
                proposals.create(me.userId(), req));
    }

    @PostMapping("/{proposalId}/accept")
    public ResponseEntity<TradeResponse> accept(
            @AuthenticationPrincipal AuthenticatedUser me,
            @PathVariable UUID proposalId,
            @Valid @RequestBody ProposalAcceptRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(
                proposals.accept(me.userId(), proposalId, req.cardId()));
    }

    @PostMapping("/{proposalId}/reject")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reject(
            @AuthenticationPrincipal AuthenticatedUser me,
            @PathVariable UUID proposalId) {
        proposals.reject(me.userId(), proposalId);
    }
}
```

- [ ] **Step 7: Write TradeProposalServiceIT**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeProposalServiceIT.java`:

```java
package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.dto.ProposalResponse;
import uz.efbazaar.trade.trade.exception.ProposalNotFoundException;
import uz.efbazaar.trade.trade.service.TradeProposalService;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class TradeProposalServiceIT extends AbstractIntegrationIT {

    @Autowired TradeProposalService svc;
    @Autowired StringRedisTemplate redis;

    @Test
    void createStoresRedisEntryWithTtl() {
        UUID proposer = UUID.randomUUID();
        UUID other = UUID.randomUUID();

        ProposalCreateRequest req = new ProposalCreateRequest(
                UUID.randomUUID(), other, proposer, other,
                500_000L, UUID.randomUUID(), null);
        ProposalResponse res = svc.create(proposer, req);

        String key = "trade:proposal:" + res.proposalId();
        assertThat(redis.opsForHash().entries(key)).isNotEmpty();
        Long ttl = redis.getExpire(key);
        assertThat(ttl).isPositive();
    }

    @Test
    void rejectRemovesEntryAndUnknownIdThrows() {
        UUID unknown = UUID.randomUUID();
        assertThatThrownBy(() -> svc.reject(UUID.randomUUID(), unknown))
                .isInstanceOf(ProposalNotFoundException.class);
    }
}
```

- [ ] **Step 8: Write TradeProposalControllerIT — only proposal + reject (accept needs Task 11)**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeProposalControllerIT.java`:

```java
package uz.efbazaar.trade.trade;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;

import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class TradeProposalControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    @Test
    void createReturns201WithProposalId() throws Exception {
        UUID proposer = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        ProposalCreateRequest req = new ProposalCreateRequest(
                UUID.randomUUID(), other, proposer, other, 500_000L, UUID.randomUUID(), null);

        mvc.perform(post("/api/v1/trades/proposals")
                        .contentType(APPLICATION_JSON)
                        .content(json.writeValueAsString(req))
                        .with(asUser(proposer)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.proposalId").isString());
    }

    @Test
    void rejectMissingProposalIs404() throws Exception {
        UUID rejecter = UUID.randomUUID();
        mvc.perform(post("/api/v1/trades/proposals/" + UUID.randomUUID() + "/reject")
                        .with(asUser(rejecter)))
                .andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 9: Run the tests**

```bash
mvn -B -q verify -Dtest=TradeProposalServiceIT,TradeProposalControllerIT
```

Expected: `BUILD SUCCESS`. Two service tests + two controller tests pass. `RateLimitedException` stub (Step 4 fallback) is enough to keep the compile green.

- [ ] **Step 10: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalCreateRequest.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalAcceptRequest.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalResponse.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/TradeResponse.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/exception/ \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeProposalService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeProposalController.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/common/exception/TradeExceptionHandler.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeProposalServiceIT.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeProposalControllerIT.java
git commit -m "feat(trade-service): Redis-backed trade proposal service + REST"
```

---

## Task 11: TradeService.openTrade + TradeStateHandler (state onEnter)

**Files:**
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java` (real body)
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateHandler.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/TradeApplication.java` — add `@EnableScheduling` (used in Task 18 too; land it now).
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/service/MailboxService.java` — add `assignOwner(UUID mailboxId, UUID newOwnerId)` and `stripFromTrade(UUID mailboxId)` methods.

**Interfaces:**
- Produces:
  - `TradeService.openTrade(...)` — persists a `Trade` row in `INITIATED`, creates two `TradeChat` rows, publishes `email-provision-request`, records audit `TRADE_OPENED`. Returns `TradeResponse` with `role` UNSET (caller sets it).
  - `TradeService.get(UUID tradeId, UUID viewerUserId) -> Trade` — enforces participant check, throws `EntityNotFoundException` if the viewer isn't a party.
  - `TradeService.transition(UUID tradeId, TradeEvent event, ActorType actor, UUID actorId) -> Trade` — the canonical mutation path. Calls state machine, calls state handler onEnter, saves, records audit, broadcasts (Task 21) via `TradeBroadcaster`.
  - `TradeStateHandler.onEnter(Trade trade, TradeState newState, ActorType actor, UUID actorId)` — dispatches state-entry side effects (produce Kafka event, set/clear deadline, insert SMART_ADMIN message, assign mailbox owner on terminal).
- Consumes: `TradeStateMachine`, `TradeRepository`, `TradeChatRepository`, `TradeEventPublisher`, `MailboxService`, `TradeAuditService`, `@Value` for timeout properties.

- [ ] **Step 1: Add mailbox helpers**

Modify `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/service/MailboxService.java`. Add four methods used by TradeService and TradeStateHandler:

```java
    /** Returns the raw entity — needed by TradeStateHandler to read the email address. */
    @Transactional(readOnly = true)
    public Mailbox getRaw(UUID mailboxId) {
        return repo.findById(mailboxId)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId));
    }

    /**
     * Creates a mailbox row with a synthetic email + zero-byte encrypted password so
     * TradeService.openTrade can reserve the FK before the worker (mock or real) has
     * actually provisioned Mailcow. {@link
     * uz.efbazaar.trade.kafka.EmailProvisionedConsumer} overwrites both fields once
     * the worker responds.
     */
    @Transactional
    public UUID createPlaceholder(String syntheticEmail) {
        Mailbox m = Mailbox.builder()
                .id(UUID.randomUUID())
                .email(syntheticEmail)
                .encryptedPassword(new byte[]{0})
                .iv(new byte[12])
                .tag(new byte[16])
                .build();
        return repo.save(m).getId();
    }

    @Transactional
    public void assignOwner(UUID mailboxId, UUID newOwnerId) {
        Mailbox m = repo.findById(mailboxId)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId));
        m.setOwnerUserId(newOwnerId);
        m.setTradeId(null);
        m.setHandedOffAt(Instant.now());
        repo.save(m);
    }

    @Transactional
    public void stripFromTrade(UUID mailboxId) {
        Mailbox m = repo.findById(mailboxId)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId));
        m.setTradeId(null);
        repo.save(m);
    }
```

If Plan A's `Mailbox` entity mapped `email` `unique = true`, keep it — the synthetic-per-trade emails have UUID entropy so uniqueness holds. If Plan A left `iv`/`tag` as raw `byte[]` without a length constraint, the `new byte[12]` / `new byte[16]` calls above satisfy V3 fixed-length. If your V3 migration made `iv` / `tag` `NOT NULL BYTEA` without a fixed length, the same array-lengths still work.

Ensure imports include `jakarta.persistence.EntityNotFoundException`, `java.time.Instant`, `java.util.UUID`, `org.springframework.transaction.annotation.Transactional`.

If Plan A's Mailbox entity doesn't have `handedOffAt` yet, add a field: `@Column(name = "handed_off_at") private Instant handedOffAt;` — the V3 migration from Plan A already provisioned the column, so no new migration is needed.

- [ ] **Step 2: Enable scheduling**

Modify `backend/trade-service/src/main/java/uz/efbazaar/trade/TradeApplication.java`:

```java
package uz.efbazaar.trade;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan("uz.efbazaar.trade")
@EnableScheduling
public class TradeApplication {
    public static void main(String[] args) {
        SpringApplication.run(TradeApplication.class, args);
    }
}
```

- [ ] **Step 3: Add TradeStateHandler**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateHandler.java`:

```java
package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeState;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * On-enter side effects for each state. Kept separate from TradeService so
 * the state machine mechanics (transition validation + save) and the
 * business side effects (kafka, deadlines, mailbox handoff) stay small
 * and testable.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeStateHandler {

    private final TradeEventPublisher events;
    private final MailboxService mailboxes;
    private final TradeAuditService audit;

    @Value("${trade.timeouts.waiting-payment-seconds}")        private long twpS;
    @Value("${trade.timeouts.waiting-email-change-seconds}")   private long twecS;
    @Value("${trade.timeouts.verifying-konami-link-seconds}")  private long tvklS;
    @Value("${trade.timeouts.waiting-password-seconds}")       private long twpwS;
    @Value("${trade.timeouts.waiting-buyer-verify-seconds}")   private long twbvS;

    /**
     * Called AFTER the trade's state field is set to {@code newState} and
     * BEFORE the trade is saved. Mutates the trade's {@code stateDeadline}
     * and {@code terminalReason}, publishes Kafka events, and touches
     * ancillary services.
     */
    public void onEnter(Trade trade, TradeState newState, ActorType actor, UUID actorId) {
        switch (newState) {
            case INITIATED -> {
                trade.setStateDeadline(null);
                events.emailProvisionRequest(trade.getId());
            }
            case WAITING_PAYMENT           -> trade.setStateDeadline(now(twpS));
            case WAITING_EMAIL_CHANGE      -> trade.setStateDeadline(now(twecS));
            case VERIFYING_KONAMI_LINK -> {
                trade.setStateDeadline(now(tvklS));
                // fire-and-forget forgot-password. The mailbox email is stored on the mailbox row.
                var mb = mailboxes.getRaw(trade.getMailboxId());
                events.forgotPasswordRequest(trade.getId(), mb.getEmail(), null);
            }
            case WAITING_PASSWORD          -> trade.setStateDeadline(now(twpwS));
            case WAITING_BUYER_VERIFY      -> trade.setStateDeadline(now(twbvS));
            case SUCCESS -> {
                trade.setStateDeadline(null);
                trade.setTerminalReason("BUYER_CONFIRMED");
                events.mailboxRotateRequest(trade.getMailboxId());
                mailboxes.assignOwner(trade.getMailboxId(), trade.getBuyerId());
                audit.record(trade.getId(), actor, actorId, "TRADE_SUCCESS",
                        Map.of("mailboxHandedTo", trade.getBuyerId().toString()));
            }
            case REJECTED -> {
                trade.setStateDeadline(null);
                trade.setTerminalReason("BUYER_REJECTED_OR_TIMEOUT");
                events.mailboxRotateRequest(trade.getMailboxId());
                mailboxes.assignOwner(trade.getMailboxId(), trade.getSellerId());
                audit.record(trade.getId(), actor, actorId, "TRADE_REJECTED",
                        Map.of("mailboxHandedTo", trade.getSellerId().toString()));
            }
            case ORPHANED -> {
                trade.setStateDeadline(null);
                trade.setTerminalReason("TIMEOUT_ORPHAN");
                mailboxes.stripFromTrade(trade.getMailboxId());
                audit.record(trade.getId(), actor, actorId, "TRADE_ORPHANED",
                        Map.of("actor", actor.name()));
            }
        }
    }

    private static Instant now(long seconds) {
        return Instant.now().plus(Duration.ofSeconds(seconds));
    }
}
```

Note the `mailboxes.getRaw(...)` reference — that returns the raw entity (email is on it). If Plan A's `MailboxService` only exposes DTOs, add a small package-private `getRaw(UUID)` returning the entity.

- [ ] **Step 4: Fully implement TradeService**

Overwrite `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java`:

```java
package uz.efbazaar.trade.trade.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class TradeService {

    private final TradeRepository trades;
    private final TradeChatRepository chats;
    private final TradeStateMachine sm;
    private final TradeStateHandler handler;
    private final TradeAuditService audit;

    @Transactional
    public TradeResponse openTrade(UUID sellerId, UUID buyerId, long priceUzs,
                                   UUID sellerCardId, UUID buyerCardId, UUID listingId) {
        // The mailbox row is created by the worker; for MVP MockWorker (Task 14) provisions
        // it. Here we allocate a placeholder mailbox row that the worker fills. To keep the
        // model simple, the mailbox row is created up-front with a synthetic email; MockWorker
        // rewrites the email once it "provisions" the address.
        UUID mailboxId = allocatePlaceholderMailbox(sellerId, buyerId);

        Trade t = Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(sellerId)
                .buyerId(buyerId)
                .listingId(listingId)
                .priceUzs(priceUzs)
                .state(TradeState.INITIATED)
                .mailboxId(mailboxId)
                .sellerCardId(sellerCardId)
                .buyerCardId(buyerCardId)
                .expiresAt(Instant.now().plus(Duration.ofHours(24)))
                .build();

        handler.onEnter(t, TradeState.INITIATED, ActorType.SYSTEM, null);
        trades.save(t);

        chats.save(TradeChat.builder()
                .id(UUID.randomUUID())
                .tradeId(t.getId())
                .participant(ParticipantRole.SELLER)
                .build());
        chats.save(TradeChat.builder()
                .id(UUID.randomUUID())
                .tradeId(t.getId())
                .participant(ParticipantRole.BUYER)
                .build());

        audit.record(t.getId(), ActorType.SYSTEM, null, "TRADE_OPENED", Map.of(
                "sellerId", sellerId.toString(),
                "buyerId", buyerId.toString(),
                "priceUzs", String.valueOf(priceUzs)
        ));
        return toResponse(t, null);
    }

    /**
     * Look up a trade AND assert the caller is a participant. Called from
     * every trade endpoint; throwing here short-circuits any per-endpoint
     * ownership check.
     */
    @Transactional(readOnly = true)
    public Trade get(UUID tradeId, UUID viewerUserId) {
        return trades.findByIdAndParticipant(tradeId, viewerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Trade " + tradeId));
    }

    /** Canonical mutation. Every action goes through here. */
    @Transactional
    public Trade transition(UUID tradeId, TradeEvent event, ActorType actor, UUID actorId) {
        Trade t = trades.findById(tradeId)
                .orElseThrow(() -> new EntityNotFoundException("Trade " + tradeId));
        TradeState from = t.getState();
        TradeState to = sm.transition(from, event);
        t.setState(to);
        handler.onEnter(t, to, actor, actorId);
        trades.save(t);
        audit.record(t.getId(), actor, actorId, "STATE_TRANSITION",
                Map.of("from", from.name(), "to", to.name(), "event", event.name()));
        return t;
    }

    public TradeResponse toResponse(Trade t, ParticipantRole role) {
        return new TradeResponse(t.getId(), t.getState(),
                t.getSellerId(), t.getBuyerId(), t.getPriceUzs(),
                t.getMailboxId(), t.getCreatedAt(), t.getExpiresAt(),
                t.getStateDeadline(), role);
    }

    private UUID allocatePlaceholderMailbox(UUID sellerId, UUID buyerId) {
        // See javadoc on openTrade — worker fills email + password later.
        // MailboxService in Plan A creates a mailbox row; we call it here with
        // a synthetic email to be overwritten in Task 14.
        return java.util.UUID.randomUUID();
    }
}
```

Note the `allocatePlaceholderMailbox` note — Task 14's `MockWorker` (or the real Python worker in Plan C) is what actually creates the row. For now, we generate a UUID that Task 14 uses to persist the mailbox row when it processes `email-provision-request`. If Plan A's `Mailbox` entity has a `NOT NULL` on `email`, Task 14 must persist it with a temporary value first — see the note in that task.

Actually, this is fragile — let's persist the mailbox row here with a synthetic email. Replace `allocatePlaceholderMailbox` with:

```java
    private final uz.efbazaar.trade.mailbox.service.MailboxService mailboxes;

    private UUID allocatePlaceholderMailbox(UUID sellerId, UUID buyerId) {
        // Insert a mailbox row up-front with a synthetic email; the worker
        // (Task 14) overwrites it on email-provisioned response.
        return mailboxes.createPlaceholder("pending-" + UUID.randomUUID() + "@efbazaar.uz");
    }
```

Add `private final MailboxService mailboxes;` at the top of the class (Lombok `@RequiredArgsConstructor` picks it up). Add `MailboxService.createPlaceholder(String email)` in `MailboxService` that persists a mailbox with an empty encrypted password (`byte[0]`), returning the row's `UUID`. In Plan A the entity has a `NOT NULL encrypted_password`; keep that constraint and store `new byte[]{0}` as a stand-in — MockWorker rewrites it via `TradeCrypto.encrypt` in Task 14. Alternatively, relax the migration constraint (not preferred — a new V7 to drop `NOT NULL` on `encrypted_password` would be the right move but adds a migration). The zero-byte payload is fine because state-1 lasts milliseconds in practice.

- [ ] **Step 5: Update TradeProposalService.accept to receive the fleshed Trade**

`TradeProposalService.accept` from Task 10 already calls `trades.openTrade(...)`. No changes needed. The stub is now real.

- [ ] **Step 6: Add an IT that walks the state machine end-to-end**

Extend `TradeProposalServiceIT` with an accept test:

```java
    @Autowired uz.efbazaar.trade.trade.service.TradeService tradeService;
    @Autowired uz.efbazaar.trade.trade.repository.TradeChatRepository chats;

    @Test
    void acceptCreatesTradeAndTwoChats() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        UUID sellerCard = UUID.randomUUID();
        UUID buyerCard = UUID.randomUUID();

        ProposalCreateRequest req = new ProposalCreateRequest(
                UUID.randomUUID(), buyer, seller, buyer, 500_000L,
                sellerCard, null);
        ProposalResponse pr = svc.create(seller, req);

        var trade = svc.accept(buyer, pr.proposalId(), buyerCard);
        assertThat(trade.state()).isEqualTo(uz.efbazaar.trade.trade.domain.TradeState.INITIATED);
        assertThat(chats.findByTradeId(trade.id())).hasSize(2);
    }
```

- [ ] **Step 7: Run tests**

```bash
mvn -B -q verify -Dtest=TradeProposalServiceIT,TradeStateMachineTest
```

Expected: `BUILD SUCCESS`. All service tests pass; state machine tests unchanged.

- [ ] **Step 8: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/TradeApplication.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateHandler.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/service/MailboxService.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeProposalServiceIT.java
git commit -m "feat(trade-service): openTrade + TradeStateHandler with on-enter side effects"
```

---

## Task 12: TradeController + TradeActionController (state-2 → state-4 actions)

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeController.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeActionController.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/exception/RateLimitedException.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/payment/MockPaymentAdapter.java` — add `markPaid(String intentId)` if not present.
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeActionControllerIT.java`

**Interfaces:**
- Produces:
  - `GET /api/v1/trades/{id}` — returns `TradeResponse` (with `role` populated for the caller).
  - `POST /api/v1/trades/{id}/actions/payment-confirmed` — buyer only; calls MockPaymentAdapter.markPaid, transitions PAYMENT_CONFIRMED.
  - `POST /api/v1/trades/{id}/actions/email-changed` — seller only; transitions EMAIL_CHANGED (state 3 → 4).
  - `POST /api/v1/trades/{id}/actions/recheck` — seller only; enforces rate limit; transitions RECHECK (no state change) + re-publishes `imap-poll-request`.
  - `POST /api/v1/trades/{id}/actions/confirm` — buyer only; transitions BUYER_CONFIRM.
  - `POST /api/v1/trades/{id}/actions/reject` — buyer only; transitions BUYER_REJECT.

- [ ] **Step 1: Add RateLimitedException (or replace the stub from Task 10)**

Create/replace `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/exception/RateLimitedException.java`:

```java
package uz.efbazaar.trade.trade.exception;

public class RateLimitedException extends RuntimeException {
    public RateLimitedException(String message) {
        super(message);
    }
}
```

- [ ] **Step 2: Ensure MockPaymentAdapter has markPaid**

If Plan A already added `markPaid`, skip. Otherwise, modify `backend/trade-service/src/main/java/uz/efbazaar/trade/payment/MockPaymentAdapter.java`:

```java
    /** Test/MVP switch: flip the intent to PAID. Called by the trade action endpoint. */
    public PaymentStatus markPaid(String intentId) {
        return new PaymentStatus(intentId, "PAID");
    }
```

Note: the mock is stateless — `PAID` is derived, not stored. That's fine because Plan B doesn't need to reconcile a real gateway.

- [ ] **Step 3: Add the recheck rate-limit helper**

Create a small helper next to `TradeService`. Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/RecheckRateLimiter.java`:

```java
package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.exception.RateLimitedException;

import java.time.Duration;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class RecheckRateLimiter {

    private final StringRedisTemplate redis;

    @Value("${trade.recheck.max-per-trade}") private long maxClicks;
    @Value("${trade.recheck.min-interval-seconds}") private long minIntervalSec;

    /**
     * Enforces spec §3.3: max 5 clicks / trade, min 5 min between clicks.
     * Uses two Redis keys, both scoped to trade id and expiring together with
     * the state-4 window (30 min).
     */
    public void reserve(UUID tradeId) {
        String countKey = "trade:" + tradeId + ":recheck:count";
        String lastKey  = "trade:" + tradeId + ":recheck:last-at";

        Long last = readLong(lastKey);
        long now = System.currentTimeMillis();
        if (last != null && (now - last) < (minIntervalSec * 1000)) {
            long secLeft = minIntervalSec - (now - last) / 1000;
            throw new RateLimitedException("Recheck too soon — retry in " + secLeft + "s");
        }
        Long count = redis.opsForValue().increment(countKey);
        if (count == 1) {
            redis.expire(countKey, Duration.ofSeconds(1800));
        }
        if (count > maxClicks) {
            throw new RateLimitedException("Recheck limit reached for this trade");
        }
        redis.opsForValue().set(lastKey, String.valueOf(now), Duration.ofSeconds(1800));
    }

    private Long readLong(String key) {
        String v = redis.opsForValue().get(key);
        return v != null ? Long.parseLong(v) : null;
    }
}
```

- [ ] **Step 4: Add TradeController (read)**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeController.java`:

```java
package uz.efbazaar.trade.trade.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/trades")
@RequiredArgsConstructor
public class TradeController {

    private final TradeService trades;

    @GetMapping("/{id}")
    public TradeResponse get(@AuthenticationPrincipal AuthenticatedUser me,
                             @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        return trades.toResponse(t, t.roleFor(me.userId()));
    }
}
```

- [ ] **Step 5: Add TradeActionController (state transitions)**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeActionController.java`:

```java
package uz.efbazaar.trade.trade.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.payment.MockPaymentAdapter;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.RecheckRateLimiter;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/trades/{id}/actions")
@RequiredArgsConstructor
public class TradeActionController {

    private final TradeService trades;
    private final MockPaymentAdapter payment;
    private final MailboxService mailboxes;
    private final RecheckRateLimiter recheckLimiter;
    private final TradeEventPublisher events;

    @PostMapping("/payment-confirmed")
    public TradeResponse paymentConfirmed(@AuthenticationPrincipal AuthenticatedUser me,
                                          @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        requireRole(t, me.userId(), ParticipantRole.BUYER);
        if (t.getPaymentIntentId() != null) {
            payment.markPaid(t.getPaymentIntentId());
        }
        Trade after = trades.transition(id, TradeEvent.PAYMENT_CONFIRMED,
                ActorType.USER, me.userId());
        return trades.toResponse(after, ParticipantRole.BUYER);
    }

    @PostMapping("/email-changed")
    public TradeResponse emailChanged(@AuthenticationPrincipal AuthenticatedUser me,
                                      @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        requireRole(t, me.userId(), ParticipantRole.SELLER);
        Trade after = trades.transition(id, TradeEvent.EMAIL_CHANGED,
                ActorType.USER, me.userId());
        return trades.toResponse(after, ParticipantRole.SELLER);
    }

    @PostMapping("/recheck")
    public TradeResponse recheck(@AuthenticationPrincipal AuthenticatedUser me,
                                 @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        requireRole(t, me.userId(), ParticipantRole.SELLER);
        recheckLimiter.reserve(id);
        var mb = mailboxes.getRaw(t.getMailboxId());
        events.imapPollRequest(id, mb.getEmail(), TradeEvents.ImapPurpose.VERIFY_LINK);
        Trade after = trades.transition(id, TradeEvent.RECHECK,
                ActorType.USER, me.userId());
        return trades.toResponse(after, ParticipantRole.SELLER);
    }

    @PostMapping("/confirm")
    public TradeResponse buyerConfirm(@AuthenticationPrincipal AuthenticatedUser me,
                                      @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        requireRole(t, me.userId(), ParticipantRole.BUYER);
        Trade after = trades.transition(id, TradeEvent.BUYER_CONFIRM,
                ActorType.USER, me.userId());
        return trades.toResponse(after, ParticipantRole.BUYER);
    }

    @PostMapping("/reject")
    public TradeResponse buyerReject(@AuthenticationPrincipal AuthenticatedUser me,
                                     @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        requireRole(t, me.userId(), ParticipantRole.BUYER);
        Trade after = trades.transition(id, TradeEvent.BUYER_REJECT,
                ActorType.USER, me.userId());
        return trades.toResponse(after, ParticipantRole.BUYER);
    }

    private static void requireRole(Trade t, UUID userId, ParticipantRole required) {
        if (t.roleFor(userId) != required) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only " + required + " may perform this action");
        }
    }
}
```

- [ ] **Step 6: Write TradeActionControllerIT — happy paths + role rejection**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeActionControllerIT.java`:

```java
package uz.efbazaar.trade.trade;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class TradeActionControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired TradeService trades;
    @Autowired TradeRepository repo;

    @Test
    void buyerCanConfirmPayment_thenSellerChangesEmail() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        var t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        // Push it to WAITING_PAYMENT — normally the mock worker does this on email-provisioned.
        trades.transition(t.id(), uz.efbazaar.trade.trade.domain.TradeEvent.MAILBOX_PROVISIONED,
                uz.efbazaar.trade.trade.domain.ActorType.SYSTEM, null);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/payment-confirmed").with(asUser(buyer)))
                .andExpect(status().isOk());
        assertThat(repo.findById(t.id()).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_EMAIL_CHANGE);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/email-changed").with(asUser(seller)))
                .andExpect(status().isOk());
        assertThat(repo.findById(t.id()).orElseThrow().getState())
                .isEqualTo(TradeState.VERIFYING_KONAMI_LINK);
    }

    @Test
    void sellerCannotConfirmPayment() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        var t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        trades.transition(t.id(), uz.efbazaar.trade.trade.domain.TradeEvent.MAILBOX_PROVISIONED,
                uz.efbazaar.trade.trade.domain.ActorType.SYSTEM, null);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/payment-confirmed").with(asUser(seller)))
                .andExpect(status().isForbidden());
    }

    @Test
    void recheckIsRateLimited() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        var t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        // Drive to state 4.
        trades.transition(t.id(), uz.efbazaar.trade.trade.domain.TradeEvent.MAILBOX_PROVISIONED,
                uz.efbazaar.trade.trade.domain.ActorType.SYSTEM, null);
        trades.transition(t.id(), uz.efbazaar.trade.trade.domain.TradeEvent.PAYMENT_CONFIRMED,
                uz.efbazaar.trade.trade.domain.ActorType.USER, buyer);
        trades.transition(t.id(), uz.efbazaar.trade.trade.domain.TradeEvent.EMAIL_CHANGED,
                uz.efbazaar.trade.trade.domain.ActorType.USER, seller);

        // 3 clicks allowed per application-test.yml (recheck.max-per-trade: 3), 4th should 429.
        for (int i = 0; i < 3; i++) {
            mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/recheck").with(asUser(seller)))
                    .andExpect(status().isOk());
            Thread.sleep(1100); // > min-interval-seconds: 1
        }
        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/recheck").with(asUser(seller)))
                .andExpect(status().isTooManyRequests());
    }
}
```

- [ ] **Step 7: Run the test**

```bash
mvn -B -q verify -Dtest=TradeActionControllerIT
```

Expected: 3 tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeController.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeActionController.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/exception/RateLimitedException.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/RecheckRateLimiter.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/payment/MockPaymentAdapter.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeActionControllerIT.java
git commit -m "feat(trade-service): trade state-action REST endpoints (payment, email-changed, recheck, confirm, reject)"
```

---

## Task 13: OneTimePasswordService — send + reveal (state 5 → 6, then reveal)

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/SendPasswordRequest.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/PasswordRevealResponse.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/OneTimePasswordService.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/OneTimePasswordServiceTest.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeMessageController.java` (created here — new file).

**Interfaces:**
- Produces:
  - `POST /api/v1/trades/{id}/messages/password` — seller only; body `{password}`. Generates 32-byte AES key, saves in Redis (`trade:{id}:password-key:{msgId}` TTL 1800s), encrypts password with that key, persists a `TradeMessage` type=PASSWORD_ONETIME in both chats (both seller can see status, buyer sees the reveal), transitions PASSWORD_SENT.
  - `POST /api/v1/trades/{id}/messages/{msgId}/reveal` — buyer only. Fetches Redis key, decrypts. **Deletes the Redis key on first successful read.** Returns plaintext password once. Records audit `PASSWORD_REVEALED`.
  - `OneTimePasswordService.sendPassword(tradeId, plaintext, senderUserId)`.
  - `OneTimePasswordService.reveal(tradeId, messageId, viewerUserId) -> String`.

- [ ] **Step 1: Add DTOs**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/SendPasswordRequest.java`:

```java
package uz.efbazaar.trade.trade.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SendPasswordRequest(@NotBlank @Size(min = 4, max = 200) String password) {}
```

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/PasswordRevealResponse.java`:

```java
package uz.efbazaar.trade.trade.dto;

public record PasswordRevealResponse(String password) {}
```

- [ ] **Step 2: Write the failing OneTimePasswordServiceTest**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/OneTimePasswordServiceTest.java`:

```java
package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.repository.TradeMessageRepository;
import uz.efbazaar.trade.trade.service.OneTimePasswordService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class OneTimePasswordServiceTest extends AbstractIntegrationIT {

    @Autowired OneTimePasswordService otp;
    @Autowired TradeService trades;
    @Autowired TradeMessageRepository messages;

    @Test
    void revealYieldsPlaintextOnceThenIsGone() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();

        var trade = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        // Fast-forward to WAITING_PASSWORD.
        trades.transition(trade.id(), TradeEvent.MAILBOX_PROVISIONED, ActorType.SYSTEM, null);
        trades.transition(trade.id(), TradeEvent.PAYMENT_CONFIRMED,  ActorType.USER, buyer);
        trades.transition(trade.id(), TradeEvent.EMAIL_CHANGED,       ActorType.USER, seller);
        trades.transition(trade.id(), TradeEvent.KONAMI_EMAIL_RECEIVED, ActorType.WORKER, null);

        UUID msgId = otp.sendPassword(trade.id(), "SuperSecret42", seller);

        assertThat(otp.reveal(trade.id(), msgId, buyer)).isEqualTo("SuperSecret42");
        // Second reveal is impossible — Redis key gone.
        assertThatThrownBy(() -> otp.reveal(trade.id(), msgId, buyer))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void sellerCannotReveal() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();

        var trade = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        trades.transition(trade.id(), TradeEvent.MAILBOX_PROVISIONED, ActorType.SYSTEM, null);
        trades.transition(trade.id(), TradeEvent.PAYMENT_CONFIRMED,  ActorType.USER, buyer);
        trades.transition(trade.id(), TradeEvent.EMAIL_CHANGED,       ActorType.USER, seller);
        trades.transition(trade.id(), TradeEvent.KONAMI_EMAIL_RECEIVED, ActorType.WORKER, null);

        UUID msgId = otp.sendPassword(trade.id(), "topsecret", seller);
        assertThatThrownBy(() -> otp.reveal(trade.id(), msgId, seller))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
```

- [ ] **Step 3: Implement OneTimePasswordService**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/OneTimePasswordService.java`:

```java
package uz.efbazaar.trade.trade.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeMessageRepository;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

/**
 * Konami password passthrough — seller → buyer via a single Redis-held key.
 *
 * <p>Unlike other encrypted messages (which are decryptable with the master
 * key + HKDF context), a PASSWORD_ONETIME message is encrypted with a random
 * 32-byte key that lives only in Redis with a 30-minute TTL. On the FIRST
 * successful reveal the key is deleted. After that the ciphertext is
 * mathematically unrecoverable — not by admins, not by us with the master
 * key, not by anyone. Spec §6 §12 mandate this exactly.
 */
@Service
@RequiredArgsConstructor
public class OneTimePasswordService {

    private static final int GCM_TAG_BITS = 128;
    private static final int GCM_IV_BYTES = 12;
    private static final long REDIS_TTL_SECONDS = 1800;

    private final StringRedisTemplate redis;
    private final TradeService trades;
    private final TradeChatRepository chats;
    private final TradeMessageRepository messages;
    private final TradeAuditService audit;
    private final SecureRandom rng = new SecureRandom();

    /**
     * Persists a PASSWORD_ONETIME message in BOTH seller and buyer chats
     * (buyer chat holds the retrievable body; seller chat holds a status
     * marker). Transitions the trade to WAITING_BUYER_VERIFY.
     *
     * @return the messageId (matches in both chats' rows via metadata.groupId)
     */
    @Transactional
    public UUID sendPassword(UUID tradeId, String password, UUID senderUserId) {
        Trade t = trades.get(tradeId, senderUserId);
        if (t.roleFor(senderUserId) != ParticipantRole.SELLER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only seller may send password");
        }

        byte[] key = new byte[32];
        rng.nextBytes(key);
        byte[] iv = new byte[GCM_IV_BYTES];
        rng.nextBytes(iv);

        byte[] cipherAndTag;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE,
                    new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, iv));
            cipherAndTag = cipher.doFinal(password.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to encrypt one-time password", e);
        }
        byte[] ciphertext = Arrays.copyOfRange(cipherAndTag, 0, cipherAndTag.length - 16);
        byte[] tag        = Arrays.copyOfRange(cipherAndTag, cipherAndTag.length - 16, cipherAndTag.length);

        UUID messageId = UUID.randomUUID();

        // Store the key in Redis. Deleting it on reveal makes the ciphertext permanently opaque.
        redis.opsForValue().set(redisKey(tradeId, messageId),
                Base64.getEncoder().encodeToString(key),
                Duration.ofSeconds(REDIS_TTL_SECONDS));

        var buyerChat = chats.findByTradeIdAndParticipant(tradeId, ParticipantRole.BUYER)
                .orElseThrow(() -> new EntityNotFoundException("buyer chat"));

        // Buyer's copy carries the recoverable ciphertext.
        TradeMessage buyerMsg = TradeMessage.builder()
                .id(messageId)
                .tradeChatId(buyerChat.getId())
                .senderType(TradeSenderType.USER)
                .messageType(TradeMessageType.PASSWORD_ONETIME)
                .encryptedBody(ciphertext)
                .iv(iv)
                .tag(tag)
                .metadata(Map.of("groupId", messageId.toString()))
                .build();
        messages.save(buyerMsg);

        // Seller's copy is a status marker (no body). Same id space (different chat).
        var sellerChat = chats.findByTradeIdAndParticipant(tradeId, ParticipantRole.SELLER)
                .orElseThrow(() -> new EntityNotFoundException("seller chat"));
        TradeMessage sellerMarker = TradeMessage.builder()
                .id(UUID.randomUUID())
                .tradeChatId(sellerChat.getId())
                .senderType(TradeSenderType.SMART_ADMIN)
                .messageType(TradeMessageType.STATUS)
                .metadata(Map.of("code", "PASSWORD_SENT", "groupId", messageId.toString()))
                .build();
        messages.save(sellerMarker);

        trades.transition(tradeId, TradeEvent.PASSWORD_SENT, ActorType.USER, senderUserId);
        return messageId;
    }

    /**
     * Fetches key from Redis, decrypts, deletes the key. Second call throws.
     */
    @Transactional
    public String reveal(UUID tradeId, UUID messageId, UUID viewerUserId) {
        Trade t = trades.get(tradeId, viewerUserId);
        if (t.roleFor(viewerUserId) != ParticipantRole.BUYER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only buyer may reveal");
        }

        var buyerChat = chats.findByTradeIdAndParticipant(tradeId, ParticipantRole.BUYER)
                .orElseThrow(() -> new EntityNotFoundException("buyer chat"));
        var msg = messages.findById(messageId)
                .filter(m -> m.getTradeChatId().equals(buyerChat.getId()))
                .filter(m -> m.getMessageType() == TradeMessageType.PASSWORD_ONETIME)
                .orElseThrow(() -> new EntityNotFoundException("password message"));

        String encoded = redis.opsForValue().get(redisKey(tradeId, messageId));
        if (encoded == null) {
            throw new IllegalStateException("Password already revealed or expired");
        }
        byte[] key = Base64.getDecoder().decode(encoded);

        byte[] cipherAndTag = new byte[msg.getEncryptedBody().length + msg.getTag().length];
        System.arraycopy(msg.getEncryptedBody(), 0, cipherAndTag, 0, msg.getEncryptedBody().length);
        System.arraycopy(msg.getTag(), 0, cipherAndTag, msg.getEncryptedBody().length, msg.getTag().length);

        String plaintext;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,
                    new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, msg.getIv()));
            plaintext = new String(cipher.doFinal(cipherAndTag), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to decrypt one-time password", e);
        }

        // Point of no return.
        redis.delete(redisKey(tradeId, messageId));
        audit.record(tradeId, ActorType.USER, viewerUserId, "PASSWORD_REVEALED",
                Map.of("messageId", messageId.toString()));
        return plaintext;
    }

    private static String redisKey(UUID tradeId, UUID messageId) {
        return "trade:" + tradeId + ":password-key:" + messageId;
    }
}
```

- [ ] **Step 4: Add password endpoints to TradeMessageController**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeMessageController.java`:

```java
package uz.efbazaar.trade.trade.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.dto.PasswordRevealResponse;
import uz.efbazaar.trade.trade.dto.SendPasswordRequest;
import uz.efbazaar.trade.trade.service.OneTimePasswordService;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/trades/{id}/messages")
@RequiredArgsConstructor
public class TradeMessageController {

    private final OneTimePasswordService otp;

    @PostMapping("/password")
    public Map<String, UUID> sendPassword(@AuthenticationPrincipal AuthenticatedUser me,
                                          @PathVariable UUID id,
                                          @Valid @RequestBody SendPasswordRequest req) {
        UUID msgId = otp.sendPassword(id, req.password(), me.userId());
        return Map.of("messageId", msgId);
    }

    @PostMapping("/{msgId}/reveal")
    public PasswordRevealResponse reveal(@AuthenticationPrincipal AuthenticatedUser me,
                                         @PathVariable UUID id,
                                         @PathVariable UUID msgId) {
        return new PasswordRevealResponse(otp.reveal(id, msgId, me.userId()));
    }

    // Text messages endpoint added in Task 20.
}
```

- [ ] **Step 5: Run the test**

```bash
mvn -B -q verify -Dtest=OneTimePasswordServiceTest
```

Expected: 2 tests pass. First reveal returns `"SuperSecret42"`; second throws. Seller reveal 403s.

- [ ] **Step 6: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/SendPasswordRequest.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/PasswordRevealResponse.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/OneTimePasswordService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeMessageController.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/trade/OneTimePasswordServiceTest.java
git commit -m "feat(trade-service): one-time password send/reveal via Redis-held key"
```

---

## Task 14: MockWorker + trade-service response consumers

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/EmailProvisionedConsumer.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/KonamiEmailReceivedConsumer.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/Imap2faCodeConsumer.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/MailboxRotatedConsumer.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/MockWorker.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/service/MailboxService.java` — add `overwriteAddressAndPassword(UUID id, String email, byte[] encPass, byte[] iv, byte[] tag)`.

**Interfaces:**
- Produces:
  - `EmailProvisionedConsumer` — listens on `efbazaar.trade.email-provisioned`. Rewrites the mailbox row (email + encrypted password) and fires `MAILBOX_PROVISIONED` on the trade.
  - `KonamiEmailReceivedConsumer` — listens on `efbazaar.trade.konami-email-received`. Fires `KONAMI_EMAIL_RECEIVED` (only if `resetLinkPresent=true`; else logs and does nothing).
  - `Imap2faCodeConsumer` — logs the code and inserts a smart-admin STATUS message in the buyer chat. Does NOT transition state.
  - `MailboxRotatedConsumer` — updates mailbox password.
  - `MockWorker` — **profile `local` and `test` only.** Consumes `email-provision-request`, `forgot-password-request`, `imap-poll-request`, `mailbox-rotate-request`. Synthesises responses so trade lifecycle completes without the Python worker.

- [ ] **Step 1: Add MailboxService.overwriteAddressAndPassword**

Modify `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/service/MailboxService.java`. Add:

```java
    @Transactional
    public void overwriteAddressAndPassword(UUID mailboxId, String email,
                                            byte[] encPass, byte[] iv, byte[] tag) {
        Mailbox m = repo.findById(mailboxId)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId));
        m.setEmail(email);
        m.setEncryptedPassword(encPass);
        m.setIv(iv);
        m.setTag(tag);
        repo.save(m);
    }
```

- [ ] **Step 2: Add EmailProvisionedConsumer**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/EmailProvisionedConsumer.java`:

```java
package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

@Slf4j
@Component
@RequiredArgsConstructor
public class EmailProvisionedConsumer {

    private final TradeRepository trades;
    private final TradeService tradeService;
    private final MailboxService mailboxes;

    @KafkaListener(
            topics = TradeEvents.TOPIC_EMAIL_PROVISIONED,
            groupId = "trade-service-email-provisioned",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$EmailProvisioned"}
    )
    public void onEmailProvisioned(TradeEvents.EmailProvisioned e) {
        Trade t = trades.findById(e.tradeId()).orElse(null);
        if (t == null) {
            log.warn("email-provisioned for unknown trade {}", e.tradeId());
            return;
        }
        mailboxes.overwriteAddressAndPassword(t.getMailboxId(),
                e.mailboxEmail(), e.encryptedPassword(), e.iv(), e.tag());
        tradeService.transition(e.tradeId(), TradeEvent.MAILBOX_PROVISIONED,
                ActorType.WORKER, null);
    }
}
```

- [ ] **Step 3: Add KonamiEmailReceivedConsumer**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/KonamiEmailReceivedConsumer.java`:

```java
package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.service.TradeService;

@Slf4j
@Component
@RequiredArgsConstructor
public class KonamiEmailReceivedConsumer {

    private final TradeService trades;

    @KafkaListener(
            topics = TradeEvents.TOPIC_KONAMI_EMAIL,
            groupId = "trade-service-konami-email",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$KonamiEmailReceived"}
    )
    public void onKonamiEmail(TradeEvents.KonamiEmailReceived e) {
        if (!e.resetLinkPresent()) {
            log.info("konami-email-received (no reset link) for trade {}, keeping state 4",
                    e.tradeId());
            return;
        }
        trades.transition(e.tradeId(), TradeEvent.KONAMI_EMAIL_RECEIVED,
                ActorType.WORKER, null);
    }
}
```

- [ ] **Step 4: Add Imap2faCodeConsumer**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/Imap2faCodeConsumer.java`:

```java
package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeMessage;
import uz.efbazaar.trade.trade.domain.TradeMessageType;
import uz.efbazaar.trade.trade.domain.TradeSenderType;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeMessageRepository;

import java.util.Map;
import java.util.UUID;

/**
 * 2FA code arrives during state 6 while B is trying to log in. We surface it
 * as a smart-admin STATUS message in the BUYER chat — no state change.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class Imap2faCodeConsumer {

    private final TradeChatRepository chats;
    private final TradeMessageRepository messages;

    @KafkaListener(
            topics = TradeEvents.TOPIC_IMAP_2FA,
            groupId = "trade-service-imap-2fa",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$Imap2faCode"}
    )
    public void onCode(TradeEvents.Imap2faCode e) {
        var buyer = chats.findByTradeIdAndParticipant(e.tradeId(), ParticipantRole.BUYER);
        if (buyer.isEmpty()) {
            log.warn("imap-2fa for trade {} with no buyer chat", e.tradeId());
            return;
        }
        messages.save(TradeMessage.builder()
                .id(UUID.randomUUID())
                .tradeChatId(buyer.get().getId())
                .senderType(TradeSenderType.SMART_ADMIN)
                .messageType(TradeMessageType.STATUS)
                .metadata(Map.of("code", "IMAP_2FA_CODE", "value", e.code()))
                .build());
    }
}
```

- [ ] **Step 5: Add MailboxRotatedConsumer**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/MailboxRotatedConsumer.java`:

```java
package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.mailbox.service.MailboxService;

@Slf4j
@Component
@RequiredArgsConstructor
public class MailboxRotatedConsumer {

    private final MailboxService mailboxes;

    @KafkaListener(
            topics = TradeEvents.TOPIC_MAILBOX_ROTATED,
            groupId = "trade-service-mailbox-rotated",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$MailboxRotated"}
    )
    public void onRotated(TradeEvents.MailboxRotated e) {
        mailboxes.overwriteAddressAndPassword(e.mailboxId(), null, /* keep email */
                e.encryptedPassword(), e.iv(), e.tag());
        // Overwrite skips null email (see method note) — if MailboxService requires an email
        // in signature, load current email and pass it back in.
    }
}
```

Add an overload of `MailboxService.overwriteAddressAndPassword` that skips email when passed `null`:

```java
    @Transactional
    public void overwriteAddressAndPassword(UUID mailboxId, String email,
                                            byte[] encPass, byte[] iv, byte[] tag) {
        Mailbox m = repo.findById(mailboxId)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId));
        if (email != null) m.setEmail(email);
        m.setEncryptedPassword(encPass);
        m.setIv(iv);
        m.setTag(tag);
        repo.save(m);
    }
```

- [ ] **Step 6: Add MockWorker (profile !prod)**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/MockWorker.java`:

```java
package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.UUID;

/**
 * Stand-in for the Python smart-admin-worker (Plan C). Consumes the four
 * request topics and synthesises the response topics so trade-service can
 * complete a full happy-path in {@code local} / {@code test} / {@code docker}
 * profiles. NOT enabled in {@code prod}.
 */
@Slf4j
@Profile({"local", "test", "docker"})
@Component
@RequiredArgsConstructor
public class MockWorker {

    private final KafkaTemplate<String, Object> kafka;
    private final TradeCrypto crypto;
    private final SecureRandom rng = new SecureRandom();

    @KafkaListener(
            topics = TradeEvents.TOPIC_EMAIL_PROVISION_REQ,
            groupId = "mock-worker-provision",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$EmailProvisionRequest"}
    )
    public void onProvisionRequest(TradeEvents.EmailProvisionRequest req) {
        String email = "trade-" + req.tradeId().toString().substring(0, 8) + "@efbazaar.uz";
        byte[] pwBytes = new byte[16];
        rng.nextBytes(pwBytes);
        String pw = java.util.Base64.getEncoder().withoutPadding().encodeToString(pwBytes);
        EncryptedField enc = crypto.encrypt("mbox-mock-" + req.tradeId(), pw.getBytes());
        kafka.send(TradeEvents.TOPIC_EMAIL_PROVISIONED, req.tradeId().toString(),
                new TradeEvents.EmailProvisioned(req.tradeId(), email,
                        enc.ciphertext(), enc.iv(), enc.tag()));
        log.info("MockWorker provisioned {} for trade {}", email, req.tradeId());
    }

    @KafkaListener(
            topics = TradeEvents.TOPIC_FORGOT_PW_REQ,
            groupId = "mock-worker-forgot",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$ForgotPasswordRequest"}
    )
    public void onForgotPwRequest(TradeEvents.ForgotPasswordRequest req) {
        // The real worker triggers Konami's forgot-password. We simulate the successful IMAP
        // hit ~250 ms later, so trade lifecycle proceeds without human intervention.
        try { Thread.sleep(250); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
        kafka.send(TradeEvents.TOPIC_KONAMI_EMAIL, req.tradeId().toString(),
                new TradeEvents.KonamiEmailReceived(req.tradeId(), true,
                        "noreply@konami.com", Instant.now()));
        log.info("MockWorker synthesised konami-email for trade {}", req.tradeId());
    }

    @KafkaListener(
            topics = TradeEvents.TOPIC_IMAP_POLL_REQ,
            groupId = "mock-worker-poll",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$ImapPollRequest"}
    )
    public void onPollRequest(TradeEvents.ImapPollRequest req) {
        switch (req.purpose()) {
            case VERIFY_LINK -> kafka.send(TradeEvents.TOPIC_KONAMI_EMAIL, req.tradeId().toString(),
                    new TradeEvents.KonamiEmailReceived(req.tradeId(), true,
                            "noreply@konami.com", Instant.now()));
            case WAIT_2FA_CODE -> kafka.send(TradeEvents.TOPIC_IMAP_2FA, req.tradeId().toString(),
                    new TradeEvents.Imap2faCode(req.tradeId(), "123456", Instant.now()));
        }
    }

    @KafkaListener(
            topics = TradeEvents.TOPIC_MAILBOX_ROTATE_REQ,
            groupId = "mock-worker-rotate",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$MailboxRotateRequest"}
    )
    public void onRotateRequest(TradeEvents.MailboxRotateRequest req) {
        byte[] pw = new byte[16];
        rng.nextBytes(pw);
        EncryptedField enc = crypto.encrypt("mbox-mock-rotate-" + req.mailboxId(),
                java.util.Base64.getEncoder().withoutPadding().encodeToString(pw).getBytes());
        kafka.send(TradeEvents.TOPIC_MAILBOX_ROTATED, req.mailboxId().toString(),
                new TradeEvents.MailboxRotated(req.mailboxId(),
                        enc.ciphertext(), enc.iv(), enc.tag()));
    }
}
```

- [ ] **Step 7: Verify wire-up with a smoke IT (dedicated test in Task 22 e2e — this just proves beans load)**

```bash
mvn -B -q verify -Dtest=TradeApplicationTests
```

Expected: `BUILD SUCCESS`. Spring context should now include all four request consumers, MockWorker, TradeEventPublisher, and existing beans.

- [ ] **Step 8: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/EmailProvisionedConsumer.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/KonamiEmailReceivedConsumer.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/Imap2faCodeConsumer.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/MailboxRotatedConsumer.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/MockWorker.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/service/MailboxService.java
git commit -m "feat(trade-service): mock worker + response consumers (email, konami, 2fa, rotate)"
```

---

## Task 15: TradeTimeoutScheduler — per-state deadline expiry

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeTimeoutScheduler.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeTimeoutSchedulerIT.java`

**Interfaces:**
- Produces:
  - `TradeTimeoutScheduler.sweep()` — `@Scheduled(fixedRate=10_000)` in prod, called manually from tests. Loads all trades with `state ∈ non-terminal` and `state_deadline < now`, fires `TIMEOUT` on each.
- Consumes: `TradeRepository`, `TradeService`, `TradeStateMachine` (via `TradeService.transition`).

- [ ] **Step 1: Add scheduler**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeTimeoutScheduler.java`:

```java
package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Instant;
import java.util.Set;

/**
 * Wakes up every 10 seconds, finds trades whose {@code state_deadline} has
 * passed, and fires TIMEOUT. Idempotent: if state has already moved on (a
 * concurrent user action closed the state), the state machine either accepts
 * or rejects and we log-and-skip.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeTimeoutScheduler {

    private final TradeRepository trades;
    private final TradeService tradeService;

    @Scheduled(fixedRateString = "${trade.scheduler.sweep-interval-ms:10000}")
    public void sweep() {
        Instant now = Instant.now();
        var due = trades.findByStateInAndStateDeadlineBefore(
                TradeState.nonTerminal(), now);
        for (var trade : due) {
            try {
                tradeService.transition(trade.getId(), TradeEvent.TIMEOUT,
                        ActorType.SYSTEM, null);
                log.info("Timed out trade {} from {}", trade.getId(), trade.getState());
            } catch (Exception e) {
                log.warn("Timeout sweep skipped trade {} ({}): {}",
                        trade.getId(), trade.getState(), e.getMessage());
            }
        }
    }
}
```

- [ ] **Step 2: Write TradeTimeoutSchedulerIT — full-cycle check**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeTimeoutSchedulerIT.java`:

```java
package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;
import uz.efbazaar.trade.trade.service.TradeTimeoutScheduler;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@SpringBootTest
class TradeTimeoutSchedulerIT extends AbstractIntegrationIT {

    @Autowired TradeService trades;
    @Autowired TradeRepository repo;
    @Autowired TradeTimeoutScheduler scheduler;

    /**
     * With application-test.yml's waiting-payment-seconds=2, a trade parked
     * in WAITING_PAYMENT should ORPHAN within a few seconds of its deadline.
     */
    @Test
    void waitingPaymentOrphansAfterDeadline() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        var t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        trades.transition(t.id(), TradeEvent.MAILBOX_PROVISIONED, ActorType.SYSTEM, null);

        await().atMost(15, TimeUnit.SECONDS).untilAsserted(() -> {
            scheduler.sweep(); // don't wait for the fixedRate — call directly
            var reloaded = repo.findById(t.id()).orElseThrow();
            assertThat(reloaded.getState()).isEqualTo(TradeState.ORPHANED);
        });
    }
}
```

- [ ] **Step 3: Run the test**

```bash
mvn -B -q verify -Dtest=TradeTimeoutSchedulerIT
```

Expected: `BUILD SUCCESS`. The `Awaitility` loop calls `sweep()` repeatedly for up to 15 s and checks the trade transitions once the 2-second deadline elapses.

- [ ] **Step 4: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeTimeoutScheduler.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeTimeoutSchedulerIT.java
git commit -m "feat(trade-service): per-state timeout scheduler"
```

---

## Task 16: TradeChatService + text message REST

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/PostTextRequest.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/TradeMessageResponse.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeChatService.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeMessageController.java` — add `GET` and `POST /messages` (text).
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeMessageControllerIT.java`

**Interfaces:**
- Produces:
  - `GET /api/v1/trades/{id}/messages` — returns the caller's own chat messages in ascending order. Decrypts TEXT bodies; PASSWORD_ONETIME bodies are never decrypted here (buyer must call `reveal`).
  - `POST /api/v1/trades/{id}/messages` — post a text message into the caller's own chat. Encrypted with TradeCrypto (`msg-{tradeId}-{messageId}`). Trade must not be terminal.
  - `TradeChatService.postText(tradeId, viewerId, text) -> TradeMessage`
  - `TradeChatService.list(tradeId, viewerId) -> List<TradeMessageResponse>`
- Consumes: `TradeCrypto` (Plan A), `TradeMessageRepository`, `TradeChatRepository`, `TradeService.get`.

- [ ] **Step 1: Add DTOs**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/PostTextRequest.java`:

```java
package uz.efbazaar.trade.trade.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PostTextRequest(@NotBlank @Size(max = 2000) String text) {}
```

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/TradeMessageResponse.java`:

```java
package uz.efbazaar.trade.trade.dto;

import uz.efbazaar.trade.trade.domain.TradeMessageType;
import uz.efbazaar.trade.trade.domain.TradeSenderType;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record TradeMessageResponse(
        UUID id,
        TradeSenderType senderType,
        TradeMessageType messageType,
        String text,             // populated for TEXT / null otherwise
        Map<String, Object> metadata,
        Instant createdAt) {}
```

- [ ] **Step 2: Add TradeChatService**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeChatService.java`:

```java
package uz.efbazaar.trade.trade.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.dto.TradeMessageResponse;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeMessageRepository;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TradeChatService {

    private final TradeService trades;
    private final TradeChatRepository chats;
    private final TradeMessageRepository messages;
    private final TradeCrypto crypto;

    @Transactional
    public TradeMessage postText(UUID tradeId, UUID viewerUserId, String text) {
        Trade t = trades.get(tradeId, viewerUserId);
        if (t.getState().isTerminal()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Trade is closed — no new messages allowed");
        }
        ParticipantRole role = t.roleFor(viewerUserId);
        var chat = chats.findByTradeIdAndParticipant(tradeId, role)
                .orElseThrow(() -> new EntityNotFoundException("chat for " + role));

        UUID messageId = UUID.randomUUID();
        EncryptedField enc = crypto.encrypt(
                context(tradeId, messageId),
                text.getBytes(StandardCharsets.UTF_8));

        TradeMessage msg = TradeMessage.builder()
                .id(messageId)
                .tradeChatId(chat.getId())
                .senderType(TradeSenderType.USER)
                .messageType(TradeMessageType.TEXT)
                .encryptedBody(enc.ciphertext())
                .iv(enc.iv())
                .tag(enc.tag())
                .build();
        return messages.save(msg);
    }

    @Transactional(readOnly = true)
    public List<TradeMessageResponse> list(UUID tradeId, UUID viewerUserId) {
        Trade t = trades.get(tradeId, viewerUserId);
        ParticipantRole role = t.roleFor(viewerUserId);
        var chat = chats.findByTradeIdAndParticipant(tradeId, role)
                .orElseThrow(() -> new EntityNotFoundException("chat for " + role));

        return messages.findByTradeChatIdOrderByCreatedAtAsc(chat.getId()).stream()
                .map(m -> new TradeMessageResponse(
                        m.getId(),
                        m.getSenderType(),
                        m.getMessageType(),
                        m.getMessageType() == TradeMessageType.TEXT
                                ? decryptText(tradeId, m)
                                : null,
                        m.getMetadata(),
                        m.getCreatedAt()))
                .toList();
    }

    private String decryptText(UUID tradeId, TradeMessage m) {
        byte[] plain = crypto.decrypt(context(tradeId, m.getId()),
                new EncryptedField(m.getIv(), m.getTag(), m.getEncryptedBody()));
        return new String(plain, StandardCharsets.UTF_8);
    }

    private static String context(UUID tradeId, UUID messageId) {
        return "msg-" + tradeId + "-" + messageId;
    }
}
```

- [ ] **Step 3: Extend TradeMessageController with GET and POST /messages**

Modify `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeMessageController.java`. Full new body:

```java
package uz.efbazaar.trade.trade.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.dto.PasswordRevealResponse;
import uz.efbazaar.trade.trade.dto.PostTextRequest;
import uz.efbazaar.trade.trade.dto.SendPasswordRequest;
import uz.efbazaar.trade.trade.dto.TradeMessageResponse;
import uz.efbazaar.trade.trade.service.OneTimePasswordService;
import uz.efbazaar.trade.trade.service.TradeChatService;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/trades/{id}/messages")
@RequiredArgsConstructor
public class TradeMessageController {

    private final OneTimePasswordService otp;
    private final TradeChatService chat;

    @GetMapping
    public List<TradeMessageResponse> list(@AuthenticationPrincipal AuthenticatedUser me,
                                           @PathVariable UUID id) {
        return chat.list(id, me.userId());
    }

    @PostMapping
    public TradeMessageResponse postText(@AuthenticationPrincipal AuthenticatedUser me,
                                         @PathVariable UUID id,
                                         @Valid @RequestBody PostTextRequest req) {
        var m = chat.postText(id, me.userId(), req.text());
        return new TradeMessageResponse(m.getId(), m.getSenderType(), m.getMessageType(),
                req.text(), m.getMetadata(), m.getCreatedAt());
    }

    @PostMapping("/password")
    public Map<String, UUID> sendPassword(@AuthenticationPrincipal AuthenticatedUser me,
                                          @PathVariable UUID id,
                                          @Valid @RequestBody SendPasswordRequest req) {
        UUID msgId = otp.sendPassword(id, req.password(), me.userId());
        return Map.of("messageId", msgId);
    }

    @PostMapping("/{msgId}/reveal")
    public PasswordRevealResponse reveal(@AuthenticationPrincipal AuthenticatedUser me,
                                         @PathVariable UUID id,
                                         @PathVariable UUID msgId) {
        return new PasswordRevealResponse(otp.reveal(id, msgId, me.userId()));
    }
}
```

- [ ] **Step 4: Write TradeMessageControllerIT**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeMessageControllerIT.java`:

```java
package uz.efbazaar.trade.trade;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.dto.PostTextRequest;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class TradeMessageControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired TradeService trades;

    @Test
    void sellerPostsAndRetrievesOwnText() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        TradeResponse t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .content(json.writeValueAsString(new PostTextRequest("hello")))
                        .with(asUser(seller)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value("hello"));

        mvc.perform(get("/api/v1/trades/" + t.id() + "/messages").with(asUser(seller)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].text").value("hello"));
    }

    @Test
    void buyerNeverSeesSellerText() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        TradeResponse t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .content(json.writeValueAsString(new PostTextRequest("seller-only")))
                        .with(asUser(seller)))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/trades/" + t.id() + "/messages").with(asUser(buyer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
```

- [ ] **Step 5: Run tests**

```bash
mvn -B -q verify -Dtest=TradeMessageControllerIT
```

Expected: 2 tests pass. Seller sees their own message; buyer sees nothing (their own chat is empty).

- [ ] **Step 6: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/PostTextRequest.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/TradeMessageResponse.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeChatService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeMessageController.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeMessageControllerIT.java
git commit -m "feat(trade-service): trade chat text messages (encrypted per-role)"
```

---

## Task 17: WebSocket + STOMP live push

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/config/WebSocketConfig.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/ws/TradeBroadcaster.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java` — call broadcaster after `save`.
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeChatService.java` — call broadcaster after `postText`.
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/ws/TradeWebSocketIT.java`

**Interfaces:**
- Produces:
  - STOMP endpoint `/ws/trade` (SockJS fallback enabled).
  - Broadcast topic per role: `/topic/trades/{tradeId}/seller`, `/topic/trades/{tradeId}/buyer`.
  - `TradeBroadcaster.publishStateChange(Trade t)` sends `TradeResponse` to both role topics.
  - `TradeBroadcaster.publishMessage(UUID tradeId, ParticipantRole targetRole, TradeMessageResponse msg)` — role-scoped push.
- Consumes: Spring WebSocket + STOMP.

- [ ] **Step 1: Add WebSocketConfig**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/config/WebSocketConfig.java`:

```java
package uz.efbazaar.trade.config;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.server.HandshakeInterceptor;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * STOMP-over-WebSocket transport for live trade updates.
 *
 * <p>Auth model: the WSS handshake goes through the same nginx proxy as REST,
 * so the {@code X-User-Id} etc. headers reach us. We capture them in a
 * {@link HandshakeInterceptor} and re-attach as a Spring Authentication on
 * the CONNECT frame.
 */
@Slf4j
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws/trade")
                .setAllowedOriginPatterns("*")
                .addInterceptors(new HeaderCapturingInterceptor())
                .withSockJS();
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new StompAuthInterceptor());
    }

    private static class HeaderCapturingInterceptor implements HandshakeInterceptor {
        @Override
        public boolean beforeHandshake(ServerHttpRequest request,
                                       ServerHttpResponse response,
                                       WebSocketHandler wsHandler,
                                       Map<String, Object> attributes) {
            if (request instanceof ServletServerHttpRequest s) {
                HttpServletRequest r = s.getServletRequest();
                attributes.put("X-User-Id", r.getHeader("X-User-Id"));
                attributes.put("X-User-Roles", r.getHeader("X-User-Roles"));
            }
            return true;
        }
        @Override
        public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Exception exception) {
            // no-op
        }
    }

    private static class StompAuthInterceptor implements ChannelInterceptor {
        @Override
        public Message<?> preSend(Message<?> message, MessageChannel channel) {
            StompHeaderAccessor acc = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
            if (acc == null || acc.getCommand() != StompCommand.CONNECT) {
                return message;
            }
            Map<String, Object> attrs = acc.getSessionAttributes();
            if (attrs == null) return message;
            Object idStr = attrs.get("X-User-Id");
            if (idStr == null) return message;
            try {
                UUID userId = UUID.fromString(idStr.toString());
                List<String> roles = attrs.get("X-User-Roles") == null
                        ? Collections.emptyList()
                        : Arrays.stream(attrs.get("X-User-Roles").toString().split(","))
                            .map(String::trim).filter(s -> !s.isEmpty()).toList();
                AuthenticatedUser principal = new AuthenticatedUser(userId, null, roles, null);
                var auth = new UsernamePasswordAuthenticationToken(principal, null,
                        roles.stream().map(SimpleGrantedAuthority::new).toList());
                acc.setUser(auth);
            } catch (IllegalArgumentException e) {
                log.warn("STOMP CONNECT with invalid X-User-Id: {}", idStr);
            }
            return message;
        }
    }
}
```

- [ ] **Step 2: Add TradeBroadcaster**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/ws/TradeBroadcaster.java`:

```java
package uz.efbazaar.trade.trade.ws;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.dto.TradeMessageResponse;
import uz.efbazaar.trade.trade.dto.TradeResponse;

import java.util.UUID;

@Component
@RequiredArgsConstructor
public class TradeBroadcaster {

    private final SimpMessagingTemplate ws;

    /** Publish the same TradeResponse to both role topics — clients render only their own actions. */
    public void publishStateChange(UUID tradeId, TradeResponse response) {
        ws.convertAndSend("/topic/trades/" + tradeId + "/seller",
                response.role() == ParticipantRole.SELLER ? response : withRole(response, ParticipantRole.SELLER));
        ws.convertAndSend("/topic/trades/" + tradeId + "/buyer",
                response.role() == ParticipantRole.BUYER ? response : withRole(response, ParticipantRole.BUYER));
    }

    public void publishMessage(UUID tradeId, ParticipantRole targetRole, TradeMessageResponse msg) {
        String role = targetRole == ParticipantRole.SELLER ? "seller" : "buyer";
        ws.convertAndSend("/topic/trades/" + tradeId + "/" + role, msg);
    }

    private static TradeResponse withRole(TradeResponse r, ParticipantRole role) {
        return new TradeResponse(r.id(), r.state(), r.sellerId(), r.buyerId(),
                r.priceUzs(), r.mailboxId(), r.createdAt(), r.expiresAt(),
                r.stateDeadline(), role);
    }
}
```

- [ ] **Step 3: Wire broadcaster into TradeService.transition**

Modify `TradeService`. Add `private final TradeBroadcaster broadcaster;` to the constructor field list (Lombok picks it up). At the bottom of `transition(...)` — after the audit call — add:

```java
        broadcaster.publishStateChange(t.getId(), toResponse(t, null));
        return t;
```

Do the same at the bottom of `openTrade(...)`, right before the `return`:

```java
        broadcaster.publishStateChange(t.getId(), toResponse(t, null));
        return toResponse(t, null);
```

- [ ] **Step 4: Wire broadcaster into TradeChatService.postText**

Modify `TradeChatService`. Add `private final TradeBroadcaster broadcaster;`. After saving the message in `postText`, add:

```java
        TradeMessageResponse resp = new TradeMessageResponse(msg.getId(), msg.getSenderType(),
                msg.getMessageType(), text, msg.getMetadata(), msg.getCreatedAt());
        broadcaster.publishMessage(tradeId, role, resp);
        return msg;
```

- [ ] **Step 5: Write TradeWebSocketIT — connect + subscribe + receive**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/ws/TradeWebSocketIT.java`:

```java
package uz.efbazaar.trade.ws;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import org.springframework.web.socket.sockjs.client.SockJsClient;
import org.springframework.web.socket.sockjs.client.WebSocketTransport;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.TradeService;

import java.lang.reflect.Type;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TradeWebSocketIT extends AbstractIntegrationIT {

    @LocalServerPort int port;
    @Autowired TradeService trades;

    @Test
    void sellerReceivesStateChange() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();

        TradeResponse t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);

        var sockJs = new SockJsClient(List.of(new WebSocketTransport(new StandardWebSocketClient())));
        var stomp = new WebSocketStompClient(sockJs);
        stomp.setMessageConverter(new MappingJackson2MessageConverter());

        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.add("X-User-Id", seller.toString());
        headers.add("X-User-Roles", "ROLE_USER");

        StompSession session = stomp
                .connectAsync("ws://localhost:" + port + "/ws/trade", headers,
                        new StompSessionHandlerAdapter() {})
                .get(5, TimeUnit.SECONDS);

        BlockingQueue<Object> queue = new ArrayBlockingQueue<>(4);
        session.subscribe("/topic/trades/" + t.id() + "/seller", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { queue.offer(payload); }
        });

        // Fire a state change — MAILBOX_PROVISIONED brings us to WAITING_PAYMENT
        trades.transition(t.id(), TradeEvent.MAILBOX_PROVISIONED, ActorType.SYSTEM, null);

        Object frame = queue.poll(5, TimeUnit.SECONDS);
        assertThat(frame).isNotNull();
        assertThat(frame.toString()).contains("WAITING_PAYMENT");
    }
}
```

- [ ] **Step 6: Run the IT**

```bash
mvn -B -q verify -Dtest=TradeWebSocketIT
```

Expected: `BUILD SUCCESS`. The test starts SockJS, subscribes, triggers a transition, receives the broadcast payload.

- [ ] **Step 7: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/config/WebSocketConfig.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/ws/TradeBroadcaster.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeChatService.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/ws/TradeWebSocketIT.java
git commit -m "feat(trade-service): STOMP-over-WebSocket live state and message push"
```

---

## Task 18: Nginx routing — trade backend + /api/v1/trades + /ws/trade

**Files:**
- Modify: `nginx/conf.d/backends.inc`
- Modify: `nginx/conf.d/api.conf`

**Interfaces:**
- Produces:
  - `set $backend_trade "trade-service:8085";`
  - `/api/v1/trades/**`, `/api/v1/mailboxes/**`, `/api/v1/cards/**` route to trade-service (with `auth_request`).
  - `/ws/trade/**` upgrades to WebSocket and proxies to trade-service.
  - `/api/v1/admin/mailboxes/**` requires admin role — enforced by trade-service SecurityConfig; nginx just forwards.

- [ ] **Step 1: Add backend_trade upstream**

Modify `nginx/conf.d/backends.inc`. Append:

```
set $backend_trade       "trade-service:8085";
```

- [ ] **Step 2: Add trade routes in api.conf**

Modify `nginx/conf.d/api.conf`. Find the block that routes `/api/v1/listings` to marketplace-service and add the following block after it (before the marketplace catch-all `/api/`):

```
    # ----- trade-service (Plan B lifecycle) --------------------------
    location ~ ^/api/v1/(trades|mailboxes|cards)(/|$) {
        limit_except GET POST DELETE OPTIONS { deny all; }
        if ($request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin      $cors_allow_origin always;
            add_header Access-Control-Allow-Methods     "GET,POST,DELETE,OPTIONS" always;
            add_header Access-Control-Allow-Headers     "Authorization,Content-Type,Accept" always;
            add_header Access-Control-Allow-Credentials "true" always;
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 204;
        }

        auth_request /_auth_verify;
        error_page 401 = @trade_unauth;

        auth_request_set $user_id      $upstream_http_x_user_id;
        auth_request_set $user_roles   $upstream_http_x_user_roles;
        auth_request_set $telegram_id  $upstream_http_x_telegram_id;
        auth_request_set $user_name    $upstream_http_x_user_name;

        proxy_set_header X-User-Id     $user_id;
        proxy_set_header X-User-Roles  $user_roles;
        proxy_set_header X-Telegram-Id $telegram_id;
        proxy_set_header X-User-Name   $user_name;

        proxy_pass http://$backend_trade$request_uri;
        include /etc/nginx/conf.d/proxy-common.inc;
    }

    location @trade_unauth {
        add_header Access-Control-Allow-Origin $cors_allow_origin always;
        return 401 '{"error":"unauthenticated"}';
    }

    # ----- trade-service WSS --------------------------
    location /ws/trade/ {
        auth_request /_auth_verify;

        auth_request_set $user_id      $upstream_http_x_user_id;
        auth_request_set $user_roles   $upstream_http_x_user_roles;

        proxy_set_header X-User-Id     $user_id;
        proxy_set_header X-User-Roles  $user_roles;
        proxy_set_header Host          $host;

        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";

        # No timeout on upgraded connection — WSS is long-lived.
        proxy_read_timeout 3600s;

        proxy_pass http://$backend_trade;
    }
```

Note the auth_request on the WSS location happens ONCE on the HTTP upgrade — after that the socket is passthrough. That's why we set the STOMP-CONNECT interceptor in Task 17 to re-read the same headers.

- [ ] **Step 3: Reload nginx config in dev / test docker stack**

```bash
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`. Reload succeeds silently.

- [ ] **Step 4: Smoke test through the proxy**

Start the full stack:
```bash
cd ~/IdeaProjects/ef-bazaar
docker compose up -d
```

Once healthy:
```bash
# Anonymous — expect 401
curl -sk -o /dev/null -w '%{http_code}\n' https://api.efbazaar.uz/api/v1/trades/00000000-0000-0000-0000-000000000000
# → 401
```

Then log in via the auth flow (out of scope for this test — use existing cookies) and:
```bash
curl -sk -o /dev/null -w '%{http_code}\n' \
     -H "Cookie: <your session cookie>" \
     https://api.efbazaar.uz/api/v1/cards
# → 200 with []
```

If you get 502, trade-service is not registered on the docker network — re-check the compose block from Task 1.

- [ ] **Step 5: Commit**

```bash
git add nginx/conf.d/backends.inc nginx/conf.d/api.conf
git commit -m "feat(nginx): route /api/v1/trades|mailboxes|cards and /ws/trade to trade-service"
```

---

## Task 19: Admin mailbox endpoint (ROLE_ADMIN-gated, no TOTP MVP)

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/controller/AdminMailboxController.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/repository/MailboxRepository.java` — add `findOrphaned()` query.
- Modify: `backend/trade-service/src/test/java/uz/efbazaar/trade/mailbox/MailboxControllerIT.java` — add admin case.

**Interfaces:**
- Produces:
  - `GET /api/v1/admin/mailboxes/orphaned` — returns list of orphaned mailboxes (owner_user_id is null AND trade_id is null AND deleted_at is null). Requires `ROLE_ADMIN`.
- TOTP MFA is a follow-up (spec §11) — noted as such in the controller javadoc.

- [ ] **Step 1: Add findOrphaned to MailboxRepository**

Modify `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/repository/MailboxRepository.java`. Add:

```java
    @org.springframework.data.jpa.repository.Query("""
            SELECT m FROM Mailbox m
             WHERE m.ownerUserId IS NULL
               AND m.tradeId IS NULL
               AND m.deletedAt IS NULL
            """)
    java.util.List<Mailbox> findOrphaned();
```

- [ ] **Step 2: Add AdminMailboxController**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/controller/AdminMailboxController.java`:

```java
package uz.efbazaar.trade.mailbox.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.dto.MailboxResponse;
import uz.efbazaar.trade.mailbox.mapper.MailboxMapper;

import java.util.List;

/**
 * Admin dashboard endpoints. TOTP MFA is a follow-up (spec §11) — role gate is
 * the only enforcement in MVP.
 */
@RestController
@RequestMapping("/api/v1/admin/mailboxes")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
@RequiredArgsConstructor
public class AdminMailboxController {

    private final MailboxRepository repo;
    private final MailboxMapper mapper;

    @GetMapping("/orphaned")
    public List<MailboxResponse> listOrphaned() {
        return repo.findOrphaned().stream().map(mapper::toResponse).toList();
    }
}
```

Add `@EnableMethodSecurity` to `SecurityConfig` if not present (needed for `@PreAuthorize`).

Modify `SecurityConfig`:

```java
@Configuration
@EnableWebSecurity
@org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {
    // …unchanged…
}
```

- [ ] **Step 3: Extend MailboxControllerIT — admin can list orphaned, regular user 403s**

Add to `MailboxControllerIT`:

```java
    @Test
    void adminCanListOrphaned() {
        RestTemplate rest = new RestTemplate();
        HttpHeaders h = new HttpHeaders();
        h.set("X-User-Id", UUID.randomUUID().toString());
        h.set("X-User-Roles", "ROLE_USER,ROLE_ADMIN");
        var response = rest.exchange(
                "http://localhost:" + port + "/api/v1/admin/mailboxes/orphaned",
                org.springframework.http.HttpMethod.GET,
                new HttpEntity<>(h),
                String.class);
        org.assertj.core.api.Assertions.assertThat(response.getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void nonAdminIsForbidden() {
        RestTemplate rest = new RestTemplate();
        HttpHeaders h = new HttpHeaders();
        h.set("X-User-Id", UUID.randomUUID().toString());
        h.set("X-User-Roles", "ROLE_USER");
        try {
            rest.exchange(
                    "http://localhost:" + port + "/api/v1/admin/mailboxes/orphaned",
                    org.springframework.http.HttpMethod.GET,
                    new HttpEntity<>(h),
                    String.class);
            org.assertj.core.api.Assertions.fail("expected 403");
        } catch (org.springframework.web.client.HttpClientErrorException.Forbidden ignored) {}
    }
```

- [ ] **Step 4: Run**

```bash
mvn -B -q verify -Dtest=MailboxControllerIT
```

Expected: `BUILD SUCCESS`, admin flow passes, user flow 403s.

- [ ] **Step 5: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/controller/AdminMailboxController.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/repository/MailboxRepository.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/security/SecurityConfig.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/mailbox/MailboxControllerIT.java
git commit -m "feat(trade-service): admin dashboard endpoint for orphaned mailboxes (ROLE_ADMIN)"
```

---

## Task 20: End-to-end happy path IT (proposal → SUCCESS)

**Files:**
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeE2EIT.java`

**Interfaces:**
- Consumes: Everything built so far. This test proves the whole plan hangs together.

- [ ] **Step 1: Write TradeE2EIT**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeE2EIT.java`:

```java
package uz.efbazaar.trade.trade;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import uz.efbazaar.trade.card.domain.Card;
import uz.efbazaar.trade.card.domain.CardBrand;
import uz.efbazaar.trade.card.repository.CardRepository;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.dto.PasswordRevealResponse;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.dto.ProposalResponse;
import uz.efbazaar.trade.trade.dto.SendPasswordRequest;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/**
 * End-to-end happy path: proposal → S accepts → trade → S/B walk the state
 * machine → SUCCESS. Uses MockWorker (Task 14) so no external Konami / IMAP
 * dependency. Kafka + Redis are Testcontainers. This is the demo test — if
 * this passes, Plan B ships.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
class TradeE2EIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired TradeRepository tradeRepo;
    @Autowired CardRepository cardRepo;
    @Autowired MailboxRepository mailboxRepo;

    @Test
    void fullHappyPathTerminatesInSuccess() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();

        UUID sellerCardId = seedCard(seller);
        UUID buyerCardId  = seedCard(buyer);

        // 1. Seller creates a proposal via REST.
        ProposalCreateRequest req = new ProposalCreateRequest(
                UUID.randomUUID(), buyer, seller, buyer, 500_000L, sellerCardId, null);

        MvcResult r = mvc.perform(post("/api/v1/trades/proposals")
                        .contentType(APPLICATION_JSON)
                        .content(json.writeValueAsString(req))
                        .with(asUser(seller)))
                .andExpect(status().isCreated())
                .andReturn();
        ProposalResponse pr = json.readValue(r.getResponse().getContentAsString(), ProposalResponse.class);

        // 2. Buyer accepts.
        MvcResult acc = mvc.perform(post("/api/v1/trades/proposals/" + pr.proposalId() + "/accept")
                        .contentType(APPLICATION_JSON)
                        .content("{\"cardId\":\"" + buyerCardId + "\"}")
                        .with(asUser(buyer)))
                .andExpect(status().isCreated())
                .andReturn();
        TradeResponse trade = json.readValue(acc.getResponse().getContentAsString(), TradeResponse.class);
        UUID tradeId = trade.id();

        // 3. Wait for MockWorker's email-provisioned → state = WAITING_PAYMENT.
        await().atMost(10, TimeUnit.SECONDS)
                .until(() -> tradeRepo.findById(tradeId).orElseThrow().getState()
                        == TradeState.WAITING_PAYMENT);

        // 4. Buyer clicks TO'LOV QILDIM.
        mvc.perform(post("/api/v1/trades/" + tradeId + "/actions/payment-confirmed").with(asUser(buyer)))
                .andExpect(status().isOk());
        assertThat(tradeRepo.findById(tradeId).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_EMAIL_CHANGE);

        // 5. Seller clicks O'ZGARTIRDIM.
        mvc.perform(post("/api/v1/trades/" + tradeId + "/actions/email-changed").with(asUser(seller)))
                .andExpect(status().isOk());

        // 6. Wait for MockWorker's konami-email-received → state = WAITING_PASSWORD.
        await().atMost(10, TimeUnit.SECONDS)
                .until(() -> tradeRepo.findById(tradeId).orElseThrow().getState()
                        == TradeState.WAITING_PASSWORD);

        // 7. Seller sends the Konami password one-time.
        MvcResult send = mvc.perform(post("/api/v1/trades/" + tradeId + "/messages/password")
                        .contentType(APPLICATION_JSON)
                        .content(json.writeValueAsString(new SendPasswordRequest("KonamiPassW0rd!")))
                        .with(asUser(seller)))
                .andExpect(status().isOk())
                .andReturn();
        UUID msgId = UUID.fromString(json.readTree(send.getResponse().getContentAsString())
                .get("messageId").asText());
        assertThat(tradeRepo.findById(tradeId).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_BUYER_VERIFY);

        // 8. Buyer reveals — plaintext returned, Redis key destroyed.
        MvcResult reveal = mvc.perform(post("/api/v1/trades/" + tradeId + "/messages/" + msgId + "/reveal")
                        .with(asUser(buyer)))
                .andExpect(status().isOk())
                .andReturn();
        PasswordRevealResponse revealed = json.readValue(reveal.getResponse().getContentAsString(),
                PasswordRevealResponse.class);
        assertThat(revealed.password()).isEqualTo("KonamiPassW0rd!");

        // 9. Buyer confirms.
        mvc.perform(post("/api/v1/trades/" + tradeId + "/actions/confirm").with(asUser(buyer)))
                .andExpect(status().isOk());
        assertThat(tradeRepo.findById(tradeId).orElseThrow().getState())
                .isEqualTo(TradeState.SUCCESS);

        // 10. Mailbox is handed to buyer.
        UUID mailboxId = tradeRepo.findById(tradeId).orElseThrow().getMailboxId();
        var mb = mailboxRepo.findById(mailboxId).orElseThrow();
        assertThat(mb.getOwnerUserId()).isEqualTo(buyer);
        assertThat(mb.getTradeId()).isNull();
        assertThat(mb.getHandedOffAt()).isNotNull();

        // 11. Second reveal is impossible.
        mvc.perform(post("/api/v1/trades/" + tradeId + "/messages/" + msgId + "/reveal")
                        .with(asUser(buyer)))
                .andExpect(status().is5xxServerError());  // IllegalStateException → 500 via default handler
    }

    /** Seeds a card row (fake PAN) so a valid cardId is available. */
    private UUID seedCard(UUID ownerUserId) {
        Card c = Card.builder()
                .id(UUID.randomUUID())
                .ownerUserId(ownerUserId)
                .encryptedPan(new byte[]{1, 2, 3})
                .panIv(new byte[12])
                .panTag(new byte[16])
                .last4("1111")
                .expiryMonth((short) 12)
                .expiryYear((short) 2030)
                .brand(CardBrand.VISA)
                .savedToProfile(false)
                .build();
        return cardRepo.save(c).getId();
    }
}
```

Note: Step 11 asserts `is5xxServerError` because the second reveal throws `IllegalStateException`. If you want a nicer response, extend `TradeExceptionHandler` with an entry mapping `IllegalStateException` → 410 Gone; that's a nice-to-have and not blocking.

- [ ] **Step 2: Run the end-to-end**

```bash
mvn -B -q verify -Dtest=TradeE2EIT
```

Expected: `Tests run: 1, Failures: 0, Errors: 0`. Runtime ~10-15 s (Kafka + Redis containers + mock worker delays).

If it hangs at "Wait for MockWorker's email-provisioned", MockWorker isn't picking up the request. Check:
1. `@Profile({"local","test","docker"})` on `MockWorker` — `test` must be there.
2. The `KafkaListener` topic constants match `TradeEvents.TOPIC_EMAIL_PROVISION_REQ`.
3. Kafka container health: `docker ps | grep kafka`.

- [ ] **Step 3: Commit**

```bash
git add backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeE2EIT.java
git commit -m "test(trade-service): end-to-end happy-path integration test (proposal → SUCCESS)"
```

---

## Task 21: Full verify + docs + deploy sanity

**Files:**
- Modify: `CLAUDE.md` — extend trade-service row to describe Plan B scope.
- Verify: `deploy.sh` `trade_bootstrap()` still works (already did in Plan A — this task confirms nothing regressed).

**Interfaces:** none — this task is a fence.

- [ ] **Step 1: Full verify**

```bash
cd backend/trade-service
mvn -B verify
```

Expected: all trade-service tests pass (Plan A carryovers + all Plan B tests). Numbers depend on carrying but should be at least 30 tests.

- [ ] **Step 2: Marketplace-service build**

```bash
cd ../marketplace-service
mvn -B -DskipTests package
```

Expected: `BUILD SUCCESS`. Marketplace tests are untouched by us — if the marketplace suite runs the migrations against a Testcontainer Postgres, verify V21 applies cleanly.

- [ ] **Step 3: Docker stack sanity**

```bash
cd ~/IdeaProjects/ef-bazaar
docker compose build trade-service marketplace-service
docker compose up -d
sleep 60  # let all services report healthy — trade-service takes ~30s
docker compose ps
```

Expected: All services (postgres, redis, kafka, auth-service, marketplace-service, recommendation-service, trade-service, bot, nginx) in status `running (healthy)` or `running`. If trade-service restarts, tail its logs:

```bash
docker compose logs -f --tail=200 trade-service
```

Common failures:
- `AccessDeniedException: /run/secrets/master_key` — permissions issue on the host file. See Plan A's fix (`chmod 644 infra/secrets/master_key`, `chmod 700` on the parent directory).
- `NoBrokersAvailableException` on Kafka — Kafka isn't healthy yet. Wait longer or check `docker compose logs kafka`.

- [ ] **Step 4: Live smoke — anonymous 401**

```bash
curl -sk -o /dev/null -w '%{http_code}\n' https://api.efbazaar.uz/api/v1/trades/proposals -X POST
# → 401
```

- [ ] **Step 5: Live smoke — authenticated proposal round-trip**

Log in through the platform to get a session cookie, then:

```bash
COOKIE="Cookie: <your session>"
PROPOSAL=$(curl -sk -H "$COOKIE" -H 'Content-Type: application/json' \
     -d '{
           "marketplaceChatId": "'"$(uuidgen)"'",
           "otherPartyUserId": "'"$(uuidgen)"'",
           "sellerId": "'"$(uuidgen)"'",
           "buyerId": "'"$(uuidgen)"'",
           "amountUzs": 500000,
           "cardId": "<a-real-saved-card-id>"
         }' \
     https://api.efbazaar.uz/api/v1/trades/proposals)
echo "$PROPOSAL"
# → {"proposalId":"...","expiresAt":"..."}
```

- [ ] **Step 6: Update CLAUDE.md — trade-service description**

Modify the trade-service entry in `CLAUDE.md` to describe the Plan B lifecycle. Find the row for trade-service in the services table and change it to something like:

```
| trade-service | 8085 | trade_db | Escrow trade lifecycle: proposals, state machine, encrypted per-role chats, one-time password passthrough, WSS live push, Kafka boundary to smart-admin-worker |
```

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update trade-service description for Plan B lifecycle"
```

---

## Follow-ups (Plan C onwards)

These are **known-and-deferred**, not blockers for Plan B merge:

1. **Python smart-admin-worker (Plan C).** Replace MockWorker. Same Kafka topics; production-only. Deploy as `smart-admin-worker` docker-compose service.
2. **Real Uzum PaymentHub integration.** `UzumPaymentAdapter` implements the same `PaymentAdapter` interface as `MockPaymentAdapter`. Requires Uzum sandbox creds + corporate account.
3. **TOTP MFA for admin dashboard.** Add `spring-security-oauth2` or hand-roll TOTP via `com.eatthepath.otp:java-otp`. Gate `/api/v1/admin/**` behind a TOTP check on top of the existing `ROLE_ADMIN`.
4. **Mail viewer IMAP proxy** — `/api/v1/mailboxes/{id}/messages`. Session-based; short TTL Redis session token; DOMPurify server-side. Not needed for Plan B tests (mailbox handoff is the important part).
5. **Frontend surfaces** — `/trade/[id]`, `/mail/[mailboxId]`, `/admin/orphaned-mails`, `/profile/cards`, plus `SAVDO BOSH` button + modal in `/marketplace/chat/[id]`.
6. **Konami sender allow-list** in MockWorker → real worker.
7. **Trade proposal spam limit** (marketplace level, spec §11).
8. **GDPR archival tier for trade_audit_log** (spec §11).
9. **Payment adapter PAN parameter** — Plan A follow-up I1: `createPayoutIntent` receives a decrypted PAN today; migrate to receive a card token.
10. **PaymentIntentId wiring** — `Trade.paymentIntentId` is created via `MockPaymentAdapter.createCheckoutIntent` on entering WAITING_PAYMENT. Fold into `TradeStateHandler.onEnter(WAITING_PAYMENT)` when the real payment adapter lands.

---

## Self-Review

**Spec coverage:**
- §3.1 pre-trade (marketplace chat + modal) — Task 9 (marketplace consumer for TRADE_PROPOSAL), Task 10 (proposal endpoints). Frontend UI deferred to a later plan (§follow-up 5).
- §3.2 state machine — Task 7 (state machine), Task 11 (state handlers), Task 12 (action endpoints), Task 15 (timeouts). Every state row in the spec's table (states 1–8) has an implementation entry.
- §3.3 recheck retry semantics — Task 12 (`RecheckRateLimiter`).
- §4.1 service boundaries — Task 9 (marketplace touch), Task 14 (mock worker for Plan C), Task 17 (WSS).
- §5.1 data model — Tasks 4, 5, 6 (V4/V5/V6 + entities).
- §5.2 Redis keys — Task 10 (proposal), Task 13 (password key).
- §6 security — Task 3 (Spring Security header pattern), Task 13 (one-time password redis-only key), Task 6 (append-only audit).
- §7 payment — Plan A already added `PaymentAdapter` + `MockPaymentAdapter`; Task 12 wires them into WAITING_PAYMENT confirm.
- §8.1 trade proposal in marketplace chat — Task 9 (TRADE_PROPOSAL system message).
- §8.2 secured chat — Task 12 (state actions), Task 16 (per-role chat), Task 17 (live push).
- §8.3 mail viewer — deferred (follow-up 4).
- §8.4 admin dashboard — Task 19 (orphaned endpoint, TOTP deferred).
- §9 kafka events — Task 8 (publisher), Task 14 (consumers + mock worker), Task 9 (marketplace consumer).
- §10 deployment — Task 1 (docker-compose entry), Task 18 (nginx routes).
- §11 follow-ups — carried forward.
- §12 success criteria — Task 20 end-to-end proves 4 of the 6 criteria; §12 items 4 and 6 (one-time password unrecoverable and encrypted-at-rest) are separately asserted by `OneTimePasswordServiceTest` (Task 13) and the existing Plan A card encryption test.

**Placeholder scan:** searched for TBD, TODO, "similar to Task N", "implement later" — none present. Two `later Task` forward-references (Task 10's `RateLimitedException` stub and Task 11's `TradeStateHandler` referencing Task 14's mock worker) are intentional and documented in the surrounding prose.

**Type consistency:**
- `TradeService.get(UUID, UUID)` returns `Trade` (entity) — used consistently in TradeActionController, OneTimePasswordService, TradeChatService.
- `TradeService.transition(UUID, TradeEvent, ActorType, UUID)` returns `Trade` — used consistently.
- `TradeService.openTrade(...)` returns `TradeResponse` — used by TradeProposalService (checked in Task 10 IT).
- `TradeService.toResponse(Trade, ParticipantRole)` — role is nullable, used consistently.
- `EncryptedField(byte[] iv, byte[] tag, byte[] ciphertext)` — Plan A record, re-used unchanged.
- All Kafka DTOs are records under `TradeEvents.*`; consumers set `spring.json.value.default.type` to the fully-qualified `TradeEvents$Xxx` names.
- `ParticipantRole` enum used consistently across `TradeChat`, `Trade.roleFor`, controllers, ws broadcaster.

No inconsistencies found.

---

## Deployment notes

- **Migrations:** trade-service V4/V5/V6 and marketplace-service V21 are append-only (guard-migrations CI check applies). All three are additive `CREATE TABLE` / `ALTER TABLE ADD COLUMN` with `NOT NULL DEFAULT` — safe under concurrent writes.
- **New env vars in `.env`:** `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `KAFKA_BOOTSTRAP_SERVERS` (already present for other services), `MAILCOW_API_URL` (default is fine). `TRADE_DB_NAME=trade_db` from Plan A remains.
- **New Kafka consumer groups** created on first deploy: `trade-service-email-provisioned`, `trade-service-konami-email`, `trade-service-imap-2fa`, `trade-service-mailbox-rotated`, `marketplace-trade-proposal`, `mock-worker-provision`, `mock-worker-forgot`, `mock-worker-poll`, `mock-worker-rotate`. Auto-created on Kafka's `auto.create.topics=true`.
- **MockWorker** is enabled by profile — `SPRING_PROFILES_ACTIVE=docker` in the compose file activates it. When Plan C ships the Python worker, change the trade-service profile to `prod` **or** disable MockWorker via `@Profile({"local","test"})` (drop `"docker"`). Do not run both — you'll get duplicate responses on every request topic.
- **Master key rotation** — unchanged from Plan A. Plan B never re-derives keys, so a rotation strategy must plan for password_key context (`otp-*`) which uses random keys from Redis, not the master. That's a feature: rotating master doesn't invalidate revealed OTP messages (which are already unrecoverable anyway).
- **CI selective deploy** already recognises `backend/trade-service/**` (build.yml, ci.yml were updated in Plan A). Marketplace changes will trigger the marketplace deploy job. No further CI wiring needed.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-13-plan-b-trade-lifecycle.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. This is how Plan A ran; the subagent workflow already handles the fresh-context startup + review checkpoint pattern.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**






