# Plan A — trade-service Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an empty-but-real trade-service Spring Boot microservice with an encrypted `Card` and `Mailbox` metadata store, a `TradeCrypto` helper for AES-256-GCM at-rest encryption with HKDF-derived per-record keys, a `MockPaymentAdapter`, and a Docker Compose entry so the service starts on `docker compose up` and reports `UP` on `/actuator/health`.

**Architecture:** New Spring Boot 3.3.4 microservice in `backend/trade-service/`, its own postgres database (`trade_db`), its own port (8085), following the exact layout of existing efbazaar services (auth-service is the template). No trade lifecycle, no Kafka, no state machine yet — those come in Plan B. This plan only builds the plumbing needed for later plans to slot in.

**Tech Stack:** Java 21, Spring Boot 3.3.4, Spring Web, Spring Data JPA, Spring Boot Actuator, Postgres 16, Flyway, Lombok, MapStruct, JUnit 5, Bean Validation, jjwt (for JWT auth compatibility later — declared, not wired).

## Global Constraints

- **Java version:** Java 21 (matches all existing services).
- **Spring Boot:** 3.3.4 (matches `auth-service/pom.xml` parent version).
- **Package root:** `uz.efbazaar.trade`.
- **Maven artifact:** `trade-service`, `groupId=uz.efbazaar`, `version=0.0.1-SNAPSHOT`.
- **HTTP port:** 8085 (auth=8081, marketplace=8082, recommendation=8083, bot=8084, trade=8085).
- **Postgres database:** `trade_db` (per-service DB, matching efbazaar pattern — not a schema).
- **Encryption:** AES-256-GCM with 12-byte IV and 16-byte tag; per-record key via HKDF-SHA256 with `master_key` (32 bytes) as input keying material.
- **Master key location:** file at `MASTER_KEY_FILE` env, mounted as Docker secret `/run/secrets/master_key`. File contains 32 raw bytes, base64-encoded on one line.
- **Naming:** DB tables plural (`cards`, `mailboxes`), Java entities singular (`Card`, `Mailbox`) — matches marketplace-service conventions.
- **Time:** all timestamps `TIMESTAMPTZ` in DB, `java.time.Instant` in Java.
- **Migration filenames:** `V<n>__<snake_case>.sql` in `src/main/resources/db/migration/`, `V1__init.sql` first.
- **Commit style:** Conventional Commits (`feat:`, `chore:`, `test:`, `docs:`) — matches recent efbazaar history.
- **Do not commit secrets:** master_key files must be gitignored; only `master_key.example` is checked in with fake bytes.

---

## File Structure

```
ef-bazaar/
├── .env.example                                                  [MODIFY]
├── .gitignore                                                    [MODIFY]
├── docker-compose.yml                                            [MODIFY]
├── infra/
│   └── secrets/
│       └── master_key.example                                    [CREATE]
├── backend/
│   └── trade-service/                                            [CREATE-DIR]
│       ├── Dockerfile                                            [CREATE]
│       ├── pom.xml                                               [CREATE]
│       └── src/
│           ├── main/
│           │   ├── java/uz/efbazaar/trade/
│           │   │   ├── TradeApplication.java                     [CREATE]
│           │   │   ├── crypto/
│           │   │   │   ├── EncryptedField.java                   [CREATE]
│           │   │   │   ├── HkdfDeriver.java                      [CREATE]
│           │   │   │   ├── MasterKeyProvider.java                [CREATE]
│           │   │   │   └── TradeCrypto.java                      [CREATE]
│           │   │   ├── card/
│           │   │   │   ├── domain/
│           │   │   │   │   ├── Card.java                         [CREATE]
│           │   │   │   │   └── CardBrand.java                    [CREATE]
│           │   │   │   ├── repository/
│           │   │   │   │   └── CardRepository.java               [CREATE]
│           │   │   │   ├── service/
│           │   │   │   │   ├── CardService.java                  [CREATE]
│           │   │   │   │   └── LuhnValidator.java                [CREATE]
│           │   │   │   ├── controller/
│           │   │   │   │   └── CardController.java               [CREATE]
│           │   │   │   ├── mapper/
│           │   │   │   │   └── CardMapper.java                   [CREATE]
│           │   │   │   ├── dto/
│           │   │   │   │   ├── CardCreateRequest.java            [CREATE]
│           │   │   │   │   └── CardResponse.java                 [CREATE]
│           │   │   │   └── exception/
│           │   │   │       └── CardValidationException.java      [CREATE]
│           │   │   ├── mailbox/
│           │   │   │   ├── domain/Mailbox.java                   [CREATE]
│           │   │   │   ├── repository/MailboxRepository.java     [CREATE]
│           │   │   │   ├── service/MailboxService.java           [CREATE]
│           │   │   │   ├── controller/MailboxController.java     [CREATE]
│           │   │   │   ├── mapper/MailboxMapper.java             [CREATE]
│           │   │   │   └── dto/MailboxResponse.java              [CREATE]
│           │   │   └── payment/
│           │   │       ├── PaymentAdapter.java                   [CREATE]
│           │   │       ├── PaymentIntent.java                    [CREATE]
│           │   │       ├── PaymentStatus.java                    [CREATE]
│           │   │       ├── PayoutIntent.java                     [CREATE]
│           │   │       ├── PayoutStatus.java                     [CREATE]
│           │   │       └── MockPaymentAdapter.java               [CREATE]
│           │   └── resources/
│           │       ├── application.yml                           [CREATE]
│           │       └── db/migration/
│           │           ├── V1__init.sql                          [CREATE]
│           │           ├── V2__create_card_table.sql             [CREATE]
│           │           └── V3__create_mailbox_table.sql          [CREATE]
│           └── test/
│               ├── java/uz/efbazaar/trade/
│               │   ├── TradeApplicationTests.java                [CREATE]
│               │   ├── crypto/
│               │   │   ├── HkdfDeriverTest.java                  [CREATE]
│               │   │   └── TradeCryptoTest.java                  [CREATE]
│               │   ├── card/
│               │   │   ├── LuhnValidatorTest.java                [CREATE]
│               │   │   ├── CardServiceTest.java                  [CREATE]
│               │   │   └── CardControllerIT.java                 [CREATE]
│               │   ├── mailbox/
│               │   │   └── MailboxControllerIT.java              [CREATE]
│               │   └── payment/
│               │       └── MockPaymentAdapterTest.java           [CREATE]
│               └── resources/
│                   └── application-test.yml                      [CREATE]
```

---

## Task 1: Scaffold Maven project and register in Docker Compose

**Files:**
- Create: `backend/trade-service/pom.xml`
- Create: `backend/trade-service/Dockerfile`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/TradeApplication.java`
- Create: `backend/trade-service/src/main/resources/application.yml` (minimal — expanded in Task 2)
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/TradeApplicationTests.java`
- Modify: `.env.example` (add `TRADE_DB_NAME`)
- Modify: `docker-compose.yml` (add trade-service block, extend `POSTGRES_MULTIPLE_DATABASES`)
- Modify: `.gitignore` (ensure `infra/secrets/master_key` is ignored)
- Create: `infra/secrets/master_key.example`

**Interfaces:**
- Produces: `TradeApplication` main class in package `uz.efbazaar.trade`. Later tasks add sub-packages beside it.

- [ ] **Step 1: Create Maven project directory and pom.xml**

Copy the auth-service pom as the base and adjust artifact + heap-relevant deps. Remove auth-only deps (Google OAuth, Spring Security) — they can come back if trade-service ever needs JWT verification, which will be added in Plan B.

Create `backend/trade-service/pom.xml`:

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
    <artifactId>trade-service</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>trade-service</name>
    <description>efBazaar Escrow Trade Orchestrator</description>

    <properties>
        <java.version>21</java.version>
        <mapstruct.version>1.6.2</mapstruct.version>
        <lombok-mapstruct-binding.version>0.2.0</lombok-mapstruct-binding.version>
        <springdoc.version>2.6.0</springdoc.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
            <version>${springdoc.version}</version>
        </dependency>

        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-core</artifactId>
        </dependency>
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-database-postgresql</artifactId>
        </dependency>

        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.mapstruct</groupId>
            <artifactId>mapstruct</artifactId>
            <version>${mapstruct.version}</version>
        </dependency>

        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>com.h2database</groupId>
            <artifactId>h2</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <finalName>${project.artifactId}</finalName>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <configuration>
                    <source>${java.version}</source>
                    <target>${java.version}</target>
                    <annotationProcessorPaths>
                        <path>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </path>
                        <path>
                            <groupId>org.mapstruct</groupId>
                            <artifactId>mapstruct-processor</artifactId>
                            <version>${mapstruct.version}</version>
                        </path>
                        <path>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok-mapstruct-binding</artifactId>
                            <version>${lombok-mapstruct-binding.version}</version>
                        </path>
                    </annotationProcessorPaths>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <layers>
                        <enabled>true</enabled>
                    </layers>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

- [ ] **Step 2: Create the main Application class**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/TradeApplication.java`:

```java
package uz.efbazaar.trade;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan("uz.efbazaar.trade")
public class TradeApplication {
    public static void main(String[] args) {
        SpringApplication.run(TradeApplication.class, args);
    }
}
```

- [ ] **Step 3: Add a minimal application.yml**

Full DB / Flyway config lands in Task 2. This one just brings the app up on port 8085 for the compile smoke test.

Create `backend/trade-service/src/main/resources/application.yml`:

```yaml
spring:
  application:
    name: trade-service
  profiles:
    active: ${SPRING_PROFILES_ACTIVE:local}
  autoconfigure:
    exclude:
      - org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
      - org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration

