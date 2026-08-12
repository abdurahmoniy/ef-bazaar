# Payment Deposit Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user tops up their efBazaar wallet by transferring an exact amount to one of the platform's own Humo cards; a Telegram userbot observes the incoming transfer and the wallet is credited.

**Architecture:** A new `payment-service` (Spring Boot, port 8087, `payment_db`) owns wallets, a double-entry ledger, the platform's receiving cards, and invoices. A new `humo-userbot` (Python, Pyrogram, no database) stays logged into one Telegram account, watches the Humo bot's chat, and publishes every observed top-up to Kafka. payment-service matches each observation to exactly one live invoice by `(card, amount)` and credits the wallet; anything ambiguous goes to an admin queue and is never credited automatically.

**Tech Stack:** Java 21, Spring Boot 3.3.4, PostgreSQL 16, Flyway, Kafka, Testcontainers, MapStruct, Lombok. Python 3.12, Pyrogram, aiokafka, pydantic-settings, pytest. Next.js frontend.

**Spec:** `docs/superpowers/specs/2026-08-11-payment-service-design.md` — this plan implements **Plan 1** from §13.

## Global Constraints

- **Java 21, Spring Boot 3.3.4.** Parent POM `spring-boot-starter-parent:3.3.4`, same as trade-service.
- **Package root:** `uz.efbazaar.payment`.
- **All money is `BIGINT` tiyin.** 1 UZS = 100 tiyin. Never `double`, never `float`, anywhere.
- **Port 8087.** 8081 auth, 8082 marketplace, 8083 recommendation, 8084 bot, 8085 trade, 8086 smart-admin-worker.
- **Database `payment_db`.** Never connect to another service's database.
- **Identity comes from nginx headers only** — `X-User-Id`, `X-User-Roles`, `X-Telegram-Id`, `X-User-Name`. This service never sees a JWT. A user id is never read from a request body.
- **`/api/v1/admin/**` requires `ROLE_ADMIN`**, enforced in `SecurityConfig`.
- **Kafka topics** follow `efbazaar.<service>.<event>`, lowercase with hyphens.
- **Flyway `V<n>__*.sql` files are immutable once merged.** CI's `guard-migrations` job blocks edits. Need a change? Add `V<n+1>__`.
- **Never commit** `-Dapi.version=1.44`, `argLine`, or any local Docker workaround into a `pom.xml`.
- **Commit messages:** `feat(payment): ...`, `test(payment): ...`, imperative, lowercase after the colon. No AI attribution of any kind — no "Generated with", no `Co-Authored-By: Claude`.
- **Never stage** `frontend/package-lock.json` or `smart-admin-worker/tests/fixtures/crypto_vectors.json` unless the task explicitly changes them. Stage files by path; never `git add -A`.
- **Frontend copy is Uzbek**, matching the rest of the app. Stable package versions only — no RC, no beta. If `frontend/package.json` changes, commit `frontend/package-lock.json` with it.

## Build environment

Default `mvn`/`java` on the target machine resolve to JDK 25 and the project **does not compile**. Every Maven command must set JAVA_HOME:

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn clean verify -DargLine="-Dapi.version=1.44"
```

`-DargLine="-Dapi.version=1.44"` works around local Docker 29.6.2 versus Testcontainers' default API handshake. **Command line only — never in a pom.**

Run builds in the foreground and stay attached; a full `mvn clean verify` takes several minutes. Quote Maven's own printed `Tests run:` summary lines for surefire and failsafe separately; do not aggregate `target/surefire-reports/*.txt`.

## File structure

### backend/payment-service (new module)

| File | Responsibility |
|---|---|
| `pom.xml` | Module build; mirrors trade-service's dependency and Testcontainers setup |
| `Dockerfile` | Runtime image |
| `src/main/resources/application.yml` | Datasource, Flyway, Kafka, `payment.*` config |
| `.../PaymentApplication.java` | Spring entry point |
| `.../security/AuthenticatedUser.java` | Identity record from nginx headers |
| `.../security/HeaderAuthenticationFilter.java` | Reads the four identity headers |
| `.../security/SecurityConfig.java` | Filter chain; `/api/v1/admin/**` → `ROLE_ADMIN` |
| `.../config/PaymentExceptionHandler.java` | `@ControllerAdvice` mapping exceptions to status codes |
| `.../crypto/*` | PAN encryption, copied from trade-service |
| `.../wallet/domain/WalletAccount.java` | Wallet projection entity |
| `.../wallet/domain/LedgerAccount.java` | The six account enum |
| `.../wallet/domain/WalletTransaction.java`, `LedgerEntry.java` | Double-entry rows |
| `.../wallet/repository/*` | Spring Data repositories |
| `.../wallet/service/LedgerService.java` | The only writer of ledger entries; enforces zero-sum |
| `.../wallet/controller/WalletController.java` | `GET /api/v1/payments/wallet` |
| `.../card/domain/PlatformCard.java`, `CardBrand.java` | Receiving cards |
| `.../card/service/LuhnValidator.java` | Copied from trade-service (see Task 3) |
| `.../card/service/PlatformCardService.java` | CRUD + audit + ordering |
| `.../card/controller/AdminPlatformCardController.java` | `/api/v1/admin/payments/cards` |
| `.../invoice/domain/Invoice.java` | Invoice entity |
| `.../invoice/service/SlotAllocator.java` | The `(card, amount)` allocation algorithm |
| `.../invoice/service/InvoiceService.java` | Create, expire, read |
| `.../invoice/controller/InvoiceController.java` | `/api/v1/payments/invoices` |
| `.../observation/domain/CardCreditObservation.java` | Raw userbot captures |
| `.../observation/service/ByCardService.java` | Matching and crediting |
| `.../observation/controller/AdminObservationController.java` | Unmatched queue |
| `.../kafka/CardCreditConsumer.java`, `HeartbeatConsumer.java` | Inbound topics |
| `.../kafka/PaymentEventPublisher.java` | Outbound topics |
| `.../health/UserbotHealth.java` | Heartbeat freshness, gates invoice creation |
| `.../notify/BotClient.java`, `HttpBotClient.java` | The one seam to Telegram, via `bot` |
| `.../notify/AdminTelegramNotifier.java` | Renders invoice notices; never throws |
| `.../notify/InvoiceNoticeListener.java` | Posts/deletes notices after commit |

### bot (existing module)

| File | Change |
|---|---|
| `.../api/PaymentNoticeController.java` | New `/bot/internal/payments/notice` surface |
| `.../telegram/TelegramApiClient.java` | Add `deleteMessage` |
| `.../config/TelegramProperties.java` | Add the `payments` thread topic |

### humo-userbot (new service)

| File | Responsibility |
|---|---|
| `pyproject.toml`, `requirements.txt`, `Dockerfile` | Build |
| `humo_userbot/config.py` | Env-driven settings |
| `humo_userbot/parser.py` | **Pure** message → observation; no Telegram import |
| `humo_userbot/kafka_client.py` | aiokafka producer |
| `humo_userbot/main.py` | Pyrogram client, handler wiring, heartbeat loop |
| `tests/test_parser.py` | Parser tests over captured real messages |

### frontend

| File | Responsibility |
|---|---|
| `src/lib/payment-types.ts` | Shared response types |
| `src/lib/payment-client.ts` | Browser-side calls |
| `src/lib/payment-server.ts` | SSR calls |
| `src/app/hamyon/page.tsx` | Wallet page |
| `src/components/payment/top-up-form.tsx` | Amount entry |
| `src/components/payment/invoice-panel.tsx` | Card, amount, countdown, warning |
| `src/app/admin/payments/cards/page.tsx` | Card manager |
| `src/components/payment/platform-card.tsx` | One card, rendered as a card |
| `src/app/admin/payments/unmatched/page.tsx` | Unmatched credit queue |

### Shared / infrastructure

| File | Change |
|---|---|
| `docker-compose.yml` | Add `payment-service` and `humo-userbot` |
| `nginx/conf.d/api.conf:144` | Add `payments` and `admin/payments` to the trade-service regex? **No** — add a separate location block for payment-service |
| `.github/workflows/deploy.yml` | Add path-based deploy jobs |

## Dependency graph

```
Task 1 (skeleton + wallets/ledger schema)
   ├── Task 2 (LedgerService)
   │      ├── Task 7 (matching + crediting)
   │      └── Task 9 (wallet page)
   ├── Task 3 (platform cards)
   │      ├── Task 4 (invoices + slot allocation)
   │      └── Task 10 (admin card manager UI)
   └── Task 5 (expiry scheduler + heartbeat gate)
Task 6 (humo-userbot)  ── independent, needs only the topic contract from Task 1
Task 7 needs Tasks 2, 4, 6
Task 8 (unmatched queue) needs Task 7
Task 9 (wallet + top-up UI) needs Tasks 2, 4
Task 11 (unmatched queue UI) needs Task 8
Task 12 (admin Telegram topic) needs Tasks 4, 5, 7
```

## Migration inventory

`payment_db` starts empty; this plan owns `V1`–`V5`.

| Migration | Task | Contents |
|---|---|---|
| `V1__wallets_and_ledger.sql` | 1 | `wallet_accounts`, `wallet_transactions`, `ledger_entries` |
| `V2__platform_cards.sql` | 3 | `platform_cards`, `platform_card_audit` |
| `V3__invoices.sql` | 4 | `invoices` with both partial unique indexes |
| `V4__card_credit_observations.sql` | 7 | `card_credit_observations` |
| `V5__invoice_admin_notice.sql` | 12 | `invoices.admin_notice_message_id` |

## New Kafka topics

| Topic | Producer | Consumer | Task |
|---|---|---|---|
| `efbazaar.payment.card-credit-observed` | humo-userbot | payment-service | 6, 7 |
| `efbazaar.payment.userbot-heartbeat` | humo-userbot | payment-service | 6, 5 |
| `efbazaar.payment.deposit-credited` | payment-service | (marketplace, later) | 7 |

---

### Task 1: payment-service skeleton, security, and the ledger schema

**Files:**
- Create: `backend/payment-service/pom.xml`
- Create: `backend/payment-service/Dockerfile`
- Create: `backend/payment-service/src/main/resources/application.yml`
- Create: `backend/payment-service/src/main/java/uz/efbazaar/payment/PaymentApplication.java`
- Create: `backend/payment-service/src/main/java/uz/efbazaar/payment/security/AuthenticatedUser.java`
- Create: `backend/payment-service/src/main/java/uz/efbazaar/payment/security/HeaderAuthenticationFilter.java`
- Create: `backend/payment-service/src/main/java/uz/efbazaar/payment/security/SecurityConfig.java`
- Create: `backend/payment-service/src/main/resources/db/migration/V1__wallets_and_ledger.sql`
- Create: `backend/payment-service/src/test/java/uz/efbazaar/payment/testsupport/AbstractPostgresIT.java`
- Create: `backend/payment-service/src/test/java/uz/efbazaar/payment/testsupport/AbstractIntegrationIT.java`
- Create: `backend/payment-service/src/test/java/uz/efbazaar/payment/testsupport/AuthHeaderRequestPostProcessor.java`
- Create: `backend/payment-service/src/test/java/uz/efbazaar/payment/PaymentApplicationTests.java`
- Create: `backend/payment-service/src/test/java/uz/efbazaar/payment/wallet/LedgerSchemaIT.java`
- Modify: `docker-compose.yml`
- Modify: `nginx/conf.d/api.conf`

**Interfaces:**
- Produces:
  - `uz.efbazaar.payment.security.AuthenticatedUser` — `record(UUID userId, Long telegramId, List<String> roles, String displayName)` with `boolean hasRole(String)`
  - Test bases `AbstractPostgresIT` (Postgres only) and `AbstractIntegrationIT` (adds Kafka)
  - `AuthHeaderRequestPostProcessor.asUser(UUID)` and `.asAdmin()` for MockMvc
  - Tables `wallet_accounts`, `wallet_transactions`, `ledger_entries`

**Context:** This task produces a service that boots, authenticates from headers, and has the ledger tables — nothing else. Everything after it assumes these exist.

Copy the security package from `backend/trade-service/src/main/java/uz/efbazaar/trade/security/` (`AuthenticatedUser`, `HeaderAuthenticationFilter`, `SecurityConfig`), changing the package to `uz.efbazaar.payment.security` and removing the `/ws/trade/**` matcher, which has no equivalent here. Do **not** copy `AuthSummaryClient` — this service does not need display names.

Copy the test bases from `backend/trade-service/src/test/java/uz/efbazaar/trade/testsupport/`, changing the package and the database name to `payment_db_test`. Drop the master-key writing from `AbstractPostgresIT` for now; Task 3 adds it back when the PAN encryption arrives.

- [ ] **Step 1: Create the module and make it boot**

`backend/payment-service/pom.xml` — copy `backend/trade-service/pom.xml` and change `<artifactId>` to `payment-service`, `<name>` to `payment-service`, and the `<description>`. Keep every dependency and the whole `<dependencyManagement>` Testcontainers BOM block verbatim: the comment in that file explains that without the BOM import, Spring Boot 3.3.4 pins Testcontainers to 1.19.8 and the explicit versions only apply to three artifacts, not their transitives. Remove the `spring-boot-starter-websocket` dependency if present — this service has no WebSocket surface.

`PaymentApplication.java`:

```java
package uz.efbazaar.payment;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class PaymentApplication {
    public static void main(String[] args) {
        SpringApplication.run(PaymentApplication.class, args);
    }
}
```

`application.yml`:

```yaml
spring:
  application:
    name: payment-service
  profiles:
    active: ${SPRING_PROFILES_ACTIVE:local}

  datasource:
    url: jdbc:postgresql://${POSTGRES_HOST:localhost}:${POSTGRES_PORT:5432}/${POSTGRES_DB:payment_db}
    username: ${POSTGRES_USER:efbazaar}
    password: ${POSTGRES_PASSWORD:efbazaar}
    driver-class-name: org.postgresql.Driver

  jpa:
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
    open-in-view: false

  flyway:
    enabled: true
    baseline-on-migrate: true
    locations: classpath:db/migration

  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
    consumer:
      group-id: payment-service
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      properties:
        spring.json.trusted.packages: "uz.efbazaar.*"

server:
  port: 8087

management:
  endpoints:
    web:
      exposure:
        include: health

payment:
  deposit:
    minimum-uzs: 1000
    invoice-ttl-minutes: 15
    bump-step-uzs: 100
    max-bump-uzs: 1000
  userbot:
    heartbeat-timeout-seconds: 180
```

- [ ] **Step 2: Write the failing schema test**

`src/test/java/uz/efbazaar/payment/wallet/LedgerSchemaIT.java`:

```java
package uz.efbazaar.payment.wallet;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class LedgerSchemaIT extends AbstractPostgresIT {

    @Autowired JdbcTemplate jdbc;

    @Test
    void walletBalancesCannotGoNegative() {
        jdbc.update("INSERT INTO wallet_accounts (user_id) VALUES (gen_random_uuid())");

        assertThatThrownBy(() -> jdbc.update(
                "UPDATE wallet_accounts SET available_tiyin = -1"))
                .hasMessageContaining("chk_wallet_non_negative");
    }

    @Test
    void aLedgerEntryCannotBeZero() {
        String txId = jdbc.queryForObject("""
                INSERT INTO wallet_transactions (id, kind, idempotency_key)
                VALUES (gen_random_uuid(), 'DEPOSIT', 'schema-test-1')
                RETURNING id::text
                """, String.class);

        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO ledger_entries (transaction_id, account, amount_tiyin)
                VALUES (?::uuid, 'PLATFORM_CARDS', 0)
                """, txId))
                .hasMessageContaining("chk_entry_non_zero");
    }

    @Test
    void theIdempotencyKeyIsUnique() {
        jdbc.update("""
                INSERT INTO wallet_transactions (id, kind, idempotency_key)
                VALUES (gen_random_uuid(), 'DEPOSIT', 'schema-test-dup')
                """);

        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO wallet_transactions (id, kind, idempotency_key)
                VALUES (gen_random_uuid(), 'DEPOSIT', 'schema-test-dup')
                """))
                .hasMessageContaining("wallet_transactions_idempotency_key_key");
    }

    @Test
    void everyLedgerAccountNameIsAccepted() {
        String txId = jdbc.queryForObject("""
                INSERT INTO wallet_transactions (id, kind, idempotency_key)
                VALUES (gen_random_uuid(), 'ADJUSTMENT', 'schema-test-accounts')
                RETURNING id::text
                """, String.class);

        for (String account : new String[]{
                "PLATFORM_CARDS", "USER_AVAILABLE", "USER_HELD",
                "WITHDRAW_PENDING", "PLATFORM_REVENUE", "PLATFORM_FEES"}) {
            jdbc.update("""
                    INSERT INTO ledger_entries (transaction_id, account, amount_tiyin)
                    VALUES (?::uuid, ?, 1)
                    """, txId, account);
        }

        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM ledger_entries WHERE transaction_id = ?::uuid",
                Integer.class, txId);
        assertThat(count).isEqualTo(6);
    }
}
```

The last test exists because the account column is a plain `VARCHAR` with no CHECK: it pins the six names the Java enum will use, so a rename on one side fails loudly rather than silently writing an account nothing reads.

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn verify -Dit.test=LedgerSchemaIT -DargLine="-Dapi.version=1.44"
```

Expected: FAIL — the migration does not exist, so Flyway creates no tables and every insert errors with `relation "wallet_accounts" does not exist`.

- [ ] **Step 4: Write the migration**

`src/main/resources/db/migration/V1__wallets_and_ledger.sql`:

```sql
-- payment-service V1 — wallets and the double-entry ledger.
--
-- wallet_accounts is a PROJECTION of ledger_entries, not the source of truth.
-- It exists so a balance read is one row rather than an aggregate over the
-- whole ledger. LedgerService is the only writer of both and keeps them equal.

CREATE TABLE wallet_accounts (
    user_id                  UUID PRIMARY KEY,
    available_tiyin          BIGINT      NOT NULL DEFAULT 0,
    held_tiyin               BIGINT      NOT NULL DEFAULT 0,
    withdraw_pending_tiyin   BIGINT      NOT NULL DEFAULT 0,
    lifetime_deposited_tiyin BIGINT      NOT NULL DEFAULT 0,
    lifetime_earned_tiyin    BIGINT      NOT NULL DEFAULT 0,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_wallet_non_negative CHECK (
        available_tiyin >= 0
        AND held_tiyin >= 0
        AND withdraw_pending_tiyin >= 0)
);

CREATE TABLE wallet_transactions (
    id              UUID PRIMARY KEY,
    kind            VARCHAR(24)  NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by      UUID,
    note            TEXT
);

CREATE TABLE ledger_entries (
    id             BIGSERIAL PRIMARY KEY,
    transaction_id UUID        NOT NULL REFERENCES wallet_transactions(id),
    account        VARCHAR(24) NOT NULL,
    user_id        UUID,
    amount_tiyin   BIGINT      NOT NULL,
    CONSTRAINT chk_entry_non_zero CHECK (amount_tiyin <> 0)
);

CREATE INDEX ix_ledger_entries_tx   ON ledger_entries (transaction_id);
CREATE INDEX ix_ledger_entries_user ON ledger_entries (user_id, account)
    WHERE user_id IS NOT NULL;
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn verify -Dit.test=LedgerSchemaIT -DargLine="-Dapi.version=1.44"
```

Expected: PASS, 4/4.

- [ ] **Step 6: Add the context-loads test**

`src/test/java/uz/efbazaar/payment/PaymentApplicationTests.java`:

```java
package uz.efbazaar.payment;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.payment.testsupport.AbstractIntegrationIT;

@SpringBootTest
class PaymentApplicationTests extends AbstractIntegrationIT {

    @Test
    void contextLoads() {
    }
}
```

- [ ] **Step 7: Wire docker-compose**

Add to `docker-compose.yml`, modelled on the existing `trade-service` block (line ~237). Use `${PAYMENT_DB_NAME}` for the database and add that variable to `.env.example` if one exists:

```yaml
  payment-service:
    image: ${IMAGE_REGISTRY:-ghcr.io}/${IMAGE_NAMESPACE:-abdurahmoniy/efbazaar}-payment-service:${IMAGE_TAG:-latest}
    build:
      context: ./backend/payment-service
    container_name: efbazaar-payment
    restart: unless-stopped
    environment:
      JAVA_OPTS: "-Xms96m -Xmx280m -XX:MaxMetaspaceSize=160m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -XX:+ExitOnOutOfMemoryError -Djava.security.egd=file:/dev/./urandom"
      SPRING_PROFILES_ACTIVE: ${SPRING_PROFILES_ACTIVE}
      POSTGRES_HOST: ${POSTGRES_HOST}
      POSTGRES_PORT: ${POSTGRES_PORT}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${PAYMENT_DB_NAME}
      KAFKA_BOOTSTRAP_SERVERS: ${KAFKA_BOOTSTRAP_SERVERS}
    depends_on:
      - postgres
      - kafka
    networks:
      - efbazaar-net
```

Match the surrounding blocks' `networks:` and `depends_on:` style exactly — read them first rather than assuming this snippet matches.

- [ ] **Step 8: Wire nginx**

In `nginx/conf.d/api.conf`, add a location block for payment-service **immediately after** the trade-service block that ends around line 173. Copy that block verbatim and change three things: the regex, the comment, and the `proxy_pass` upstream variable.

```nginx
    # ----- payment-service (wallet, deposits, platform cards) --------
    location ~ ^/api/v1/(payments|admin/payments)(/|$) {
        auth_basic off;

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

        proxy_pass http://$backend_payment$request_uri;
        include /etc/nginx/conf.d/proxy-common.inc;
    }
```

`$backend_payment` must be defined alongside the other upstream variables. Find them in `nginx/conf.d/backends.inc` and add an entry pointing at `payment-service:8087`, matching the format of `$backend_trade`.

**A second nginx block is also required, in a different file.** `api.conf` serves `api.efbazaar.uz`, the public API host. The **frontend** reaches backends by a different path: both its browser proxy routes and its server-side rendering call `http://nginx:8080/api/<service>/...`, and nginx strips the service prefix. That is why `mailbox-admin-server.ts` uses `/trade/v1/admin/mailboxes` rather than `/v1/admin/mailboxes`.

Add to `nginx/conf.d/efbazaar.conf`, immediately after the `location /api/trade/` block (around line 341), copying its shape exactly:

```nginx
    # ---------- payment-service (frontend proxy target) ----------
    # Frontend calls arrive as `/api/payment/v1/payments/wallet`; strip the
    # `/payment/` prefix and forward to payment-service, which expects
    # `/api/v1/payments/wallet`.
    location /api/payment/ {
        auth_request /_auth_verify;
        error_page 401 = @trade_unauth_internal;

        auth_request_set $user_id      $upstream_http_x_user_id;
        auth_request_set $user_roles   $upstream_http_x_user_roles;
        auth_request_set $telegram_id  $upstream_http_x_telegram_id;
        auth_request_set $user_name    $upstream_http_x_user_name;

        proxy_set_header X-User-Id     $user_id;
        proxy_set_header X-User-Roles  $user_roles;
        proxy_set_header X-Telegram-Id $telegram_id;
        proxy_set_header X-User-Name   $user_name;

        rewrite ^/api/payment/(.*)$ /api/$1 break;
        proxy_pass http://$backend_payment$uri$is_args$args;
        include /etc/nginx/conf.d/proxy-common.inc;
    }
```

`@trade_unauth_internal` is reused deliberately — it returns a plain 401 JSON body and is not
trade-specific. Do not add a second copy of it; nginx rejects a duplicate named location.

`limit_except` deliberately stays `GET POST DELETE OPTIONS` — the payment API is shaped around those verbs, exactly as trade-service's is. Do not add `PUT`.

Validate the config. `docker compose exec nginx nginx -t` if the stack is up; otherwise mount the repo config into a throwaway container. Note that a bare `docker run -v "$PWD/nginx:/etc/nginx:ro" nginx:alpine nginx -t` **fails for unrelated reasons** — it hides the image's `mime.types`, and the config also needs `conf.d/secrets.inc` (generated at container start), a resolvable `host.docker.internal`, and TLS certificates. Mount `nginx.conf` and `conf.d` individually, add a stub `secrets.inc` containing `set $efbazaar_internal_secret "test";`, pass `--add-host host.docker.internal:127.0.0.1`, and supply self-signed certs for the three configured domains.

- [ ] **Step 9: Run the full suite**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn clean verify -DargLine="-Dapi.version=1.44"
```

Expected: BUILD SUCCESS. Record the surefire and failsafe counts — they are the baseline for every later task.

- [ ] **Step 10: Commit**

```bash
git add backend/payment-service docker-compose.yml nginx/conf.d/api.conf nginx/conf.d/backends.inc
git commit -m "feat(payment): add the payment-service skeleton and the ledger schema"
```

---

### Task 2: LedgerService — double-entry posting

**Files:**
- Create: `backend/payment-service/src/main/java/uz/efbazaar/payment/wallet/domain/LedgerAccount.java`
- Create: `.../wallet/domain/WalletAccount.java`
- Create: `.../wallet/domain/WalletTransaction.java`
- Create: `.../wallet/domain/LedgerEntry.java`
- Create: `.../wallet/domain/TransactionKind.java`
- Create: `.../wallet/repository/WalletAccountRepository.java`
- Create: `.../wallet/repository/WalletTransactionRepository.java`
- Create: `.../wallet/repository/LedgerEntryRepository.java`
- Create: `.../wallet/service/LedgerService.java`
- Create: `.../wallet/dto/WalletResponse.java`
- Create: `.../wallet/controller/WalletController.java`
- Test: `backend/payment-service/src/test/java/uz/efbazaar/payment/wallet/LedgerServiceIT.java`

**Interfaces:**
- Consumes: the `V1` tables and test bases from Task 1.
- Produces:
  - `enum LedgerAccount { PLATFORM_CARDS, USER_AVAILABLE, USER_HELD, WITHDRAW_PENDING, PLATFORM_REVENUE, PLATFORM_FEES }`
  - `enum TransactionKind { DEPOSIT, TRADE_HOLD, TRADE_SETTLE, TRADE_RELEASE, WITHDRAW_RESERVE, WITHDRAW_FULFIL, WITHDRAW_CANCEL, ADJUSTMENT }`
  - `record Posting(LedgerAccount account, UUID userId, long amountTiyin)` — nested in `LedgerService`
  - `LedgerService.post(TransactionKind kind, String idempotencyKey, UUID createdBy, String note, List<Posting> postings)` → `UUID` transaction id; **idempotent**: a repeat of the same key returns the existing id and writes nothing
  - `LedgerService.balanceOf(UUID userId)` → `WalletAccount`, creating a zeroed row on first read
  - `record WalletResponse(long availableTiyin, long heldTiyin, long withdrawPendingTiyin, long lifetimeDepositedTiyin, long lifetimeEarnedTiyin)`
  - `record WalletEntryResponse(UUID transactionId, TransactionKind kind, LedgerAccount account, long amountTiyin, Instant createdAt)`
  - `LedgerService.historyOf(UUID userId, int limit)` → `List<WalletEntryResponse>`, newest first
  - `GET /api/v1/payments/wallet` → `WalletResponse` for the caller
  - `GET /api/v1/payments/wallet/transactions?limit=` → `List<WalletEntryResponse>`

**Context:** `LedgerService.post` is the only method in the codebase that writes `ledger_entries` or mutates `wallet_accounts`. Everything else — deposits, escrow, withdrawals — calls it. It enforces two things: the postings sum to zero, and the wallet projection moves in step with the entries.

Sign convention: **positive is a debit, negative is a credit.** A deposit of 100 000 tiyin to a user reads `Posting(PLATFORM_CARDS, null, +100_000)` and `Posting(USER_AVAILABLE, userId, -100_000)`.

Projection mapping — a **credit** (negative) to a user account increases what the user owns, because these are liability accounts:

| Account | Wallet column | On credit (negative amount) |
|---|---|---|
| `USER_AVAILABLE` | `available_tiyin` | increases by `-amount` |
| `USER_HELD` | `held_tiyin` | increases by `-amount` |
| `WITHDRAW_PENDING` | `withdraw_pending_tiyin` | increases by `-amount` |

Platform accounts have no projection row.

- [ ] **Step 1: Write the failing test**

`src/test/java/uz/efbazaar/payment/wallet/LedgerServiceIT.java`:

```java
package uz.efbazaar.payment.wallet;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class LedgerServiceIT extends AbstractPostgresIT {

    @Autowired LedgerService ledger;
    @Autowired JdbcTemplate jdbc;

    @Test
    void aDepositCreditsTheWalletAndBalancesTheBooks() {
        UUID user = UUID.randomUUID();

        UUID txId = ledger.post(TransactionKind.DEPOSIT, "dep-" + user, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 100_000),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -100_000)));

        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(100_000);

        Long sum = jdbc.queryForObject(
                "SELECT sum(amount_tiyin) FROM ledger_entries WHERE transaction_id = ?",
                Long.class, txId);
        assertThat(sum).as("every transaction must sum to zero").isZero();
    }

    @Test
    void postingsThatDoNotSumToZeroAreRejected() {
        UUID user = UUID.randomUUID();

        assertThatThrownBy(() -> ledger.post(
                TransactionKind.DEPOSIT, "unbalanced-" + user, null, null, List.of(
                        new Posting(LedgerAccount.PLATFORM_CARDS, null, 100_000),
                        new Posting(LedgerAccount.USER_AVAILABLE, user, -99_000))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("sum to zero");

        assertThat(ledger.balanceOf(user).getAvailableTiyin())
                .as("a rejected posting must leave nothing behind")
                .isZero();
    }

    @Test
    void theSameIdempotencyKeyPostsOnce() {
        UUID user = UUID.randomUUID();
        List<Posting> postings = List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 50_000),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -50_000));

        UUID first  = ledger.post(TransactionKind.DEPOSIT, "idem-" + user, null, null, postings);
        UUID second = ledger.post(TransactionKind.DEPOSIT, "idem-" + user, null, null, postings);

        assertThat(second).isEqualTo(first);
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(50_000);
    }

    @Test
    void theBumpCaseBalances() {
        // 100 100 arrives on the card, 100 000 reaches the user, 100 is revenue.
        UUID user = UUID.randomUUID();

        UUID txId = ledger.post(TransactionKind.DEPOSIT, "bump-" + user, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 100_100),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -100_000),
                new Posting(LedgerAccount.PLATFORM_REVENUE, null, -100)));

        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(100_000);
        Long sum = jdbc.queryForObject(
                "SELECT sum(amount_tiyin) FROM ledger_entries WHERE transaction_id = ?",
                Long.class, txId);
        assertThat(sum).isZero();
    }

    @Test
    void aHoldMovesMoneyBetweenTheUsersOwnBuckets() {
        UUID user = UUID.randomUUID();
        ledger.post(TransactionKind.DEPOSIT, "hold-dep-" + user, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 100_000),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -100_000)));

        ledger.post(TransactionKind.TRADE_HOLD, "hold-" + user, null, null, List.of(
                new Posting(LedgerAccount.USER_AVAILABLE, user, 80_000),
                new Posting(LedgerAccount.USER_HELD, user, -80_000)));

        var w = ledger.balanceOf(user);
        assertThat(w.getAvailableTiyin()).isEqualTo(20_000);
        assertThat(w.getHeldTiyin()).isEqualTo(80_000);
    }

    @Test
    void spendingMoreThanIsAvailableIsRefusedByTheDatabase() {
        UUID user = UUID.randomUUID();

        assertThatThrownBy(() -> ledger.post(
                TransactionKind.TRADE_HOLD, "overdraw-" + user, null, null, List.of(
                        new Posting(LedgerAccount.USER_AVAILABLE, user, 1),
                        new Posting(LedgerAccount.USER_HELD, user, -1))))
                .hasMessageContaining("chk_wallet_non_negative");
    }

    @Test
    void balanceOfCreatesAZeroedWalletOnFirstRead() {
        UUID stranger = UUID.randomUUID();
        var w = ledger.balanceOf(stranger);
        assertThat(w.getAvailableTiyin()).isZero();
        assertThat(w.getHeldTiyin()).isZero();
    }

    @Test
    void historyReturnsOnlyTheCallersOwnEntriesNewestFirst() {
        UUID mine = UUID.randomUUID();
        UUID theirs = UUID.randomUUID();

        ledger.post(TransactionKind.DEPOSIT, "hist-1-" + mine, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 100_000),
                new Posting(LedgerAccount.USER_AVAILABLE, mine, -100_000)));
        ledger.post(TransactionKind.TRADE_HOLD, "hist-2-" + mine, null, null, List.of(
                new Posting(LedgerAccount.USER_AVAILABLE, mine, 30_000),
                new Posting(LedgerAccount.USER_HELD, mine, -30_000)));
        ledger.post(TransactionKind.DEPOSIT, "hist-other-" + theirs, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 500),
                new Posting(LedgerAccount.USER_AVAILABLE, theirs, -500)));

        var history = ledger.historyOf(mine, 50);

        assertThat(history).hasSize(3);   // one deposit credit + two hold entries
        assertThat(history).allSatisfy(e ->
                assertThat(e.kind()).isIn(TransactionKind.DEPOSIT, TransactionKind.TRADE_HOLD));
        assertThat(ledger.historyOf(theirs, 50))
                .as("one user's history must never contain another's")
                .hasSize(1);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn verify -Dit.test=LedgerServiceIT -DargLine="-Dapi.version=1.44"
```

Expected: compilation failure — `LedgerService` does not exist.

- [ ] **Step 3: Write the enums and entities**

`wallet/domain/LedgerAccount.java`:

```java
package uz.efbazaar.payment.wallet.domain;

/**
 * The six accounts. Names are written into {@code ledger_entries.account} as
 * plain text, so a rename here is a data migration, not a refactor.
 */