server:
  port: 8085
  forward-headers-strategy: framework
  error:
    include-message: always

management:
  endpoints:
    web:
      exposure:
        include: health,info
  endpoint:
    health:
      show-details: never
```

The datasource exclusions in Step 3 are intentional and **removed in Task 2** once the DB config is real. They stop the app from failing to start before we've wired the DB.

- [ ] **Step 4: Write the failing "context loads" test**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/TradeApplicationTests.java`:

```java
package uz.efbazaar.trade;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class TradeApplicationTests {

    @Test
    void contextLoads() {
        // The Spring context should start with no beans failing.
    }
}
```

- [ ] **Step 5: Compile and run the test**

Run:
```bash
cd backend/trade-service
mvn -q clean test
```

Expected: `BUILD SUCCESS`, `Tests run: 1, Failures: 0, Errors: 0`.

If the test fails because the Spring context tries to connect to a datasource, re-check Step 3 — the auto-configure exclusions must be present.

- [ ] **Step 6: Add the Dockerfile (multi-stage layered jar)**

Create `backend/trade-service/Dockerfile`:

```dockerfile
# ==============================================================
# trade-service — multi-stage build with Spring Boot LAYERED jar.
# Same pattern as auth-service (see backend/auth-service/Dockerfile).
# ==============================================================

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q clean package -DskipTests \
 && mv target/*.jar target/app.jar

FROM eclipse-temurin:21-jre-alpine AS extract
WORKDIR /workspace
COPY --from=build /workspace/target/app.jar app.jar
RUN java -Djarmode=tools -jar app.jar extract --layers --launcher

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S -G app app

COPY --from=extract /workspace/app/dependencies/          ./
COPY --from=extract /workspace/app/spring-boot-loader/    ./
COPY --from=extract /workspace/app/snapshot-dependencies/ ./
COPY --from=extract /workspace/app/application/           ./

USER app
EXPOSE 8085

ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"
ENV SPRING_PROFILES_ACTIVE=docker

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD wget -qO- http://localhost:8085/actuator/health | grep -q '"status":"UP"' || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS org.springframework.boot.loader.launch.JarLauncher"]
```

- [ ] **Step 7: Add the `TRADE_DB_NAME` env variable**

Modify `.env.example` — add one line beside `MARKETPLACE_DB_NAME`:

```
TRADE_DB_NAME=trade_db
```

Also add the same line to your local `.env` (unversioned).

- [ ] **Step 8: Extend `POSTGRES_MULTIPLE_DATABASES` and add the trade-service block**

Modify `docker-compose.yml`:

Find the `postgres:` service block and update the env var:

```yaml
      POSTGRES_MULTIPLE_DATABASES: ${AUTH_DB_NAME},${MARKETPLACE_DB_NAME},${RECOMMENDATION_DB_NAME},${TRADE_DB_NAME},${EFBAZAAR_DB_NAME:-efbazaar}
```

Add a new service after `recommendation-service:` (before the reverse-proxy block):

```yaml
  # ---------- Trade service (escrow orchestrator, Plan A foundation) ----------
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
      MASTER_KEY_FILE: /run/secrets/master_key
    secrets:
      - master_key
    depends_on:
      postgres:
        condition: service_healthy
    mem_limit: 320m
    memswap_limit: 480m
    networks:
      - efbazaar-net
```

Add (or extend) a top-level `secrets:` block at the bottom of the compose file:

```yaml
secrets:
  master_key:
    file: ./infra/secrets/master_key
```

- [ ] **Step 9: Create the example master key and gitignore the real one**

Create `infra/secrets/master_key.example`:

```
# 32 random bytes, base64-encoded, on one line, no trailing newline.
# Generate a real key with:
#   openssl rand -base64 32 > infra/secrets/master_key
# and DO NOT commit the real key.
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
```

Add to `.gitignore`:

```
# Secrets (never commit)
infra/secrets/master_key
```

Generate a real key for local dev:

```bash
openssl rand -base64 32 > infra/secrets/master_key
```

- [ ] **Step 10: Commit**

```bash
git add backend/trade-service/pom.xml \
        backend/trade-service/Dockerfile \
        backend/trade-service/src/ \
        infra/secrets/master_key.example \
        .env.example \
        .gitignore \
        docker-compose.yml
git commit -m "feat(trade-service): scaffold Spring Boot 3.3.4 project on port 8085"
```

---

## Task 2: Wire the datasource and Flyway with an empty schema

**Files:**
- Modify: `backend/trade-service/src/main/resources/application.yml`
- Create: `backend/trade-service/src/main/resources/db/migration/V1__init.sql`
- Create: `backend/trade-service/src/test/resources/application-test.yml`
- Modify: `backend/trade-service/src/test/java/uz/efbazaar/trade/TradeApplicationTests.java`

**Interfaces:**
- Consumes: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` env vars.
- Produces: an initialised `trade_db` with the `uuid-ossp` extension and Flyway history table.

- [ ] **Step 1: Replace the minimal application.yml with a full one**

Overwrite `backend/trade-service/src/main/resources/application.yml`:

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

server:
  port: 8085
  forward-headers-strategy: framework
  error:
    include-message: always

management:
  endpoints:
    web:
      exposure:
        include: health,info
  endpoint:
    health:
      show-details: never
```

Notice the datasource auto-configure exclusions from Task 1 are now removed — Flyway needs a live datasource.

- [ ] **Step 2: Create the V1 migration**

Create `backend/trade-service/src/main/resources/db/migration/V1__init.sql`:

```sql
-- ==============================================================
-- trade-service — initial schema.
-- Provides just the uuid-ossp extension used by later migrations.
-- ==============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

- [ ] **Step 3: Provide an in-memory test profile so `mvn test` doesn't need a real postgres**

Create `backend/trade-service/src/test/resources/application-test.yml`:

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:trade_db_test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE
    driver-class-name: org.h2.Driver
    username: sa
    password:

  jpa:
    hibernate:
      ddl-auto: create-drop
    properties:
      hibernate:
        dialect: org.hibernate.dialect.H2Dialect

  flyway:
    enabled: false
```

We disable Flyway in the test profile because the `uuid-ossp` extension is Postgres-specific. Postgres-only migrations get integration-tested against a real postgres in Plan B (Testcontainers). For unit-and-context tests we let Hibernate `create-drop` build the tables from the entity annotations.

- [ ] **Step 4: Point the context-loads test at the `test` profile**

Modify `backend/trade-service/src/test/java/uz/efbazaar/trade/TradeApplicationTests.java` — add the `@ActiveProfiles("test")` annotation:

```java
package uz.efbazaar.trade;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class TradeApplicationTests {

    @Test
    void contextLoads() {
        // Full context with H2 datasource, no Flyway.
    }
}
```

- [ ] **Step 5: Run the test to verify the H2-backed context loads**

Run:
```bash
cd backend/trade-service
mvn -q clean test
```

Expected: `BUILD SUCCESS`, `Tests run: 1, Failures: 0, Errors: 0`.

- [ ] **Step 6: Smoke-test against local postgres (optional local check)**

If a local postgres is already running from the compose stack:

```bash
cd ~/IdeaProjects/ef-bazaar
docker compose up -d postgres
docker compose exec postgres psql -U efbazaar -c "CREATE DATABASE trade_db;" || true
cd backend/trade-service
POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=efbazaar POSTGRES_PASSWORD=efbazaar POSTGRES_DB=trade_db mvn -q spring-boot:run
```

In another terminal:
```bash
curl -s http://localhost:8085/actuator/health
```

Expected: `{"status":"UP"}`.

Then stop with Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add backend/trade-service/src/main/resources/application.yml \
        backend/trade-service/src/main/resources/db/migration/V1__init.sql \
        backend/trade-service/src/test/resources/application-test.yml \
        backend/trade-service/src/test/java/uz/efbazaar/trade/TradeApplicationTests.java
git commit -m "feat(trade-service): wire postgres datasource and Flyway V1"
```

---

## Task 3: TradeCrypto — AES-256-GCM with HKDF-derived per-record keys

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/crypto/MasterKeyProvider.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/crypto/HkdfDeriver.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/crypto/EncryptedField.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/crypto/TradeCrypto.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/crypto/HkdfDeriverTest.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/crypto/TradeCryptoTest.java`
- Modify: `backend/trade-service/src/main/resources/application.yml` (add `MASTER_KEY_FILE` binding)

**Interfaces:**
- Produces:
  - `EncryptedField` record: `EncryptedField(byte[] iv, byte[] tag, byte[] ciphertext)` — used by later entities to store encrypted PAN, mailbox password, chat message body.
  - `TradeCrypto.encrypt(String context, byte[] plaintext) -> EncryptedField`
  - `TradeCrypto.decrypt(String context, EncryptedField field) -> byte[]`
- Consumes:
  - `MasterKeyProvider.masterKey() -> byte[]` (32 bytes)

- [ ] **Step 1: Write the failing HkdfDeriver test**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/crypto/HkdfDeriverTest.java`:

```java
package uz.efbazaar.trade.crypto;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;

class HkdfDeriverTest {

    private static final byte[] MASTER = HexFormat.of()
            .parseHex("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b");

    @Test
    void derivesReproducibleKey() {
        byte[] k1 = HkdfDeriver.derive(MASTER, "card-abc".getBytes(StandardCharsets.UTF_8), 32);
        byte[] k2 = HkdfDeriver.derive(MASTER, "card-abc".getBytes(StandardCharsets.UTF_8), 32);
        assertThat(k1).isEqualTo(k2);
        assertThat(k1).hasSize(32);
    }

    @Test
    void differentContextsProduceDifferentKeys() {
        byte[] k1 = HkdfDeriver.derive(MASTER, "card-abc".getBytes(StandardCharsets.UTF_8), 32);
        byte[] k2 = HkdfDeriver.derive(MASTER, "card-xyz".getBytes(StandardCharsets.UTF_8), 32);
        assertThat(k1).isNotEqualTo(k2);
    }
}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend/trade-service
mvn -q test -Dtest=HkdfDeriverTest
```

Expected: compilation failure — `HkdfDeriver` doesn't exist yet.

- [ ] **Step 3: Implement HkdfDeriver**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/crypto/HkdfDeriver.java`:

```java
package uz.efbazaar.trade.crypto;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.util.Arrays;

/**
 * RFC 5869 HKDF-SHA256.
 * Single static helper because we never keep hkdf state around.
 */
public final class HkdfDeriver {

    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final byte[] EMPTY_SALT = new byte[32];

    private HkdfDeriver() {
    }

    public static byte[] derive(byte[] inputKeyMaterial, byte[] info, int length) {
        if (length <= 0 || length > 255 * 32) {
            throw new IllegalArgumentException("length must be in (0, 8160]");
        }
        try {
            byte[] prk = hmac(EMPTY_SALT, inputKeyMaterial);

            int n = (length + 31) / 32;
            ByteBuffer okm = ByteBuffer.allocate(n * 32);
            byte[] t = new byte[0];
            for (int i = 1; i <= n; i++) {
                Mac mac = Mac.getInstance(HMAC_SHA256);
                mac.init(new SecretKeySpec(prk, HMAC_SHA256));
                mac.update(t);
                mac.update(info);
                mac.update((byte) i);
                t = mac.doFinal();
                okm.put(t);
            }
            return Arrays.copyOf(okm.array(), length);
        } catch (Exception e) {
            throw new IllegalStateException("HKDF derivation failed", e);
        }
    }

    private static byte[] hmac(byte[] key, byte[] data) throws Exception {
        Mac mac = Mac.getInstance(HMAC_SHA256);
        mac.init(new SecretKeySpec(key, HMAC_SHA256));
        return mac.doFinal(data);
    }
}
```

- [ ] **Step 4: Run to verify HkdfDeriver tests pass**

```bash
mvn -q test -Dtest=HkdfDeriverTest
```

Expected: `Tests run: 2, Failures: 0, Errors: 0`.

- [ ] **Step 5: Add MasterKeyProvider and EncryptedField**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/crypto/EncryptedField.java`:

```java
package uz.efbazaar.trade.crypto;

/**
 * At-rest encryption bundle. All three fields go into DB columns of the owning entity.
 * The tag is authenticated by GCM but stored separately from the ciphertext to keep the
 * DB column contract explicit (some DB tooling truncates unknown suffixes on BYTEA).
 */
public record EncryptedField(byte[] iv, byte[] tag, byte[] ciphertext) {
    public EncryptedField {
        if (iv == null || iv.length != 12) {
            throw new IllegalArgumentException("iv must be 12 bytes");
        }
        if (tag == null || tag.length != 16) {
            throw new IllegalArgumentException("tag must be 16 bytes");
        }
        if (ciphertext == null) {
            throw new IllegalArgumentException("ciphertext must be non-null");
        }
    }
}
```

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/crypto/MasterKeyProvider.java`:

```java
package uz.efbazaar.trade.crypto;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

/**
 * Reads the 32-byte master key from the file referenced by MASTER_KEY_FILE.
 * File contents: base64-encoded 32 raw bytes on one line (trailing whitespace tolerated).
 */
@Slf4j
@Component
public class MasterKeyProvider {

    private final byte[] key;

    public MasterKeyProvider(@Value("${trade.crypto.master-key-file:#{null}}") String masterKeyFile) {
        if (masterKeyFile == null || masterKeyFile.isBlank()) {
            throw new IllegalStateException(
                    "trade.crypto.master-key-file (or MASTER_KEY_FILE env) must be set");
        }
        try {
            String content = Files.readString(Path.of(masterKeyFile)).trim();
            byte[] decoded = Base64.getDecoder().decode(content);
            if (decoded.length != 32) {
                throw new IllegalStateException(
                        "master key must decode to 32 bytes, got " + decoded.length);
            }
            this.key = decoded;
            log.info("Master key loaded from {}", masterKeyFile);
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to load master key from " + masterKeyFile, e);
        }
    }

    public byte[] masterKey() {
        return key.clone();
    }
}
```

Modify `backend/trade-service/src/main/resources/application.yml` — add at the bottom, under a new `trade:` root:

```yaml
trade:
  crypto:
    master-key-file: ${MASTER_KEY_FILE:}
```