public enum LedgerAccount {
    /** Asset — real UZS sitting on the platform's Humo cards. */
    PLATFORM_CARDS,
    /** Liability — owed to a user, spendable. */
    USER_AVAILABLE,
    /** Liability — owed to a user, frozen by an active trade. */
    USER_HELD,
    /** Liability — owed to a user, payout in progress. */
    WITHDRAW_PENDING,
    /** Equity — commission and disambiguation bumps. */
    PLATFORM_REVENUE,
    /** Expense — bank transfer fees the platform absorbs. */
    PLATFORM_FEES;

    /** True when entries on this account belong to a specific user. */
    public boolean isUserScoped() {
        return this == USER_AVAILABLE || this == USER_HELD || this == WITHDRAW_PENDING;
    }
}
```

`wallet/domain/TransactionKind.java`:

```java
package uz.efbazaar.payment.wallet.domain;

public enum TransactionKind {
    DEPOSIT,
    TRADE_HOLD,
    TRADE_SETTLE,
    TRADE_RELEASE,
    WITHDRAW_RESERVE,
    WITHDRAW_FULFIL,
    WITHDRAW_CANCEL,
    ADJUSTMENT
}
```

`wallet/domain/WalletAccount.java`:

```java
package uz.efbazaar.payment.wallet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "wallet_accounts")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WalletAccount {

    @Id
    @Column(name = "user_id", columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID userId;

    @Column(name = "available_tiyin", nullable = false)
    private long availableTiyin;

    @Column(name = "held_tiyin", nullable = false)
    private long heldTiyin;

    @Column(name = "withdraw_pending_tiyin", nullable = false)
    private long withdrawPendingTiyin;

    @Column(name = "lifetime_deposited_tiyin", nullable = false)
    private long lifetimeDepositedTiyin;

    @Column(name = "lifetime_earned_tiyin", nullable = false)
    private long lifetimeEarnedTiyin;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PreUpdate
    void touch() {
        this.updatedAt = Instant.now();
    }
}
```

`wallet/domain/WalletTransaction.java`:

```java
package uz.efbazaar.payment.wallet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "wallet_transactions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WalletTransaction {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private TransactionKind kind;

    @Column(name = "idempotency_key", nullable = false, length = 128, updatable = false)
    private String idempotencyKey;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column
    private String note;
}
```

`wallet/domain/LedgerEntry.java`:

```java
package uz.efbazaar.payment.wallet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "ledger_entries")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LedgerEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "transaction_id", nullable = false)
    private UUID transactionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private LedgerAccount account;

    @Column(name = "user_id")
    private UUID userId;

    /** Signed: positive debits, negative credits. */
    @Column(name = "amount_tiyin", nullable = false)
    private long amountTiyin;
}
```

- [ ] **Step 4: Write the repositories**

`wallet/repository/WalletAccountRepository.java`:

```java
package uz.efbazaar.payment.wallet.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.payment.wallet.domain.WalletAccount;

import java.util.Optional;
import java.util.UUID;

public interface WalletAccountRepository extends JpaRepository<WalletAccount, UUID> {

    /**
     * Row lock for the duration of a posting. Two concurrent postings against
     * the same wallet must serialise, or the projection drifts from the ledger.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT w FROM WalletAccount w WHERE w.userId = :userId")
    Optional<WalletAccount> findByIdForUpdate(@Param("userId") UUID userId);
}
```

`wallet/repository/WalletTransactionRepository.java`:

```java
package uz.efbazaar.payment.wallet.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.wallet.domain.WalletTransaction;

import java.util.Optional;
import java.util.UUID;

public interface WalletTransactionRepository extends JpaRepository<WalletTransaction, UUID> {
    Optional<WalletTransaction> findByIdempotencyKey(String idempotencyKey);
}
```

`wallet/repository/LedgerEntryRepository.java`:

```java
package uz.efbazaar.payment.wallet.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.wallet.domain.LedgerEntry;

import java.util.List;
import java.util.UUID;

public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, Long> {
    List<LedgerEntry> findByTransactionId(UUID transactionId);
}
```

- [ ] **Step 5: Write LedgerService**

`wallet/service/LedgerService.java`:

```java
package uz.efbazaar.payment.wallet.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.LedgerEntry;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.domain.WalletAccount;
import uz.efbazaar.payment.wallet.domain.WalletTransaction;
import uz.efbazaar.payment.wallet.repository.LedgerEntryRepository;
import uz.efbazaar.payment.wallet.repository.WalletAccountRepository;
import uz.efbazaar.payment.wallet.repository.WalletTransactionRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The only writer of {@code ledger_entries} and the only mutator of
 * {@code wallet_accounts}. Every money movement in the platform goes through
 * {@link #post}.
 *
 * <p>Sign convention: positive debits, negative credits. User accounts are
 * liabilities, so a credit (negative) increases what the user owns.
 *
 * <p>Two invariants are enforced here rather than hoped for: the postings of
 * one transaction sum to zero, and the wallet projection moves in the same
 * transaction as the entries. A negative balance is caught by
 * {@code chk_wallet_non_negative} in the database, so a bug aborts the
 * transaction instead of corrupting a balance.
 */
@Service
@RequiredArgsConstructor
public class LedgerService {

    private final WalletAccountRepository wallets;
    private final WalletTransactionRepository transactions;
    private final LedgerEntryRepository entries;

    public record Posting(LedgerAccount account, UUID userId, long amountTiyin) {}

    @Transactional
    public UUID post(TransactionKind kind, String idempotencyKey, UUID createdBy,
                     String note, List<Posting> postings) {

        // Idempotency first: a repeat writes nothing and returns the original.
        var existing = transactions.findByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            return existing.get().getId();
        }

        if (postings == null || postings.isEmpty()) {
            throw new IllegalArgumentException("A transaction needs at least one posting");
        }
        long total = postings.stream().mapToLong(Posting::amountTiyin).sum();
        if (total != 0) {
            throw new IllegalArgumentException(
                    "Postings must sum to zero, got " + total + " for key " + idempotencyKey);
        }
        for (Posting p : postings) {
            if (p.account().isUserScoped() && p.userId() == null) {
                throw new IllegalArgumentException(p.account() + " requires a userId");
            }
            if (!p.account().isUserScoped() && p.userId() != null) {
                throw new IllegalArgumentException(p.account() + " must not carry a userId");
            }
        }

        UUID txId = UUID.randomUUID();
        transactions.save(WalletTransaction.builder()
                .id(txId)
                .kind(kind)
                .idempotencyKey(idempotencyKey)
                .createdAt(Instant.now())
                .createdBy(createdBy)
                .note(note)
                .build());

        for (Posting p : postings) {
            entries.save(LedgerEntry.builder()
                    .transactionId(txId)
                    .account(p.account())
                    .userId(p.userId())
                    .amountTiyin(p.amountTiyin())
                    .build());
            applyToProjection(kind, p);
        }
        // Force the wallet CHECK constraints to fire inside this transaction
        // rather than at an arbitrary later flush.
        wallets.flush();
        return txId;
    }

    @Transactional
    public WalletAccount balanceOf(UUID userId) {
        return wallets.findById(userId).orElseGet(() -> wallets.save(WalletAccount.builder()
                .userId(userId)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build()));
    }

    private void applyToProjection(TransactionKind kind, Posting p) {
        if (!p.account().isUserScoped()) {
            return;
        }
        WalletAccount w = wallets.findByIdForUpdate(p.userId())
                .orElseGet(() -> wallets.save(WalletAccount.builder()
                        .userId(p.userId())
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build()));

        // A credit is negative and increases the user's holding.
        long delta = -p.amountTiyin();
        switch (p.account()) {
            case USER_AVAILABLE -> {
                w.setAvailableTiyin(w.getAvailableTiyin() + delta);
                // Only a real deposit counts. A trade release also credits
                // USER_AVAILABLE, and counting it would inflate the lifetime
                // total every time a trade failed.
                if (kind == TransactionKind.DEPOSIT && delta > 0) {
                    w.setLifetimeDepositedTiyin(w.getLifetimeDepositedTiyin() + delta);
                }
            }
            case USER_HELD -> w.setHeldTiyin(w.getHeldTiyin() + delta);
            case WITHDRAW_PENDING ->
                    w.setWithdrawPendingTiyin(w.getWithdrawPendingTiyin() + delta);
            default -> throw new IllegalStateException("Not user-scoped: " + p.account());
        }
        w.setUpdatedAt(Instant.now());
        wallets.save(w);
    }
}
```

- [ ] **Step 6: Add the lifetime-deposit test**

Append to `LedgerServiceIT`:

```java
    @Test
    void onlyADepositCountsTowardsTheLifetimeTotal() {
        UUID user = UUID.randomUUID();

        ledger.post(TransactionKind.DEPOSIT, "life-dep-" + user, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 100_000),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -100_000)));

        ledger.post(TransactionKind.TRADE_HOLD, "life-hold-" + user, null, null, List.of(
                new Posting(LedgerAccount.USER_AVAILABLE, user, 40_000),
                new Posting(LedgerAccount.USER_HELD, user, -40_000)));

        ledger.post(TransactionKind.TRADE_RELEASE, "life-rel-" + user, null, null, List.of(
                new Posting(LedgerAccount.USER_HELD, user, 40_000),
                new Posting(LedgerAccount.USER_AVAILABLE, user, -40_000)));

        var w = ledger.balanceOf(user);
        assertThat(w.getAvailableTiyin()).isEqualTo(100_000);
        assertThat(w.getLifetimeDepositedTiyin())
                .as("a release is not a deposit")
                .isEqualTo(100_000);
    }
```

- [ ] **Step 7: Write the wallet read endpoint**

`wallet/dto/WalletResponse.java`:

```java
package uz.efbazaar.payment.wallet.dto;

import uz.efbazaar.payment.wallet.domain.WalletAccount;

public record WalletResponse(
        long availableTiyin,
        long heldTiyin,
        long withdrawPendingTiyin,
        long lifetimeDepositedTiyin,
        long lifetimeEarnedTiyin
) {
    public static WalletResponse of(WalletAccount w) {
        return new WalletResponse(
                w.getAvailableTiyin(),
                w.getHeldTiyin(),
                w.getWithdrawPendingTiyin(),
                w.getLifetimeDepositedTiyin(),
                w.getLifetimeEarnedTiyin());
    }
}
```

`wallet/controller/WalletController.java`:

```java
package uz.efbazaar.payment.wallet.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.security.AuthenticatedUser;
import uz.efbazaar.payment.wallet.dto.WalletResponse;
import uz.efbazaar.payment.wallet.service.LedgerService;

@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
public class WalletController {

    private final LedgerService ledger;

    /** The caller's own wallet. There is no endpoint for reading somebody else's. */
    @GetMapping("/wallet")
    public WalletResponse myWallet(@AuthenticationPrincipal AuthenticatedUser me) {
        return WalletResponse.of(ledger.balanceOf(me.userId()));
    }

    /** The caller's own ledger entries, newest first. */
    @GetMapping("/wallet/transactions")
    public List<WalletEntryResponse> myHistory(
            @AuthenticationPrincipal AuthenticatedUser me,
            @RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit) {
        return ledger.historyOf(me.userId(), limit);
    }
}
```

Add the matching imports: `java.util.List`, `jakarta.validation.constraints.Min`, `Max`,
`org.springframework.web.bind.annotation.RequestParam`, and the DTO. Put `@Validated` on the class so
the `@Min`/`@Max` on a request parameter are enforced.

`wallet/dto/WalletEntryResponse.java`:

```java
package uz.efbazaar.payment.wallet.dto;

import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;

import java.time.Instant;
import java.util.UUID;

/**
 * One ledger entry belonging to the caller. The sign is the ledger's own:
 * negative is a credit to the user, positive a debit. The UI flips it for
 * display rather than the backend lying about the sign.
 */
public record WalletEntryResponse(
        UUID transactionId,
        TransactionKind kind,
        LedgerAccount account,
        long amountTiyin,
        Instant createdAt
) {}
```

Add to `LedgerEntryRepository`:

```java
    @Query("""
           SELECT new uz.efbazaar.payment.wallet.dto.WalletEntryResponse(
                    t.id, t.kind, e.account, e.amountTiyin, t.createdAt)
           FROM LedgerEntry e
           JOIN WalletTransaction t ON t.id = e.transactionId
           WHERE e.userId = :userId
           ORDER BY t.createdAt DESC
           """)
    List<WalletEntryResponse> findHistory(@Param("userId") UUID userId, Pageable pageable);