- [ ] **Step 6: Write the failing TradeCrypto test**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/crypto/TradeCryptoTest.java`:

```java
package uz.efbazaar.trade.crypto;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TradeCryptoTest {

    private TradeCrypto crypto;

    @BeforeEach
    void setUp() {
        byte[] master = new byte[32];
        new SecureRandom().nextBytes(master);
        crypto = new TradeCrypto(() -> master);
    }

    @Test
    void roundTripPlaintext() {
        byte[] plaintext = "hello world".getBytes(StandardCharsets.UTF_8);
        EncryptedField enc = crypto.encrypt("mbox-abc", plaintext);
        byte[] out = crypto.decrypt("mbox-abc", enc);
        assertThat(new String(out, StandardCharsets.UTF_8)).isEqualTo("hello world");
    }

    @Test
    void differentContextsProduceDifferentCiphertext() {
        byte[] plaintext = "same input".getBytes(StandardCharsets.UTF_8);
        EncryptedField a = crypto.encrypt("mbox-abc", plaintext);
        EncryptedField b = crypto.encrypt("mbox-xyz", plaintext);
        assertThat(a.ciphertext()).isNotEqualTo(b.ciphertext());
    }

    @Test
    void decryptWithWrongContextFails() {
        byte[] plaintext = "top secret".getBytes(StandardCharsets.UTF_8);
        EncryptedField enc = crypto.encrypt("mbox-abc", plaintext);
        assertThatThrownBy(() -> crypto.decrypt("mbox-xyz", enc))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void tamperingWithCiphertextFails() {
        byte[] plaintext = "top secret".getBytes(StandardCharsets.UTF_8);
        EncryptedField enc = crypto.encrypt("mbox-abc", plaintext);
        byte[] tampered = enc.ciphertext().clone();
        tampered[0] ^= 0x01;
        EncryptedField bad = new EncryptedField(enc.iv(), enc.tag(), tampered);
        assertThatThrownBy(() -> crypto.decrypt("mbox-abc", bad))
                .isInstanceOf(IllegalStateException.class);
    }
}
```

- [ ] **Step 7: Verify test fails (class does not exist)**

```bash
mvn -q test -Dtest=TradeCryptoTest
```

Expected: compilation failure — `TradeCrypto` does not exist.

- [ ] **Step 8: Implement TradeCrypto**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/crypto/TradeCrypto.java`:

```java
package uz.efbazaar.trade.crypto;

import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.function.Supplier;

/**
 * AES-256-GCM with HKDF-derived per-record keys.
 *
 * Context is any short string identifying the record (e.g. "card-{uuid}",
 * "mbox-{uuid}"). Same context is required at decrypt time — a wrong context
 * derives a different key and GCM authentication fails.
 */
@Component
public class TradeCrypto {

    private static final int GCM_TAG_BITS = 128;
    private static final int GCM_IV_BYTES = 12;

    private final Supplier<byte[]> masterKeySource;
    private final SecureRandom random;

    public TradeCrypto(MasterKeyProvider provider) {
        this(provider::masterKey);
    }

    /** Test-friendly constructor. */
    TradeCrypto(Supplier<byte[]> masterKeySource) {
        this.masterKeySource = masterKeySource;
        this.random = new SecureRandom();
    }

    public EncryptedField encrypt(String context, byte[] plaintext) {
        try {
            byte[] key = HkdfDeriver.derive(
                    masterKeySource.get(),
                    context.getBytes(StandardCharsets.UTF_8),
                    32);
            byte[] iv = new byte[GCM_IV_BYTES];
            random.nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE,
                    new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] cipherAndTag = cipher.doFinal(plaintext);

            byte[] ciphertext = Arrays.copyOfRange(cipherAndTag, 0, cipherAndTag.length - 16);
            byte[] tag = Arrays.copyOfRange(cipherAndTag, cipherAndTag.length - 16, cipherAndTag.length);
            return new EncryptedField(iv, tag, ciphertext);
        } catch (Exception e) {
            throw new IllegalStateException("AES-GCM encryption failed", e);
        }
    }

    public byte[] decrypt(String context, EncryptedField field) {
        try {
            byte[] key = HkdfDeriver.derive(
                    masterKeySource.get(),
                    context.getBytes(StandardCharsets.UTF_8),
                    32);
            byte[] cipherAndTag = new byte[field.ciphertext().length + field.tag().length];
            System.arraycopy(field.ciphertext(), 0, cipherAndTag, 0, field.ciphertext().length);
            System.arraycopy(field.tag(), 0, cipherAndTag, field.ciphertext().length, field.tag().length);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,
                    new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, field.iv()));
            return cipher.doFinal(cipherAndTag);
        } catch (Exception e) {
            throw new IllegalStateException("AES-GCM decryption failed", e);
        }
    }
}
```

- [ ] **Step 9: Run TradeCrypto tests**

```bash
mvn -q test -Dtest=TradeCryptoTest
```

Expected: `Tests run: 4, Failures: 0, Errors: 0`.

- [ ] **Step 10: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/crypto/ \
        backend/trade-service/src/test/java/uz/efbazaar/trade/crypto/ \
        backend/trade-service/src/main/resources/application.yml
git commit -m "feat(trade-service): add TradeCrypto (AES-256-GCM + HKDF-SHA256)"
```

---

## Task 4: Card entity + V2 migration

**Files:**
- Create: `backend/trade-service/src/main/resources/db/migration/V2__create_card_table.sql`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/card/domain/Card.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/card/domain/CardBrand.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/card/repository/CardRepository.java`

**Interfaces:**
- Produces:
  - `Card` entity fields: `id (UUID)`, `ownerUserId (UUID)`, `encryptedPan (byte[])`, `panIv (byte[12])`, `panTag (byte[16])`, `last4 (String)`, `expiryMonth (short)`, `expiryYear (short)`, `brand (CardBrand)`, `encryptedCvv (byte[]?)`, `cvvIv (byte[12]?)`, `cvvTag (byte[16]?)`, `savedToProfile (boolean)`, `createdAt (Instant)`.
  - `CardRepository extends JpaRepository<Card, UUID>` with `List<Card> findByOwnerUserIdAndSavedToProfileIsTrue(UUID ownerUserId)`.

- [ ] **Step 1: Create the V2 migration**

Create `backend/trade-service/src/main/resources/db/migration/V2__create_card_table.sql`:

```sql
-- ==============================================================
-- trade-service — card storage.
-- PAN is encrypted at rest with per-card HKDF-derived AES-256-GCM.
-- CVV is only stored when strictly needed (mock adapter); production
-- payment providers must never see our servers hold CVV.
-- ==============================================================

CREATE TABLE cards (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    owner_user_id     UUID         NOT NULL,

    encrypted_pan     BYTEA        NOT NULL,
    pan_iv            BYTEA        NOT NULL,
    pan_tag           BYTEA        NOT NULL,

    last4             CHAR(4)      NOT NULL,
    expiry_month      SMALLINT     NOT NULL,
    expiry_year       SMALLINT     NOT NULL,
    brand             VARCHAR(16)  NOT NULL,

    encrypted_cvv     BYTEA,
    cvv_iv            BYTEA,
    cvv_tag           BYTEA,

    saved_to_profile  BOOLEAN      NOT NULL DEFAULT FALSE,

    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_cards_brand    CHECK (brand IN ('VISA', 'MC', 'UZCARD', 'HUMO')),
    CONSTRAINT chk_cards_month    CHECK (expiry_month BETWEEN 1 AND 12),
    CONSTRAINT chk_cards_year     CHECK (expiry_year BETWEEN 2020 AND 2099),
    CONSTRAINT chk_cards_cvv_all_or_nothing
        CHECK ((encrypted_cvv IS NULL AND cvv_iv IS NULL AND cvv_tag IS NULL)
            OR (encrypted_cvv IS NOT NULL AND cvv_iv IS NOT NULL AND cvv_tag IS NOT NULL))
);

CREATE INDEX idx_cards_owner_user_id ON cards (owner_user_id);
```

- [ ] **Step 2: Add the CardBrand enum**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/card/domain/CardBrand.java`:

```java
package uz.efbazaar.trade.card.domain;

public enum CardBrand {
    VISA, MC, UZCARD, HUMO
}
```

- [ ] **Step 3: Add the Card entity**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/card/domain/Card.java`:

```java
package uz.efbazaar.trade.card.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cards")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Card {

    /**
     * Application-assigned UUID. We deliberately don't use @GeneratedValue
     * because the id is needed *before* persistence to derive the AES-GCM
     * context ("card-pan-{id}"). The DB default (uuid_generate_v4()) stays
     * as a safety net for direct SQL inserts.
     */
    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "owner_user_id", nullable = false)
    private UUID ownerUserId;

    @Column(name = "encrypted_pan", nullable = false)
    private byte[] encryptedPan;

    @Column(name = "pan_iv", nullable = false, length = 12)
    private byte[] panIv;

    @Column(name = "pan_tag", nullable = false, length = 16)
    private byte[] panTag;

    @Column(name = "last4", nullable = false, length = 4)
    private String last4;

    @Column(name = "expiry_month", nullable = false)
    private short expiryMonth;

    @Column(name = "expiry_year", nullable = false)
    private short expiryYear;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private CardBrand brand;

    @Column(name = "encrypted_cvv")
    private byte[] encryptedCvv;

    @Column(name = "cvv_iv", length = 12)
    private byte[] cvvIv;

    @Column(name = "cvv_tag", length = 16)
    private byte[] cvvTag;

    @Column(name = "saved_to_profile", nullable = false)
    @Builder.Default
    private boolean savedToProfile = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
```

- [ ] **Step 4: Add the CardRepository**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/card/repository/CardRepository.java`:

```java
package uz.efbazaar.trade.card.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.card.domain.Card;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CardRepository extends JpaRepository<Card, UUID> {

    List<Card> findByOwnerUserIdAndSavedToProfileIsTrue(UUID ownerUserId);

    Optional<Card> findByIdAndOwnerUserId(UUID id, UUID ownerUserId);
}
```

- [ ] **Step 5: Verify the schema still boots**

```bash
mvn -q clean test -Dtest=TradeApplicationTests
```

Expected: `Tests run: 1, Failures: 0, Errors: 0`. Hibernate's `create-drop` should now emit a `cards` table from the entity in the H2 test profile.

- [ ] **Step 6: Commit**

```bash
git add backend/trade-service/src/main/resources/db/migration/V2__create_card_table.sql \
        backend/trade-service/src/main/java/uz/efbazaar/trade/card/
git commit -m "feat(trade-service): add Card entity and V2 migration"
```

---

## Task 5: Card service with Luhn validation and PAN encryption

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/card/service/LuhnValidator.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/card/service/CardService.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/card/dto/CardCreateRequest.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/card/exception/CardValidationException.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/card/LuhnValidatorTest.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/card/CardServiceTest.java`

**Interfaces:**
- Consumes: `TradeCrypto`, `CardRepository` (Task 3, Task 4).
- Produces:
  - `LuhnValidator.isValid(String pan) -> boolean`
  - `CardCreateRequest(String pan, short expiryMonth, short expiryYear, CardBrand brand, String cvv, boolean saveToProfile)`
  - `CardService.create(UUID ownerUserId, CardCreateRequest req) -> Card`
  - `CardService.listSaved(UUID ownerUserId) -> List<Card>`
  - `CardService.delete(UUID ownerUserId, UUID cardId) -> void` (throws `EntityNotFoundException` if not owned by user).

- [ ] **Step 1: Write the failing LuhnValidator test**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/card/LuhnValidatorTest.java`:

```java
package uz.efbazaar.trade.card;

import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.card.service.LuhnValidator;

import static org.assertj.core.api.Assertions.assertThat;

class LuhnValidatorTest {

    @Test
    void acceptsKnownValidNumbers() {
        assertThat(LuhnValidator.isValid("4111111111111111")).isTrue();  // Visa test
        assertThat(LuhnValidator.isValid("5555555555554444")).isTrue();  // Mastercard test
        assertThat(LuhnValidator.isValid("8600000000000000")).isFalse(); // Uzcard prefix, but not Luhn-valid stub
    }

    @Test
    void rejectsShortNumbers() {
        assertThat(LuhnValidator.isValid("411111")).isFalse();
    }

    @Test
    void rejectsNonDigits() {
        assertThat(LuhnValidator.isValid("4111-1111-1111-1111")).isFalse();
    }

    @Test
    void rejectsNull() {
        assertThat(LuhnValidator.isValid(null)).isFalse();
    }
}
```

- [ ] **Step 2: Run to verify failure**

```bash
mvn -q test -Dtest=LuhnValidatorTest
```

Expected: compilation failure.

- [ ] **Step 3: Implement LuhnValidator**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/card/service/LuhnValidator.java`:

```java
package uz.efbazaar.trade.card.service;

public final class LuhnValidator {

    private LuhnValidator() {
    }

    public static boolean isValid(String pan) {
        if (pan == null || pan.length() < 12 || pan.length() > 19) {
            return false;
        }
        int sum = 0;
        boolean doubleIt = false;
        for (int i = pan.length() - 1; i >= 0; i--) {
            char c = pan.charAt(i);
            if (c < '0' || c > '9') {
                return false;
            }
            int digit = c - '0';
            if (doubleIt) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }
            sum += digit;
            doubleIt = !doubleIt;
        }
        return sum % 10 == 0;
    }
}
```

- [ ] **Step 4: Run to verify Luhn tests pass**

```bash
mvn -q test -Dtest=LuhnValidatorTest
```

Expected: `Tests run: 4, Failures: 0, Errors: 0`.

- [ ] **Step 5: Add DTO and exception**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/card/dto/CardCreateRequest.java`:

```java
package uz.efbazaar.trade.card.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import uz.efbazaar.trade.card.domain.CardBrand;

public record CardCreateRequest(
        @NotBlank String pan,
        @Min(1) @Max(12) short expiryMonth,
        @Min(2020) @Max(2099) short expiryYear,
        @NotNull CardBrand brand,
        String cvv,
        boolean saveToProfile
) {
}
```

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/card/exception/CardValidationException.java`:

```java
package uz.efbazaar.trade.card.exception;

public class CardValidationException extends RuntimeException {
    public CardValidationException(String message) {
        super(message);
    }
}
```

- [ ] **Step 6: Write the failing CardService test**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/card/CardServiceTest.java`:

```java
package uz.efbazaar.trade.card;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.card.domain.Card;
import uz.efbazaar.trade.card.domain.CardBrand;
import uz.efbazaar.trade.card.dto.CardCreateRequest;
import uz.efbazaar.trade.card.exception.CardValidationException;
import uz.efbazaar.trade.card.repository.CardRepository;
import uz.efbazaar.trade.card.service.CardService;
import uz.efbazaar.trade.crypto.TradeCrypto;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CardServiceTest {

    private CardRepository repo;
    private TradeCrypto crypto;
    private CardService service;

    @BeforeEach
    void setUp() {
        repo = mock(CardRepository.class);
        byte[] master = new byte[32];
        new SecureRandom().nextBytes(master);
        crypto = new TradeCrypto(() -> master);
        service = new CardService(repo, crypto);

        when(repo.save(any(Card.class))).thenAnswer(inv -> {
            Card c = inv.getArgument(0);
            if (c.getId() == null) {
                c.setId(UUID.randomUUID());
            }
            return c;
        });
    }

    @Test
    void createStoresLast4AndEncryptedPan() {
        UUID user = UUID.randomUUID();
        CardCreateRequest req = new CardCreateRequest(
                "4111111111111111", (short) 12, (short) 2027, CardBrand.VISA, "123", true);

        Card saved = service.create(user, req);

        assertThat(saved.getLast4()).isEqualTo("1111");
        assertThat(saved.getEncryptedPan()).isNotEmpty();
        assertThat(new String(saved.getEncryptedPan(), StandardCharsets.UTF_8))
                .doesNotContain("4111111111111111");
        assertThat(saved.isSavedToProfile()).isTrue();
        assertThat(saved.getEncryptedCvv()).isNotNull();  // Visa → CVV kept
    }

    @Test
    void createRejectsInvalidPan() {
        UUID user = UUID.randomUUID();
        CardCreateRequest req = new CardCreateRequest(
                "1234", (short) 12, (short) 2027, CardBrand.VISA, "123", true);

        assertThatThrownBy(() -> service.create(user, req))
                .isInstanceOf(CardValidationException.class)
                .hasMessageContaining("PAN");
    }

    @Test
    void createSkipsCvvForNonVisaCards() {
        UUID user = UUID.randomUUID();
        CardCreateRequest req = new CardCreateRequest(
                "5555555555554444", (short) 12, (short) 2027, CardBrand.MC, "999", false);

        Card saved = service.create(user, req);

        assertThat(saved.getEncryptedCvv()).isNull();
        assertThat(saved.getCvvIv()).isNull();
        assertThat(saved.getCvvTag()).isNull();
    }
}
```

- [ ] **Step 7: Run to verify failure**

```bash
mvn -q test -Dtest=CardServiceTest
```

Expected: compilation failure — `CardService` does not exist.

- [ ] **Step 8: Implement CardService**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/card/service/CardService.java`:

```java
package uz.efbazaar.trade.card.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.card.domain.Card;
import uz.efbazaar.trade.card.domain.CardBrand;
import uz.efbazaar.trade.card.dto.CardCreateRequest;
import uz.efbazaar.trade.card.exception.CardValidationException;
import uz.efbazaar.trade.card.repository.CardRepository;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class CardService {

    private final CardRepository cards;
    private final TradeCrypto crypto;

    @Transactional
    public Card create(UUID ownerUserId, CardCreateRequest req) {
        String pan = req.pan();
        if (!LuhnValidator.isValid(pan)) {
            throw new CardValidationException("PAN failed Luhn check");
        }

        UUID cardId = UUID.randomUUID();
        String panContext = "card-pan-" + cardId;
        EncryptedField encPan = crypto.encrypt(panContext, pan.getBytes(StandardCharsets.UTF_8));

        Card card = Card.builder()
                .id(cardId)
                .ownerUserId(ownerUserId)
                .encryptedPan(encPan.ciphertext())
                .panIv(encPan.iv())
                .panTag(encPan.tag())
                .last4(pan.substring(pan.length() - 4))
                .expiryMonth(req.expiryMonth())
                .expiryYear(req.expiryYear())
                .brand(req.brand())
                .savedToProfile(req.saveToProfile())
                .build();

        if (req.brand() == CardBrand.VISA && req.cvv() != null && !req.cvv().isBlank()) {
            String cvvContext = "card-cvv-" + cardId;
            EncryptedField encCvv = crypto.encrypt(cvvContext,
                    req.cvv().getBytes(StandardCharsets.UTF_8));
            card.setEncryptedCvv(encCvv.ciphertext());
            card.setCvvIv(encCvv.iv());
            card.setCvvTag(encCvv.tag());
        }

        Card saved = cards.save(card);
        log.info("Saved card {} last4={} for user {}", saved.getId(), saved.getLast4(), ownerUserId);
        return saved;
    }

    @Transactional(readOnly = true)
    public List<Card> listSaved(UUID ownerUserId) {
        return cards.findByOwnerUserIdAndSavedToProfileIsTrue(ownerUserId);
    }

    @Transactional
    public void delete(UUID ownerUserId, UUID cardId) {
        Card card = cards.findByIdAndOwnerUserId(cardId, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Card " + cardId + " not found for user " + ownerUserId));
        cards.delete(card);
    }
}
```

- [ ] **Step 9: Run CardService tests**

```bash
mvn -q test -Dtest=CardServiceTest
```

Expected: `Tests run: 3, Failures: 0, Errors: 0`.

- [ ] **Step 10: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/card/ \
        backend/trade-service/src/test/java/uz/efbazaar/trade/card/
git commit -m "feat(trade-service): add CardService with Luhn + AES-GCM PAN encryption"
```

---

## Task 6: Card REST endpoints (POST / GET / DELETE)

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/card/dto/CardResponse.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/card/mapper/CardMapper.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/card/controller/CardController.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/card/CardControllerIT.java`

**Interfaces:**
- Produces REST endpoints (owner user id read from the `X-User-Id` header for now — real JWT auth wires in Plan B):
  - `POST /api/v1/cards` — request body `CardCreateRequest`, response `CardResponse`, status 201.
  - `GET /api/v1/cards` — returns saved cards for the caller.
  - `DELETE /api/v1/cards/{id}` — 204 on success, 404 on missing / not-owned.

- [ ] **Step 1: Add response DTO**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/card/dto/CardResponse.java`:

```java
package uz.efbazaar.trade.card.dto;

import uz.efbazaar.trade.card.domain.CardBrand;

import java.time.Instant;
import java.util.UUID;

public record CardResponse(
        UUID id,
        String last4,
        short expiryMonth,
        short expiryYear,
        CardBrand brand,
        boolean savedToProfile,
        Instant createdAt
) {
}
```

Note: no encrypted fields ever leave the service via API.

- [ ] **Step 2: Add MapStruct mapper**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/card/mapper/CardMapper.java`:

```java
package uz.efbazaar.trade.card.mapper;

import org.mapstruct.Mapper;
import uz.efbazaar.trade.card.domain.Card;
import uz.efbazaar.trade.card.dto.CardResponse;

@Mapper(componentModel = "spring")
public interface CardMapper {
    CardResponse toResponse(Card card);
}
```

- [ ] **Step 3: Add the controller**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/card/controller/CardController.java`:

```java
package uz.efbazaar.trade.card.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.card.dto.CardCreateRequest;
import uz.efbazaar.trade.card.dto.CardResponse;
import uz.efbazaar.trade.card.mapper.CardMapper;
import uz.efbazaar.trade.card.service.CardService;

import java.util.List;
import java.util.UUID;

/**
 * Plan A auth model: caller identity comes from X-User-Id header, set by nginx
 * after the auth-service auth_request check. Plan B replaces this with a real
 * JWT resolver and Spring Security config.
 */
@RestController
@RequestMapping("/api/v1/cards")
@RequiredArgsConstructor
public class CardController {

    private final CardService cardService;
    private final CardMapper mapper;

    @PostMapping
    public ResponseEntity<CardResponse> create(
            @RequestHeader("X-User-Id") UUID userId,
            @Valid @RequestBody CardCreateRequest request) {
        var card = cardService.create(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(mapper.toResponse(card));
    }

    @GetMapping
    public List<CardResponse> listSaved(@RequestHeader("X-User-Id") UUID userId) {
        return cardService.listSaved(userId).stream()
                .map(mapper::toResponse)
                .toList();
    }

    @DeleteMapping("/{cardId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @RequestHeader("X-User-Id") UUID userId,
            @PathVariable UUID cardId) {
        cardService.delete(userId, cardId);
    }
}
```

- [ ] **Step 4: Write the failing integration test**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/card/CardControllerIT.java`:

```java
package uz.efbazaar.trade.card;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.UUID;

import static org.hamcrest.Matchers.equalTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@ActiveProfiles("test")
class CardControllerIT {

    private static Path masterKeyFile;

    @DynamicPropertySource
    static void setupMasterKey(DynamicPropertyRegistry registry) throws IOException {
        byte[] key = new byte[32];
        new java.security.SecureRandom().nextBytes(key);
        masterKeyFile = Files.createTempFile("trade-master-key-", ".txt");
        Files.writeString(masterKeyFile, Base64.getEncoder().encodeToString(key));
        registry.add("trade.crypto.master-key-file", () -> masterKeyFile.toString());
    }

    @Autowired
    private WebApplicationContext ctx;

    private MockMvc mvc;

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(ctx).build();
    }

    @Test
    void createReturnsResponseWithoutSensitiveFields() throws Exception {
        UUID userId = UUID.randomUUID();
        String body = """
                {
                  "pan": "4111111111111111",
                  "expiryMonth": 12,
                  "expiryYear": 2027,
                  "brand": "VISA",
                  "cvv": "123",
                  "saveToProfile": true
                }
                """;

        mvc.perform(post("/api/v1/cards")
                        .header("X-User-Id", userId.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.last4", equalTo("1111")))
                .andExpect(jsonPath("$.brand", equalTo("VISA")))
                .andExpect(jsonPath("$.savedToProfile", equalTo(true)))
                .andExpect(jsonPath("$.encryptedPan").doesNotExist())
                .andExpect(jsonPath("$.pan").doesNotExist())
                .andExpect(jsonPath("$.cvv").doesNotExist());
    }

    @Test
    void listReturnsSavedCards() throws Exception {
        UUID userId = UUID.randomUUID();
        String body = """
                {"pan":"4111111111111111","expiryMonth":10,"expiryYear":2026,
                 "brand":"VISA","cvv":"123","saveToProfile":true}
                """;
        mvc.perform(post("/api/v1/cards")
                        .header("X-User-Id", userId.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());

        mvc.perform(get("/api/v1/cards").header("X-User-Id", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()", equalTo(1)));
    }
}
```

- [ ] **Step 5: Run the integration test**

```bash
mvn -q test -Dtest=CardControllerIT
```

Expected: `Tests run: 2, Failures: 0, Errors: 0`.

If it fails with a `MasterKeyProvider` bean creation error, verify Step 4 — `@DynamicPropertySource` must be registered before the context starts, and the temp file must be written before the property lookup.

- [ ] **Step 6: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/card/controller/ \
        backend/trade-service/src/main/java/uz/efbazaar/trade/card/mapper/ \
        backend/trade-service/src/main/java/uz/efbazaar/trade/card/dto/CardResponse.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/card/CardControllerIT.java
git commit -m "feat(trade-service): expose Card REST endpoints (POST/GET/DELETE)"
```

---

## Task 7: Mailbox entity + V3 migration

**Files:**
- Create: `backend/trade-service/src/main/resources/db/migration/V3__create_mailbox_table.sql`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/domain/Mailbox.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/repository/MailboxRepository.java`

**Interfaces:**
- Produces:
  - `Mailbox` entity fields: `id (UUID)`, `email (String)`, `ownerUserId (UUID?)`, `tradeId (UUID?)`, `encryptedPassword (byte[])`, `passwordIv (byte[12])`, `passwordTag (byte[16])`, `createdAt`, `handedOffAt (Instant?)`, `deletedAt (Instant?)`.
  - `MailboxRepository extends JpaRepository<Mailbox, UUID>` with `Optional<Mailbox> findByEmail(String)`, `List<Mailbox> findByOwnerUserId(UUID)`.

- [ ] **Step 1: Create the V3 migration**

Create `backend/trade-service/src/main/resources/db/migration/V3__create_mailbox_table.sql`:

```sql
-- ==============================================================
-- trade-service — mailbox metadata.
-- The real mailbox lives inside Mailcow (mail.efbazaar.uz).
-- This table stores the address, current owner, and the encrypted
-- Mailcow password so a trade winner can re-fetch it via re-auth.
-- ==============================================================

CREATE TABLE mailboxes (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email                VARCHAR(255) NOT NULL UNIQUE,

    owner_user_id        UUID,
    trade_id             UUID,

    encrypted_password   BYTEA        NOT NULL,
    password_iv          BYTEA        NOT NULL,
    password_tag         BYTEA        NOT NULL,

    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    handed_off_at        TIMESTAMPTZ,
    deleted_at           TIMESTAMPTZ
);

CREATE INDEX idx_mailboxes_owner_user_id ON mailboxes (owner_user_id);
CREATE INDEX idx_mailboxes_trade_id      ON mailboxes (trade_id);
```

- [ ] **Step 2: Add the entity**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/domain/Mailbox.java`:

```java
package uz.efbazaar.trade.mailbox.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "mailboxes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Mailbox {

    /**
     * Application-assigned UUID; see the same rationale on Card.
     */
    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "owner_user_id")
    private UUID ownerUserId;

    @Column(name = "trade_id")
    private UUID tradeId;

    @Column(name = "encrypted_password", nullable = false)
    private byte[] encryptedPassword;

    @Column(name = "password_iv", nullable = false, length = 12)
    private byte[] passwordIv;

    @Column(name = "password_tag", nullable = false, length = 16)
    private byte[] passwordTag;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "handed_off_at")
    private Instant handedOffAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;
}
```

- [ ] **Step 3: Add the repository**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/repository/MailboxRepository.java`:

```java
package uz.efbazaar.trade.mailbox.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.mailbox.domain.Mailbox;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MailboxRepository extends JpaRepository<Mailbox, UUID> {

    Optional<Mailbox> findByEmail(String email);

    List<Mailbox> findByOwnerUserId(UUID ownerUserId);

    Optional<Mailbox> findByIdAndOwnerUserId(UUID id, UUID ownerUserId);
}
```

- [ ] **Step 4: Verify the app still boots with the new entity**

```bash
mvn -q clean test -Dtest=TradeApplicationTests
```

Expected: `Tests run: 1, Failures: 0, Errors: 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/trade-service/src/main/resources/db/migration/V3__create_mailbox_table.sql \
        backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/domain/ \
        backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/repository/
git commit -m "feat(trade-service): add Mailbox entity and V3 migration"
```

---

## Task 8: Mailbox service and read-only REST

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/service/MailboxService.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/dto/MailboxResponse.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/mapper/MailboxMapper.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/controller/MailboxController.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/mailbox/MailboxControllerIT.java`

**Interfaces:**
- Consumes: `TradeCrypto`, `MailboxRepository`.
- Produces:
  - `MailboxService.create(String email, UUID ownerUserId, UUID tradeId, byte[] initialPassword) -> Mailbox` — Plan B will call this after provisioning.
  - `MailboxService.listOwnedBy(UUID ownerUserId) -> List<Mailbox>`
  - `MailboxService.getOwned(UUID ownerUserId, UUID mailboxId) -> Mailbox`
  - REST: `GET /api/v1/mailboxes` (list owner's), `GET /api/v1/mailboxes/{id}` (single).

- [ ] **Step 1: Add MailboxService**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/service/MailboxService.java`:

```java
package uz.efbazaar.trade.mailbox.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MailboxService {

    private final MailboxRepository mailboxes;
    private final TradeCrypto crypto;

    @Transactional
    public Mailbox create(String email, UUID ownerUserId, UUID tradeId, byte[] initialPassword) {
        UUID id = UUID.randomUUID();
        EncryptedField enc = crypto.encrypt("mbox-" + id, initialPassword);

        Mailbox mbox = Mailbox.builder()
                .id(id)
                .email(email)
                .ownerUserId(ownerUserId)
                .tradeId(tradeId)
                .encryptedPassword(enc.ciphertext())
                .passwordIv(enc.iv())
                .passwordTag(enc.tag())
                .build();
        return mailboxes.save(mbox);
    }

    @Transactional(readOnly = true)
    public List<Mailbox> listOwnedBy(UUID ownerUserId) {
        return mailboxes.findByOwnerUserId(ownerUserId);
    }

    @Transactional(readOnly = true)
    public Mailbox getOwned(UUID ownerUserId, UUID mailboxId) {
        return mailboxes.findByIdAndOwnerUserId(mailboxId, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Mailbox " + mailboxId + " not found for user " + ownerUserId));
    }
}
```

- [ ] **Step 2: Add DTO and mapper**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/dto/MailboxResponse.java`:

```java
package uz.efbazaar.trade.mailbox.dto;

import java.time.Instant;
import java.util.UUID;

public record MailboxResponse(
        UUID id,
        String email,
        UUID tradeId,
        Instant createdAt,
        Instant handedOffAt
) {
}
```

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/mapper/MailboxMapper.java`:

```java
package uz.efbazaar.trade.mailbox.mapper;

import org.mapstruct.Mapper;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.dto.MailboxResponse;

@Mapper(componentModel = "spring")
public interface MailboxMapper {
    MailboxResponse toResponse(Mailbox mailbox);
}
```