```

and to `LedgerService`:

```java
    @Transactional(readOnly = true)
    public List<WalletEntryResponse> historyOf(UUID userId, int limit) {
        return entries.findHistory(userId, PageRequest.of(0, limit));
    }
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn verify -Dit.test=LedgerServiceIT -DargLine="-Dapi.version=1.44"
```

Expected: PASS, 8/8.

- [ ] **Step 9: Commit**

```bash
git add backend/payment-service
git commit -m "feat(payment): add the double-entry ledger and the wallet read endpoint"
```

---

### Task 3: platform receiving cards

**Files:**
- Create: `backend/payment-service/src/main/java/uz/efbazaar/payment/crypto/` — copy of trade-service's `crypto/` package
- Create: `.../card/domain/PlatformCard.java`
- Create: `.../card/domain/CardBrand.java`
- Create: `.../card/domain/PlatformCardAudit.java`
- Create: `.../card/domain/CardAuditAction.java`
- Create: `.../card/repository/PlatformCardRepository.java`
- Create: `.../card/repository/PlatformCardAuditRepository.java`
- Create: `.../card/service/LuhnValidator.java`
- Create: `.../card/service/PlatformCardService.java`
- Create: `.../card/dto/PlatformCardCreateRequest.java`
- Create: `.../card/dto/PlatformCardResponse.java`
- Create: `.../card/dto/ReorderCardsRequest.java`
- Create: `.../card/controller/AdminPlatformCardController.java`
- Create: `.../config/PaymentExceptionHandler.java`
- Create: `backend/payment-service/src/main/resources/db/migration/V2__platform_cards.sql`
- Modify: `backend/payment-service/src/test/java/uz/efbazaar/payment/testsupport/AbstractPostgresIT.java`
- Test: `backend/payment-service/src/test/java/uz/efbazaar/payment/card/PlatformCardServiceIT.java`
- Test: `backend/payment-service/src/test/java/uz/efbazaar/payment/card/AdminPlatformCardControllerIT.java`

**Interfaces:**
- Consumes: `AbstractPostgresIT`, `AuthHeaderRequestPostProcessor` (Task 1).
- Produces:
  - `PlatformCardService.create(UUID actorId, PlatformCardCreateRequest req)` → `PlatformCard`
  - `.deactivate(UUID actorId, UUID cardId)`, `.activate(UUID actorId, UUID cardId)`
  - `.reorder(UUID actorId, List<UUID> orderedIds)`
  - `.listAll()` → `List<PlatformCard>` ordered by `displayOrder`
  - `.activeOrdered()` → `List<PlatformCard>` — **Task 4 depends on this name and order**
  - `.recordBalance(UUID cardId, long balanceTiyin, Instant observedAt)` — **Task 7 calls this**
  - `.findActiveByLast4(String last4)` → `Optional<PlatformCard>` — **Task 7 calls this**
  - `record PlatformCardCreateRequest(@NotBlank String pan, @NotBlank String holderName, @NotNull @Min(1) @Max(12) Short expiryMonth, @NotNull Short expiryYear)`
  - `record PlatformCardResponse(UUID id, String maskedPan, String last4, String holderName, short expiryMonth, short expiryYear, CardBrand brand, int displayOrder, boolean active, Long balanceTiyin, Instant balanceObservedAt)`
  - `record ReorderCardsRequest(@NotEmpty List<UUID> orderedIds)`
- Endpoints, all `ROLE_ADMIN`:
  - `GET  /api/v1/admin/payments/cards` → `List<PlatformCardResponse>`
  - `POST /api/v1/admin/payments/cards` → `PlatformCardResponse`
  - `POST /api/v1/admin/payments/cards/{id}/deactivate`
  - `POST /api/v1/admin/payments/cards/{id}/activate`
  - `POST /api/v1/admin/payments/cards/reorder`

**Context:** These are the platform's own cards, the ones users transfer to. The PAN is shown to users at invoice time, so encryption at rest protects a database dump rather than satisfying PCI.

Two rules carry the design:

**`last4` is unique among active cards.** Matching an incoming transfer keys on the last four digits alone (§3.4 of the spec). Two active cards sharing them makes a payment unattributable, so card creation refuses. This is a partial unique index, not an application check.

**`display_order` is unique among active cards.** It is the order the slot allocator walks (Task 4). Ties would make allocation non-deterministic.

Copy `crypto/` from `backend/trade-service/src/main/java/uz/efbazaar/trade/crypto/` — `EncryptedField`, `MasterKeyProvider`, `FileMasterKeyProvider`, `HkdfDeriver`, `TradeCrypto`. Change the package to `uz.efbazaar.payment.crypto`, rename the class `TradeCrypto` to `PaymentCrypto`, and change the config property it reads from `trade.crypto.master-key-file` to `payment.crypto.master-key-file`. Its API is `EncryptedField encrypt(String context, byte[] plaintext)` and `byte[] decrypt(String context, EncryptedField field)`.

Copy `LuhnValidator` and `CardBrand` from `backend/trade-service/src/main/java/uz/efbazaar/trade/card/`. This duplicates them for now; Plan 2 moves the whole user-card feature here and deletes the trade-service originals. Do not try to share them through a new module.

Restore master-key handling in `AbstractPostgresIT`: copy the `MASTER_KEY_PATH`, the `writeMasterKey()` static block and the `r.add("payment.crypto.master-key-file", ...)` registration from trade-service's version, changing the property name.

- [ ] **Step 1: Write the failing service test**

`src/test/java/uz/efbazaar/payment/card/PlatformCardServiceIT.java`:

```java
package uz.efbazaar.payment.card;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.domain.CardAuditAction;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class PlatformCardServiceIT extends AbstractPostgresIT {

    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository repo;
    @Autowired PlatformCardAuditRepository audits;

    private static final String HUMO_A = "9860160101080101";
    private static final String HUMO_B = "9860160102050202";

    @BeforeEach
    void clean() {
        audits.deleteAll();
        repo.deleteAll();
    }

    private PlatformCardCreateRequest req(String pan, String holder) {
        return new PlatformCardCreateRequest(pan, holder, (short) 12, (short) 2030);
    }

    @Test
    void creatingACardStoresItAndUpperCasesTheHolder() {
        UUID admin = UUID.randomUUID();

        var card = cards.create(admin, req(HUMO_A, "aziz karimov"));

        assertThat(card.getLast4()).isEqualTo("0101");
        assertThat(card.getHolderName()).isEqualTo("AZIZ KARIMOV");
        assertThat(card.isActive()).isTrue();
        assertThat(card.getDisplayOrder()).isEqualTo(1);
        assertThat(card.getBalanceTiyin()).isNull();
    }

    @Test
    void aSecondActiveCardCannotShareTheLastFourDigits() {
        UUID admin = UUID.randomUUID();
        cards.create(admin, req(HUMO_A, "AZIZ"));

        // Different full number, same trailing four.
        assertThatThrownBy(() -> cards.create(admin, req("9860160199920101", "BOBUR")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    void aDeactivatedCardReleasesItsLastFourDigits() {
        UUID admin = UUID.randomUUID();
        var first = cards.create(admin, req(HUMO_A, "AZIZ"));
        cards.deactivate(admin, first.getId());

        var second = cards.create(admin, req("9860160199920101", "BOBUR"));
        assertThat(second.getLast4()).isEqualTo("0101");
    }

    @Test
    void anInvalidCardNumberIsRefused() {
        UUID admin = UUID.randomUUID();

        // Deliberately NOT Luhn-valid (its check digit sums to 34). Every other
        // PAN in these tests is genuinely valid — do not "fix" this one.
        assertThatThrownBy(() -> cards.create(admin, req("9860160101010102", "AZIZ")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void activeOrderedWalksTheDisplayOrderAndSkipsInactiveCards() {
        UUID admin = UUID.randomUUID();
        var a = cards.create(admin, req(HUMO_A, "AZIZ"));
        var b = cards.create(admin, req(HUMO_B, "BOBUR"));
        var c = cards.create(admin, req("9860160103020303", "DILSHOD"));
        cards.deactivate(admin, b.getId());

        assertThat(cards.activeOrdered())
                .extracting(x -> x.getId())
                .containsExactly(a.getId(), c.getId());
    }

    @Test
    void reorderingRewritesTheOrder() {
        UUID admin = UUID.randomUUID();
        var a = cards.create(admin, req(HUMO_A, "AZIZ"));
        var b = cards.create(admin, req(HUMO_B, "BOBUR"));

        cards.reorder(admin, List.of(b.getId(), a.getId()));

        assertThat(cards.activeOrdered())
                .extracting(x -> x.getId())
                .containsExactly(b.getId(), a.getId());
    }

    @Test
    void everyMutationIsAudited() {
        UUID admin = UUID.randomUUID();
        var a = cards.create(admin, req(HUMO_A, "AZIZ"));
        cards.deactivate(admin, a.getId());
        cards.activate(admin, a.getId());

        assertThat(audits.findAll())
                .extracting(x -> x.getAction())
                .contains(CardAuditAction.CREATED,
                          CardAuditAction.DEACTIVATED,
                          CardAuditAction.ACTIVATED);
        assertThat(audits.findAll())
                .allSatisfy(x -> assertThat(x.getActorId()).isEqualTo(admin));
    }

    @Test
    void recordingABalanceStampsWhenItWasObserved() {
        UUID admin = UUID.randomUUID();
        var a = cards.create(admin, req(HUMO_A, "AZIZ"));
        Instant seen = Instant.now();

        cards.recordBalance(a.getId(), 3_165_916, seen);

        var reloaded = repo.findById(a.getId()).orElseThrow();
        assertThat(reloaded.getBalanceTiyin()).isEqualTo(3_165_916);
        assertThat(reloaded.getBalanceObservedAt()).isNotNull();
    }

    @Test
    void findActiveByLast4IgnoresDeactivatedCards() {
        UUID admin = UUID.randomUUID();
        var a = cards.create(admin, req(HUMO_A, "AZIZ"));
        assertThat(cards.findActiveByLast4("0101")).isPresent();

        cards.deactivate(admin, a.getId());
        assertThat(cards.findActiveByLast4("0101")).isEmpty();
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn verify -Dit.test=PlatformCardServiceIT -DargLine="-Dapi.version=1.44"
```

Expected: compilation failure — none of the classes exist.

- [ ] **Step 3: Write the migration**

`src/main/resources/db/migration/V2__platform_cards.sql`:

```sql
-- payment-service V2 — the platform's own receiving cards.
--
-- These are shown to users: a deposit works by the user transferring to one of
-- them. The PAN is encrypted at rest against a database dump, not for PCI --
-- a card you publish deliberately is not customer cardholder data.

CREATE TABLE platform_cards (
    id                  UUID PRIMARY KEY,
    pan_encrypted       BYTEA       NOT NULL,
    pan_iv              BYTEA       NOT NULL,
    pan_tag             BYTEA       NOT NULL,
    last4               VARCHAR(4)  NOT NULL,
    holder_name         VARCHAR(64) NOT NULL,
    expiry_month        SMALLINT    NOT NULL,
    expiry_year         SMALLINT    NOT NULL,
    brand               VARCHAR(16) NOT NULL,
    display_order       INT         NOT NULL,
    active              BOOLEAN     NOT NULL DEFAULT TRUE,
    balance_tiyin       BIGINT,
    balance_observed_at TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID        NOT NULL,
    CONSTRAINT chk_platform_cards_expiry
        CHECK (expiry_month BETWEEN 1 AND 12 AND expiry_year BETWEEN 2000 AND 2100)
);

-- An incoming transfer is attributed by last4 alone. Two active cards sharing
-- it would make the payment unattributable, so the database refuses.
CREATE UNIQUE INDEX uk_platform_cards_last4_active
    ON platform_cards (last4) WHERE active;

-- display_order is the order the slot allocator walks; ties would make
-- allocation non-deterministic.
CREATE UNIQUE INDEX uk_platform_cards_order_active
    ON platform_cards (display_order) WHERE active;

CREATE TABLE platform_card_audit (
    id         BIGSERIAL PRIMARY KEY,
    card_id    UUID        NOT NULL,
    action     VARCHAR(24) NOT NULL,
    actor_id   UUID        NOT NULL,
    detail     JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_platform_card_audit_card ON platform_card_audit (card_id, created_at DESC);
```

- [ ] **Step 4: Write the domain classes**

`card/domain/CardBrand.java` — copy from `backend/trade-service/src/main/java/uz/efbazaar/trade/card/domain/CardBrand.java`, changing only the package.

`card/domain/CardAuditAction.java`:

```java
package uz.efbazaar.payment.card.domain;

public enum CardAuditAction { CREATED, DEACTIVATED, ACTIVATED, REORDERED }
```

`card/domain/PlatformCard.java`:

```java
package uz.efbazaar.payment.card.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "platform_cards")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlatformCard {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "pan_encrypted", nullable = false)
    private byte[] panEncrypted;

    @Column(name = "pan_iv", nullable = false, length = 12)
    private byte[] panIv;

    @Column(name = "pan_tag", nullable = false, length = 16)
    private byte[] panTag;

    @Column(nullable = false, length = 4)
    private String last4;

    /** Stored upper-case; the service upper-cases on write. */
    @Column(name = "holder_name", nullable = false, length = 64)
    private String holderName;

    @Column(name = "expiry_month", nullable = false)
    private short expiryMonth;

    @Column(name = "expiry_year", nullable = false)
    private short expiryYear;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private CardBrand brand;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(nullable = false)
    private boolean active;

    /** Last balance the Humo bot reported. Null until the first message. */
    @Column(name = "balance_tiyin")
    private Long balanceTiyin;

    @Column(name = "balance_observed_at")
    private Instant balanceObservedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;
}
```

`card/domain/PlatformCardAudit.java`:

```java
package uz.efbazaar.payment.card.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "platform_card_audit")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlatformCardAudit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "card_id", nullable = false)
    private UUID cardId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private CardAuditAction action;

    @Column(name = "actor_id", nullable = false)
    private UUID actorId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
```

The `detail JSONB` column is left unmapped for now: nothing writes it in this plan, and an unused
`@JdbcTypeCode(SqlTypes.JSON)` mapping is a maintenance cost with no reader.

- [ ] **Step 5: Write the repositories**

`card/repository/PlatformCardRepository.java`:

```java
package uz.efbazaar.payment.card.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.card.domain.PlatformCard;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlatformCardRepository extends JpaRepository<PlatformCard, UUID> {

    List<PlatformCard> findByActiveTrueOrderByDisplayOrderAsc();

    List<PlatformCard> findAllByOrderByDisplayOrderAsc();

    Optional<PlatformCard> findByLast4AndActiveTrue(String last4);

    boolean existsByLast4AndActiveTrue(String last4);
}
```

`card/repository/PlatformCardAuditRepository.java`:

```java
package uz.efbazaar.payment.card.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.card.domain.PlatformCardAudit;

public interface PlatformCardAuditRepository extends JpaRepository<PlatformCardAudit, Long> {
}
```

- [ ] **Step 6: Write the service**

`card/service/LuhnValidator.java` — copy from `backend/trade-service/src/main/java/uz/efbazaar/trade/card/service/LuhnValidator.java`, changing only the package. Note it is a `final class` exposing `public static boolean isValid(String pan)`; it is not a Spring bean and must not be injected.

`card/service/PlatformCardService.java`:

```java
package uz.efbazaar.payment.card.service;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.domain.CardAuditAction;
import uz.efbazaar.payment.card.domain.CardBrand;
import uz.efbazaar.payment.card.domain.PlatformCard;
import uz.efbazaar.payment.card.domain.PlatformCardAudit;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.crypto.EncryptedField;
import uz.efbazaar.payment.crypto.PaymentCrypto;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PlatformCardService {

    private final PlatformCardRepository cards;
    private final PlatformCardAuditRepository audits;
    private final PaymentCrypto crypto;

    @Transactional
    public PlatformCard create(UUID actorId, PlatformCardCreateRequest req) {
        String pan = req.pan().replaceAll("\\D", "");
        // LuhnValidator is a final class with a static method — call it
        // statically, do not try to inject it as a bean.
        if (pan.length() < 12 || !LuhnValidator.isValid(pan)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Karta raqami noto'g'ri");
        }
        String last4 = pan.substring(pan.length() - 4);
        if (cards.existsByLast4AndActiveTrue(last4)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Oxirgi 4 raqami bir xil faol karta allaqachon bor: " + last4);
        }

        UUID id = UUID.randomUUID();
        EncryptedField enc = crypto.encrypt("pcard-" + id, pan.getBytes(StandardCharsets.UTF_8));

        int nextOrder = cards.findByActiveTrueOrderByDisplayOrderAsc().stream()
                .mapToInt(PlatformCard::getDisplayOrder)
                .max().orElse(0) + 1;

        PlatformCard card = PlatformCard.builder()
                .id(id)
                .panEncrypted(enc.ciphertext())
                .panIv(enc.iv())
                .panTag(enc.tag())
                .last4(last4)
                .holderName(req.holderName().trim().toUpperCase())
                .expiryMonth(req.expiryMonth())
                .expiryYear(req.expiryYear())
                .brand(CardBrand.detect(pan))
                .displayOrder(nextOrder)
                .active(true)
                .createdAt(Instant.now())
                .createdBy(actorId)
                .build();

        try {
            cards.saveAndFlush(card);
        } catch (DataIntegrityViolationException e) {
            // Lost a race against a concurrent create for the same last4 or order.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Karta qo'shilmadi — qayta urinib ko'ring", e);
        }
        audit(id, CardAuditAction.CREATED, actorId);
        return card;
    }

    @Transactional
    public void deactivate(UUID actorId, UUID cardId) {
        PlatformCard card = require(cardId);
        card.setActive(false);
        cards.save(card);
        audit(cardId, CardAuditAction.DEACTIVATED, actorId);
    }

    @Transactional
    public void activate(UUID actorId, UUID cardId) {
        PlatformCard card = require(cardId);
        if (cards.existsByLast4AndActiveTrue(card.getLast4())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Oxirgi 4 raqami bir xil faol karta bor: " + card.getLast4());
        }
        card.setActive(true);
        card.setDisplayOrder(cards.findByActiveTrueOrderByDisplayOrderAsc().stream()
                .mapToInt(PlatformCard::getDisplayOrder)
                .max().orElse(0) + 1);
        cards.save(card);
        audit(cardId, CardAuditAction.ACTIVATED, actorId);
    }

    /**
     * Rewrites display_order to match the given sequence. Written in two passes
     * with an offset because uk_platform_cards_order_active is unique: assigning
     * 1,2 directly over an existing 1,2 collides mid-update.
     */
    @Transactional
    public void reorder(UUID actorId, List<UUID> orderedIds) {
        List<PlatformCard> active = cards.findByActiveTrueOrderByDisplayOrderAsc();
        if (orderedIds.size() != active.size()
                || !orderedIds.containsAll(active.stream().map(PlatformCard::getId).toList())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tartib ro'yxati barcha faol kartalarni o'z ichiga olishi kerak");
        }

        int offset = 1000;
        for (PlatformCard c : active) {
            c.setDisplayOrder(c.getDisplayOrder() + offset);
        }
        cards.saveAllAndFlush(active);

        for (int i = 0; i < orderedIds.size(); i++) {
            PlatformCard c = require(orderedIds.get(i));
            c.setDisplayOrder(i + 1);
            cards.save(c);
        }
        cards.flush();
        orderedIds.forEach(id -> audit(id, CardAuditAction.REORDERED, actorId));
    }

    @Transactional(readOnly = true)
    public List<PlatformCard> activeOrdered() {
        return cards.findByActiveTrueOrderByDisplayOrderAsc();
    }

    @Transactional(readOnly = true)
    public List<PlatformCard> listAll() {
        return cards.findAllByOrderByDisplayOrderAsc();
    }

    @Transactional(readOnly = true)
    public Optional<PlatformCard> findActiveByLast4(String last4) {
        return cards.findByLast4AndActiveTrue(last4);
    }

    @Transactional
    public void recordBalance(UUID cardId, long balanceTiyin, Instant observedAt) {
        PlatformCard card = require(cardId);
        card.setBalanceTiyin(balanceTiyin);
        card.setBalanceObservedAt(observedAt);
        cards.save(card);
    }

    /** Decrypts the PAN. Called when building the invoice a user must pay. */
    @Transactional(readOnly = true)
    public String revealPan(PlatformCard card) {
        byte[] plain = crypto.decrypt("pcard-" + card.getId(),
                new EncryptedField(card.getPanIv(), card.getPanTag(), card.getPanEncrypted()));
        return new String(plain, StandardCharsets.UTF_8);
    }

    private PlatformCard require(UUID cardId) {
        return cards.findById(cardId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Karta topilmadi"));
    }

    private void audit(UUID cardId, CardAuditAction action, UUID actorId) {
        audits.save(PlatformCardAudit.builder()
                .cardId(cardId)
                .action(action)
                .actorId(actorId)
                .createdAt(Instant.now())
                .build());
    }
}
```

`CardBrand.detect(pan)` must exist. trade-service's `CardBrand` may not have it — the brand is passed in from the client there. If it does not, add this to the copied enum:

```java
    /** BIN rules matching the frontend's card-detect.ts. */
    public static CardBrand detect(String pan) {
        if (pan.startsWith("9860")) return HUMO;
        if (pan.startsWith("8600")) return UZCARD;
        if (pan.startsWith("4")) return VISA;
        if (pan.matches("^(5[1-5]|222[1-9]|2[3-6]\\d\\d|27[01]\\d|2720).*")) return MC;
        throw new IllegalArgumentException("Unknown card brand for this BIN");
    }
```

- [ ] **Step 7: Write the DTOs, controller and exception handler**

`card/dto/PlatformCardCreateRequest.java`:

```java
package uz.efbazaar.payment.card.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record PlatformCardCreateRequest(
        @NotBlank @Size(max = 32) String pan,
        @NotBlank @Size(max = 64) String holderName,
        @NotNull @Min(1) @Max(12) Short expiryMonth,
        @NotNull @Min(2000) @Max(2100) Short expiryYear
) {}
```

`card/dto/PlatformCardResponse.java`:

```java
package uz.efbazaar.payment.card.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.payment.card.domain.CardBrand;
import uz.efbazaar.payment.card.domain.PlatformCard;

import java.time.Instant;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PlatformCardResponse(
        UUID id,
        /** Never the full number in a list view — the admin panel shows a mask. */
        String maskedPan,
        String last4,
        String holderName,
        short expiryMonth,
        short expiryYear,
        CardBrand brand,
        int displayOrder,
        boolean active,
        Long balanceTiyin,
        Instant balanceObservedAt
) {
    public static PlatformCardResponse of(PlatformCard c) {
        return new PlatformCardResponse(
                c.getId(),
                "**** **** **** " + c.getLast4(),
                c.getLast4(),
                c.getHolderName(),
                c.getExpiryMonth(),
                c.getExpiryYear(),
                c.getBrand(),
                c.getDisplayOrder(),
                c.isActive(),
                c.getBalanceTiyin(),
                c.getBalanceObservedAt());
    }
}
```

`card/dto/ReorderCardsRequest.java`:

```java
package uz.efbazaar.payment.card.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;
import java.util.UUID;

public record ReorderCardsRequest(@NotEmpty List<UUID> orderedIds) {}
```

`card/controller/AdminPlatformCardController.java`:

```java
package uz.efbazaar.payment.card.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.dto.PlatformCardResponse;
import uz.efbazaar.payment.card.dto.ReorderCardsRequest;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/payments/cards")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
@RequiredArgsConstructor
public class AdminPlatformCardController {

    private final PlatformCardService cards;

    @GetMapping
    public List<PlatformCardResponse> list() {
        return cards.listAll().stream().map(PlatformCardResponse::of).toList();
    }

    @PostMapping
    public PlatformCardResponse create(@AuthenticationPrincipal AuthenticatedUser me,
                                       @Valid @RequestBody PlatformCardCreateRequest req) {
        return PlatformCardResponse.of(cards.create(me.userId(), req));
    }

    @PostMapping("/{id}/deactivate")
    public void deactivate(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id) {
        cards.deactivate(me.userId(), id);
    }

    @PostMapping("/{id}/activate")
    public void activate(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id) {
        cards.activate(me.userId(), id);
    }

    @PostMapping("/reorder")
    public void reorder(@AuthenticationPrincipal AuthenticatedUser me,
                        @Valid @RequestBody ReorderCardsRequest req) {
        cards.reorder(me.userId(), req.orderedIds());
    }
}
```

`config/PaymentExceptionHandler.java`:

```java
package uz.efbazaar.payment.config;

import jakarta.persistence.EntityNotFoundException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class PaymentExceptionHandler {

    @ExceptionHandler(EntityNotFoundException.class)
    public ProblemDetail notFound(EntityNotFoundException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail badRequest(IllegalArgumentException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    /**
     * A losing race on a partial unique index is a conflict, not a 500. Without
     * this the slot allocator's own conflicts and concurrent card creates would
     * surface as server errors.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail conflict(DataIntegrityViolationException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Bir vaqtda o'zgardi");
    }
}
```

- [ ] **Step 8: Run the service test to verify it passes**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn verify -Dit.test=PlatformCardServiceIT -DargLine="-Dapi.version=1.44"
```

Expected: PASS, 9/9.

- [ ] **Step 9: Write the HTTP-boundary test**

`src/test/java/uz/efbazaar/payment/card/AdminPlatformCardControllerIT.java`:

```java
package uz.efbazaar.payment.card;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asAdmin;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class AdminPlatformCardControllerIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PlatformCardRepository repo;
    @Autowired PlatformCardAuditRepository audits;

    @BeforeEach
    void clean() {
        audits.deleteAll();
        repo.deleteAll();
    }

    @Test
    void aPlainUserIsForbidden() throws Exception {
        mvc.perform(get("/api/v1/admin/payments/cards").with(asUser(UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }

    @Test
    void anAdminCreatesAndListsACardWithoutEverSeeingTheFullNumber() throws Exception {
        var req = new PlatformCardCreateRequest(
                "9860 1601 0101 0101", "aziz karimov", (short) 12, (short) 2030);

        mvc.perform(post("/api/v1/admin/payments/cards")
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.last4").value("0101"))
                .andExpect(jsonPath("$.holderName").value("AZIZ KARIMOV"))
                .andExpect(jsonPath("$.brand").value("HUMO"))
                .andExpect(jsonPath("$.maskedPan").value("**** **** **** 0101"))
                .andExpect(jsonPath("$.panEncrypted").doesNotExist());

        mvc.perform(get("/api/v1/admin/payments/cards").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].last4").value("0101"))
                .andExpect(jsonPath("$[0].active").value(true));
    }

    @Test
    void aMalformedCardNumberIsRejectedAtTheBoundary() throws Exception {
        var req = new PlatformCardCreateRequest("1234", "AZIZ", (short) 12, (short) 2030);

        mvc.perform(post("/api/v1/admin/payments/cards")
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }
}
```

The `panEncrypted` assertion matters: it proves the response DTO does not accidentally serialise the
entity.

- [ ] **Step 10: Run the full suite and commit**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn clean verify -DargLine="-Dapi.version=1.44"
```

```bash
git add backend/payment-service
git commit -m "feat(payment): add the platform receiving cards with admin CRUD and audit"
```

---

### Task 4: invoices and slot allocation

**Files:**
- Create: `backend/payment-service/src/main/resources/db/migration/V3__invoices.sql`
- Create: `.../invoice/domain/Invoice.java`
- Create: `.../invoice/domain/InvoiceStatus.java`
- Create: `.../invoice/domain/PaymentProviderId.java`
- Create: `.../invoice/repository/InvoiceRepository.java`
- Create: `.../invoice/service/SlotAllocator.java`
- Create: `.../invoice/service/InvoiceService.java`
- Create: `.../invoice/dto/CreateInvoiceRequest.java`
- Create: `.../invoice/dto/InvoiceResponse.java`
- Create: `.../invoice/controller/InvoiceController.java`
- Test: `.../invoice/SlotAllocatorIT.java`
- Test: `.../invoice/InvoiceServiceIT.java`

**Interfaces:**
- Consumes: `PlatformCardService.activeOrdered()`, `.revealPan(PlatformCard)` (Task 3).
- Produces:
  - `enum InvoiceStatus { PENDING, PAID, EXPIRED, CANCELLED }`
  - `enum PaymentProviderId { BY_CARD, MOCK }`
  - `SlotAllocator.allocate(UUID userId, long requestedTiyin)` → `Invoice` (already persisted, `PENDING`)
  - `InvoiceService.create(UUID userId, long requestedUzs)` → `InvoiceResponse`
  - `InvoiceService.findLive(UUID cardId, long transferTiyin, Instant at)` → `List<Invoice>` — **Task 7 calls this**
  - `InvoiceService.markPaid(Invoice invoice, UUID observationId)` — **Task 7 calls this**
  - `InvoiceService.myActive(UUID userId)` → `Optional<InvoiceResponse>`
  - `record CreateInvoiceRequest(@NotNull @Min(1) Long amountUzs)` — the real floor is
    `payment.deposit.minimum-uzs`, enforced in `InvoiceService.create` so it stays configurable;
    the annotation only rejects zero and negatives.
  - `record InvoiceResponse(UUID id, String pan, String holderName, String cardExpiry, long requestedTiyin, long transferTiyin, Instant expiresAt, InvoiceStatus status)`
- Endpoints:
  - `POST /api/v1/payments/invoices` → `InvoiceResponse`
  - `GET  /api/v1/payments/invoices/active` → `InvoiceResponse` or 204

**Context:** This is the core of the whole rail. An incoming transfer carries only an amount and a card's last four digits, so the system's job is to guarantee that no two live invoices ever share both.

The algorithm, from spec §6.2:

```
bump := 0
loop:
    for card in active cards ordered by display_order:
        transfer := requested + bump
        try INSERT invoice(card, transfer)
        success -> done
        conflict -> next card
    bump := bump + bump-step-uzs
    if bump > max-bump-uzs: refuse
```

**The insert is the allocation.** There is no read-then-write, so there is no race to lose: `uk_invoices_live_slot` decides the winner and a conflict is ordinary control flow, not an error. A version of this that queries for a free slot and then inserts is wrong even though it passes a single-threaded test.

Each attempt needs its own transaction, because a constraint violation marks the surrounding transaction rollback-only in PostgreSQL — a subsequent insert in the same transaction fails regardless. Use `TransactionTemplate` with `PROPAGATION_REQUIRES_NEW` per attempt, and keep `SlotAllocator` itself **not** `@Transactional`, so a caller's transaction does not swallow the retries. This is the same trap Task 15 of the human trade-admin plan hit with its escalation sweeper.

- [ ] **Step 1: Write the failing allocator test**

`src/test/java/uz/efbazaar/payment/invoice/SlotAllocatorIT.java`:

```java
package uz.efbazaar.payment.invoice;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.invoice.service.SlotAllocator;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class SlotAllocatorIT extends AbstractPostgresIT {

    @Autowired SlotAllocator allocator;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired InvoiceRepository invoices;

    private static final long UZS = 100;  // tiyin per UZS

    @BeforeEach
    void clean() {
        invoices.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
    }

    private void givenCards(String... pans) {
        UUID admin = UUID.randomUUID();
        int i = 0;
        for (String pan : pans) {
            cards.create(admin, new PlatformCardCreateRequest(
                    pan, "HOLDER " + (++i), (short) 12, (short) 2030));
        }
    }

    @Test
    void theFirstInvoiceTakesThePrimaryCardAtTheRequestedAmount() {
        givenCards("9860160101080101", "9860160102050202");

        Invoice inv = allocator.allocate(UUID.randomUUID(), 100_000 * UZS);

        assertThat(inv.getTransferAmountTiyin()).isEqualTo(100_000 * UZS);
        assertThat(inv.getRequestedAmountTiyin()).isEqualTo(100_000 * UZS);
        assertThat(cardRepo.findById(inv.getCardId()).orElseThrow().getDisplayOrder())
                .as("primary card first")
                .isEqualTo(1);
    }

    @Test
    void aSecondInvoiceForTheSameAmountFallsToTheNextCard() {
        givenCards("9860160101080101", "9860160102050202");

        Invoice first  = allocator.allocate(UUID.randomUUID(), 100_000 * UZS);
        Invoice second = allocator.allocate(UUID.randomUUID(), 100_000 * UZS);

        assertThat(second.getCardId()).isNotEqualTo(first.getCardId());
        assertThat(second.getTransferAmountTiyin())
                .as("same amount, different card — no bump needed yet")
                .isEqualTo(100_000 * UZS);
    }

    @Test
    void whenEveryCardIsBusyTheAmountIsBumped() {
        givenCards("9860160101080101", "9860160102050202");

        allocator.allocate(UUID.randomUUID(), 100_000 * UZS);
        allocator.allocate(UUID.randomUUID(), 100_000 * UZS);
        Invoice third = allocator.allocate(UUID.randomUUID(), 100_000 * UZS);

        assertThat(third.getTransferAmountTiyin()).isEqualTo(100_100 * UZS);
        assertThat(third.getRequestedAmountTiyin())
                .as("the user is still credited what they asked for")
                .isEqualTo(100_000 * UZS);
    }

    @Test
    void theBumpCeilingRefusesRatherThanClimbingForever() {
        givenCards("9860160101080101");

        // One card, step 100, ceiling 1000 -> 11 slots (bump 0..1000).
        for (int i = 0; i <= 10; i++) {
            allocator.allocate(UUID.randomUUID(), 100_000 * UZS);
        }

        assertThatThrownBy(() -> allocator.allocate(UUID.randomUUID(), 100_000 * UZS))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("503");
    }

    @Test
    void withNoActiveCardsAllocationRefuses() {
        assertThatThrownBy(() -> allocator.allocate(UUID.randomUUID(), 100_000 * UZS))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("503");
    }

    @Test
    void concurrentRequestsForTheSameAmountNeverShareASlot() throws Exception {
        givenCards("9860160101080101", "9860160102050202",
                   "9860160103020303", "9860160104090404");

        int threads = 4;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Invoice>> futures = new ArrayList<>();

        for (int i = 0; i < threads; i++) {
            futures.add(pool.submit(() -> {
                go.await(5, TimeUnit.SECONDS);
                return allocator.allocate(UUID.randomUUID(), 100_000 * UZS);
            }));
        }
        go.countDown();

        List<Invoice> allocated = new ArrayList<>();
        for (Future<Invoice> f : futures) {
            allocated.add(f.get(30, TimeUnit.SECONDS));
        }
        pool.shutdown();

        Set<String> slots = allocated.stream()
                .map(i -> i.getCardId() + ":" + i.getTransferAmountTiyin())
                .collect(Collectors.toSet());

        assertThat(slots)
                .as("four concurrent allocations must occupy four distinct slots")
                .hasSize(threads);
    }
}
```

The last test is the one that matters. Run it against an implementation that queries for a free slot before inserting and it fails; that is the point.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn verify -Dit.test=SlotAllocatorIT -DargLine="-Dapi.version=1.44"
```

Expected: compilation failure — `SlotAllocator` does not exist.

- [ ] **Step 3: Write the migration**

`src/main/resources/db/migration/V3__invoices.sql`:

```sql
-- payment-service V3 — deposit invoices.
--
-- An incoming transfer identifies itself by amount and the receiving card's
-- last four digits, and nothing else. The two partial unique indexes below are
-- what make that enough to attribute a payment.

CREATE TABLE invoices (
    id                     UUID PRIMARY KEY,
    user_id                UUID        NOT NULL,
    provider               VARCHAR(16) NOT NULL,
    provider_ref           VARCHAR(128),
    card_id                UUID        REFERENCES platform_cards(id),
    requested_amount_tiyin BIGINT      NOT NULL,
    transfer_amount_tiyin  BIGINT      NOT NULL,
    status                 VARCHAR(16) NOT NULL,
    expires_at             TIMESTAMPTZ NOT NULL,
    paid_at                TIMESTAMPTZ,
    observation_id         UUID,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_invoices_amounts CHECK (
        requested_amount_tiyin > 0
        AND transfer_amount_tiyin >= requested_amount_tiyin)
);

-- THE SLOT. Two live invoices may never share a card and an amount, because a
-- Humo notification carrying that pair could not then be attributed. This is
-- also how concurrent allocation is made safe: the insert is the claim.
CREATE UNIQUE INDEX uk_invoices_live_slot
    ON invoices (card_id, transfer_amount_tiyin) WHERE status = 'PENDING';

-- One live invoice per user: without it a user can exhaust the slots for
-- common round numbers and drive everyone else's bump tower higher.
CREATE UNIQUE INDEX uk_invoices_one_live_per_user
    ON invoices (user_id) WHERE status = 'PENDING';

-- The expiry sweeper's lookup.
CREATE INDEX ix_invoices_pending_expiry
    ON invoices (expires_at) WHERE status = 'PENDING';
```

- [ ] **Step 4: Write the domain classes**

`invoice/domain/InvoiceStatus.java`:

```java
package uz.efbazaar.payment.invoice.domain;

public enum InvoiceStatus { PENDING, PAID, EXPIRED, CANCELLED }
```

`invoice/domain/PaymentProviderId.java`:

```java
package uz.efbazaar.payment.invoice.domain;

/**
 * Which rail an invoice belongs to. BY_CARD is the transfer-to-our-own-card
 * rail; hosted providers (Click, Payme) slot in here later behind the same
 * PaymentProvider interface.
 */
public enum PaymentProviderId { BY_CARD, MOCK }
```

`invoice/domain/Invoice.java`:

```java
package uz.efbazaar.payment.invoice.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "invoices")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Invoice {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private PaymentProviderId provider;

    @Column(name = "provider_ref", length = 128)
    private String providerRef;

    /** Null for hosted providers; always set for BY_CARD. */
    @Column(name = "card_id")
    private UUID cardId;

    /** What the user asked for, and what their wallet receives. */
    @Column(name = "requested_amount_tiyin", nullable = false)
    private long requestedAmountTiyin;

    /** What the user must actually transfer — requested plus any bump. */
    @Column(name = "transfer_amount_tiyin", nullable = false)
    private long transferAmountTiyin;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private InvoiceStatus status;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "paid_at")
    private Instant paidAt;

    /**
     * No FK: invoices and card_credit_observations reference each other, so
     * one side stays a plain column.
     */
    @Column(name = "observation_id")
    private UUID observationId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
```

- [ ] **Step 5: Write the repository**

`invoice/repository/InvoiceRepository.java`:

```java
package uz.efbazaar.payment.invoice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {

    Optional<Invoice> findByUserIdAndStatus(UUID userId, InvoiceStatus status);

    /**
     * Candidates for an incoming transfer. Expired invoices are excluded
     * deliberately: their slot has been released and may already belong to
     * somebody else's live invoice, so crediting on amount alone would credit
     * the wrong user.
     */
    @Query("""
           SELECT i FROM Invoice i
           WHERE i.cardId = :cardId
             AND i.transferAmountTiyin = :amount
             AND i.status = uz.efbazaar.payment.invoice.domain.InvoiceStatus.PENDING
             AND i.expiresAt > :at
           """)
    List<Invoice> findLiveSlot(@Param("cardId") UUID cardId,
                               @Param("amount") long amount,
                               @Param("at") Instant at);

    @Query("""
           SELECT i FROM Invoice i
           WHERE i.status = uz.efbazaar.payment.invoice.domain.InvoiceStatus.PENDING
             AND i.expiresAt <= :now
           """)
    List<Invoice> findDue(@Param("now") Instant now);
}
```

- [ ] **Step 6: Write the allocator**

`invoice/service/SlotAllocator.java`:

```java
package uz.efbazaar.payment.invoice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.domain.PlatformCard;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.domain.PaymentProviderId;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Picks the {@code (card, transfer amount)} slot an invoice occupies.
 *
 * <p>The insert IS the allocation. Nothing is read to find a free slot first,
 * because a read-then-write loses the race whenever two users request the same
 * amount at the same moment; {@code uk_invoices_live_slot} decides the winner
 * instead, and a constraint violation is ordinary control flow here.
 *
 * <p>Each attempt runs in its own transaction: in PostgreSQL a constraint
 * violation marks the enclosing transaction rollback-only, so a retry inside
 * the same transaction cannot succeed. This class is deliberately NOT
 * {@code @Transactional} for the same reason.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SlotAllocator {

    private final PlatformCardService cards;
    private final InvoiceRepository invoices;
    private final PlatformTransactionManager txManager;

    @Value("${payment.deposit.invoice-ttl-minutes}") private long ttlMinutes;
    @Value("${payment.deposit.bump-step-uzs}")       private long bumpStepUzs;
    @Value("${payment.deposit.max-bump-uzs}")        private long maxBumpUzs;

    public Invoice allocate(UUID userId, long requestedTiyin) {
        List<PlatformCard> active = cards.activeOrdered();
        if (active.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Hozircha to'ldirish uchun karta yo'q");
        }

        TransactionTemplate tx = new TransactionTemplate(txManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        long stepTiyin = bumpStepUzs * 100;
        long maxBumpTiyin = maxBumpUzs * 100;

        for (long bump = 0; bump <= maxBumpTiyin; bump += stepTiyin) {
            long transfer = requestedTiyin + bump;
            for (PlatformCard card : active) {
                Invoice claimed = tryClaim(tx, userId, card.getId(), requestedTiyin, transfer);
                if (claimed != null) {
                    return claimed;
                }
            }
        }

        // Every card is busy at every amount within the ceiling. At realistic
        // volumes that means something is wrong, not that we are popular.
        log.warn("Slot exhausted for user {} at {} tiyin across {} cards",
                userId, requestedTiyin, active.size());
        throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Hozir band — bir necha daqiqadan keyin qayta urinib ko'ring");
    }

    private Invoice tryClaim(TransactionTemplate tx, UUID userId, UUID cardId,
                             long requestedTiyin, long transferTiyin) {
        try {
            return tx.execute(status -> {
                Invoice inv = Invoice.builder()
                        .id(UUID.randomUUID())
                        .userId(userId)
                        .provider(PaymentProviderId.BY_CARD)
                        .cardId(cardId)
                        .requestedAmountTiyin(requestedTiyin)
                        .transferAmountTiyin(transferTiyin)
                        .status(InvoiceStatus.PENDING)
                        .expiresAt(Instant.now().plus(Duration.ofMinutes(ttlMinutes)))
                        .createdAt(Instant.now())
                        .build();
                invoices.saveAndFlush(inv);
                return inv;
            });
        } catch (DataIntegrityViolationException e) {
            // Either this slot is taken, or the user already has a live
            // invoice. The caller checks the latter first, so treat it as
            // "slot busy" and move on.
            return null;
        }
    }
}
```

- [ ] **Step 7: Run the allocator test to verify it passes**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn verify -Dit.test=SlotAllocatorIT -DargLine="-Dapi.version=1.44"
```

Expected: PASS, 6/6.

**If `concurrentRequestsForTheSameAmountNeverShareASlot` fails**, the allocator is reading before writing or sharing one transaction across attempts. Do not widen the assertion — fix the allocator.

- [ ] **Step 8: Write InvoiceService, DTOs and the controller**

`invoice/dto/CreateInvoiceRequest.java`:

```java
package uz.efbazaar.payment.invoice.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record CreateInvoiceRequest(@NotNull @Min(1) Long amountUzs) {}
```

`invoice/dto/InvoiceResponse.java`:

```java
package uz.efbazaar.payment.invoice.dto;

import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;

import java.time.Instant;
import java.util.UUID;

/**
 * What the payer sees. The PAN is present deliberately — the user cannot make
 * the transfer without it. It is only ever returned to the user who owns the
 * invoice.
 */
public record InvoiceResponse(
        UUID id,
        String pan,
        String holderName,
        String cardExpiry,
        long requestedTiyin,
        long transferTiyin,
        Instant expiresAt,
        InvoiceStatus status
) {
    public static InvoiceResponse of(Invoice i, String pan, String holderName, String expiry) {
        return new InvoiceResponse(
                i.getId(), pan, holderName, expiry,
                i.getRequestedAmountTiyin(), i.getTransferAmountTiyin(),
                i.getExpiresAt(), i.getStatus());
    }
}
```

`invoice/service/InvoiceService.java`:

```java
package uz.efbazaar.payment.invoice.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.domain.PlatformCard;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.health.UserbotHealth;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.dto.InvoiceResponse;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InvoiceService {

    private final SlotAllocator allocator;
    private final InvoiceRepository invoices;
    private final PlatformCardService cards;
    private final UserbotHealth userbot;

    @Value("${payment.deposit.minimum-uzs}") private long minimumUzs;

    public InvoiceResponse create(UUID userId, long requestedUzs) {
        // Refusing money we cannot observe is better than taking it blind.
        if (!userbot.isHealthy()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "To'ldirish vaqtincha ishlamayapti — birozdan keyin urinib ko'ring");
        }
        if (requestedUzs < minimumUzs) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Eng kam summa: " + minimumUzs + " so'm");
        }
        if (invoices.findByUserIdAndStatus(userId, InvoiceStatus.PENDING).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Sizda tugallanmagan to'ldirish bor");
        }

        Invoice inv = allocator.allocate(userId, requestedUzs * 100);
        return render(inv);
    }

    @Transactional(readOnly = true)
    public Optional<InvoiceResponse> myActive(UUID userId) {
        return invoices.findByUserIdAndStatus(userId, InvoiceStatus.PENDING)
                .filter(i -> i.getExpiresAt().isAfter(Instant.now()))
                .map(this::render);
    }

    @Transactional(readOnly = true)
    public List<Invoice> findLive(UUID cardId, long transferTiyin, Instant at) {
        return invoices.findLiveSlot(cardId, transferTiyin, at);
    }

    @Transactional
    public void markPaid(Invoice invoice, UUID observationId) {
        if (invoice.getStatus() != InvoiceStatus.PENDING) {
            throw new IllegalStateException(
                    "Invoice " + invoice.getId() + " is " + invoice.getStatus());
        }
        invoice.setStatus(InvoiceStatus.PAID);
        invoice.setPaidAt(Instant.now());
        invoice.setObservationId(observationId);
        invoices.save(invoice);
    }

    private InvoiceResponse render(Invoice inv) {
        PlatformCard card = cards.listAll().stream()
                .filter(c -> c.getId().equals(inv.getCardId()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "Invoice " + inv.getId() + " points at a missing card"));
        String expiry = "%02d/%02d".formatted(card.getExpiryMonth(), card.getExpiryYear() % 100);
        return InvoiceResponse.of(inv, cards.revealPan(card), card.getHolderName(), expiry);
    }
}
```

`invoice/controller/InvoiceController.java`:

```java
package uz.efbazaar.payment.invoice.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.invoice.dto.CreateInvoiceRequest;
import uz.efbazaar.payment.invoice.dto.InvoiceResponse;
import uz.efbazaar.payment.invoice.service.InvoiceService;
import uz.efbazaar.payment.security.AuthenticatedUser;

@RestController
@RequestMapping("/api/v1/payments/invoices")
@RequiredArgsConstructor
public class InvoiceController {

    private final InvoiceService invoices;

    @PostMapping
    public InvoiceResponse create(@AuthenticationPrincipal AuthenticatedUser me,
                                  @Valid @RequestBody CreateInvoiceRequest req) {
        return invoices.create(me.userId(), req.amountUzs());
    }

    @GetMapping("/active")
    public ResponseEntity<InvoiceResponse> active(@AuthenticationPrincipal AuthenticatedUser me) {
        return invoices.myActive(me.userId())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
```

`InvoiceService` depends on `UserbotHealth`, which Task 5 creates. To keep this task independently
testable, create the class now as a stub that always returns healthy, and let Task 5 replace its body:

```java
package uz.efbazaar.payment.health;

import org.springframework.stereotype.Component;

/** Heartbeat freshness. Task 5 wires the real Kafka-fed implementation. */
@Component
public class UserbotHealth {
    public boolean isHealthy() {
        return true;
    }
}
```

- [ ] **Step 9: Write the InvoiceService test**

`src/test/java/uz/efbazaar/payment/invoice/InvoiceServiceIT.java`:

```java
package uz.efbazaar.payment.invoice;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.invoice.service.InvoiceService;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class InvoiceServiceIT extends AbstractPostgresIT {

    @Autowired InvoiceService invoices;
    @Autowired InvoiceRepository invoiceRepo;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;

    @BeforeEach
    void clean() {
        invoiceRepo.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "aziz karimov", (short) 12, (short) 2030));
    }

    @Test
    void anInvoiceCarriesEverythingThePayerNeeds() {
        var res = invoices.create(UUID.randomUUID(), 100_000);

        assertThat(res.pan()).isEqualTo("9860160101080101");
        assertThat(res.holderName()).isEqualTo("AZIZ KARIMOV");
        assertThat(res.cardExpiry()).isEqualTo("12/30");
        assertThat(res.transferTiyin()).isEqualTo(10_000_000);
        assertThat(res.requestedTiyin()).isEqualTo(10_000_000);
        assertThat(res.expiresAt()).isNotNull();
    }

    @Test
    void belowTheMinimumIsRefused() {
        assertThatThrownBy(() -> invoices.create(UUID.randomUUID(), 500))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void aUserMayOnlyHaveOneLiveInvoice() {
        UUID user = UUID.randomUUID();
        invoices.create(user, 100_000);

        assertThatThrownBy(() -> invoices.create(user, 50_000))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    void myActiveReturnsTheLiveInvoice() {
        UUID user = UUID.randomUUID();
        var created = invoices.create(user, 100_000);

        assertThat(invoices.myActive(user)).isPresent()
                .get().extracting(x -> x.id()).isEqualTo(created.id());
        assertThat(invoices.myActive(UUID.randomUUID())).isEmpty();
    }
}
```

- [ ] **Step 10: Run everything and commit**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn clean verify -DargLine="-Dapi.version=1.44"
```

```bash
git add backend/payment-service
git commit -m "feat(payment): add deposit invoices and race-safe slot allocation"
```

---

### Task 5: invoice expiry and the userbot heartbeat gate

**Files:**
- Modify: `.../health/UserbotHealth.java` (replace the Task 4 stub)
- Create: `.../kafka/HeartbeatConsumer.java`
- Create: `.../kafka/PaymentTopics.java`
- Create: `.../invoice/service/InvoiceExpirySweeper.java`
- Create: `.../health/dto/UserbotStatusResponse.java`
- Create: `.../health/controller/AdminUserbotStatusController.java`
- Test: `.../invoice/InvoiceExpirySweeperIT.java`
- Test: `.../health/UserbotHealthIT.java`

**Interfaces:**
- Consumes: `InvoiceRepository.findDue(Instant)` (Task 4).
- Produces:
  - `final class PaymentTopics { String CARD_CREDIT_OBSERVED = "efbazaar.payment.card-credit-observed"; String USERBOT_HEARTBEAT = "efbazaar.payment.userbot-heartbeat"; String DEPOSIT_CREDITED = "efbazaar.payment.deposit-credited"; }`
  - `UserbotHealth.isHealthy()` → `boolean`, `.lastSeenAt()` → `Optional<Instant>`, `.record(Instant)`
  - `record HeartbeatEvent(Instant sentAt)`
  - `record UserbotStatusResponse(boolean healthy, Instant lastSeenAt, long timeoutSeconds)`
  - `GET /api/v1/admin/payments/userbot` → `UserbotStatusResponse`

**Context:** Two independent jobs that both keep the rail honest.

**Expiry** flips `PENDING` invoices past `expires_at` to `EXPIRED`, which releases their `(card, amount)` slot. This is why a late payment can never be auto-credited: by the time it arrives the slot may belong to someone else.

**The heartbeat gate** is the difference between a visible outage and a silent one. If the userbot stops, invoices would still be issued and users would still pay, and nothing would credit. Tracking the last heartbeat and refusing new invoices turns that into an honest error message.

`UserbotHealth` keeps the last heartbeat **in memory**. That is deliberate: a restarted payment-service should treat the userbot as unproven until it hears a fresh heartbeat, which arrives within one interval. Persisting it would let a stale database row vouch for a userbot that died during the restart.

- [ ] **Step 1: Write the failing tests**

`src/test/java/uz/efbazaar/payment/health/UserbotHealthIT.java`:

```java
package uz.efbazaar.payment.health;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class UserbotHealthIT extends AbstractPostgresIT {

    @Autowired UserbotHealth health;

    @Test
    void aFreshHeartbeatIsHealthy() {
        health.record(Instant.now());
        assertThat(health.isHealthy()).isTrue();
        assertThat(health.lastSeenAt()).isPresent();
    }

    @Test
    void aStaleHeartbeatIsNotHealthy() {
        health.record(Instant.now().minus(Duration.ofHours(1)));
        assertThat(health.isHealthy()).isFalse();
    }

    @Test
    void anOlderHeartbeatNeverOverwritesANewerOne() {
        Instant fresh = Instant.now();
        health.record(fresh);
        health.record(fresh.minus(Duration.ofHours(1)));

        assertThat(health.isHealthy())
                .as("a delayed heartbeat must not un-heal a live userbot")
                .isTrue();
    }
}
```

`src/test/java/uz/efbazaar/payment/invoice/InvoiceExpirySweeperIT.java`:

```java
package uz.efbazaar.payment.invoice;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.invoice.service.InvoiceExpirySweeper;
import uz.efbazaar.payment.invoice.service.SlotAllocator;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class InvoiceExpirySweeperIT extends AbstractPostgresIT {

    @Autowired InvoiceExpirySweeper sweeper;
    @Autowired SlotAllocator allocator;
    @Autowired InvoiceRepository invoices;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;

    @BeforeEach
    void clean() {
        invoices.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "AZIZ", (short) 12, (short) 2030));
    }

    @Test
    void aDueInvoiceExpiresAndAFreshOneIsUnaffected() {
        var due = allocator.allocate(UUID.randomUUID(), 10_000_000);
        due.setExpiresAt(Instant.now().minusSeconds(1));
        invoices.save(due);

        var fresh = allocator.allocate(UUID.randomUUID(), 20_000_000);

        sweeper.sweep();

        assertThat(invoices.findById(due.getId()).orElseThrow().getStatus())
                .isEqualTo(InvoiceStatus.EXPIRED);
        assertThat(invoices.findById(fresh.getId()).orElseThrow().getStatus())
                .isEqualTo(InvoiceStatus.PENDING);
    }

    @Test
    void expiringReleasesTheSlotForSomebodyElse() {
        var first = allocator.allocate(UUID.randomUUID(), 10_000_000);
        first.setExpiresAt(Instant.now().minusSeconds(1));
        invoices.save(first);

        sweeper.sweep();

        var second = allocator.allocate(UUID.randomUUID(), 10_000_000);
        assertThat(second.getCardId()).isEqualTo(first.getCardId());
        assertThat(second.getTransferAmountTiyin())
                .as("the freed slot is reused at the same amount, no bump")
                .isEqualTo(first.getTransferAmountTiyin());
    }
}
```

The second test is the one that documents *why* late payments go to the manual queue: the slot really
does get handed to a different user.

- [ ] **Step 2: Run them to verify they fail**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn verify -Dit.test=UserbotHealthIT,InvoiceExpirySweeperIT -DargLine="-Dapi.version=1.44"
```

Expected: compilation failure — `InvoiceExpirySweeper` does not exist and `UserbotHealth` has no
`record`/`lastSeenAt`.

- [ ] **Step 3: Write the topics constant and the heartbeat plumbing**

`kafka/PaymentTopics.java`:

```java
package uz.efbazaar.payment.kafka;

/** Topic names. Kept in one place so a producer and a consumer cannot drift. */
public final class PaymentTopics {

    public static final String CARD_CREDIT_OBSERVED = "efbazaar.payment.card-credit-observed";
    public static final String USERBOT_HEARTBEAT    = "efbazaar.payment.userbot-heartbeat";
    public static final String DEPOSIT_CREDITED     = "efbazaar.payment.deposit-credited";

    private PaymentTopics() {}
}
```

`health/UserbotHealth.java` — replace the Task 4 stub:

```java
package uz.efbazaar.payment.health;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Freshness of the humo-userbot's heartbeat, and therefore whether the platform
 * can currently see incoming transfers.
 *
 * <p>Held in memory on purpose. After a restart the userbot is unproven until a
 * heartbeat arrives — which takes at most one interval. A persisted timestamp
 * would let a stale row vouch for a userbot that died during the restart.
 */
@Slf4j
@Component
public class UserbotHealth {

    private final AtomicReference<Instant> lastSeen = new AtomicReference<>();

    @Value("${payment.userbot.heartbeat-timeout-seconds}")
    private long timeoutSeconds;

    /** Kafka delivery can reorder; an older beat never un-heals a live bot. */
    public void record(Instant sentAt) {
        lastSeen.updateAndGet(current ->
                current == null || sentAt.isAfter(current) ? sentAt : current);
    }

    public boolean isHealthy() {
        Instant seen = lastSeen.get();
        return seen != null
                && seen.isAfter(Instant.now().minus(Duration.ofSeconds(timeoutSeconds)));
    }

    public Optional<Instant> lastSeenAt() {
        return Optional.ofNullable(lastSeen.get());
    }

    public long timeoutSeconds() {
        return timeoutSeconds;
    }
}
```

`kafka/HeartbeatConsumer.java`:

```java
package uz.efbazaar.payment.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.payment.health.UserbotHealth;

import java.time.Instant;

@Slf4j
@Component
@RequiredArgsConstructor
public class HeartbeatConsumer {

    private final UserbotHealth health;

    public record HeartbeatEvent(Instant sentAt) {}

    @KafkaListener(
            topics = PaymentTopics.USERBOT_HEARTBEAT,
            groupId = "payment-service-userbot-heartbeat")
    public void onHeartbeat(HeartbeatEvent event) {
        if (event == null || event.sentAt() == null) {
            log.warn("heartbeat with no timestamp, ignoring");
            return;
        }
        health.record(event.sentAt());
    }
}
```

- [ ] **Step 4: Write the expiry sweeper**

`invoice/service/InvoiceExpirySweeper.java`:

```java
package uz.efbazaar.payment.invoice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;

import java.time.Instant;
import java.util.List;

/**
 * Flips overdue PENDING invoices to EXPIRED, which releases their
 * {@code (card, amount)} slot for the next payer.
 *
 * <p>That release is exactly why a payment arriving after expiry is never
 * credited automatically: the slot it names may already belong to a different
 * user's live invoice.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InvoiceExpirySweeper {

    private final InvoiceRepository invoices;

    @Scheduled(fixedDelayString = "${payment.scheduler.expiry-sweep-interval-ms:30000}")
    @Transactional
    public void sweep() {
        List<Invoice> due = invoices.findDue(Instant.now());
        if (due.isEmpty()) {
            return;
        }
        for (Invoice inv : due) {
            inv.setStatus(InvoiceStatus.EXPIRED);
        }
        invoices.saveAll(due);
        log.info("Expired {} invoice(s)", due.size());
    }
}
```

Add to `application.yml`:

```yaml
payment:
  scheduler:
    expiry-sweep-interval-ms: 30000
```

- [ ] **Step 5: Write the admin status endpoint**

`health/dto/UserbotStatusResponse.java`:

```java
package uz.efbazaar.payment.health.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserbotStatusResponse(boolean healthy, Instant lastSeenAt, long timeoutSeconds) {}
```

`health/controller/AdminUserbotStatusController.java`:

```java
package uz.efbazaar.payment.health.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.health.UserbotHealth;
import uz.efbazaar.payment.health.dto.UserbotStatusResponse;

@RestController
@RequestMapping("/api/v1/admin/payments/userbot")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
@RequiredArgsConstructor
public class AdminUserbotStatusController {

    private final UserbotHealth health;

    @GetMapping
    public UserbotStatusResponse status() {
        return new UserbotStatusResponse(
                health.isHealthy(),
                health.lastSeenAt().orElse(null),
                health.timeoutSeconds());
    }
}
```

- [ ] **Step 6: Add the gate test**

Append to `InvoiceServiceIT` from Task 4:

```java
    @Test
    void aStaleUserbotStopsNewInvoices() {
        // UserbotHealth is @Autowired into InvoiceService; drive it directly.
        userbotHealth.record(Instant.now().minus(Duration.ofHours(1)));

        assertThatThrownBy(() -> invoices.create(UUID.randomUUID(), 100_000))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("503");
    }
```

Add `@Autowired UserbotHealth userbotHealth;` to the test class, and in its `@BeforeEach` call
`userbotHealth.record(Instant.now())` so the other tests in the class run against a healthy bot.
Without that the gate breaks every existing test in the file.

- [ ] **Step 7: Run and commit**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn clean verify -DargLine="-Dapi.version=1.44"
```

```bash
git add backend/payment-service
git commit -m "feat(payment): expire stale invoices and gate deposits on userbot liveness"
```

---

### Task 6: humo-userbot

**Files:**
- Create: `humo-userbot/pyproject.toml`
- Create: `humo-userbot/requirements.txt`
- Create: `humo-userbot/requirements-dev.txt`
- Create: `humo-userbot/Dockerfile`
- Create: `humo-userbot/README.md`
- Create: `humo-userbot/humo_userbot/__init__.py`
- Create: `humo-userbot/humo_userbot/config.py`
- Create: `humo-userbot/humo_userbot/parser.py`
- Create: `humo-userbot/humo_userbot/kafka_client.py`
- Create: `humo-userbot/humo_userbot/main.py`
- Create: `humo-userbot/tests/__init__.py`
- Create: `humo-userbot/tests/test_parser.py`
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces, on `efbazaar.payment.card-credit-observed`, keyed by `telegramMessageId`:
  ```json
  {"telegramMessageId": 12345, "cardLast4": "4556", "amountTiyin": 3000000,
   "cardBalanceTiyin": 3165916, "observedAt": "2026-08-10T20:41:00Z",
   "rawText": "🎉 To'ldirish\n➕ 30.000,00 UZS\n..."}
  ```
- Produces, on `efbazaar.payment.userbot-heartbeat`: `{"sentAt": "2026-08-10T20:41:00Z"}`
- Python API: `parse_topup(text: str) -> TopUp | None`, where `TopUp` is a frozen dataclass with
  `amount_tiyin: int`, `card_last4: str`, `card_balance_tiyin: int | None`

**Context:** The userbot knows nothing about invoices. It parses and reports; payment-service decides what a message means. That split is what lets this service be tested without Telegram and keeps every money rule inside one transactional service.

The Humo bot's top-up message:

```
🎉 To'ldirish
➕ 30.000,00 UZS
📍 PAYME AJ P2P HUMO2H
💳 HUMOCARD *4556
🕓 20:41 10.08.2026
💰 31.659,16 UZS
```

`30.000,00` uses `.` for thousands and `,` for decimals — it is 30 000 UZS, which is 3 000 000 tiyin. The trailing `💰` line is the card's balance after the movement.

**The filter is a correctness boundary, not a convenience.** The same chat carries withdrawal notifications and messages about other cards. A withdrawal misread as a top-up credits a user money nobody sent. Match on the top-up marker, and require both an amount and a card tail before emitting anything.

Model this service on `smart-admin-worker/`: same `pyproject.toml` shape, `pydantic-settings` config, `aiokafka` producer, `logging_config.py` pattern. Read that service's `kafka/producer.py` before writing this one.

- [ ] **Step 1: Write the failing parser tests**

`humo-userbot/tests/test_parser.py`:

```python
"""Parser tests over real captured Humo bot messages.

No Telegram, no network, no Kafka — parse_topup is a pure function and this
file is what proves the filter that separates a top-up from a withdrawal.
"""

from humo_userbot.parser import parse_topup

TOPUP = (
    "🎉 To'ldirish\n"
    "➕ 30.000,00 UZS\n"
    "📍 PAYME AJ P2P HUMO2H\n"
    "💳 HUMOCARD *4556\n"
    "🕓 20:41 10.08.2026\n"
    "💰 31.659,16 UZS"
)

WITHDRAWAL = (
    "💸 Yechish\n"
    "➖ 30.000,00 UZS\n"
    "📍 PAYME AJ P2P HUMO2H\n"
    "💳 HUMOCARD *4556\n"
    "🕓 20:45 10.08.2026\n"
    "💰 1.659,16 UZS"
)


def test_a_topup_is_parsed():
    result = parse_topup(TOPUP)
    assert result is not None
    assert result.amount_tiyin == 3_000_000
    assert result.card_last4 == "4556"
    assert result.card_balance_tiyin == 3_165_916


def test_a_withdrawal_is_not_a_topup():
    assert parse_topup(WITHDRAWAL) is None


def test_a_small_amount_without_a_thousands_separator():
    text = TOPUP.replace("➕ 30.000,00 UZS", "➕ 1.000,00 UZS")
    result = parse_topup(text)
    assert result is not None
    assert result.amount_tiyin == 100_000


def test_the_bumped_amount_survives_the_decimal_conversion():
    text = TOPUP.replace("➕ 30.000,00 UZS", "➕ 100.100,00 UZS")
    result = parse_topup(text)
    assert result is not None
    assert result.amount_tiyin == 10_010_000


def test_a_non_zero_decimal_part_is_kept():
    text = TOPUP.replace("➕ 30.000,00 UZS", "➕ 30.000,55 UZS")
    result = parse_topup(text)
    assert result is not None
    assert result.amount_tiyin == 3_000_055


def test_a_message_without_a_card_tail_is_rejected():
    text = "\n".join(line for line in TOPUP.splitlines() if "HUMOCARD" not in line)
    assert parse_topup(text) is None


def test_a_message_without_an_amount_is_rejected():
    text = "\n".join(line for line in TOPUP.splitlines() if "➕" not in line)
    assert parse_topup(text) is None


def test_a_missing_balance_line_still_parses():
    text = "\n".join(line for line in TOPUP.splitlines() if "💰" not in line)
    result = parse_topup(text)
    assert result is not None
    assert result.amount_tiyin == 3_000_000
    assert result.card_balance_tiyin is None


def test_empty_and_none_are_safe():
    assert parse_topup("") is None
    assert parse_topup(None) is None


def test_an_unrelated_message_is_ignored():
    assert parse_topup("Sizning balansingiz: 31.659,16 UZS") is None
```

Ask the owner for one real withdrawal message and one real "other card" message to replace the
invented `WITHDRAWAL` fixture above. The top-up fixture is real; the withdrawal one is a
reconstruction and the filter it pins is the highest-consequence line in this service.

- [ ] **Step 2: Run them to verify they fail**

```bash
cd humo-userbot && python -m pytest tests/test_parser.py -v
```

Expected: `ModuleNotFoundError: No module named 'humo_userbot.parser'`.

- [ ] **Step 3: Write the parser**

`humo_userbot/parser.py`:

```python
"""Humo bot message -> structured top-up.

A pure function over text. No Telegram import belongs in this file: keeping it
dependency-free is what makes the filter testable, and the filter is the line
between crediting a real deposit and crediting somebody else's withdrawal.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# "➕ 30.000,00 UZS" — '.' groups thousands, ',' separates decimals.
_AMOUNT = re.compile(r"➕\s*([\d.\s]+(?:,\d+)?)\s*UZS")
# "💳 HUMOCARD *4556"
_CARD = re.compile(r"💳\s*HUMOCARD\s*\*(\d{4})")
# "💰 31.659,16 UZS" — the card balance after the movement.
_BALANCE = re.compile(r"💰\s*([\d.\s]+(?:,\d+)?)\s*UZS")

_TOPUP_MARKER = "To'ldirish"


@dataclass(frozen=True)
class TopUp:
    amount_tiyin: int
    card_last4: str
    card_balance_tiyin: int | None


def _to_tiyin(raw: str) -> int:
    """'30.000,00' -> 3_000_000 tiyin.

    Integer arithmetic throughout: this is money, and a float would round.
    """
    cleaned = raw.replace(".", "").replace(" ", "").replace(" ", "")
    if "," in cleaned:
        whole, _, frac = cleaned.partition(",")
    else:
        whole, frac = cleaned, "0"
    frac = (frac + "00")[:2]
    return int(whole) * 100 + int(frac)


def parse_topup(text: str | None) -> TopUp | None:
    """Return a TopUp, or None when the message is not one.

    None covers every non-top-up case: withdrawals, balance notices, and
    malformed messages. The caller emits nothing for None.
    """
    if not text:
        return None

    # The marker AND the plus sign must both be present. A withdrawal carries
    # '➖' and a different heading, so either check alone would be enough --
    # requiring both keeps a wording change from silently widening the filter.
    if _TOPUP_MARKER not in text or "➕" not in text:
        return None

    amount_match = _AMOUNT.search(text)
    card_match = _CARD.search(text)
    if not amount_match or not card_match:
        return None

    balance_match = _BALANCE.search(text)
    return TopUp(
        amount_tiyin=_to_tiyin(amount_match.group(1)),
        card_last4=card_match.group(1),
        card_balance_tiyin=_to_tiyin(balance_match.group(1)) if balance_match else None,
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd humo-userbot && python -m pytest tests/test_parser.py -v
```

Expected: PASS, 10/10.

- [ ] **Step 5: Write config, the Kafka client and main**

`humo_userbot/config.py`:

```python
"""Runtime configuration from environment variables, validated at startup."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    telegram_api_id: int = Field(alias="TELEGRAM_API_ID")
    telegram_api_hash: str = Field(alias="TELEGRAM_API_HASH")
    telegram_session_name: str = Field(
        default="humo_userbot_session", alias="TELEGRAM_SESSION_NAME"
    )
    telegram_session_dir: str = Field(
        default="/run/secrets", alias="TELEGRAM_SESSION_DIR"
    )
    source_chat: str = Field(default="humocardbot", alias="HUMO_SOURCE_CHAT")

    kafka_bootstrap_servers: str = Field(alias="KAFKA_BOOTSTRAP_SERVERS")
    heartbeat_interval_seconds: int = Field(
        default=60, alias="HEARTBEAT_INTERVAL_SECONDS"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

`humo_userbot/kafka_client.py`:

```python
"""aiokafka producer. Mirrors smart-admin-worker/kafka/producer.py: acks='all'
so a publish failure surfaces to the caller rather than being lost."""

from __future__ import annotations

import json
import logging
from typing import Any

from aiokafka import AIOKafkaProducer

log = logging.getLogger(__name__)

CARD_CREDIT_OBSERVED = "efbazaar.payment.card-credit-observed"
USERBOT_HEARTBEAT = "efbazaar.payment.userbot-heartbeat"


class KafkaClient:
    def __init__(self, bootstrap_servers: str) -> None:
        self._bootstrap = bootstrap_servers
        self._producer: AIOKafkaProducer | None = None

    async def start(self) -> None:
        self._producer = AIOKafkaProducer(
            bootstrap_servers=self._bootstrap,
            enable_idempotence=False,
            acks="all",
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
        )
        await self._producer.start()

    async def stop(self) -> None:
        if self._producer is not None:
            await self._producer.stop()
            self._producer = None

    async def publish(self, topic: str, value: dict[str, Any], key: str | None = None) -> None:
        if self._producer is None:
            raise RuntimeError("Kafka producer not started")
        await self._producer.send_and_wait(topic, value=value, key=key)
```

`humo_userbot/main.py`:

```python
"""Telegram userbot: watches the Humo bot's chat and reports every top-up.

Runs continuously rather than starting per invoice. Reconnecting churns the
Telegram session and drops whatever arrives during the gap, and a dropped
message is money the platform cannot see.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from pyrogram import Client, filters

from humo_userbot.config import get_settings
from humo_userbot.kafka_client import (
    CARD_CREDIT_OBSERVED,
    USERBOT_HEARTBEAT,
    KafkaClient,
)
from humo_userbot.parser import parse_topup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger(__name__)

settings = get_settings()
kafka = KafkaClient(settings.kafka_bootstrap_servers)

app = Client(
    settings.telegram_session_name,
    api_id=settings.telegram_api_id,
    api_hash=settings.telegram_api_hash,
    workdir=settings.telegram_session_dir,
)


@app.on_message(filters.chat(settings.source_chat))
async def on_humo_message(_client, message) -> None:
    text = message.text or message.caption
    parsed = parse_topup(text)
    if parsed is None:
        log.debug("message %s is not a top-up, ignoring", message.id)
        return

    observed_at = (message.date or datetime.now(timezone.utc)).astimezone(timezone.utc)
    payload = {
        "telegramMessageId": message.id,
        "cardLast4": parsed.card_last4,
        "amountTiyin": parsed.amount_tiyin,
        "cardBalanceTiyin": parsed.card_balance_tiyin,
        "observedAt": observed_at.isoformat(),
        "rawText": text,
    }
    await kafka.publish(CARD_CREDIT_OBSERVED, payload, key=str(message.id))
    log.info(
        "observed top-up %s tiyin on card *%s (message %s)",
        parsed.amount_tiyin,
        parsed.card_last4,
        message.id,
    )


async def heartbeat_loop() -> None:
    while True:
        try:
            await kafka.publish(
                USERBOT_HEARTBEAT,
                {"sentAt": datetime.now(timezone.utc).isoformat()},
            )
        except Exception:
            log.exception("heartbeat publish failed")
        await asyncio.sleep(settings.heartbeat_interval_seconds)


async def main() -> None:
    await kafka.start()
    await app.start()
    log.info("humo-userbot started, watching %s", settings.source_chat)
    try:
        await heartbeat_loop()
    finally:
        await app.stop()
        await kafka.stop()


if __name__ == "__main__":
    asyncio.run(main())
```

`requirements.txt`:

```
pyrogram==2.0.106
TgCrypto==1.2.5
aiokafka==0.10.0
pydantic==2.9.2
pydantic-settings==2.5.2
```

`requirements-dev.txt`:

```
-r requirements.txt
pytest==8.3.3
ruff==0.6.9
```

`Dockerfile`:

```dockerfile
# ==============================================================
# humo-userbot — watches the Humo bot's Telegram chat
# ==============================================================
FROM python:3.12-slim

RUN groupadd -r app && useradd -r -g app app -m
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY humo_userbot/ ./humo_userbot/

USER app

ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "humo_userbot.main"]
```

No `EXPOSE` and no healthcheck: this service has no HTTP surface. Its liveness is reported through
the Kafka heartbeat, which is what payment-service actually gates on.

`README.md` must document the one-time interactive login: the session file is produced by running the
client once with a phone number, the code Telegram sends, and the 2FA password if the account has
one. It cannot be automated in CI. The resulting `.session` file is mounted as a secret and must
never be committed.

- [ ] **Step 6: Wire docker-compose**

```yaml
  humo-userbot:
    image: ${IMAGE_REGISTRY:-ghcr.io}/${IMAGE_NAMESPACE:-abdurahmoniy/efbazaar}-humo-userbot:${IMAGE_TAG:-latest}
    build:
      context: ./humo-userbot
    container_name: efbazaar-humo-userbot
    restart: unless-stopped
    environment:
      TELEGRAM_API_ID: ${TELEGRAM_API_ID}
      TELEGRAM_API_HASH: ${TELEGRAM_API_HASH}
      TELEGRAM_SESSION_DIR: /session
      HUMO_SOURCE_CHAT: ${HUMO_SOURCE_CHAT:-humocardbot}
      KAFKA_BOOTSTRAP_SERVERS: ${KAFKA_BOOTSTRAP_SERVERS}
    volumes:
      - humo-userbot-session:/session
    depends_on:
      - kafka
    networks:
      - efbazaar-net
```

Add `humo-userbot-session:` to the top-level `volumes:` block. Match the surrounding services'
`networks:` style — read them rather than assuming this snippet fits.

- [ ] **Step 7: Run the tests and commit**

```bash
cd humo-userbot && python -m pytest tests/ -v
```

```bash
git add humo-userbot docker-compose.yml
git commit -m "feat(userbot): add the humo-userbot that reports observed top-ups"
```

---

### Task 7: matching an observation and crediting the wallet

**Files:**
- Create: `backend/payment-service/src/main/resources/db/migration/V4__card_credit_observations.sql`
- Create: `.../observation/domain/CardCreditObservation.java`
- Create: `.../observation/domain/ObservationStatus.java`
- Create: `.../observation/repository/CardCreditObservationRepository.java`
- Create: `.../observation/service/ByCardService.java`
- Create: `.../kafka/CardCreditConsumer.java`
- Create: `.../kafka/PaymentEventPublisher.java`
- Test: `.../observation/ByCardServiceIT.java`

**Interfaces:**
- Consumes: `LedgerService.post` (Task 2), `PlatformCardService.findActiveByLast4`/`.recordBalance` (Task 3), `InvoiceService.findLive`/`.markPaid` (Task 4), `PaymentTopics` (Task 5).
- Produces:
  - `enum ObservationStatus { MATCHED, UNMATCHED, MANUALLY_RESOLVED, IGNORED }`
  - `record CardCreditEvent(Long telegramMessageId, String cardLast4, Long amountTiyin, Long cardBalanceTiyin, Instant observedAt, String rawText)`
  - `ByCardService.ingest(CardCreditEvent event)` → `CardCreditObservation`
  - `ByCardService.resolveManually(UUID observationId, UUID targetUserId, UUID adminId, String note)` — **Task 8 calls this**
  - `ByCardService.markIgnored(UUID observationId, UUID adminId, String note)` — **Task 8 calls this**
  - `PaymentEventPublisher.depositCredited(UUID userId, long amountTiyin, UUID invoiceId)`

**Context:** This is where money is created in a user's wallet, so it is the task whose **negative** branches matter most.

The rule, from spec §6.4: find `PENDING`, non-expired invoices on that card at that exact amount. **Exactly one** → credit. **Zero or more than one** → credit nothing and queue for an admin.

The ledger movement for a credited deposit is three postings, because the user is credited what they requested and the bump is revenue:

```
PLATFORM_CARDS     D transferAmount
  USER_AVAILABLE     C requestedAmount
  PLATFORM_REVENUE   C (transferAmount - requestedAmount)
```

When there is no bump the third posting is zero, and a zero-amount entry violates `chk_entry_non_zero`. **Omit it** rather than writing a zero.

Idempotency is the unique `telegram_message_id`: a Kafka redelivery inserts nothing and credits nothing.

- [ ] **Step 1: Write the failing test**

`src/test/java/uz/efbazaar/payment/observation/ByCardServiceIT.java`:

```java
package uz.efbazaar.payment.observation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.invoice.service.SlotAllocator;
import uz.efbazaar.payment.observation.domain.ObservationStatus;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;
import uz.efbazaar.payment.observation.service.ByCardService;
import uz.efbazaar.payment.observation.service.ByCardService.CardCreditEvent;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.wallet.service.LedgerService;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class ByCardServiceIT extends AbstractPostgresIT {

    @Autowired ByCardService byCard;
    @Autowired SlotAllocator allocator;
    @Autowired InvoiceRepository invoices;
    @Autowired CardCreditObservationRepository observations;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired LedgerService ledger;

    private static final AtomicLong MSG = new AtomicLong(1);

    @BeforeEach
    void clean() {
        observations.deleteAll();
        invoices.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "AZIZ", (short) 12, (short) 2030));
    }

    private CardCreditEvent event(String last4, long amountTiyin) {
        return new CardCreditEvent(MSG.getAndIncrement(), last4, amountTiyin,
                3_165_916L, Instant.now(), "🎉 To'ldirish ...");
    }

    @Test
    void exactlyOneMatchCreditsTheUser() {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);

        var obs = byCard.ingest(event("0101", inv.getTransferAmountTiyin()));

        assertThat(obs.getStatus()).isEqualTo(ObservationStatus.MATCHED);
        assertThat(invoices.findById(inv.getId()).orElseThrow().getStatus())
                .isEqualTo(InvoiceStatus.PAID);
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(10_000_000);
    }

    @Test
    void aBumpedInvoiceCreditsTheRequestedAmountAndBooksTheRest() {
        // Fill the only card at 100 000 so the second invoice is bumped.
        allocator.allocate(UUID.randomUUID(), 10_000_000);
        UUID user = UUID.randomUUID();
        Invoice bumped = allocator.allocate(user, 10_000_000);
        assertThat(bumped.getTransferAmountTiyin()).isEqualTo(10_010_000);

        byCard.ingest(event("0101", 10_010_000));

        assertThat(ledger.balanceOf(user).getAvailableTiyin())
                .as("the user gets what they asked for, not what they sent")
                .isEqualTo(10_000_000);
    }

    @Test
    void noMatchingInvoiceCreditsNothing() {
        UUID user = UUID.randomUUID();
        allocator.allocate(user, 10_000_000);

        var obs = byCard.ingest(event("0101", 7_777_777));

        assertThat(obs.getStatus()).isEqualTo(ObservationStatus.UNMATCHED);
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isZero();
    }

    @Test
    void anExpiredInvoiceIsNotMatchedEvenThoughTheAmountFits() {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);
        inv.setExpiresAt(Instant.now().minusSeconds(1));
        invoices.save(inv);

        var obs = byCard.ingest(event("0101", inv.getTransferAmountTiyin()));

        assertThat(obs.getStatus()).isEqualTo(ObservationStatus.UNMATCHED);
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isZero();
        assertThat(invoices.findById(inv.getId()).orElseThrow().getStatus())
                .isEqualTo(InvoiceStatus.PENDING);
    }

    @Test
    void aCardWeDoNotOwnIsIgnored() {
        var obs = byCard.ingest(event("9999", 10_000_000));
        assertThat(obs.getStatus()).isEqualTo(ObservationStatus.IGNORED);
    }

    @Test
    void aReplayedMessageCreditsOnce() {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);
        var e = event("0101", inv.getTransferAmountTiyin());

        byCard.ingest(e);
        byCard.ingest(e);

        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(10_000_000);
        assertThat(observations.count()).isEqualTo(1);
    }

    @Test
    void theCardBalanceIsRecordedFromTheMessage() {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);

        byCard.ingest(event("0101", inv.getTransferAmountTiyin()));

        var card = cardRepo.findByLast4AndActiveTrue("0101").orElseThrow();
        assertThat(card.getBalanceTiyin()).isEqualTo(3_165_916);
        assertThat(card.getBalanceObservedAt()).isNotNull();
    }

    @Test
    void anObservationAlwaysKeepsTheRawMessage() {
        byCard.ingest(event("0101", 12_345));
        assertThat(observations.findAll())
                .allSatisfy(o -> assertThat(o.getRawText()).isNotBlank());
    }
}
```

`aCardWeDoNotOwnIsIgnored` and `anExpiredInvoiceIsNotMatched...` are the two that keep users' money
safe. If either starts failing, the fix is never to widen the match.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn verify -Dit.test=ByCardServiceIT -DargLine="-Dapi.version=1.44"
```

Expected: compilation failure — `ByCardService` does not exist.

- [ ] **Step 3: Write the migration**

`src/main/resources/db/migration/V4__card_credit_observations.sql`:

```sql
-- payment-service V4 — every top-up the userbot saw, matched or not.
--
-- Doubles as the reconciliation queue: WHERE status = 'UNMATCHED'. A separate
-- queue table would have to be kept in step with this one for no benefit.

CREATE TABLE card_credit_observations (
    id                  UUID PRIMARY KEY,
    telegram_message_id BIGINT      NOT NULL UNIQUE,
    card_last4          VARCHAR(4)  NOT NULL,
    amount_tiyin        BIGINT      NOT NULL,
    card_balance_tiyin  BIGINT,
    observed_at         TIMESTAMPTZ NOT NULL,
    raw_text            TEXT        NOT NULL,
    status              VARCHAR(24) NOT NULL,
    invoice_id          UUID        REFERENCES invoices(id),
    resolved_by         UUID,
    resolved_at         TIMESTAMPTZ,
    resolution_note     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The admin queue's lookup, oldest first.
CREATE INDEX ix_observations_unmatched
    ON card_credit_observations (observed_at) WHERE status = 'UNMATCHED';
```

`raw_text` is kept on purpose: when the Humo bot changes its wording, the failures are diagnosable
from stored evidence instead of guesswork.

- [ ] **Step 4: Write the domain and repository**

`observation/domain/ObservationStatus.java`:

```java
package uz.efbazaar.payment.observation.domain;

public enum ObservationStatus {
    /** Attributed to exactly one live invoice and credited. */
    MATCHED,
    /** Zero or several candidates — waiting for an admin. Nothing credited. */
    UNMATCHED,
    /** An admin attributed it by hand. */
    MANUALLY_RESOLVED,
    /** A card the platform does not own, or an admin dismissed it. */
    IGNORED
}
```

`observation/domain/CardCreditObservation.java`:

```java
package uz.efbazaar.payment.observation.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "card_credit_observations")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CardCreditObservation {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    /** Idempotency key. A Kafka redelivery collides here and credits nothing. */
    @Column(name = "telegram_message_id", nullable = false, updatable = false)
    private long telegramMessageId;

    @Column(name = "card_last4", nullable = false, length = 4)
    private String cardLast4;

    @Column(name = "amount_tiyin", nullable = false)
    private long amountTiyin;

    @Column(name = "card_balance_tiyin")
    private Long cardBalanceTiyin;

    @Column(name = "observed_at", nullable = false)
    private Instant observedAt;

    @Column(name = "raw_text", nullable = false)
    private String rawText;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private ObservationStatus status;

    @Column(name = "invoice_id")
    private UUID invoiceId;

    @Column(name = "resolved_by")
    private UUID resolvedBy;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "resolution_note")
    private String resolutionNote;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
```

`observation/repository/CardCreditObservationRepository.java`:

```java
package uz.efbazaar.payment.observation.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.observation.domain.CardCreditObservation;
import uz.efbazaar.payment.observation.domain.ObservationStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CardCreditObservationRepository
        extends JpaRepository<CardCreditObservation, UUID> {

    Optional<CardCreditObservation> findByTelegramMessageId(long telegramMessageId);

    List<CardCreditObservation> findByStatusOrderByObservedAtAsc(ObservationStatus status);
}
```

- [ ] **Step 5: Write the publisher and ByCardService**

`kafka/PaymentEventPublisher.java`:

```java
package uz.efbazaar.payment.kafka;

import lombok.RequiredArgsConstructor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class PaymentEventPublisher {

    private final KafkaTemplate<String, Object> kafka;

    public record DepositCredited(UUID userId, long amountTiyin, UUID invoiceId, Instant occurredAt) {}

    public void depositCredited(UUID userId, long amountTiyin, UUID invoiceId) {
        kafka.send(PaymentTopics.DEPOSIT_CREDITED, userId.toString(),
                new DepositCredited(userId, amountTiyin, invoiceId, Instant.now()));
    }
}
```

`observation/service/ByCardService.java`:

```java
package uz.efbazaar.payment.observation.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.domain.PlatformCard;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.service.InvoiceService;
import uz.efbazaar.payment.kafka.PaymentEventPublisher;
import uz.efbazaar.payment.observation.domain.CardCreditObservation;
import uz.efbazaar.payment.observation.domain.ObservationStatus;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Turns an observed card credit into a wallet credit — or into an admin's
 * problem, which is the safer default.
 *
 * <p>The whole design rests on one rule: a credit happens only when the
 * observation names EXACTLY ONE live invoice. Zero candidates and several
 * candidates are both refusals. An expired invoice is not a candidate at all,
 * because its slot has been released and may already belong to a different
 * user's live invoice — crediting on amount alone would credit the wrong
 * person.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ByCardService {

    private final CardCreditObservationRepository observations;
    private final PlatformCardService cards;
    private final InvoiceService invoices;
    private final LedgerService ledger;
    private final PaymentEventPublisher events;

    public record CardCreditEvent(
            Long telegramMessageId,
            String cardLast4,
            Long amountTiyin,
            Long cardBalanceTiyin,
            Instant observedAt,
            String rawText) {}

    @Transactional
    public CardCreditObservation ingest(CardCreditEvent event) {
        Optional<CardCreditObservation> seen =
                observations.findByTelegramMessageId(event.telegramMessageId());
        if (seen.isPresent()) {
            log.debug("Telegram message {} already ingested", event.telegramMessageId());
            return seen.get();
        }

        CardCreditObservation obs = CardCreditObservation.builder()
                .id(UUID.randomUUID())
                .telegramMessageId(event.telegramMessageId())
                .cardLast4(event.cardLast4())
                .amountTiyin(event.amountTiyin())
                .cardBalanceTiyin(event.cardBalanceTiyin())
                .observedAt(event.observedAt())
                .rawText(event.rawText())
                .status(ObservationStatus.UNMATCHED)
                .createdAt(Instant.now())
                .build();

        Optional<PlatformCard> card = cards.findActiveByLast4(event.cardLast4());
        if (card.isEmpty()) {
            // Not our card. Nothing to reconcile and nothing to credit.
            obs.setStatus(ObservationStatus.IGNORED);
            obs.setResolutionNote("Bu karta platformaga tegishli emas");
            return observations.save(obs);
        }

        if (event.cardBalanceTiyin() != null) {
            cards.recordBalance(card.get().getId(), event.cardBalanceTiyin(), event.observedAt());
        }

        List<Invoice> candidates = invoices.findLive(
                card.get().getId(), event.amountTiyin(), event.observedAt());

        if (candidates.size() != 1) {
            log.warn("Observation {} matched {} invoices on card *{} at {} tiyin — queued",
                    obs.getId(), candidates.size(), event.cardLast4(), event.amountTiyin());
            return observations.save(obs);
        }

        Invoice invoice = candidates.get(0);
        credit(invoice, obs);
        obs.setStatus(ObservationStatus.MATCHED);
        obs.setInvoiceId(invoice.getId());
        return observations.save(obs);
    }

    /**
     * An admin attributes a queued observation to a user by hand. The credited
     * amount is what actually arrived — there is no invoice to take a requested
     * amount from.
     */
    @Transactional
    public CardCreditObservation resolveManually(UUID observationId, UUID targetUserId,
                                                 UUID adminId, String note) {
        CardCreditObservation obs = require(observationId);
        if (obs.getStatus() != ObservationStatus.UNMATCHED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu tushum allaqachon hal qilingan: " + obs.getStatus());
        }
        if (note == null || note.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Izoh majburiy — nima uchun biriktirilgani yozilishi kerak");
        }

        ledger.post(TransactionKind.ADJUSTMENT, "obs-manual-" + obs.getId(), adminId, note,
                List.of(new Posting(LedgerAccount.PLATFORM_CARDS, null, obs.getAmountTiyin()),
                        new Posting(LedgerAccount.USER_AVAILABLE, targetUserId,
                                -obs.getAmountTiyin())));

        obs.setStatus(ObservationStatus.MANUALLY_RESOLVED);
        obs.setResolvedBy(adminId);
        obs.setResolvedAt(Instant.now());
        obs.setResolutionNote(note);
        return observations.save(obs);
    }

    @Transactional
    public CardCreditObservation markIgnored(UUID observationId, UUID adminId, String note) {
        CardCreditObservation obs = require(observationId);
        if (obs.getStatus() != ObservationStatus.UNMATCHED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu tushum allaqachon hal qilingan: " + obs.getStatus());
        }
        obs.setStatus(ObservationStatus.IGNORED);
        obs.setResolvedBy(adminId);
        obs.setResolvedAt(Instant.now());
        obs.setResolutionNote(note);
        return observations.save(obs);
    }

    @Transactional(readOnly = true)
    public List<CardCreditObservation> unmatched() {
        return observations.findByStatusOrderByObservedAtAsc(ObservationStatus.UNMATCHED);
    }

    private void credit(Invoice invoice, CardCreditObservation obs) {
        long transferred = invoice.getTransferAmountTiyin();
        long credited = invoice.getRequestedAmountTiyin();
        long bump = transferred - credited;

        List<Posting> postings = new ArrayList<>();
        postings.add(new Posting(LedgerAccount.PLATFORM_CARDS, null, transferred));
        postings.add(new Posting(LedgerAccount.USER_AVAILABLE, invoice.getUserId(), -credited));
        if (bump > 0) {
            // Omitted when zero: chk_entry_non_zero rejects a zero entry.
            postings.add(new Posting(LedgerAccount.PLATFORM_REVENUE, null, -bump));
        }

        ledger.post(TransactionKind.DEPOSIT, "invoice-" + invoice.getId(), null, null, postings);
        invoices.markPaid(invoice, obs.getId());
        events.depositCredited(invoice.getUserId(), credited, invoice.getId());
    }

    private CardCreditObservation require(UUID id) {
        return observations.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Tushum topilmadi"));
    }
}
```

- [ ] **Step 6: Write the consumer**

`kafka/CardCreditConsumer.java`:

```java
package uz.efbazaar.payment.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.payment.observation.service.ByCardService;
import uz.efbazaar.payment.observation.service.ByCardService.CardCreditEvent;

@Slf4j
@Component
@RequiredArgsConstructor
public class CardCreditConsumer {

    private final ByCardService byCard;

    @KafkaListener(
            topics = PaymentTopics.CARD_CREDIT_OBSERVED,
            groupId = "payment-service-card-credit")
    public void onCardCredit(CardCreditEvent event) {
        if (event == null || event.telegramMessageId() == null
                || event.cardLast4() == null || event.amountTiyin() == null) {
            log.warn("card-credit-observed with missing fields, skipping: {}", event);
            return;
        }
        byCard.ingest(event);
    }
}
```

- [ ] **Step 7: Run and commit**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn clean verify -DargLine="-Dapi.version=1.44"
```

Expected: `ByCardServiceIT` 8/8, whole module green.

```bash
git add backend/payment-service
git commit -m "feat(payment): match observed card credits to invoices and credit wallets"
```

---

### Task 8: the unmatched credits queue

**Files:**
- Create: `.../observation/dto/ObservationResponse.java`
- Create: `.../observation/dto/ResolveObservationRequest.java`
- Create: `.../observation/dto/IgnoreObservationRequest.java`
- Create: `.../observation/controller/AdminObservationController.java`
- Test: `.../observation/AdminObservationControllerIT.java`

**Interfaces:**
- Consumes: `ByCardService.unmatched()`, `.resolveManually(...)`, `.markIgnored(...)` (Task 7).
- Produces:
  - `record ObservationResponse(UUID id, String cardLast4, long amountTiyin, Long cardBalanceTiyin, Instant observedAt, String rawText, ObservationStatus status)`
  - `record ResolveObservationRequest(@NotNull UUID userId, @NotBlank @Size(max = 500) String note)`
  - `record IgnoreObservationRequest(@Size(max = 500) String note)`
- Endpoints, all `ROLE_ADMIN`:
  - `GET  /api/v1/admin/payments/observations/unmatched`
  - `POST /api/v1/admin/payments/observations/{id}/resolve`
  - `POST /api/v1/admin/payments/observations/{id}/ignore`

**Context:** The queue is where every payment the system could not attribute ends up. The admin sees the amount, the card, when it arrived and the raw Telegram message, then either attributes it to a user or dismisses it.

Attributing credits the amount that **actually arrived** — there is no invoice to read a requested amount from — through an `ADJUSTMENT` transaction carrying the admin's id and a mandatory note.

- [ ] **Step 1: Write the failing test**

`src/test/java/uz/efbazaar/payment/observation/AdminObservationControllerIT.java`:

```java
package uz.efbazaar.payment.observation;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.observation.domain.CardCreditObservation;
import uz.efbazaar.payment.observation.domain.ObservationStatus;
import uz.efbazaar.payment.observation.dto.ResolveObservationRequest;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;
import uz.efbazaar.payment.observation.service.ByCardService;
import uz.efbazaar.payment.observation.service.ByCardService.CardCreditEvent;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.wallet.service.LedgerService;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asAdmin;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class AdminObservationControllerIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired ByCardService byCard;
    @Autowired LedgerService ledger;
    @Autowired CardCreditObservationRepository observations;
    @Autowired InvoiceRepository invoices;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;

    @BeforeEach
    void clean() {
        observations.deleteAll();
        invoices.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "AZIZ", (short) 12, (short) 2030));
    }

    /** An observation with no invoice behind it — the queue's whole subject. */
    private CardCreditObservation queued(long amountTiyin) {
        return byCard.ingest(new CardCreditEvent(
                System.nanoTime(), "0101", amountTiyin, 3_165_916L,
                Instant.now(), "🎉 To'ldirish\n➕ ... UZS"));
    }

    @Test
    void aPlainUserIsForbidden() throws Exception {
        mvc.perform(get("/api/v1/admin/payments/observations/unmatched")
                        .with(asUser(UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }

    @Test
    void theQueueShowsWhatTheAdminNeedsToDecide() throws Exception {
        var obs = queued(7_777_777);
        assertThat(obs.getStatus()).isEqualTo(ObservationStatus.UNMATCHED);
        String id = obs.getId().toString();
        String sel = "$[?(@.id=='" + id + "')]";

        mvc.perform(get("/api/v1/admin/payments/observations/unmatched").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath(sel).exists())
                .andExpect(jsonPath(sel + ".amountTiyin").value(org.hamcrest.Matchers.hasItem(7777777)))
                .andExpect(jsonPath(sel + ".cardLast4").value(org.hamcrest.Matchers.hasItem("0101")))
                .andExpect(jsonPath(sel + ".rawText").exists());
    }

    @Test
    void resolvingCreditsTheNamedUserTheAmountThatArrived() throws Exception {
        var obs = queued(7_777_777);
        UUID target = UUID.randomUUID();

        mvc.perform(post("/api/v1/admin/payments/observations/{id}/resolve", obs.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                new ResolveObservationRequest(target, "Telegram orqali tasdiqlandi"))))
                .andExpect(status().isOk());

        assertThat(ledger.balanceOf(target).getAvailableTiyin()).isEqualTo(7_777_777);
        assertThat(observations.findById(obs.getId()).orElseThrow().getStatus())
                .isEqualTo(ObservationStatus.MANUALLY_RESOLVED);
    }

    @Test
    void resolvingWithoutANoteIsRefused() throws Exception {
        var obs = queued(7_777_777);

        mvc.perform(post("/api/v1/admin/payments/observations/{id}/resolve", obs.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                new ResolveObservationRequest(UUID.randomUUID(), "  "))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void thesameObservationCannotBeResolvedTwice() throws Exception {
        var obs = queued(7_777_777);
        UUID target = UUID.randomUUID();
        String body = json.writeValueAsString(
                new ResolveObservationRequest(target, "birinchi marta"));

        mvc.perform(post("/api/v1/admin/payments/observations/{id}/resolve", obs.getId())
                        .with(asAdmin()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/admin/payments/observations/{id}/resolve", obs.getId())
                        .with(asAdmin()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());

        assertThat(ledger.balanceOf(target).getAvailableTiyin())
                .as("a double resolve must not double credit")
                .isEqualTo(7_777_777);
    }
}
```

The queue assertion selects by observation id rather than by array position. The queue is a global
list ordered by arrival, so `$[0]` would depend on what other tests left behind — a mistake this
codebase has already paid for once.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn verify -Dit.test=AdminObservationControllerIT -DargLine="-Dapi.version=1.44"
```

Expected: compilation failure — the DTOs and controller do not exist.

- [ ] **Step 3: Write the DTOs**

`observation/dto/ObservationResponse.java`:

```java
package uz.efbazaar.payment.observation.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.payment.observation.domain.CardCreditObservation;
import uz.efbazaar.payment.observation.domain.ObservationStatus;

import java.time.Instant;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ObservationResponse(
        UUID id,
        String cardLast4,
        long amountTiyin,
        Long cardBalanceTiyin,
        Instant observedAt,
        /** The original Telegram text — the admin decides from what actually arrived. */
        String rawText,
        ObservationStatus status
) {
    public static ObservationResponse of(CardCreditObservation o) {
        return new ObservationResponse(
                o.getId(), o.getCardLast4(), o.getAmountTiyin(), o.getCardBalanceTiyin(),
                o.getObservedAt(), o.getRawText(), o.getStatus());
    }
}
```

`observation/dto/ResolveObservationRequest.java`:

```java
package uz.efbazaar.payment.observation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record ResolveObservationRequest(
        @NotNull UUID userId,
        /** Mandatory: an admin creating money by hand must say why. */
        @NotBlank @Size(max = 500) String note
) {}
```

`observation/dto/IgnoreObservationRequest.java`:

```java
package uz.efbazaar.payment.observation.dto;

import jakarta.validation.constraints.Size;

public record IgnoreObservationRequest(@Size(max = 500) String note) {}
```

- [ ] **Step 4: Write the controller**

`observation/controller/AdminObservationController.java`:

```java
package uz.efbazaar.payment.observation.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.observation.dto.IgnoreObservationRequest;
import uz.efbazaar.payment.observation.dto.ObservationResponse;
import uz.efbazaar.payment.observation.dto.ResolveObservationRequest;
import uz.efbazaar.payment.observation.service.ByCardService;
import uz.efbazaar.payment.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/payments/observations")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
@RequiredArgsConstructor
public class AdminObservationController {

    private final ByCardService byCard;

    @GetMapping("/unmatched")
    public List<ObservationResponse> unmatched() {
        return byCard.unmatched().stream().map(ObservationResponse::of).toList();
    }

    @PostMapping("/{id}/resolve")
    public ObservationResponse resolve(@AuthenticationPrincipal AuthenticatedUser me,
                                       @PathVariable UUID id,
                                       @Valid @RequestBody ResolveObservationRequest req) {
        return ObservationResponse.of(
                byCard.resolveManually(id, req.userId(), me.userId(), req.note()));
    }

    @PostMapping("/{id}/ignore")
    public ObservationResponse ignore(@AuthenticationPrincipal AuthenticatedUser me,
                                      @PathVariable UUID id,
                                      @Valid @RequestBody(required = false)
                                      IgnoreObservationRequest req) {
        return ObservationResponse.of(
                byCard.markIgnored(id, me.userId(), req == null ? null : req.note()));
    }
}
```

- [ ] **Step 5: Run and commit**

```bash
cd backend/payment-service && \
JAVA_HOME=/home/mukhiddinov/.jdks/openjdk-21.0.2 mvn clean verify -DargLine="-Dapi.version=1.44"
```

```bash
git add backend/payment-service
git commit -m "feat(payment): add the unmatched credits queue with manual attribution"
```

---

### Task 9: wallet page and the top-up flow

**Files:**
- Create: `frontend/src/app/api/payment/[...path]/route.ts`
- Create: `frontend/src/lib/payment-types.ts`
- Create: `frontend/src/lib/payment-server.ts`
- Create: `frontend/src/lib/payment-client.ts`
- Create: `frontend/src/lib/money.ts`
- Create: `frontend/src/lib/money.test.ts`
- Create: `frontend/src/app/hamyon/page.tsx`
- Create: `frontend/src/components/payment/top-up-form.tsx`
- Create: `frontend/src/components/payment/invoice-panel.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/payments/wallet`, `POST /api/v1/payments/invoices`, `GET /api/v1/payments/invoices/active` (Tasks 2, 4).
- Produces:
  - `formatTiyin(tiyin: number): string` — `10000000` → `"100 000"`
  - `uzsToTiyin(uzs: number): number`
  - `types WalletResponse`, `InvoiceResponse`
  - `createInvoice(amountUzs)`, `getActiveInvoice()`, `getWalletHistory()` in `payment-client.ts`
  - `getWallet()`, `getActiveInvoiceSSR()`, `getWalletHistorySSR()` in `payment-server.ts`
  - `type WalletEntryResponse` in `payment-types.ts`

**Context:** Two screens' worth of behaviour, both driven by one rule the user must not miss: **the transfer amount has to match to the tiyin.** If it does not, the system cannot attribute the payment and it lands in a manual queue.

The invoice panel therefore leads with the exact amount, makes it copyable, and states plainly that a different amount cannot be matched automatically. When the amount differs from what the user asked for — the bump — the panel says why, because a user who types 100 000 and is told to send 100 100 will otherwise assume it is a bug and send 100 000.

The proxy route is a straight copy of `frontend/src/app/api/trade/[...path]/route.ts` with `/trade/` changed to `/payment/`. Read that file and copy it verbatim including the `HOP_BY_HOP_HEADERS` set and the path-traversal guard; do not write a simpler version.

- [ ] **Step 1: Write the failing money-formatting test**

`frontend/src/lib/money.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { formatTiyin, uzsToTiyin } from './money';

describe('formatTiyin', () => {
  it('renders whole so\'m with thin spaces', () => {
    expect(formatTiyin(10_000_000)).toBe('100 000');
  });

  it('keeps a non-zero tiyin part', () => {
    expect(formatTiyin(10_000_055)).toBe('100 000,55');
  });

  it('handles zero', () => {
    expect(formatTiyin(0)).toBe('0');
  });

  it('handles the bumped amount', () => {
    expect(formatTiyin(10_010_000)).toBe('100 100');
  });
});

describe('uzsToTiyin', () => {
  it('multiplies by a hundred without floating point drift', () => {
    expect(uzsToTiyin(100_000)).toBe(10_000_000);
    expect(uzsToTiyin(1)).toBe(100);
  });
});
```

Use whatever test runner the frontend already uses — check `frontend/package.json` for `vitest` or
`jest` and match the existing `*.test.ts` files' imports rather than the `vitest` import above.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend && npm test -- money
```

Expected: FAIL — `./money` does not exist.

- [ ] **Step 3: Write the money helpers and types**

`frontend/src/lib/money.ts`:

```ts
/**
 * Money is BIGINT tiyin end to end. 1 so'm = 100 tiyin.
 *
 * Never do arithmetic on formatted strings, and never send a float to the
 * backend — `uzsToTiyin` is the only conversion the UI performs.
 */

const NBSP = ' ';

/** 10_000_000 -> "100 000"; 10_000_055 -> "100 000,55" */
export function formatTiyin(tiyin: number): string {
  const whole = Math.trunc(tiyin / 100);
  const frac = Math.abs(tiyin % 100);
  const grouped = whole.toLocaleString('ru-RU').replace(/\s/g, NBSP);
  return frac === 0 ? grouped : `${grouped},${String(frac).padStart(2, '0')}`;
}

export function uzsToTiyin(uzs: number): number {
  return Math.round(uzs) * 100;
}
```

`frontend/src/lib/payment-types.ts`:

```ts
export interface WalletResponse {
  availableTiyin: number;
  heldTiyin: number;
  withdrawPendingTiyin: number;
  lifetimeDepositedTiyin: number;
  lifetimeEarnedTiyin: number;
}

export type InvoiceStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';

export interface InvoiceResponse {
  id: string;
  /** Full card number — the user cannot transfer without it. */
  pan: string;
  holderName: string;
  cardExpiry: string;
  /** What lands in the wallet. */
  requestedTiyin: number;
  /** What the user must actually send. Differs from requested when bumped. */
  transferTiyin: number;
  expiresAt: string;
  status: InvoiceStatus;
}

export type TransactionKind =
  | 'DEPOSIT'
  | 'TRADE_HOLD'
  | 'TRADE_SETTLE'
  | 'TRADE_RELEASE'
  | 'WITHDRAW_RESERVE'
  | 'WITHDRAW_FULFIL'
  | 'WITHDRAW_CANCEL'
  | 'ADJUSTMENT';

export type LedgerAccount =
  | 'PLATFORM_CARDS'
  | 'USER_AVAILABLE'
  | 'USER_HELD'
  | 'WITHDRAW_PENDING'
  | 'PLATFORM_REVENUE'
  | 'PLATFORM_FEES';

export interface WalletEntryResponse {
  transactionId: string;
  kind: TransactionKind;
  account: LedgerAccount;
  /** Ledger sign: negative credits the user. Flip it for display. */
  amountTiyin: number;
  createdAt: string;
}

export interface PlatformCardResponse {
  id: string;
  maskedPan: string;
  last4: string;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
  brand: 'VISA' | 'MC' | 'UZCARD' | 'HUMO';
  displayOrder: number;
  active: boolean;
  balanceTiyin?: number;
  balanceObservedAt?: string;
}

export interface ObservationResponse {
  id: string;
  cardLast4: string;
  amountTiyin: number;
  cardBalanceTiyin?: number;
  observedAt: string;
  rawText: string;
  status: 'MATCHED' | 'UNMATCHED' | 'MANUALLY_RESOLVED' | 'IGNORED';
}

export interface UserbotStatusResponse {
  healthy: boolean;
  lastSeenAt?: string;
  timeoutSeconds: number;
}
```

- [ ] **Step 4: Write the proxy route and the API clients**

`frontend/src/app/api/payment/[...path]/route.ts` — copy `frontend/src/app/api/trade/[...path]/route.ts`, changing `/trade/` to `/payment/` in the upstream URL and updating the doc comment. Everything else stays identical.

`frontend/src/lib/payment-server.ts`:

```ts
import 'server-only';

import { apiFetch, ApiException } from './api';
import type { InvoiceResponse, WalletResponse } from './payment-types';

/**
 * payment-service through internal nginx. `/payment/...` is stripped there, so
 * `/payment/v1/payments/wallet` lands on payment-service's
 * `/api/v1/payments/wallet` — the same hop the browser proxy route uses.
 */
const PREFIX = '/payment/v1/payments';

export async function getWallet(): Promise<WalletResponse | null> {
  try {
    return await apiFetch<WalletResponse>(`${PREFIX}/wallet`);
  } catch (error) {
    if (error instanceof ApiException) {
      console.error(`[payment-server] wallet → ${error.status}: ${error.message}`);
      return null;
    }
    throw error;
  }
}

export async function getActiveInvoiceSSR(): Promise<InvoiceResponse | null> {
  try {
    return await apiFetch<InvoiceResponse>(`${PREFIX}/invoices/active`);
  } catch (error) {
    if (error instanceof ApiException && (error.status === 204 || error.status === 404)) {
      return null;
    }
    if (error instanceof ApiException) {
      console.error(`[payment-server] active invoice → ${error.status}: ${error.message}`);
      return null;
    }
    throw error;
  }
}
```

`frontend/src/lib/payment-client.ts`:

```ts
'use client';

import type { InvoiceResponse, WalletResponse } from './payment-types';

const BASE = '/api/payment/v1/payments';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (res.status === 204) {
    return null as T;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.message || `So'rov bajarilmadi (${res.status})`);
  }
  return (await res.json()) as T;
}

export function getWallet(): Promise<WalletResponse> {
  return call<WalletResponse>('/wallet');
}

export function getActiveInvoice(): Promise<InvoiceResponse | null> {
  return call<InvoiceResponse | null>('/invoices/active');
}

export function createInvoice(amountUzs: number): Promise<InvoiceResponse> {
  return call<InvoiceResponse>('/invoices', {
    method: 'POST',
    body: JSON.stringify({ amountUzs }),
  });
}
```

- [ ] **Step 5: Write the invoice panel**

`frontend/src/components/payment/invoice-panel.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

import { formatPanForDisplay } from '@/lib/card-detect';
import { formatTiyin } from '@/lib/money';
import type { InvoiceResponse } from '@/lib/payment-types';

function useCountdown(expiresAt: string): number {
  const [left, setLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return left;
}

interface InvoicePanelProps {
  invoice: InvoiceResponse;
  onExpired: () => void;
}

export function InvoicePanel({ invoice, onExpired }: InvoicePanelProps) {
  const secondsLeft = useCountdown(invoice.expiresAt);
  const [copied, setCopied] = useState<'pan' | 'amount' | null>(null);
  const bumped = invoice.transferTiyin !== invoice.requestedTiyin;

  useEffect(() => {
    if (secondsLeft === 0) onExpired();
  }, [secondsLeft, onExpired]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  async function copy(value: string, what: 'pan' | 'amount') {
    await navigator.clipboard.writeText(value);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <section className="rounded-2xl border p-6 space-y-5">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Quyidagi kartaga o&apos;tkazing</h2>
        <span className="font-mono text-sm tabular-nums">{mm}:{ss}</span>
      </header>

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Karta raqami</p>
        <button
          type="button"
          onClick={() => copy(invoice.pan, 'pan')}
          className="font-mono text-xl tracking-wider"
        >
          {formatPanForDisplay(invoice.pan)}
        </button>
        <p className="text-sm">{invoice.holderName} · {invoice.cardExpiry}</p>
        {copied === 'pan' && <p className="text-xs text-green-600">Nusxalandi</p>}
      </div>

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">O&apos;tkaziladigan summa</p>
        <button
          type="button"
          onClick={() => copy(String(Math.trunc(invoice.transferTiyin / 100)), 'amount')}
          className="text-2xl font-semibold tabular-nums"
        >
          {formatTiyin(invoice.transferTiyin)} so&apos;m
        </button>
        {copied === 'amount' && <p className="text-xs text-green-600">Nusxalandi</p>}
      </div>

      {bumped && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm">
          Siz {formatTiyin(invoice.requestedTiyin)} so&apos;m so&apos;radingiz, lekin
          o&apos;tkazish uchun {formatTiyin(invoice.transferTiyin)} so&apos;m ko&apos;rsatilgan.
          Ayni damda shu summada boshqa to&apos;lov ham kutilmoqda — tizim ularni
          ajrata olishi uchun summa biroz o&apos;zgartirildi. Hamyoningizga
          {' '}{formatTiyin(invoice.requestedTiyin)} so&apos;m tushadi.
        </p>
      )}

      <p className="rounded-lg bg-red-50 p-3 text-sm">
        Summa <strong>aynan</strong> shunday bo&apos;lishi kerak. Bir so&apos;m kam yoki
        ko&apos;p bo&apos;lsa, tizim to&apos;lovni avtomatik aniqlay olmaydi va uni qo&apos;lda
        tekshirishga to&apos;g&apos;ri keladi.
      </p>
    </section>
  );
}
```

The bump explanation and the exact-amount warning are the two paragraphs that decide whether this
feature works in practice. Do not shorten them into a tooltip.

- [ ] **Step 6: Write the top-up form and the wallet page**

`frontend/src/components/payment/top-up-form.tsx`:

```tsx
'use client';

import { useState } from 'react';

import { createInvoice } from '@/lib/payment-client';
import type { InvoiceResponse } from '@/lib/payment-types';

const PRESETS = [50_000, 100_000, 200_000, 500_000];

interface TopUpFormProps {
  onCreated: (invoice: InvoiceResponse) => void;
}

export function TopUpForm({ onCreated }: TopUpFormProps) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(uzs: number) {
    setBusy(true);
    setError(null);
    try {
      onCreated(await createInvoice(uzs));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xatolik yuz berdi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Hamyonni to&apos;ldirish</h2>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={busy}
            onClick={() => submit(p)}
            className="rounded-lg border px-4 py-2"
          >
            {p.toLocaleString('ru-RU')} so&apos;m
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const uzs = Number(amount.replace(/\D/g, ''));
          if (uzs > 0) submit(uzs);
        }}
        className="flex gap-2"
      >
        <input
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Boshqa summa"
          className="flex-1 rounded-lg border px-3 py-2"
        />
        <button type="submit" disabled={busy} className="rounded-lg border px-4 py-2">
          Davom etish
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
```

`frontend/src/app/hamyon/page.tsx`:

```tsx
import { WalletView } from '@/components/payment/wallet-view';
import { getActiveInvoiceSSR, getWallet } from '@/lib/payment-server';

export const dynamic = 'force-dynamic';

export default async function WalletPage() {
  const [wallet, activeInvoice] = await Promise.all([getWallet(), getActiveInvoiceSSR()]);

  if (!wallet) {
    return <p className="p-6">Hamyon ma&apos;lumotini olishda xatolik.</p>;
  }

  return <WalletView wallet={wallet} initialInvoice={activeInvoice} />;
}
```

Create `frontend/src/components/payment/wallet-view.tsx` as a `'use client'` component that shows the
balance (available, held, withdraw-pending) using `formatTiyin`, renders either `TopUpForm` or
`InvoicePanel` depending on whether an invoice is live, and lists the transaction history below.
`onExpired` clears the invoice and shows the form again.

The held balance needs a one-line explanation next to it — "savdoda muzlatilgan" — because a user
seeing money they cannot spend and no reason will open a support ticket.

**History.** `getWalletHistory()` returns `WalletEntryResponse[]` whose `amountTiyin` uses the
ledger's sign: negative is money arriving in the user's account, positive is money leaving. Flip it
for display — a deposit must read `+100 000`, not `−100 000` — and label each row from `kind`:

| `kind` | Uzbek label |
|---|---|
| `DEPOSIT` | To'ldirish |
| `TRADE_HOLD` | Savdoda muzlatildi |
| `TRADE_SETTLE` | Savdodan tushdi |
| `TRADE_RELEASE` | Savdodan qaytdi |
| `WITHDRAW_RESERVE` | Yechishga ajratildi |
| `WITHDRAW_FULFIL` | Yechib berildi |
| `WITHDRAW_CANCEL` | Yechish bekor qilindi |
| `ADJUSTMENT` | Admin tuzatishi |

Filter the list to `account === 'USER_AVAILABLE'` by default so a single hold does not appear as two
confusing rows; the held and withdraw-pending entries are already visible as balances above.

Add `getWalletHistory()` to `payment-client.ts` (`GET /wallet/transactions`) and
`getWalletHistorySSR()` to `payment-server.ts`, following the shape of the two functions already
there.

- [ ] **Step 7: Run the tests, lint and commit**

```bash
cd frontend && npm test -- money && npm run lint
```

```bash
git add frontend/src
git commit -m "feat(frontend): add the wallet page and the card top-up flow"
```

If `frontend/package.json` changed, stage `frontend/package-lock.json` with it — CI breaks otherwise.

---

### Task 10: admin platform card manager

**Files:**
- Create: `frontend/src/lib/payment-admin-server.ts`
- Create: `frontend/src/lib/payment-admin-client.ts`
- Create: `frontend/src/app/admin/payments/cards/page.tsx`
- Create: `frontend/src/components/payment/platform-card.tsx`
- Create: `frontend/src/components/payment/platform-card-list.tsx`
- Create: `frontend/src/components/payment/add-card-form.tsx`

**Interfaces:**
- Consumes: the five endpoints under `/api/v1/admin/payments/cards` (Task 3), `PlatformCardResponse` (Task 9).
- Produces: `listPlatformCards()`, `createPlatformCard(...)`, `deactivateCard(id)`, `activateCard(id)`, `reorderCards(ids)`.

**Context:** The owner asked for these to look like cards, not table rows: number, holder, expiry and the last observed balance on the face.

Reuse `frontend/src/lib/card-detect.ts`, which already exists for the profile "Kartalar" tab. It exports `normalizePan(pan)`, `detectBrand(pan)` and `luhnCheck(pan)` and its BIN rules match the backend's. **Do not write a second copy.**

The holder-name input upper-cases as the admin types, matching what the backend stores.

- [ ] **Step 1: Write the card component**

`frontend/src/components/payment/platform-card.tsx`:

```tsx
'use client';

import { formatTiyin } from '@/lib/money';
import type { PlatformCardResponse } from '@/lib/payment-types';

const BRAND_LABEL: Record<PlatformCardResponse['brand'], string> = {
  HUMO: 'HUMO',
  UZCARD: 'UZCARD',
  VISA: 'VISA',
  MC: 'Mastercard',
};

interface PlatformCardProps {
  card: PlatformCardResponse;
  onDeactivate: (id: string) => void;
  onActivate: (id: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
}

export function PlatformCard({
  card, onDeactivate, onActivate, onMoveUp, onMoveDown,
}: PlatformCardProps) {
  return (
    <article
      className={[
        'relative flex aspect-[1.586/1] w-full max-w-sm flex-col justify-between',
        'rounded-2xl p-5 text-white shadow-lg',
        card.active
          ? 'bg-gradient-to-br from-slate-700 to-slate-900'
          : 'bg-gradient-to-br from-slate-400 to-slate-500 opacity-60',
      ].join(' ')}
    >
      <header className="flex items-start justify-between">
        <span className="text-sm font-medium tracking-wide">{BRAND_LABEL[card.brand]}</span>
        {card.active ? (
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
            #{card.displayOrder}
          </span>
        ) : (
          <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs">Faol emas</span>
        )}
      </header>

      <p className="font-mono text-xl tracking-widest">{card.maskedPan}</p>

      <footer className="space-y-2">
        <div className="flex items-end justify-between text-sm">
          <span className="uppercase">{card.holderName}</span>
          <span className="tabular-nums">
            {String(card.expiryMonth).padStart(2, '0')}/{String(card.expiryYear).slice(-2)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-white/80">
          <span>
            {card.balanceTiyin != null
              ? `${formatTiyin(card.balanceTiyin)} so'm`
              : 'Qoldiq hali ma\'lum emas'}
          </span>
          <span className="flex gap-2">
            {onMoveUp && <button type="button" onClick={() => onMoveUp(card.id)}>↑</button>}
            {onMoveDown && <button type="button" onClick={() => onMoveDown(card.id)}>↓</button>}
            <button
              type="button"
              onClick={() => (card.active ? onDeactivate(card.id) : onActivate(card.id))}
            >
              {card.active ? 'O\'chirish' : 'Yoqish'}
            </button>
          </span>
        </div>
      </footer>
    </article>
  );
}
```

The balance line falls back to "qoldiq hali ma'lum emas" rather than rendering `0`. A card that has
never received a transfer has an unknown balance, not a zero one, and showing zero would look like a
drained card.

- [ ] **Step 2: Write the add-card form**

`frontend/src/components/payment/add-card-form.tsx`:

```tsx
'use client';

import { useState } from 'react';

import { detectBrand, luhnCheck, normalizePan } from '@/lib/card-detect';
import { createPlatformCard } from '@/lib/payment-admin-client';

interface AddCardFormProps {
  onAdded: () => void;
}

export function AddCardForm({ onAdded }: AddCardFormProps) {
  const [pan, setPan] = useState('');
  const [holder, setHolder] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = normalizePan(pan);
  const brand = detectBrand(digits);
  const panValid = digits.length >= 12 && luhnCheck(digits);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createPlatformCard({
        pan: digits,
        holderName: holder,
        expiryMonth: Number(month),
        expiryYear: Number(year),
      });
      setPan(''); setHolder(''); setMonth(''); setYear('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Karta qo\'shilmadi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">Yangi karta qo&apos;shish</h3>

      <div>
        <input
          inputMode="numeric"
          value={pan}
          onChange={(e) => setPan(e.target.value)}
          placeholder="Karta raqami"
          className="w-full rounded-lg border px-3 py-2 font-mono"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {digits.length === 0
            ? 'Humo yoki Uzcard raqamini kiriting'
            : brand
              ? `${brand}${panValid ? '' : ' — raqam noto\'g\'ri'}`
              : 'Karta turini aniqlab bo\'lmadi'}
        </p>
      </div>

      <input
        value={holder}
        onChange={(e) => setHolder(e.target.value.toUpperCase())}
        placeholder="KARTA EGASI"
        className="w-full rounded-lg border px-3 py-2 uppercase"
      />

      <div className="flex gap-2">
        <input
          inputMode="numeric" value={month}
          onChange={(e) => setMonth(e.target.value)}
          placeholder="Oy" className="w-24 rounded-lg border px-3 py-2"
        />
        <input
          inputMode="numeric" value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="Yil" className="w-28 rounded-lg border px-3 py-2"
        />
      </div>

      <button
        type="submit"
        disabled={busy || !panValid || !holder || !month || !year}
        className="rounded-lg border px-4 py-2"
      >
        Qo&apos;shish
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

The holder input upper-cases on change so what the admin sees is what the backend stores. The submit
button stays disabled until Luhn passes, which turns a typo into an obvious dead button instead of a
server error.

- [ ] **Step 3: Write the clients and the page**

`frontend/src/lib/payment-admin-client.ts` — mirror `payment-client.ts`, base `/api/payment/v1/admin/payments`, exporting `listPlatformCards`, `createPlatformCard`, `deactivateCard`, `activateCard`, `reorderCards`, `listUnmatched`, `resolveObservation`, `ignoreObservation`, `getUserbotStatus`.

`frontend/src/lib/payment-admin-server.ts` — mirror `payment-server.ts` for the SSR reads the pages need: `listPlatformCardsSSR()`, `listUnmatchedSSR()`, `getUserbotStatusSSR()`.

`frontend/src/app/admin/payments/cards/page.tsx`:

```tsx
import { PlatformCardList } from '@/components/payment/platform-card-list';
import { listPlatformCardsSSR } from '@/lib/payment-admin-server';

export const dynamic = 'force-dynamic';

export default async function AdminPaymentCardsPage() {
  const cards = await listPlatformCardsSSR();

  if (!cards) {
    return <p className="p-6">Kartalarni olishda xatolik.</p>;
  }

  return <PlatformCardList initialCards={cards} />;
}
```

`platform-card-list.tsx` is a `'use client'` component holding the cards in state, rendering
`AddCardForm` and a grid of `PlatformCard`, and wiring the callbacks. Reordering moves an item in the
local array and posts the whole ordered id list to `/reorder`, then refetches — the backend rewrites
`display_order` for every active card in one call, so a partial update is not possible.

- [ ] **Step 4: Lint and commit**

```bash
cd frontend && npm run lint
```

```bash
git add frontend/src
git commit -m "feat(frontend): add the admin platform card manager"
```

---

### Task 11: unmatched credits queue and the userbot banner

**Files:**
- Create: `frontend/src/app/admin/payments/unmatched/page.tsx`
- Create: `frontend/src/components/payment/unmatched-queue.tsx`
- Create: `frontend/src/components/payment/userbot-banner.tsx`
- Modify: `frontend/src/app/admin/payments/cards/page.tsx` (render the banner)

**Interfaces:**
- Consumes: `/api/v1/admin/payments/observations/unmatched`, `/{id}/resolve`, `/{id}/ignore` (Task 8), `/api/v1/admin/payments/userbot` (Task 5).

**Context:** These two screens are how an outage becomes visible.

The banner reports whether the userbot has sent a heartbeat recently. When it has not, deposits are refused platform-wide, and an admin needs to know that in one glance rather than by reading a pile of unmatched payments.

The queue shows each payment the system could not attribute: amount, card, when it arrived, and the raw Telegram message. The admin either attributes it to a user — which credits that user and demands a note — or dismisses it.

**Attributing creates money.** The form must therefore require the note, show the amount prominently, and confirm before submitting. This is the one screen in the platform where an admin's click mints wallet balance.

- [ ] **Step 1: Write the banner**

`frontend/src/components/payment/userbot-banner.tsx`:

```tsx
'use client';

import type { UserbotStatusResponse } from '@/lib/payment-types';

export function UserbotBanner({ status }: { status: UserbotStatusResponse }) {
  if (status.healthy) {
    return (
      <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-800">
        To&apos;lov kuzatuvchisi ishlayapti
        {status.lastSeenAt && (
          <> · oxirgi signal {new Date(status.lastSeenAt).toLocaleTimeString('ru-RU')}</>
        )}
      </p>
    );
  }

  return (
    <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="font-semibold">To&apos;lov kuzatuvchisi javob bermayapti</p>
      <p>
        Yangi to&apos;ldirish so&apos;rovlari qabul qilinmayapti.
        {status.lastSeenAt
          ? ` Oxirgi signal: ${new Date(status.lastSeenAt).toLocaleString('ru-RU')}.`
          : ' Hech qanday signal olinmadi.'}
        {' '}Kelgan pullar yo&apos;qolmaydi — ular tekshirilmagan tushumlar ro&apos;yxatiga tushadi.
      </p>
    </div>
  );
}
```

The last sentence matters: an admin seeing a red banner needs to know money is not being lost, only
that it is not being credited automatically.

- [ ] **Step 2: Write the queue**

`frontend/src/components/payment/unmatched-queue.tsx` — a `'use client'` component taking
`initialItems: ObservationResponse[]`. For each item render a row with:

- the amount via `formatTiyin`, large;
- the card's last four digits and the arrival time;
- the raw Telegram message in a `<pre>`, collapsed by default;
- a "Foydalanuvchiga biriktirish" action opening a form with a user id field and a **required** note field;
- an "E'tiborsiz qoldirish" action with an optional note.

Attribution posts to `/observations/{id}/resolve`, removes the row on success, and surfaces the
server's message on failure. A 409 means somebody else already handled it — refetch the list rather
than showing a raw error, because the row is simply gone.

Show the amount inside the confirm step too. The admin is about to create that much wallet balance
from a note, and the number should be in front of them when they commit.

- [ ] **Step 3: Write the page**

`frontend/src/app/admin/payments/unmatched/page.tsx`:

```tsx
import { UnmatchedQueue } from '@/components/payment/unmatched-queue';
import { UserbotBanner } from '@/components/payment/userbot-banner';
import { getUserbotStatusSSR, listUnmatchedSSR } from '@/lib/payment-admin-server';

export const dynamic = 'force-dynamic';

export default async function AdminUnmatchedPage() {
  const [items, userbot] = await Promise.all([listUnmatchedSSR(), getUserbotStatusSSR()]);

  return (
    <div className="space-y-4 p-6">
      {userbot && <UserbotBanner status={userbot} />}
      {items ? (
        <UnmatchedQueue initialItems={items} />
      ) : (
        <p>Tekshirilmagan tushumlarni olishda xatolik.</p>
      )}
    </div>
  );
}
```

Render `UserbotBanner` on the card manager page too — an admin adding cards is exactly the person who
should see that the observer is down.

- [ ] **Step 4: Lint, run the whole frontend suite, and commit**

```bash
cd frontend && npm run lint && npm test
```

```bash
git add frontend/src
git commit -m "feat(frontend): add the unmatched credits queue and the userbot status banner"
```

---

### Task 12: announce every invoice in the admin Telegram topic

**Files:**
- Modify: `bot/src/main/java/uz/efbazaar/bot/config/TelegramProperties.java` (add the `payments` topic)
- Modify: `bot/src/main/resources/application.yml` (`topics.payments`)
- Modify: `bot/src/main/java/uz/efbazaar/bot/telegram/TelegramApiClient.java` (add `deleteMessage`)
- Create: `bot/src/main/java/uz/efbazaar/bot/api/PaymentNoticeController.java`
- Create: `bot/src/test/java/uz/efbazaar/bot/api/PaymentNoticeControllerTest.java`
- Create: `backend/payment-service/src/main/resources/db/migration/V5__invoice_admin_notice.sql`
- Modify: `backend/payment-service/src/main/java/uz/efbazaar/payment/invoice/domain/Invoice.java`
- Create: `.../payment/notify/BotClient.java`
- Create: `.../payment/notify/HttpBotClient.java`
- Create: `.../payment/notify/AdminTelegramNotifier.java`
- Create: `.../payment/notify/InvoiceNotice.java`
- Create: `.../payment/notify/InvoiceNoticeEvents.java`
- Create: `.../payment/notify/InvoiceNoticeListener.java`
- Modify: `.../payment/card/service/PlatformCardService.java` (add `findById`)
- Modify: `.../payment/invoice/service/InvoiceService.java` (announce on create)
- Modify: `.../payment/observation/service/ByCardService.java` (publish the paid event)
- Modify: `.../payment/invoice/service/InvoiceExpirySweeper.java` (publish the expired event)
- Modify: `backend/payment-service/src/main/resources/application.yml`
- Modify: `backend/payment-service/src/test/resources/application-test.yml`
- Create: `.../payment/notify/AdminTelegramNotifierTest.java`
- Create: `.../payment/notify/InvoiceNoticeIT.java`
- Modify: `docker-compose.yml`, `.env.example`

**Interfaces:**
- `bot` exposes `POST /bot/internal/payments/notice` → `{ "messageId": 1234 }` and
  `POST /bot/internal/payments/notice/delete` → `204`.
- payment-service publishes `InvoicePaidEvent(UUID invoiceId)` and
  `InvoicesExpiredEvent(List<Long> messageIds)`; `InvoiceNoticeListener` consumes both **after commit**.
- `AdminTelegramNotifier`:
  - `OptionalLong invoiceCreated(InvoiceNotice n)`
  - `OptionalLong invoicePaid(InvoiceNotice n, Long previousMessageId)`
  - `void invoiceExpired(Long messageId)`

**Context:** The people who own the receiving cards watch money arrive from Telegram, not from the
admin panel. This task gives them a live feed: every invoice appears in a dedicated thread topic of
the admin group the moment it is created, and disappears the moment it is answered.

The lifecycle is a **replacement, not an edit** (§4.5 of the spec):

1. Invoice created → post a message; keep the returned Telegram `message_id` on the invoice row.
2. Invoice paid → **delete** that message, then post a fresh "to'lov amalga oshirildi" message
   carrying the same invoice details.
3. Invoice expired → delete the message and post nothing.

An unanswered invoice sitting in the topic is a to-do item; a completed one is a receipt. Editing in
place would make the whole topic look alike, which is exactly what the owner did not want.

**Notification failure never blocks money.** Every method on `AdminTelegramNotifier` swallows its own
failures. A `bot` outage, a wrong chat id or a Telegram error must leave the invoice created and the
payment credited. This is the most important property of this task — a notifier that can throw into
the credit path turns a cosmetic outage into lost deposits.

Three further decisions, each load-bearing:

- **payment-service never talks to Telegram.** It calls `bot`, which already owns the token, the
  group chat id and a working `TelegramApiClient`. Adding a second Telegram client would mean a
  second copy of the bot token in a second service's environment.
- **The chat id and the thread id live in `bot`, not in payment-service.** `bot` already carries
  `app.telegram.group-chat-id` and `app.telegram.topics.{logs,registration,media}`; the payments
  topic is the fourth entry in that list. payment-service sends rendered text and knows nothing about
  where it lands. (This narrows the spec's §8 sketch, which had payment-service holding both ids —
  keeping every Telegram identifier in one service is worth the deviation.)
- **The notice shows the masked card, never the PAN.** A Telegram group is outside our security
  boundary and its membership is not the card owner list. Last four digits plus the holder name are
  enough to know which card was hit.

- [ ] **Step 1: Add `payments` to the bot's topics and a `deleteMessage` call**

`TelegramProperties.Topics` gains one component:

```java
    public record Topics(
            Integer logs,
            Integer registration,
            Integer media,
            Integer payments
    ) {}
```

`bot/src/main/resources/application.yml`, under `app.telegram.topics`:

```yaml
      payments:     ${TELEGRAM_TOPIC_PAYMENTS:}
```

No default number. An unset topic must mean "do not post", not "post into topic 2".

`TelegramApiClient` gains the delete call, next to `sendMessage`:

```java
    /**
     * deleteMessage — removes a message the bot itself sent.
     *
     * <p>Telegram answers {@code ok:false} when the message is already gone or
     * older than 48 hours. That is not an error worth propagating: the caller
     * only wants the message absent, and it is.
     *
     * @return true when Telegram confirmed the deletion.
     */
    public boolean deleteMessage(String chatId, long messageId) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("chat_id", chatId)
                .put("message_id", messageId);
        return postJson("deleteMessage", body).isPresent();
    }
```

- [ ] **Step 2: Write the bot's internal endpoint, test first**

`bot/src/test/java/uz/efbazaar/bot/api/PaymentNoticeControllerTest.java`:

```java
package uz.efbazaar.bot.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.util.Map;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = PaymentNoticeController.class)
@Import(PaymentNoticeControllerTest.Stubs.class)
class PaymentNoticeControllerTest {

    static final TelegramApiClient TELEGRAM = mock(TelegramApiClient.class);

    @TestConfiguration
    static class Stubs {
        @Bean TelegramApiClient telegram() { return TELEGRAM; }
        @Bean TelegramProperties props() {
            return new TelegramProperties("t", "u", "https://api.telegram.org", "-100777",
                    new TelegramProperties.Topics(6, 4, 2, 11), null, null);
        }
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    @Test
    void postsIntoThePaymentsTopicAndReturnsTheMessageId() throws Exception {
        when(TELEGRAM.sendMessage(eq("-100777"), eq(11), anyString())).thenReturn(Optional.of(4242));

        mvc.perform(post("/bot/internal/payments/notice")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("text", "<b>salom</b>"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messageId").value(4242));
    }

    @Test
    void reportsNullWhenTelegramRefuses() throws Exception {
        when(TELEGRAM.sendMessage(anyString(), any(), anyString())).thenReturn(Optional.empty());

        mvc.perform(post("/bot/internal/payments/notice")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("text", "salom"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messageId").doesNotExist());
    }

    @Test
    void rejectsBlankText() throws Exception {
        mvc.perform(post("/bot/internal/payments/notice")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("text", "  "))))
                .andExpect(status().isBadRequest());
        verify(TELEGRAM, never()).sendMessage(anyString(), any(), anyString());
    }

    @Test
    void deleteReturnsNoContent() throws Exception {
        when(TELEGRAM.deleteMessage(eq("-100777"), anyLong())).thenReturn(true);

        mvc.perform(post("/bot/internal/payments/notice/delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("messageId", 4242))))
                .andExpect(status().isNoContent());

        verify(TELEGRAM).deleteMessage("-100777", 4242L);
    }
}
```

Reset the shared mock between tests with a `@BeforeEach org.mockito.Mockito.reset(TELEGRAM)` if the
verifications interfere.

Run it and watch it fail — the controller does not exist yet.

```bash
cd bot && mvn -q -Dtest=PaymentNoticeControllerTest test
```

`bot/src/main/java/uz/efbazaar/bot/api/PaymentNoticeController.java`:

```java
package uz.efbazaar.bot.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.telegram.TelegramApiClient;

/**
 * Internal endpoint — payment-service posts invoice notices into the admin
 * group's payments topic through here.
 *
 * <p>Not reachable from outside: nginx answers 404 for {@code /bot/internal/}.
 *
 * <p>The caller sends rendered HTML and learns nothing about the chat or the
 * topic. Every Telegram identifier stays in this service, beside the token.
 *
 * <p>An unconfigured topic is not an error. The endpoint answers 200 with a
 * null message id, and payment-service records "not announced" — a platform
 * running without an admin group must still take deposits.
 */
@Slf4j
@RestController
@RequestMapping("/bot/internal/payments")
@RequiredArgsConstructor
public class PaymentNoticeController {

    private final TelegramApiClient telegram;
    private final TelegramProperties props;

    public record NoticeRequest(@NotBlank String text) {}

    public record DeleteRequest(@NotNull Long messageId) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NoticeResponse(Long messageId) {}

    @PostMapping("/notice")
    public NoticeResponse notice(@Valid @RequestBody NoticeRequest req) {
        Integer topic = topicOrNull();
        if (topic == null) {
            return new NoticeResponse(null);
        }
        return telegram.sendMessage(props.groupChatId(), topic, req.text())
                .map(id -> new NoticeResponse(id.longValue()))
                .orElseGet(() -> new NoticeResponse(null));
    }

    @PostMapping("/notice/delete")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@Valid @RequestBody DeleteRequest req) {
        if (topicOrNull() == null) {
            return;
        }
        telegram.deleteMessage(props.groupChatId(), req.messageId());
    }

    private Integer topicOrNull() {
        Integer topic = props.topics() == null ? null : props.topics().payments();
        if (topic == null || props.groupChatId() == null || props.groupChatId().isBlank()) {
            log.warn("Payments topic is not configured — invoice notice dropped");
            return null;
        }
        return topic;
    }
}
```

Run the test again; it must be green.

- [ ] **Step 3: Add the notice column and the entity field**

`backend/payment-service/src/main/resources/db/migration/V5__invoice_admin_notice.sql`:

```sql
-- The Telegram message announcing this invoice in the admin payments topic.
-- Null means the announcement never landed (bot down, topic unconfigured) —
-- which is allowed: notification failure must not block a deposit.
ALTER TABLE invoices
    ADD COLUMN admin_notice_message_id BIGINT;
```

`Invoice.java` gains, after `observationId`:

```java
    /**
     * Telegram message id of this invoice's announcement in the admin payments
     * topic. Null when the announcement failed or the topic is unconfigured;
     * set again when the paid message replaces the pending one.
     */
    @Column(name = "admin_notice_message_id")
    private Long adminNoticeMessageId;
```

- [ ] **Step 4: Write the bot client**

`notify/BotClient.java`:

```java
package uz.efbazaar.payment.notify;

import java.util.OptionalLong;

/**
 * The one seam between payment-service and Telegram. An interface so tests can
 * substitute a client that fails, which is the behaviour that actually matters
 * here.
 */
public interface BotClient {

    /** @return the Telegram message id, or empty when the notice did not land. */
    OptionalLong postPaymentNotice(String html);

    void deletePaymentNotice(long messageId);
}
```

`config/BotClientConfig.java`:

```java
package uz.efbazaar.payment.config;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * Short timeouts on purpose. This client sits in front of the invoice creation
 * path; a hung bot must degrade the notice, never the deposit.
 */
@Configuration
public class BotClientConfig {

    @Bean
    @Qualifier("botClient")
    public RestClient botRestClient(
            @Value("${payment.admin-telegram.bot-base-url:http://bot:8084}") String baseUrl,
            RestClient.Builder builder) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofMillis(500).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        return builder.baseUrl(baseUrl).requestFactory(factory).build();
    }
}
```

`notify/HttpBotClient.java`:

```java
package uz.efbazaar.payment.notify;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.OptionalLong;

@Slf4j
@Component
public class HttpBotClient implements BotClient {

    private static final String NOTICE = "/bot/internal/payments/notice";
    private static final String DELETE = "/bot/internal/payments/notice/delete";

    private final RestClient http;

    public HttpBotClient(@Qualifier("botClient") RestClient http) {
        this.http = http;
    }

    public record NoticeResponse(Long messageId) {}

    @Override
    public OptionalLong postPaymentNotice(String html) {
        NoticeResponse res = http.post()
                .uri(NOTICE)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("text", html))
                .retrieve()
                .body(NoticeResponse.class);
        return res == null || res.messageId() == null
                ? OptionalLong.empty()
                : OptionalLong.of(res.messageId());
    }

    @Override
    public void deletePaymentNotice(long messageId) {
        http.post()
                .uri(DELETE)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("messageId", messageId))
                .retrieve()
                .toBodilessEntity();
    }
}
```

This class does **not** catch anything. Swallowing lives one layer up, in the notifier, so there is
exactly one place to look for it.

- [ ] **Step 5: Write the notifier, test first**

`notify/InvoiceNotice.java`:

```java
package uz.efbazaar.payment.notify;

import java.time.Instant;
import java.util.UUID;

/** Everything a notice needs, already resolved. No entities cross this line. */
public record InvoiceNotice(
        UUID invoiceId,
        UUID userId,
        String cardLast4,
        String holderName,
        long requestedAmountTiyin,
        long transferAmountTiyin,
        Instant expiresAt,
        Instant paidAt) {}
```

`notify/AdminTelegramNotifierTest.java`:

```java
package uz.efbazaar.payment.notify;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalLong;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class AdminTelegramNotifierTest {

    private static final InvoiceNotice NOTICE = new InvoiceNotice(
            UUID.randomUUID(), UUID.randomUUID(), "4556", "ISMOILOV XUSNIDDIN",
            10_000_000L, 10_010_000L, Instant.parse("2026-08-12T15:41:00Z"), null);

    /** Records what was sent; can be told to fail like a dead bot. */
    static class FakeBot implements BotClient {
        final List<String> posted = new ArrayList<>();
        final List<Long> deleted = new ArrayList<>();
        boolean explode;
        long nextId = 1;

        @Override public OptionalLong postPaymentNotice(String html) {
            if (explode) throw new IllegalStateException("bot is down");
            posted.add(html);
            return OptionalLong.of(nextId++);
        }

        @Override public void deletePaymentNotice(long messageId) {
            if (explode) throw new IllegalStateException("bot is down");
            deleted.add(messageId);
        }
    }

    private AdminTelegramNotifier notifier(FakeBot bot, boolean enabled) {
        AdminTelegramNotifier n = new AdminTelegramNotifier(bot);
        ReflectionTestUtils.setField(n, "enabled", enabled);
        return n;
    }

    @Test
    void createdNoticeCarriesTheCardAmountsAndDeadline() {
        FakeBot bot = new FakeBot();

        OptionalLong id = notifier(bot, true).invoiceCreated(NOTICE);

        assertThat(id).hasValue(1L);
        assertThat(bot.posted).hasSize(1);
        String html = bot.posted.get(0);
        assertThat(html).contains("4556")
                .contains("ISMOILOV XUSNIDDIN")
                .contains("100 100")   // transfer amount, so'm
                .contains("100 000");  // credited amount, so'm
        assertThat(html).doesNotContain("8600");  // never a full PAN
    }

    @Test
    void paidNoticeDeletesTheOldMessageFirst() {
        FakeBot bot = new FakeBot();

        OptionalLong id = notifier(bot, true).invoicePaid(NOTICE, 77L);

        assertThat(bot.deleted).containsExactly(77L);
        assertThat(id).isPresent();
        assertThat(bot.posted.get(0)).contains("amalga oshirildi");
    }

    @Test
    void paidNoticeStillPostsWhenThereIsNoOldMessage() {
        FakeBot bot = new FakeBot();

        notifier(bot, true).invoicePaid(NOTICE, null);

        assertThat(bot.deleted).isEmpty();
        assertThat(bot.posted).hasSize(1);
    }

    /** The property this whole task exists to preserve. */
    @Test
    void aDeadBotNeverThrowsAtTheCaller() {
        FakeBot bot = new FakeBot();
        bot.explode = true;
        AdminTelegramNotifier n = notifier(bot, true);

        assertThatCode(() -> {
            assertThat(n.invoiceCreated(NOTICE)).isEmpty();
            assertThat(n.invoicePaid(NOTICE, 5L)).isEmpty();
            n.invoiceExpired(5L);
        }).doesNotThrowAnyException();
    }

    @Test
    void disabledNotifierCallsNobody() {
        FakeBot bot = new FakeBot();

        AdminTelegramNotifier n = notifier(bot, false);
        assertThat(n.invoiceCreated(NOTICE)).isEmpty();
        n.invoiceExpired(9L);

        assertThat(bot.posted).isEmpty();
        assertThat(bot.deleted).isEmpty();
    }
}
```

Run it red, then write:

`notify/AdminTelegramNotifier.java`:

```java
package uz.efbazaar.payment.notify;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.OptionalLong;

/**
 * Renders invoice notices and hands them to {@link BotClient}.
 *
 * <p><b>Nothing here throws.</b> Every method catches everything it can and
 * degrades to "not announced". The callers sit in the invoice creation path and
 * in the credit path; a Telegram outage must cost us a message, never a
 * deposit. Read every catch block in this class as load-bearing.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AdminTelegramNotifier {

    private static final DateTimeFormatter CLOCK =
            DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("Asia/Tashkent"));

    private final BotClient bot;

    @Value("${payment.admin-telegram.enabled:true}")
    private boolean enabled;

    /** @return the Telegram message id to store on the invoice, or empty. */
    public OptionalLong invoiceCreated(InvoiceNotice n) {
        if (!enabled) return OptionalLong.empty();
        try {
            return bot.postPaymentNotice(renderPending(n));
        } catch (Exception e) {
            log.warn("Invoice {} was not announced: {}", n.invoiceId(), e.toString());
            return OptionalLong.empty();
        }
    }

    /**
     * Replaces the pending announcement with a completion message. The delete
     * and the post are independent: a failed delete still leaves a receipt in
     * the topic, which is the more useful half.
     */
    public OptionalLong invoicePaid(InvoiceNotice n, Long previousMessageId) {
        if (!enabled) return OptionalLong.empty();
        if (previousMessageId != null) {
            invoiceExpired(previousMessageId);
        }
        try {
            return bot.postPaymentNotice(renderPaid(n));
        } catch (Exception e) {
            log.warn("Paid notice for invoice {} failed: {}", n.invoiceId(), e.toString());
            return OptionalLong.empty();
        }
    }

    /** Deletes an announcement with no replacement — an expiry is not news. */
    public void invoiceExpired(Long messageId) {
        if (!enabled || messageId == null) return;
        try {
            bot.deletePaymentNotice(messageId);
        } catch (Exception e) {
            log.warn("Could not delete admin notice {}: {}", messageId, e.toString());
        }
    }

    private String renderPending(InvoiceNotice n) {
        return """
               🧾 <b>Yangi to'ldirish</b>
               💳 %s • %s
               💵 O'tkaziladi: <b>%s so'm</b>
               🎯 Hisobga tushadi: %s so'm
               👤 <code>%s</code>
               🕓 Muddat: %s gacha"""
                .formatted(mask(n.cardLast4()), esc(n.holderName()),
                        uzs(n.transferAmountTiyin()), uzs(n.requestedAmountTiyin()),
                        n.userId(), CLOCK.format(n.expiresAt()));
    }

    private String renderPaid(InvoiceNotice n) {
        Instant at = n.paidAt() == null ? Instant.now() : n.paidAt();
        return """
               ✅ <b>To'lov amalga oshirildi</b>
               💳 %s • %s
               💵 Kelgan summa: <b>%s so'm</b>
               🎯 Hisobga tushdi: %s so'm
               👤 <code>%s</code>
               🕓 %s"""
                .formatted(mask(n.cardLast4()), esc(n.holderName()),
                        uzs(n.transferAmountTiyin()), uzs(n.requestedAmountTiyin()),
                        n.userId(), CLOCK.format(at));
    }

    private static String mask(String last4) {
        return "•••• " + last4;
    }

    /**
     * Amounts are whole so'm by construction: a request is UZS × 100 and a bump
     * is a multiple of 100 so'm, so the tiyin part is always zero.
     */
    private static String uzs(long tiyin) {
        return String.format("%,d", tiyin / 100).replace(',', ' ');
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
```

- [ ] **Step 6: Announce on creation**

`PlatformCardService` gains a lookup the notifier path needs:

```java
    @Transactional(readOnly = true)
    public Optional<PlatformCard> findById(UUID id) {
        return cards.findById(id);
    }
```

`InvoiceService` takes the notifier and announces right after allocation. `create` is deliberately
**not** `@Transactional` — the allocator opens its own transaction per attempt — so the HTTP call
holds no database connection:

```java
    private final AdminTelegramNotifier notifier;
    private final InvoiceRepository invoices;   // already present

    public InvoiceResponse create(UUID userId, long requestedUzs) {
        // ... existing guards unchanged ...
        Invoice inv = allocator.allocate(userId, requestedUzs * 100);
        announce(inv);
        return render(inv);
    }

    /**
     * Best effort by construction: {@link AdminTelegramNotifier} never throws,
     * and a missing message id simply means this invoice has no announcement to
     * delete later.
     */
    private void announce(Invoice inv) {
        PlatformCard card = cards.findById(inv.getCardId()).orElse(null);
        if (card == null) return;
        OptionalLong messageId = notifier.invoiceCreated(new InvoiceNotice(
                inv.getId(), inv.getUserId(), card.getLast4(), card.getHolderName(),
                inv.getRequestedAmountTiyin(), inv.getTransferAmountTiyin(),
                inv.getExpiresAt(), null));
        if (messageId.isPresent()) {
            inv.setAdminNoticeMessageId(messageId.getAsLong());
            invoices.save(inv);
        }
    }
```

- [ ] **Step 7: Replace the notice on payment, delete it on expiry**

Both call sites sit **inside** transactions — `ByCardService.ingest` and `InvoiceExpirySweeper.sweep`
are `@Transactional`. Calling Telegram there would hold a database connection for the length of an
HTTP round trip, and a notice posted before a rollback would announce a payment that never happened.
Publish events instead and act after commit.

`notify/InvoiceNoticeEvents.java`:

```java
package uz.efbazaar.payment.notify;

import java.util.List;
import java.util.UUID;

/** Signals for the admin topic, published inside a transaction, acted on after it commits. */
public final class InvoiceNoticeEvents {

    private InvoiceNoticeEvents() {}

    public record InvoicePaid(UUID invoiceId) {}

    /** Only message ids: an expired invoice needs its notice gone, nothing else. */
    public record InvoicesExpired(List<Long> messageIds) {}
}
```

In `ByCardService`, inject `ApplicationEventPublisher events` — name it `appEvents` to avoid
colliding with the existing `PaymentEventPublisher events` field — and publish at the end of
`credit`:

```java
        ledger.post(TransactionKind.DEPOSIT, "invoice-" + invoice.getId(), null, null, postings);
        invoices.markPaid(invoice, obs.getId());
        events.depositCredited(invoice.getUserId(), credited, invoice.getId());
        appEvents.publishEvent(new InvoiceNoticeEvents.InvoicePaid(invoice.getId()));
```

In `InvoiceExpirySweeper`, collect the ids before saving and publish once:

```java
        List<Long> notices = due.stream()
                .map(Invoice::getAdminNoticeMessageId)
                .filter(Objects::nonNull)
                .toList();
        for (Invoice inv : due) {
            inv.setStatus(InvoiceStatus.EXPIRED);
        }
        invoices.saveAll(due);
        if (!notices.isEmpty()) {
            appEvents.publishEvent(new InvoiceNoticeEvents.InvoicesExpired(notices));
        }
        log.info("Expired {} invoice(s)", due.size());
```

`notify/InvoiceNoticeListener.java`:

```java
package uz.efbazaar.payment.notify;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;
import uz.efbazaar.payment.card.domain.PlatformCard;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;

import java.util.Optional;
import java.util.OptionalLong;

/**
 * Turns committed invoice facts into Telegram messages.
 *
 * <p>{@code AFTER_COMMIT} is the point: a notice announcing a credit that later
 * rolled back would be a lie, and a Telegram round trip inside the credit
 * transaction would hold a database connection for its duration.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InvoiceNoticeListener {

    private final InvoiceRepository invoices;
    private final PlatformCardService cards;
    private final AdminTelegramNotifier notifier;

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onPaid(InvoiceNoticeEvents.InvoicePaid event) {
        Optional<Invoice> found = invoices.findById(event.invoiceId());
        if (found.isEmpty()) return;
        Invoice inv = found.get();

        PlatformCard card = cards.findById(inv.getCardId()).orElse(null);
        if (card == null) {
            log.warn("Invoice {} points at a missing card — paid notice skipped", inv.getId());
            return;
        }

        OptionalLong newId = notifier.invoicePaid(new InvoiceNotice(
                inv.getId(), inv.getUserId(), card.getLast4(), card.getHolderName(),
                inv.getRequestedAmountTiyin(), inv.getTransferAmountTiyin(),
                inv.getExpiresAt(), inv.getPaidAt()), inv.getAdminNoticeMessageId());

        // Store the receipt's id, or clear the stale pending one. Either way the
        // row stops pointing at a message that no longer exists.
        inv.setAdminNoticeMessageId(newId.isPresent() ? newId.getAsLong() : null);
        invoices.save(inv);
    }

    @TransactionalEventListener
    public void onExpired(InvoiceNoticeEvents.InvoicesExpired event) {
        event.messageIds().forEach(notifier::invoiceExpired);
    }
}
```

`onExpired` needs no transaction: it only deletes messages.

- [ ] **Step 8: Prove the wiring end to end**

`notify/InvoiceNoticeIT.java` — a Spring integration test with the real event plumbing and a fake
`BotClient`:

```java
package uz.efbazaar.payment.notify;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.TestPropertySource;

import java.util.ArrayList;
import java.util.List;
import java.util.OptionalLong;

import static org.assertj.core.api.Assertions.assertThat;

@Import(InvoiceNoticeIT.FakeBotConfig.class)
@TestPropertySource(properties = "payment.admin-telegram.enabled=true")
class InvoiceNoticeIT extends AbstractPostgresIT {

    static class RecordingBot implements BotClient {
        final List<String> posted = new ArrayList<>();
        final List<Long> deleted = new ArrayList<>();
        long nextId = 100;

        @Override public OptionalLong postPaymentNotice(String html) {
            posted.add(html);
            return OptionalLong.of(nextId++);
        }

        @Override public void deletePaymentNotice(long messageId) {
            deleted.add(messageId);
        }
    }

    @TestConfiguration
    static class FakeBotConfig {
        @Bean @Primary RecordingBot recordingBot() { return new RecordingBot(); }
    }

    @Autowired RecordingBot bot;
    // plus the fixtures the other invoice ITs use: PlatformCardService,
    // InvoiceService, ByCardService, InvoiceRepository, InvoiceExpirySweeper.

    @BeforeEach
    void reset() {
        bot.posted.clear();
        bot.deleted.clear();
    }
```

Four tests:

1. **`creatingAnInvoiceStoresTheNoticeId`** — create an invoice against an active card; assert
   `bot.posted` has one entry and the persisted row's `adminNoticeMessageId` is `100`.
2. **`payingReplacesTheNotice`** — feed `ByCardService.ingest` a matching observation, then assert
   `bot.deleted` contains `100` and a second message was posted containing `amalga oshirildi`.
   The listener fires after the ingest transaction commits, so read the invoice back in a fresh
   transaction before asserting the new id.
3. **`expiringDeletesTheNotice`** — set `expiresAt` into the past, run
   `InvoiceExpirySweeper.sweep()`, assert `bot.deleted` contains the id and `bot.posted` gained
   nothing.
4. **`aDeadBotStillCreditsTheWallet`** — swap in a `BotClient` that throws on every call (a nested
   `@TestConfiguration`, or a boolean flag on `RecordingBot` flipped inside the test), run the full
   create → ingest cycle, and assert the wallet balance rose. **This is the test that guards the
   rule.** Without it, a future refactor that lets the notifier throw would pass every other test in
   this file.

Note for test 2: `@TransactionalEventListener` only fires when a real transaction commits. If a test
method is itself `@Transactional`, the listener never runs. Keep these tests non-transactional and
clean up explicitly, as the other payment ITs do.

- [ ] **Step 9: Configuration, compose, and the environment**

`backend/payment-service/src/main/resources/application.yml`:

```yaml
payment:
  admin-telegram:
    enabled: ${PAYMENT_ADMIN_TELEGRAM_ENABLED:true}
    bot-base-url: ${BOT_INTERNAL_BASE_URL:http://bot:8084}
```

`backend/payment-service/src/test/resources/application-test.yml`:

```yaml
payment:
  admin-telegram:
    enabled: false
```

Off by default in tests, so the ITs written in Tasks 1–11 keep passing without a bot. `InvoiceNoticeIT`
turns it back on for itself with `@TestPropertySource`.

`docker-compose.yml` — `payment-service` gains `BOT_INTERNAL_BASE_URL` and
`PAYMENT_ADMIN_TELEGRAM_ENABLED`; `bot` gains `TELEGRAM_TOPIC_PAYMENTS`. Add the same three keys to
`.env.example` with empty values and a comment that `TELEGRAM_TOPIC_PAYMENTS` is the thread id of the
admin group's payments topic. **The real value goes in `.env` only** — it is a secret, like every
other Telegram identifier in this project.

No nginx change: `/bot/internal/` already answers 404 publicly.

- [ ] **Step 10: Build both modules and commit**

```bash
cd bot && mvn -q clean verify
```

```bash
cd backend/payment-service && mvn -q clean verify
```

```bash
git add bot/src backend/payment-service/src docker-compose.yml .env.example
git commit -m "feat(payment): announce every invoice in the admin Telegram topic"
```

---

## Done when

- A user opens `/hamyon`, requests a top-up, sees a real card with an exact amount and a countdown, transfers, and the balance rises without anybody touching the database.
- Two users requesting the same amount at the same moment receive different cards, or different amounts, and both are credited correctly.
- Stopping `humo-userbot` makes the platform refuse new top-ups within `heartbeat-timeout-seconds`, and the admin banner turns red.
- A transfer with no matching invoice appears in the unmatched queue with its raw Telegram message, and an admin can attribute it to a user with a note.
- Every invoice appears in the admin group's payments topic when it is created, is replaced by a completion message when it is paid, and vanishes when it expires — and stopping `bot` entirely changes none of the money outcomes above.
- `mvn clean verify` is green in `backend/payment-service` and in `bot`; `pytest` is green in `humo-userbot`; `npm run lint && npm test` are green in `frontend`.