- [ ] **Step 3: Add the controller**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/controller/MailboxController.java`:

```java
package uz.efbazaar.trade.mailbox.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.mailbox.dto.MailboxResponse;
import uz.efbazaar.trade.mailbox.mapper.MailboxMapper;
import uz.efbazaar.trade.mailbox.service.MailboxService;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/mailboxes")
@RequiredArgsConstructor
public class MailboxController {

    private final MailboxService service;
    private final MailboxMapper mapper;

    @GetMapping
    public List<MailboxResponse> listOwnedBy(@RequestHeader("X-User-Id") UUID userId) {
        return service.listOwnedBy(userId).stream()
                .map(mapper::toResponse)
                .toList();
    }

    @GetMapping("/{id}")
    public MailboxResponse getOne(
            @RequestHeader("X-User-Id") UUID userId,
            @PathVariable UUID id) {
        return mapper.toResponse(service.getOwned(userId, id));
    }
}
```

- [ ] **Step 4: Write the failing integration test**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/mailbox/MailboxControllerIT.java`:

```java
package uz.efbazaar.trade.mailbox;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import uz.efbazaar.trade.mailbox.service.MailboxService;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.UUID;

import static org.hamcrest.Matchers.equalTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@ActiveProfiles("test")
class MailboxControllerIT {

    private static Path masterKeyFile;

    @DynamicPropertySource
    static void setupMasterKey(DynamicPropertyRegistry registry) throws IOException {
        byte[] key = new byte[32];
        new java.security.SecureRandom().nextBytes(key);
        masterKeyFile = Files.createTempFile("trade-master-key-", ".txt");
        Files.writeString(masterKeyFile, Base64.getEncoder().encodeToString(key));
        registry.add("trade.crypto.master-key-file", () -> masterKeyFile.toString());
    }

    @Autowired
    private WebApplicationContext ctx;

    @Autowired
    private MailboxService mailboxService;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(ctx).build();
    }

    @Test
    void listReturnsOwnedMailboxes() throws Exception {
        UUID user = UUID.randomUUID();
        mailboxService.create("tX7kpb2m@efbazaar.uz", user, UUID.randomUUID(),
                "supersecret".getBytes(StandardCharsets.UTF_8));

        mvc.perform(get("/api/v1/mailboxes").header("X-User-Id", user.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()", equalTo(1)))
                .andExpect(jsonPath("$[0].email", equalTo("tX7kpb2m@efbazaar.uz")))
                .andExpect(jsonPath("$[0].encryptedPassword").doesNotExist());
    }

    @Test
    void getReturnsOwnedMailboxById() throws Exception {
        UUID owner = UUID.randomUUID();
        var mbox = mailboxService.create("owned@efbazaar.uz", owner, UUID.randomUUID(),
                "pw".getBytes(StandardCharsets.UTF_8));

        mvc.perform(get("/api/v1/mailboxes/" + mbox.getId())
                        .header("X-User-Id", owner.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email", equalTo("owned@efbazaar.uz")))
                .andExpect(jsonPath("$.encryptedPassword").doesNotExist());
    }
    // Note: cross-user access ("stranger can't fetch owner's mailbox") is not
    // asserted here because Plan A has no ControllerAdvice yet — an EntityNotFoundException
    // currently surfaces as 500. Plan B adds a global exception handler that maps it
    // to 404, and Plan B's TradeControllerIT covers this properly.
}
```

- [ ] **Step 5: Run**

```bash
mvn -q test -Dtest=MailboxControllerIT
```

Expected: `Tests run: 2, Failures: 0, Errors: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/ \
        backend/trade-service/src/test/java/uz/efbazaar/trade/mailbox/
git commit -m "feat(trade-service): add Mailbox service and read-only REST"
```

---

## Task 9: PaymentAdapter interface + MockPaymentAdapter

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/payment/PaymentAdapter.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/payment/PaymentIntent.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/payment/PaymentStatus.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/payment/PayoutIntent.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/payment/PayoutStatus.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/payment/MockPaymentAdapter.java`
- Create: `backend/trade-service/src/test/java/uz/efbazaar/trade/payment/MockPaymentAdapterTest.java`

**Interfaces:**
- Produces:
  - `PaymentAdapter.createCheckoutIntent(UUID tradeId, long amountUzsTiyin) -> PaymentIntent`
  - `PaymentAdapter.markPaid(String intentId) -> PaymentStatus` (mock-only helper for MVP button)
  - `PaymentAdapter.checkPaymentStatus(String intentId) -> PaymentStatus`
  - `PaymentAdapter.createPayoutIntent(UUID tradeId, String recipientCardPan, long amountUzsTiyin) -> PayoutIntent`
  - `PaymentAdapter.confirmPayout(String payoutIntentId) -> PayoutStatus`
  - `PaymentAdapter.checkPayoutStatus(String payoutIntentId) -> PayoutStatus`
- Consumed by Plan B state machine.

- [ ] **Step 1: Add the small DTOs**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/payment/PaymentStatus.java`:

```java
package uz.efbazaar.trade.payment;

public enum PaymentStatus { PENDING, PAID, FAILED, EXPIRED }
```

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/payment/PayoutStatus.java`:

```java
package uz.efbazaar.trade.payment;

public enum PayoutStatus { PENDING, CONFIRMED, COMPLETED, FAILED }
```

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/payment/PaymentIntent.java`:

```java
package uz.efbazaar.trade.payment;

import java.util.UUID;

public record PaymentIntent(
        String intentId,
        UUID tradeId,
        long amountUzsTiyin,
        String checkoutUrl,
        PaymentStatus status
) {
}
```

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/payment/PayoutIntent.java`:

```java
package uz.efbazaar.trade.payment;

import java.util.UUID;

public record PayoutIntent(
        String payoutIntentId,
        UUID tradeId,
        long amountUzsTiyin,
        PayoutStatus status
) {
}
```

- [ ] **Step 2: Add the interface**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/payment/PaymentAdapter.java`:

```java
package uz.efbazaar.trade.payment;

import java.util.UUID;

/**
 * Provider-agnostic contract. MVP uses MockPaymentAdapter; UzumPaymentAdapter
 * (Uzum Checkout + PaymentHub) lands post-MVP.
 */
public interface PaymentAdapter {

    /** Called on entry into STATE_2 (WAITING_PAYMENT). */
    PaymentIntent createCheckoutIntent(UUID tradeId, long amountUzsTiyin);

    /** Flip the intent to PAID. Only supported by the mock adapter. */
    PaymentStatus markPaid(String intentId);

    PaymentStatus checkPaymentStatus(String intentId);

    /** Called on entry into STATE_8_SUCCESS. */
    PayoutIntent createPayoutIntent(UUID tradeId, String recipientCardPan, long amountUzsTiyin);

    PayoutStatus confirmPayout(String payoutIntentId);

    PayoutStatus checkPayoutStatus(String payoutIntentId);
}
```

- [ ] **Step 3: Write the failing MockPaymentAdapter test**

Create `backend/trade-service/src/test/java/uz/efbazaar/trade/payment/MockPaymentAdapterTest.java`:

```java
package uz.efbazaar.trade.payment;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MockPaymentAdapterTest {

    private MockPaymentAdapter mock;

    @BeforeEach
    void setUp() {
        mock = new MockPaymentAdapter();
    }

    @Test
    void checkoutIntentStartsPending() {
        PaymentIntent intent = mock.createCheckoutIntent(UUID.randomUUID(), 500_000_00L);
        assertThat(intent.status()).isEqualTo(PaymentStatus.PENDING);
        assertThat(mock.checkPaymentStatus(intent.intentId())).isEqualTo(PaymentStatus.PENDING);
    }

    @Test
    void markPaidFlipsToPaid() {
        PaymentIntent intent = mock.createCheckoutIntent(UUID.randomUUID(), 100_00L);
        PaymentStatus s = mock.markPaid(intent.intentId());
        assertThat(s).isEqualTo(PaymentStatus.PAID);
        assertThat(mock.checkPaymentStatus(intent.intentId())).isEqualTo(PaymentStatus.PAID);
    }

    @Test
    void markPaidUnknownIntentThrows() {
        assertThatThrownBy(() -> mock.markPaid("nope"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void payoutFlow() {
        PayoutIntent p = mock.createPayoutIntent(UUID.randomUUID(), "4111111111111111", 500_000_00L);
        assertThat(p.status()).isEqualTo(PayoutStatus.PENDING);

        PayoutStatus confirmed = mock.confirmPayout(p.payoutIntentId());
        assertThat(confirmed).isEqualTo(PayoutStatus.CONFIRMED);
        assertThat(mock.checkPayoutStatus(p.payoutIntentId())).isEqualTo(PayoutStatus.CONFIRMED);
    }
}
```

- [ ] **Step 4: Run to verify failure**

```bash
mvn -q test -Dtest=MockPaymentAdapterTest
```

Expected: compilation failure.

- [ ] **Step 5: Implement MockPaymentAdapter**

Create `backend/trade-service/src/main/java/uz/efbazaar/trade/payment/MockPaymentAdapter.java`:

```java
package uz.efbazaar.trade.payment;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * MVP payment stub. Held in memory — restarts wipe state. That's acceptable
 * because Plan B stores the intent id on the Trade row; a restart mid-trade
 * during MVP just means B must re-click "TO'LOV QILDIM".
 *
 * Active in the "local", "docker", and "test" profiles. The Uzum adapter, when
 * built, will be @Profile("!mock") and take over automatically.
 */
@Component
@Profile({"local", "docker", "test"})
public class MockPaymentAdapter implements PaymentAdapter {

    private final Map<String, PaymentIntent> payments = new ConcurrentHashMap<>();
    private final Map<String, PayoutIntent> payouts = new ConcurrentHashMap<>();

    @Override
    public PaymentIntent createCheckoutIntent(UUID tradeId, long amountUzsTiyin) {
        String id = "mock-pay-" + UUID.randomUUID();
        PaymentIntent intent = new PaymentIntent(
                id, tradeId, amountUzsTiyin, "https://mock/checkout/" + id, PaymentStatus.PENDING);
        payments.put(id, intent);
        return intent;
    }

    @Override
    public PaymentStatus markPaid(String intentId) {
        PaymentIntent existing = payments.get(intentId);
        if (existing == null) {
            throw new IllegalArgumentException("Unknown payment intent " + intentId);
        }
        PaymentIntent updated = new PaymentIntent(
                existing.intentId(), existing.tradeId(), existing.amountUzsTiyin(),
                existing.checkoutUrl(), PaymentStatus.PAID);
        payments.put(intentId, updated);
        return PaymentStatus.PAID;
    }

    @Override
    public PaymentStatus checkPaymentStatus(String intentId) {
        PaymentIntent existing = payments.get(intentId);
        return existing == null ? PaymentStatus.FAILED : existing.status();
    }

    @Override
    public PayoutIntent createPayoutIntent(UUID tradeId, String recipientCardPan, long amountUzsTiyin) {
        String id = "mock-payout-" + UUID.randomUUID();
        PayoutIntent intent = new PayoutIntent(id, tradeId, amountUzsTiyin, PayoutStatus.PENDING);
        payouts.put(id, intent);
        return intent;
    }

    @Override
    public PayoutStatus confirmPayout(String payoutIntentId) {
        PayoutIntent existing = payouts.get(payoutIntentId);
        if (existing == null) {
            throw new IllegalArgumentException("Unknown payout intent " + payoutIntentId);
        }
        PayoutIntent updated = new PayoutIntent(
                existing.payoutIntentId(), existing.tradeId(), existing.amountUzsTiyin(),
                PayoutStatus.CONFIRMED);
        payouts.put(payoutIntentId, updated);
        return PayoutStatus.CONFIRMED;
    }

    @Override
    public PayoutStatus checkPayoutStatus(String payoutIntentId) {
        PayoutIntent existing = payouts.get(payoutIntentId);
        return existing == null ? PayoutStatus.FAILED : existing.status();
    }
}
```

- [ ] **Step 6: Run the test**

```bash
mvn -q test -Dtest=MockPaymentAdapterTest
```

Expected: `Tests run: 4, Failures: 0, Errors: 0`.

- [ ] **Step 7: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/payment/ \
        backend/trade-service/src/test/java/uz/efbazaar/trade/payment/
git commit -m "feat(trade-service): add PaymentAdapter interface and MockPaymentAdapter"
```

---

## Task 10: Full stack up + end-to-end smoke test

**Files:**
- Modify: `docker-compose.yml` (nothing structural — verify block from Task 1 is still there)
- Modify: `CLAUDE.md` (root — add trade-service to the service table)

**Interfaces:**
- Consumes: everything from Tasks 1-9.
- Produces: a running `efbazaar-trade` container on port 8085 with `/actuator/health` returning UP, `trade_db` created, migrations V1-V3 applied.

- [ ] **Step 1: Run the full test suite one more time**

```bash
cd backend/trade-service
mvn -q clean verify
```

Expected: `BUILD SUCCESS`. All tests pass (context loads + hkdf + crypto + luhn + card service + card IT + mailbox IT + payment).

- [ ] **Step 2: Build the Docker image locally**

```bash
cd ~/IdeaProjects/ef-bazaar
docker compose build trade-service
```

Expected: image tag `ghcr.io/abdurahmoniy/efbazaar-trade-service:latest` created.

- [ ] **Step 3: Bring the stack up**

```bash
docker compose up -d postgres redis kafka trade-service
docker compose ps trade-service
```

Expected: `trade-service` STATUS `Up (healthy)` after ~40 seconds.

If unhealthy, tail logs:
```bash
docker compose logs --tail 50 trade-service
```

Common failure: `MASTER_KEY_FILE` unreadable. Fix: verify `infra/secrets/master_key` exists on host and the compose `secrets:` block points at it.

- [ ] **Step 4: Verify Flyway ran**

```bash
docker compose exec postgres psql -U efbazaar -d trade_db -c "\dt" 2>/dev/null
```

Expected output includes `flyway_schema_history`, `cards`, `mailboxes`.

- [ ] **Step 5: Curl the health endpoint from the host**

```bash
docker compose exec trade-service wget -qO- http://localhost:8085/actuator/health
```

Expected: `{"status":"UP"}`.

- [ ] **Step 6: End-to-end card create → list**

```bash
USER_ID=$(uuidgen)

# Create a card
docker compose exec trade-service sh -c "
  wget -qO- --header='Content-Type: application/json' \
       --header='X-User-Id: $USER_ID' \
       --post-data='{\"pan\":\"4111111111111111\",\"expiryMonth\":12,\"expiryYear\":2027,\"brand\":\"VISA\",\"cvv\":\"123\",\"saveToProfile\":true}' \
       http://localhost:8085/api/v1/cards"
echo

# List them
docker compose exec trade-service sh -c "
  wget -qO- --header='X-User-Id: $USER_ID' http://localhost:8085/api/v1/cards"
echo
```

Expected: first call returns a JSON body with `last4:"1111"`, second returns a single-element array with the same card.

- [ ] **Step 7: Confirm the encrypted PAN is unreadable in the DB**

```bash
docker compose exec postgres psql -U efbazaar -d trade_db -c "SELECT last4, encode(encrypted_pan,'hex') FROM cards LIMIT 5;"
```

Expected: `last4` is `1111`, `encrypted_pan` hex bytes look like random noise (not `4111111111111111` in ASCII).

- [ ] **Step 8: Update root CLAUDE.md service list**

Modify `CLAUDE.md` — find the service table (under "Repo strukturasi" / port table) and add a row for `trade-service`:

```
│   ├── recommendation-service/ # Recommendation engine — Spring Boot, port 8083
│   └── trade-service/          # Escrow trade orchestrator — Spring Boot, port 8085
```

- [ ] **Step 9: Commit the docs update**

```bash
git add CLAUDE.md
git commit -m "docs: add trade-service to CLAUDE.md service list"
```

- [ ] **Step 10: Final tear-down**

```bash
docker compose stop trade-service
```

The stack stays up for other work; only trade-service is stopped to avoid running an idle container between plans.

---

## Follow-ups for Plan B

Plan B picks up from this foundation to add:

- `Trade`, `TradeChat`, `TradeMessage`, `TradeAuditLog` entities and V4-V7 migrations.
- Real state machine and per-state timeout scheduler.
- WSS transport for the secured chat.
- Kafka producer for `efbazaar.trade.*` topics.
- Real JWT-based auth (replace the `X-User-Id` header shim on the Card and Mailbox controllers).
- ~~Global exception handler that maps `EntityNotFoundException` → 404~~ — done in the Plan A final-review fix batch (`TradeExceptionHandler`), ahead of Plan B.
- Testcontainers-backed integration tests against real postgres (replacing the H2 shim for tests that exercise Postgres-specific SQL).
- **PaymentAdapter interface takes plaintext PAN parameter (`createPayoutIntent(..., String recipientCardPan, ...)`).** Reviewer flagged this as a step down from the otherwise-strict at-rest-encryption discipline. Before `UzumPaymentAdapter` is implemented, refactor the interface to accept `UUID recipientCardId` (or a sealed `PanReference` wrapper) so the adapter itself decrypts inside a narrow method scope rather than every caller holding a plaintext PAN.

## Deployment Notes (Plan A)

- **V2 was retroactively edited during Task 10** to change `last4` from `CHAR(4)` to `VARCHAR(4)` (Hibernate `ddl-auto: validate` rejected the mismatch on container startup). For any environment where V2 had already been applied with `CHAR(4)`, a `flyway repair` alone will NOT alter the column — it only rewrites the checksum. The full remediation is:
    1. `docker compose exec postgres psql -U efbazaar -d trade_db -c "ALTER TABLE cards ALTER COLUMN last4 TYPE VARCHAR(4);"`
    2. Restart trade-service; Flyway will re-verify and either succeed (checksum matches after the ALTER) or complain — in which case run `flyway repair` to align the metadata table.
- After Plan A, **do not edit already-applied migrations in place** — use a new forward-only V<n> migration for schema drift. The V2 edit was a one-time exception driven by the fact that no shared environment had yet applied it.
- The compose stack's `postgres` container's `POSTGRES_MULTIPLE_DATABASES` init script only fires on a truly-fresh data volume. Existing installations that had `postgres_data` populated before `TRADE_DB_NAME` was added to `.env` must create `trade_db` manually: `docker compose exec postgres psql -U efbazaar -c "CREATE DATABASE trade_db OWNER efbazaar;"`.
