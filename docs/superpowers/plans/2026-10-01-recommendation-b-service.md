# Recommendation B — recommendation-service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yangi `recommendation-service` (port 8083) — marketplace snapshot'laridan projection quradi, player filtri (match), dream team, card interest va "Mening qiziqishlarim" lentasini beradi; qorong'i deploy (frontend hali chaqirmaydi).

**Architecture:** Spring Boot 3 servis, o'z `recommendation_db` bazasi. marketplace'dan faqat Kafka orqali o'qiydi (`listing-snapshot`, `card-snapshot`, `like-toggled`) va har birini `version` + `consumed_events` bilan idempotent projection'ga yozadi. Match SQL marketplace'dagi `JdbcListingMatchRepository` dan 1:1 ko'chadi (`listings`/`listing_cards` o'rniga `listings_view`/`listing_cards_view`). Lenta profil (dream team + like + interest) asosida SQL bilan tartiblanadi va Redis'da 30 daqiqalik sessiya snapshot'i sifatida saqlanadi. marketplace kodi bu rejada TEGILMAYDI (tozalash — D bosqichi).

**Tech Stack:** Java 21, Spring Boot 3.3.4, Spring Data JPA (faqat dream team), JdbcTemplate, Flyway, PostgreSQL 16, Spring Kafka, Redis (`StringRedisTemplate`), Testcontainers 1.20.4, JUnit 5, Mockito, Docker, nginx, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-30-recommendation-service-design.md` (§4, §7-bosqich 2, §8, §9 "recommendation"). A bosqichi (marketplace tomoni) — `docs/superpowers/plans/2026-10-01-recommendation-a-marketplace.md`, `main`'da.

## Global Constraints

- Java 21, `spring-boot-starter-parent` **3.3.4**, `springdoc.version` **2.6.0**, Testcontainers **1.20.4**, Postgres image `postgres:16-alpine`.
- Paket: `uz.efbazaar.recommendation.<layer>`. Servis papkasi: `backend/recommendation-service/`.
- Port **8083**; compose servis nomi `recommendation-service`; container `efbazaar-recommendation`; nginx yo'li `/api/rec/**` → servisda `/api/**`.
- DB env: `RECOMMENDATION_DB_NAME` (default `recommendation_db`) — `.env.example` da allaqachon bor. Hikari `maximum-pool-size: 4`.
- `mem_limit: 300m`, `memswap_limit: 400m`, `JAVA_OPTS` access-service bilan bir xil.
- Kafka consumer group: `recommendation-service`. Topic'lar: `efbazaar.marketplace.listing-snapshot`, `efbazaar.marketplace.card-snapshot`, `efbazaar.marketplace.like-toggled`.
- recommendation marketplace'ni HTTP orqali **chaqirmaydi**; marketplace DB'siga ulanmaydi.
- `userId` faqat `X-User-Id` headeridan (nginx) — hech qachon request body/param'dan emas.
- Xato javob shakli marketplace bilan bir xil: `{ timestamp, status, code, message[, details] }`.
- Formula konstantalari: exact kredit **1.0**, alternate **0.75**, `Importance` NORMAL=**1**, PRIORITY=**3**; `META_BOOST` **1.5**; profil **50** kriteriy; snapshot **1000** ID, TTL **30 daqiqa**; interest oynasi **30 kun**; `user_card_interest` saqlash **90 kun**.
- Redis kalitlari: lenta `rec:feed:{userId}:{profileHash}`; card interest marketplace bilan bir xil `card-interest:*` va bir xil `CARD_INTEREST_HMAC_SECRET` (bo'sh bo'lsa servis ishga tushmaydi).
- Flyway: `V<n>__*.sql` `main`'ga tushgach o'zgarmaydi. `baseline-on-migrate` **yoqilmaydi**.
- Test buyrug'i (har task oxirida): `cd backend/recommendation-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"` — `*IT` failsafe'da, `mvn test` ularni o'tkazib yuboradi.
- Commit formati: `feat(recommendation): ...` / `chore(infra): ...` / `docs(recommendation): ...`. Commit xabarida **hech qanday** `Co-Authored-By`, `Claude-Session` yoki "Generated with Claude" qatori bo'lmaydi.
- Test fixture `smart-admin-worker/tests/fixtures/crypto_vectors.json` o'zgarsa — `git checkout` qiling, commit qilmang.

## Qarorlar (spec jim yoki ziddiyatli joylarda)

- **P1.** DB env nomi `RECOMMENDATION_DB_NAME` (spec'da `REC_DB_NAME`) — `.env.example` da shu nom allaqachon turibdi.
- **P2.** `/match` tartibi: `score DESC, value_score DESC NULLS LAST, listing_id ASC`. marketplace ikkinchi kalit sifatida `created_at` ishlatadi, lekin projection'da u yo'q va spec "eng yangi tepada" tartibidan voz kechgan. Parity = bir xil ID to'plami va bir xil ball.
- **P3.** `/match` faqat `ACTIVE` (spec §4.3); `includeSold` qo'llab-quvvatlanmaydi.
- **P4.** Kafka xabari `String` sifatida o'qiladi va servisning o'z record'lariga `ObjectMapper` bilan o'giriladi — `__TypeId__` headeriga (marketplace klass nomi) bog'lanmaymiz.
- **P5.** Eski `dream_team` / `dream_team_min_match` havola parametrlari `/match` da ham qabul qilinadi (`LegacyDreamTeamAdapter` 1:1).
- **P6.** `consumed_events` 30 kundan keyin tozalanadi (version guard baribir takrorni to'sadi); `user_card_interest` 90 kun. Ikkalasi bitta `RetentionJob` da.
- **P7.** `/feed/details` joriy profil bo'yicha hisoblaydi (snapshot emas); mehmonga `{}`.
- **P8.** Profil bor, lekin mos e'lon yo'q → `empty: true` (frontend Katta bozorga o'tadi).
- **P9.** `/match/{listingId}` projection'da yo'q e'lon uchun 404 `listing_not_found` (marketplace "hammasi missing" qaytarardi).
- **P10.** DLT'ga yozish uchun alohida `KafkaTemplate<String, String>` — xom xabar qo'shtirnoqqa o'ralmasin.

## Review Focus

1. **Serverdagi eski `recommendation_db`** (2026-08-23 da o'chirilgan servisdan qolgan jadvallar) — Flyway V1 qo'llanmaydi va servis crash-loop'ga tushadi; deploy logida aniq ogohlantirish chiqishi kerak, ma'lumot o'chirilmasligi kerak. → Task 7 `recommendation_bootstrap` tekshiruvi + `baseline-on-migrate` o'chiq (Task 1 IT).
2. **Buzilgan/eski dream team sloti** (marketplace'dan ko'chirilgan qator, `efhubId` matn yoki `playerId` UUID emas) — lenta shu foydalanuvchi uchun 500 bermasligi, slot shunchaki tashlanishi kerak. → Task 6 `ProfileRepositoryIT.malformedSlotIsSkipped`.
3. **Redis o'chiq** — lenta har so'rovda joyida hisoblanadi, 500 yo'q. → Task 6 `RedisFeedCacheTest`.
4. **O'qib bo'lmaydigan Kafka xabari** — bitta offset DLT'ga ketadi, consumer tiqilmaydi. → Task 2 `SnapshotConsumersTest.malformedPayloadThrows` + `KafkaConfigTest`.
5. **Replay'dan oldin** (`cards_view` bo'sh) — har `matchCard` 400 `invalid_attribute_value` qaytaradi (500 emas). → Task 3 `CardIdentityVerifierIT.unknownCardIsRejected`; runbook replay'ni frontenddan oldin qo'yadi.

---

## Fayl xaritasi

```
backend/recommendation-service/
├── pom.xml, Dockerfile, CLAUDE.md, README.md
├── src/main/resources/application.yml
├── src/main/resources/db/migration/V1__init.sql
├── src/main/java/uz/efbazaar/recommendation/
│   ├── RecommendationApplication.java
│   ├── security/      AuthenticatedUser, HeaderAuthenticationFilter, SecurityConfig
│   ├── exception/     RecommendationException, GlobalExceptionHandler
│   ├── projection/    ProjectionTopics, Snapshots, ProjectionWriter, SnapshotConsumers
│   ├── config/        KafkaConfig
│   ├── observability/ KafkaLogForwarder, LogEvent, LogThrottle, NotifyMarker (marketplace'dan nusxa)
│   ├── match/         Criterion, MatchCardCriterion, MatchRequest, MatchHit, MatchDetails,
│   │                  CardIdentityVerifier, MatchRequestParser, LegacyDreamTeamAdapter,
│   │                  MatchEngine, MatchController, MatchIdsResponse
│   ├── dreamteam/     DreamTeam, DreamTeamRequest, DreamTeamResponse, DreamTeamRepository,
│   │                  DreamTeamService, DreamTeamWriteLock, DreamTeamController
│   ├── interest/      CardInterestController, CardInterestRequest, CardInterestResponse,
│   │                  CardInterestService, UserCardInterestRepository
│   ├── maintenance/   RetentionJob
│   └── feed/          FeedProperties, ProfileSignal, ProfileRepository, ProfileService, ProfileHash,
│                      FeedRanker, FeedCache, RedisFeedCache, FeedResponse, FeedService, FeedController
└── src/test/...       (har task o'z testlari bilan)

Infra (Task 7): docker-compose.yml, nginx/nginx.conf, nginx/conf.d/efbazaar.conf,
  .github/workflows/build.yml, .github/workflows/ci.yml, deploy.sh,
  infra/prometheus/prometheus.yml, backend/auth-service/src/main/resources/application.yml (byudjet izohi)
Ops + hujjat (Task 8): scripts/rec-copy-dream-teams.sh, scripts/rec-verify-projection.sh,
  backend/recommendation-service/README.md, docs/kafka-topics.md, README.md, CLAUDE.md,
  nginx/README.md, spec holati
```

---
### Task 1: Servis skeleti — pom, sxema, security, xato javoblari

**Files:**
- Create: `backend/recommendation-service/pom.xml`
- Create: `backend/recommendation-service/Dockerfile`
- Create: `backend/recommendation-service/CLAUDE.md`
- Create: `backend/recommendation-service/src/main/resources/application.yml`
- Create: `backend/recommendation-service/src/main/resources/db/migration/V1__init.sql`
- Create: `backend/recommendation-service/src/main/java/uz/efbazaar/recommendation/RecommendationApplication.java`
- Create: `.../security/AuthenticatedUser.java`, `.../security/HeaderAuthenticationFilter.java`, `.../security/SecurityConfig.java`
- Create: `.../exception/RecommendationException.java`, `.../exception/GlobalExceptionHandler.java`
- Create: `backend/recommendation-service/src/test/resources/mockito-extensions/org.mockito.plugins.MockMaker`
- Test: `src/test/java/uz/efbazaar/recommendation/RecommendationApplicationIT.java`
- Test: `src/test/java/uz/efbazaar/recommendation/security/SecurityRulesTest.java`
- Test: `src/test/java/uz/efbazaar/recommendation/exception/GlobalExceptionHandlerTest.java`

(`...` = `backend/recommendation-service/src/main/java/uz/efbazaar/recommendation`)

**Interfaces:**
- Produces: `RecommendationException(HttpStatus status, String code, String message)` + `getStatus()`, `getCode()`; statik `invalidAttributeValue(String key, String reason)` (kod `invalid_attribute_value`, matn `"Attribute qiymati noto'g'ri (" + key + "): " + reason`), `listingNotFound()` (404 `listing_not_found`, `"E'lon topilmadi"`), `badRequest(String code, String message)`.
- Produces: `AuthenticatedUser(UUID userId, List<String> roles)` — controller'lar `@AuthenticationPrincipal AuthenticatedUser` oladi (mehmon → `null`).
- Produces: jadvallar `listings_view`, `listing_cards_view`, `cards_view`, `user_likes`, `dream_teams`, `user_card_interest`, `consumed_events` (ustunlar quyidagi V1 da).
- Produces: `RecommendationApplicationIT` — keyingi task'lar bu klassga tegmaydi; u butun kontekst + Flyway'ni Postgres ustida tekshiradi.

- [ ] **Step 1: pom.xml**

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
    <artifactId>recommendation-service</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>recommendation-service</name>
    <description>efBazaar — shaxsiy lenta, player filtri, dream team, card interest</description>

    <properties>
        <java.version>21</java.version>
        <springdoc.version>2.6.0</springdoc.version>
        <testcontainers.version>1.20.4</testcontainers.version>
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
            <groupId>io.micrometer</groupId>
            <artifactId>micrometer-registry-prometheus</artifactId>
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
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-redis</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.kafka</groupId>
            <artifactId>spring-kafka</artifactId>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>

        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.springframework.security</groupId>
            <artifactId>spring-security-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-testcontainers</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.testcontainers</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>${testcontainers.version}</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.testcontainers</groupId>
            <artifactId>postgresql</artifactId>
            <version>${testcontainers.version}</version>
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
                    </annotationProcessorPaths>
                </configuration>
            </plugin>
            <!-- *IT klasslari Testcontainers ustida. Surefire ularni nomi bo'yicha
                 o'tkazib yuboradi — failsafe bog'lanmasa `mvn verify` ularni hech
                 qachon ishga tushirmaydi. -->
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

- [ ] **Step 2: Mockito sozlamasi va CLAUDE.md**

```bash
mkdir -p backend/recommendation-service/src/test/resources/mockito-extensions
cp backend/marketplace-service/src/test/resources/mockito-extensions/org.mockito.plugins.MockMaker \
   backend/recommendation-service/src/test/resources/mockito-extensions/
```

`backend/recommendation-service/CLAUDE.md`:

```markdown
# recommendation-service

Bu komponentning vazifasi, API, Kafka, jadvallar va ehtiyot bo'ladigan joylari:

@README.md

Endpoint, topic, jadval yoki env o'zgarsa README.md ni shu commit'da yangilang.
```

(`README.md` Task 8 da yoziladi; ungacha `@README.md` havolasi bo'sh qolishi zararsiz.)

- [ ] **Step 3: Yiqiladigan testlarni yozing**

`src/test/java/uz/efbazaar/recommendation/RecommendationApplicationIT.java`:

```java
package uz.efbazaar.recommendation;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Butun kontekst haqiqiy Postgres va Flyway ustida ko'tariladi — JPA {@code validate}
 * sxema bilan entity'lar mosligini ham shu yerda tekshiradi.
 */
@SpringBootTest
@Testcontainers
@TestPropertySource(properties = {
        "spring.kafka.listener.auto-startup=false",
        "app.logging.kafka-forward.enabled=false",
        "app.card-interest.hmac-secret=test-secret"
})
class RecommendationApplicationIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired JdbcTemplate jdbc;
    @Autowired Environment env;

    @Test
    void migrationsCreateEveryTable() {
        assertThat(jdbc.queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
                String.class))
                .contains("listings_view", "listing_cards_view", "cards_view", "user_likes",
                        "dream_teams", "user_card_interest", "consumed_events");
    }

    /** Eski servisdan qolgan baza jim "baseline" qilinmasin — Flyway yiqilib, ko'rinsin. */
    @Test
    void baselineOnMigrateStaysOff() {
        assertThat(env.getProperty("spring.flyway.baseline-on-migrate", Boolean.class, false)).isFalse();
    }
}
```

`src/test/java/uz/efbazaar/recommendation/security/SecurityRulesTest.java`:

```java
package uz.efbazaar.recommendation.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Kirish qoidalari — haqiqiy controller'lar keyingi task'larda, bu yerda faqat yo'llar.
 * Probe test klassining ichki klassi: Spring Boot TestTypeExcludeFilter uni component scan'dan
 * chiqaradi (aks holda @SpringBootTest'da FeedController bilan bir xil yo'l to'qnashardi),
 * shuning uchun @Import orqali aniq ro'yxatga olinadi.
 */
@WebMvcTest(controllers = SecurityRulesTest.Probe.class)
@Import({SecurityRulesTest.Probe.class, SecurityConfig.class, HeaderAuthenticationFilter.class})
class SecurityRulesTest {

    @RestController
    static class Probe {
        @GetMapping({"/api/v1/feed", "/api/v1/feed/details", "/api/v1/match", "/api/v1/match/details",
                "/api/v1/dream-teams", "/api/v1/card-interest/counts"})
        String ok() { return "ok"; }

        @PostMapping("/api/v1/card-interest/apply")
        String apply() { return "ok"; }
    }

    @Autowired MockMvc mvc;

    private static final String USER = UUID.randomUUID().toString();

    @Test
    void guestReachesPublicEndpoints() throws Exception {
        mvc.perform(get("/api/v1/feed")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/feed/details")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/match")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/match/details")).andExpect(status().isOk());
        mvc.perform(post("/api/v1/card-interest/apply")).andExpect(status().isOk());
    }

    @Test
    void dreamTeamsNeedLogin() throws Exception {
        mvc.perform(get("/api/v1/dream-teams")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/dream-teams").header("X-User-Id", USER)).andExpect(status().isOk());
    }

    @Test
    void interestCountsAreAdminOnly() throws Exception {
        mvc.perform(get("/api/v1/card-interest/counts")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/card-interest/counts")
                .header("X-User-Id", USER).header("X-User-Roles", "ROLE_USER"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/card-interest/counts")
                .header("X-User-Id", USER).header("X-User-Roles", "ROLE_USER,ROLE_ADMIN"))
                .andExpect(status().isOk());
    }
}
```

`src/test/java/uz/efbazaar/recommendation/exception/GlobalExceptionHandlerTest.java`:

```java
package uz.efbazaar.recommendation.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MissingServletRequestParameterException;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void domainErrorKeepsMarketplaceShape() {
        var response = handler.onRecommendation(
                RecommendationException.invalidAttributeValue("matchCard", "yomon"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        Map<String, Object> body = response.getBody();
        assertThat(body).containsKeys("timestamp", "status", "code", "message");
        assertThat(body.get("status")).isEqualTo(400);
        assertThat(body.get("code")).isEqualTo("invalid_attribute_value");
        assertThat(body.get("message")).isEqualTo("Attribute qiymati noto'g'ri (matchCard): yomon");
    }

    @Test
    void missingParameterIsBadRequestNotServerError() {
        var response = handler.onMissingParameter(
                new MissingServletRequestParameterException("ids", "List"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("code")).isEqualTo("bad_request");
    }
}
```

- [ ] **Step 4: Testlar yiqilishini ko'ring**

Run: `cd backend/recommendation-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR — `SecurityConfig`, `GlobalExceptionHandler`, `RecommendationException` topilmadi.

- [ ] **Step 5: application.yml**

```yaml
spring:
  application:
    name: recommendation-service
  profiles:
    active: ${SPRING_PROFILES_ACTIVE:local}

  # Foydalanuvchi nginx headerlaridan o'qiladi — UserDetailsService kerak emas.
  autoconfigure:
    exclude:
      - org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration

  datasource:
    url: jdbc:postgresql://${POSTGRES_HOST:localhost}:${POSTGRES_PORT:5432}/${POSTGRES_DB:recommendation_db}
    username: ${POSTGRES_USER:efbazaar}
    password: ${POSTGRES_PASSWORD:efbazaar}
    driver-class-name: org.postgresql.Driver
    # Ulanish byudjeti auth-service application.yml da — yig'indi 50 dan oshmasin.
    hikari:
      maximum-pool-size: 4

  jpa:
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
    open-in-view: false

  # baseline-on-migrate ATAYLAB yo'q: serverdagi recommendation_db da 2026-08-23
  # da o'chirilgan eski servisdan jadvallar qolgan bo'lishi mumkin. Flyway ularni
  # jim "baseline" qilsa V1 qo'llanmay qoladi; yiqilsa — deploy logida ko'rinadi.
  flyway:
    enabled: true
    locations: classpath:db/migration

  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
      password: ${REDIS_PASSWORD:}
      # Redis sekin bo'lsa lenta uni kutib qolmasin — joyida hisoblanadi.
      timeout: 300ms

server:
  port: 8083
  forward-headers-strategy: framework

app:
  debug-errors: ${APP_DEBUG_ERRORS:false}

management:
  endpoints:
    web:
      exposure:
        include: health,prometheus
  health:
    # Redis faqat kesh — u tushsa konteyner qayta ishga tushmasin.
    redis:
      enabled: false
  metrics:
    distribution:
      percentiles-histogram:
        http.server.requests: true
      minimum-expected-value:
        http.server.requests: 10ms
      maximum-expected-value:
        http.server.requests: 5s

springdoc:
  api-docs:
    path: /v3/api-docs
    enabled: true
  swagger-ui:
    enabled: false
  show-actuator: false
```

- [ ] **Step 6: V1__init.sql**

`backend/recommendation-service/src/main/resources/db/migration/V1__init.sql`:

```sql
-- recommendation-service — boshlang'ich sxema.
-- *_view jadvallar marketplace snapshot'larining projection'i: faqat Kafka
-- consumer'lari yozadi, `version` eski xabarni to'sadi.

CREATE TABLE listings_view (
    listing_id  UUID PRIMARY KEY,
    seller_id   UUID             NOT NULL,
    status      VARCHAR(16)      NOT NULL,
    price       NUMERIC(19, 2)   NOT NULL,
    value_score DOUBLE PRECISION,
    version     BIGINT           NOT NULL,
    updated_at  TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX listings_view_active_idx
    ON listings_view (value_score DESC NULLS LAST, listing_id)
    WHERE status = 'ACTIVE';

-- Snapshot kelganda e'lonning kartalari to'liq almashtiriladi.
CREATE TABLE listing_cards_view (
    listing_id UUID   NOT NULL REFERENCES listings_view (listing_id) ON DELETE CASCADE,
    efhub_id   BIGINT NOT NULL,
    player_id  UUID   NOT NULL,
    PRIMARY KEY (listing_id, efhub_id)
);

CREATE INDEX listing_cards_view_player_idx ON listing_cards_view (player_id);

-- Karta katalogi nusxasi (efbazaar DB'dagi bigtime/epic/showtime + identity).
CREATE TABLE cards_view (
    efhub_id       BIGINT PRIMARY KEY,
    player_id      UUID,
    type           VARCHAR(16),
    overall_rating INTEGER,
    meta_tier      VARCHAR(16),
    meta_priority  INTEGER     NOT NULL DEFAULT 0,
    active_from    TIMESTAMPTZ,
    active_until   TIMESTAMPTZ,
    version        BIGINT      NOT NULL
);

CREATE INDEX cards_view_player_idx ON cards_view (player_id);

-- Unlike → liked = false (qator o'chmaydi, aks holda eski "like" event'i qaytib tirilardi).
CREATE TABLE user_likes (
    user_id    UUID    NOT NULL,
    listing_id UUID    NOT NULL,
    liked      BOOLEAN NOT NULL,
    version    BIGINT  NOT NULL,
    PRIMARY KEY (user_id, listing_id)
);

-- marketplace'dagi bilan bir xil shakl (V27 + V31): bitta foydalanuvchiga bitta jamoa.
CREATE TABLE dream_teams (
    id         UUID PRIMARY KEY,
    user_id    UUID        NOT NULL,
    name       VARCHAR(80) NOT NULL,
    formation  VARCHAR(16) NOT NULL DEFAULT '4-3-3',
    slots      JSONB       NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX dream_teams_user_unique_idx ON dream_teams (user_id);

-- Login qilgan foydalanuvchi qaysi kartaga qiziqqani (shaxsiy lenta uchun).
-- 90 kundan eski qatorlar RetentionJob bilan o'chiriladi.
CREATE TABLE user_card_interest (
    user_id  UUID        NOT NULL,
    efhub_id BIGINT      NOT NULL,
    last_at  TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, efhub_id)
);

CREATE INDEX user_card_interest_last_at_idx ON user_card_interest (last_at);

CREATE TABLE consumed_events (
    idempotency_key VARCHAR(200) PRIMARY KEY,
    consumed_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX consumed_events_consumed_at_idx ON consumed_events (consumed_at);
```

- [ ] **Step 7: Application, security, exception klasslari**

`.../RecommendationApplication.java`:

```java
package uz.efbazaar.recommendation;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class RecommendationApplication {

    public static void main(String[] args) {
        SpringApplication.run(RecommendationApplication.class, args);
    }
}
```

`AuthenticatedUser` va `HeaderAuthenticationFilter` — access-service'dan nusxa, faqat paket o'zgaradi:

```bash
S=backend/recommendation-service/src/main/java/uz/efbazaar/recommendation
mkdir -p $S/security $S/exception
for f in AuthenticatedUser HeaderAuthenticationFilter; do
  sed 's/^package uz\.efbazaar\.access\.security;/package uz.efbazaar.recommendation.security;/' \
    backend/access-service/src/main/java/uz/efbazaar/access/security/$f.java > $S/security/$f.java
done
```

`.../security/SecurityConfig.java`:

```java
package uz.efbazaar.recommendation.security;

import jakarta.servlet.DispatcherType;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
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
                .exceptionHandling(e -> e.authenticationEntryPoint(
                        new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .authorizeHttpRequests(auth -> auth
                        // ERROR dispatch ochiq bo'lmasa har xato 401 ga aylanadi.
                        .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.ASYNC).permitAll()
                        .requestMatchers("/actuator/**", "/v3/api-docs/**").permitAll()
                        // Mehmon ham bozorni ko'radi: lenta unga bo'sh, player filtri ishlaydi.
                        .requestMatchers(HttpMethod.GET, "/api/v1/feed", "/api/v1/feed/details").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/match", "/api/v1/match/**").permitAll()
                        // Anonim qiziqish X-Interest-Network (nginx) bilan sanaladi.
                        .requestMatchers(HttpMethod.POST, "/api/v1/card-interest/apply").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/card-interest/counts").hasAuthority("ROLE_ADMIN")
                        .anyRequest().authenticated())
                .addFilterBefore(headerAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}
```

`.../exception/RecommendationException.java`:

```java
package uz.efbazaar.recommendation.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class RecommendationException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public RecommendationException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    /** marketplace'dagi bilan bir xil kod va matn — frontend xabarlari o'zgarmasin. */
    public static RecommendationException invalidAttributeValue(String key, String reason) {
        return new RecommendationException(HttpStatus.BAD_REQUEST, "invalid_attribute_value",
                "Attribute qiymati noto'g'ri (" + key + "): " + reason);
    }

    public static RecommendationException listingNotFound() {
        return new RecommendationException(HttpStatus.NOT_FOUND, "listing_not_found", "E'lon topilmadi");
    }

    public static RecommendationException badRequest(String code, String message) {
        return new RecommendationException(HttpStatus.BAD_REQUEST, code, message);
    }
}
```

`.../exception/GlobalExceptionHandler.java`:

```java
package uz.efbazaar.recommendation.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Javob shakli marketplace {@code GlobalExceptionHandler} bilan bir xil. */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @Value("${app.debug-errors:false}")
    private boolean debugErrors;

    @ExceptionHandler(RecommendationException.class)
    public ResponseEntity<Map<String, Object>> onRecommendation(RecommendationException ex) {
        return build(ex.getStatus(), ex.getCode(), ex.getMessage(), null);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> onValidation(MethodArgumentNotValidException ex) {
        List<Map<String, String>> details = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> Map.of(
                        "field", fe.getField(),
                        "message", fe.getDefaultMessage() == null ? "" : fe.getDefaultMessage()))
                .toList();
        return build(HttpStatus.BAD_REQUEST, "validation_failed",
                "Kiritilgan ma'lumotlar noto'g'ri", details);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, Object>> onMissingParameter(MissingServletRequestParameterException ex) {
        return build(HttpStatus.BAD_REQUEST, "bad_request",
                "So'rov parametri yetishmaydi: " + ex.getParameterName(), null);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> onTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return build(HttpStatus.BAD_REQUEST, "bad_request", "So'rov parametri noto'g'ri", null);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> onUnreadable(HttpMessageNotReadableException ex) {
        return build(HttpStatus.BAD_REQUEST, "bad_request", "So'rov tanasi noto'g'ri", null);
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Map<String, Object>> onAuth(AuthenticationException ex) {
        return build(HttpStatus.UNAUTHORIZED, "unauthorized", "Ruxsat yo'q", null);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> onForbidden(AccessDeniedException ex) {
        return build(HttpStatus.FORBIDDEN, "forbidden", "Ruxsat etilmagan", null);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> onNotFound(NoResourceFoundException ex) {
        return build(HttpStatus.NOT_FOUND, "not_found", "Not Found", null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> onUnknown(Exception ex) {
        Throwable root = ex;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        // Root cause birinchi qatorda — Telegram log forwarder uzun stack'ni kesadi.
        log.error("Unhandled exception: {} | root cause: {}: {}",
                ex.toString(), root.getClass().getSimpleName(), root.getMessage(), ex);
        Object details = debugErrors
                ? Map.of("exception", ex.getClass().getName(),
                         "message", String.valueOf(ex.getMessage()),
                         "rootCause", root.getClass().getName(),
                         "rootMessage", String.valueOf(root.getMessage()))
                : null;
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error", "Ichki xatolik", details);
    }

    private static ResponseEntity<Map<String, Object>> build(HttpStatus status, String code,
                                                             String message, Object details) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", status.value());
        body.put("code", code);
        body.put("message", message);
        if (details != null) body.put("details", details);
        return ResponseEntity.status(status).body(body);
    }
}
```

- [ ] **Step 8: Dockerfile**

```bash
sed -e 's/access-service — multi-stage build/recommendation-service — multi-stage build/' \
    -e 's/EXPOSE 8088/EXPOSE 8083/' \
    -e 's#http://localhost:8088/actuator/health#http://localhost:8083/actuator/health#' \
    backend/access-service/Dockerfile > backend/recommendation-service/Dockerfile
grep -n '8083\|recommendation' backend/recommendation-service/Dockerfile
```
Expected: 3 qator (sarlavha, `EXPOSE 8083`, healthcheck).

- [ ] **Step 9: Testlar o'tishini ko'ring**

Run: `cd backend/recommendation-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"`
Expected: BUILD SUCCESS — `SecurityRulesTest` 3, `GlobalExceptionHandlerTest` 2, `RecommendationApplicationIT` 2.

Run: `docker build -t efbazaar-rec-test backend/recommendation-service`
Expected: muvaffaqiyatli build.

- [ ] **Step 10: Commit**

```bash
git add backend/recommendation-service
git commit -m "feat(recommendation): servis skeleti — sxema, security, xato javoblari"
```

---
### Task 2: Projection'lar — snapshot consumer'lari, DLT, log forwarder

**Files:**
- Create: `.../projection/ProjectionTopics.java`, `.../projection/Snapshots.java`, `.../projection/ProjectionWriter.java`, `.../projection/SnapshotConsumers.java`
- Create: `.../config/KafkaConfig.java`
- Create (nusxa): `.../observability/KafkaLogForwarder.java`, `LogEvent.java`, `LogThrottle.java`, `NotifyMarker.java`
- Modify: `backend/recommendation-service/src/main/resources/application.yml` (Kafka + log forward)
- Test: `src/test/java/uz/efbazaar/recommendation/projection/ProjectionWriterIT.java`
- Test: `src/test/java/uz/efbazaar/recommendation/projection/SnapshotConsumersTest.java`
- Test: `src/test/java/uz/efbazaar/recommendation/config/KafkaConfigTest.java`

**Interfaces:**
- Consumes: V1 jadvallari (Task 1).
- Consumes (Kafka, marketplace A bosqichidan — `RecommendationSnapshots`): payload maydon nomlari aynan shular:
  - listing-snapshot: `{ idempotencyKey, listingId, sellerId, status, price, valueScore, cards: [{efhubId, playerId}], version, occurredAt }`
  - card-snapshot: `{ idempotencyKey, efhubId, playerId, type, overallRating, metaTier, metaPriority, activeFrom, activeUntil, version, occurredAt }`
  - like-toggled: `{ idempotencyKey, listingId, userId, liked, version, occurredAt }`
  - marketplace `JsonSerializer` `Instant` ni son (`1759312800.123456789`) ko'rinishida yozadi; ISO matn ham qabul qilinadi.
- Produces: `ProjectionWriter.applyListing(Snapshots.ListingSnapshot) : boolean`, `applyCard(Snapshots.CardSnapshot) : boolean`, `applyLike(Snapshots.LikeToggled) : boolean` — `true` = projection o'zgardi.
- Produces: `KafkaConfig.deadLetterFor(ConsumerRecord<?, ?>) : TopicPartition` (`<topic>.DLT`, partition `-1`).

- [ ] **Step 1: Yiqiladigan testlarni yozing**

`src/test/java/uz/efbazaar/recommendation/projection/ProjectionWriterIT.java`:

```java
package uz.efbazaar.recommendation.projection;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.recommendation.projection.Snapshots.CardRef;
import uz.efbazaar.recommendation.projection.Snapshots.CardSnapshot;
import uz.efbazaar.recommendation.projection.Snapshots.LikeToggled;
import uz.efbazaar.recommendation.projection.Snapshots.ListingSnapshot;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(ProjectionWriter.class)
class ProjectionWriterIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final Instant NOW = Instant.parse("2026-10-01T10:00:00Z");
    private static final UUID SELLER = UUID.randomUUID();
    private static final UUID PLAYER_A = UUID.randomUUID();
    private static final UUID PLAYER_B = UUID.randomUUID();

    @Autowired ProjectionWriter writer;
    @Autowired JdbcTemplate jdbc;

    private static ListingSnapshot listing(UUID id, long version, String status, CardRef... cards) {
        return new ListingSnapshot("listing:" + id + ":" + version, id, SELLER, status,
                new BigDecimal("150000.00"), 0.4, List.of(cards), version, NOW);
    }

    private List<Long> cardsOf(UUID id) {
        return jdbc.queryForList(
                "SELECT efhub_id FROM listing_cards_view WHERE listing_id = ? ORDER BY efhub_id", Long.class, id);
    }

    private String statusOf(UUID id) {
        return jdbc.queryForObject("SELECT status FROM listings_view WHERE listing_id = ?", String.class, id);
    }

    @Test
    void listingSnapshotInsertsRowAndCards() {
        UUID id = UUID.randomUUID();

        assertThat(writer.applyListing(listing(id, 1, "ACTIVE",
                new CardRef(101, PLAYER_A), new CardRef(202, PLAYER_B)))).isTrue();

        assertThat(statusOf(id)).isEqualTo("ACTIVE");
        assertThat(cardsOf(id)).containsExactly(101L, 202L);
        assertThat(jdbc.queryForObject("SELECT value_score FROM listings_view WHERE listing_id = ?",
                Double.class, id)).isEqualTo(0.4);
    }

    @Test
    void newerSnapshotReplacesCardsCompletely() {
        UUID id = UUID.randomUUID();
        writer.applyListing(listing(id, 1, "ACTIVE", new CardRef(101, PLAYER_A), new CardRef(202, PLAYER_B)));

        assertThat(writer.applyListing(listing(id, 2, "SOLD", new CardRef(303, PLAYER_A)))).isTrue();

        assertThat(statusOf(id)).isEqualTo("SOLD");
        assertThat(cardsOf(id)).containsExactly(303L);
    }

    @Test
    void staleSnapshotIsIgnored() {
        UUID id = UUID.randomUUID();
        writer.applyListing(listing(id, 5, "SOLD", new CardRef(505, PLAYER_A)));

        assertThat(writer.applyListing(listing(id, 3, "ACTIVE", new CardRef(101, PLAYER_A)))).isFalse();

        assertThat(statusOf(id)).isEqualTo("SOLD");
        assertThat(cardsOf(id)).containsExactly(505L);
    }

    @Test
    void sameIdempotencyKeyIsAppliedOnce() {
        UUID id = UUID.randomUUID();
        writer.applyListing(listing(id, 1, "ACTIVE", new CardRef(101, PLAYER_A)));
        ListingSnapshot replayedWithSameKey = new ListingSnapshot("listing:" + id + ":1", id, SELLER,
                "DELETED", BigDecimal.ONE, null, List.of(), 9, NOW);

        assertThat(writer.applyListing(replayedWithSameKey)).isFalse();

        assertThat(statusOf(id)).isEqualTo("ACTIVE");
        assertThat(cardsOf(id)).containsExactly(101L);
    }

    @Test
    void duplicateCardInSnapshotIsStoredOnce() {
        UUID id = UUID.randomUUID();

        writer.applyListing(listing(id, 1, "ACTIVE", new CardRef(101, PLAYER_A), new CardRef(101, PLAYER_A)));

        assertThat(cardsOf(id)).containsExactly(101L);
    }

    @Test
    void unlikeKeepsRowAndStaleLikeCannotResurrectIt() {
        UUID user = UUID.randomUUID();
        UUID listingId = UUID.randomUUID();
        writer.applyLike(new LikeToggled("like:" + user + ":" + listingId + ":1", listingId, user, true, 1, NOW));
        writer.applyLike(new LikeToggled("like:" + user + ":" + listingId + ":2", listingId, user, false, 2, NOW));

        // Kechikkan qayta yuborish (boshqa kalit, eski version).
        assertThat(writer.applyLike(new LikeToggled("like:late", listingId, user, true, 1, NOW))).isFalse();

        assertThat(jdbc.queryForObject("SELECT liked FROM user_likes WHERE user_id = ? AND listing_id = ?",
                Boolean.class, user, listingId)).isFalse();
    }

    @Test
    void cardSnapshotUpsertsWithVersionGuard() {
        CardSnapshot v2 = new CardSnapshot("card:777:2", 777, PLAYER_A, "EPIC", 103, "META", 40,
                Instant.parse("2026-09-01T00:00:00Z"), null, 2, NOW);
        CardSnapshot v1 = new CardSnapshot("card:777:1", 777, PLAYER_B, "EPIC", 99, "NORMAL", 0,
                null, null, 1, NOW);

        assertThat(writer.applyCard(v2)).isTrue();
        assertThat(writer.applyCard(v1)).isFalse();

        assertThat(jdbc.queryForObject("SELECT meta_tier FROM cards_view WHERE efhub_id = 777", String.class))
                .isEqualTo("META");
        assertThat(jdbc.queryForObject("SELECT player_id FROM cards_view WHERE efhub_id = 777", UUID.class))
                .isEqualTo(PLAYER_A);
    }
}
```

`src/test/java/uz/efbazaar/recommendation/projection/SnapshotConsumersTest.java`:

```java
package uz.efbazaar.recommendation.projection;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/** Xabar shakli marketplace A bosqichidagi RecommendationSnapshots bilan bir xil. */
class SnapshotConsumersTest {

    // Spring Boot ObjectMapper'i bilan bir xil sozlama: noma'lum maydon xato emas, java.time bor.
    private final ObjectMapper mapper = Jackson2ObjectMapperBuilder.json().build();
    private final ProjectionWriter writer = mock(ProjectionWriter.class);
    private final SnapshotConsumers consumers = new SnapshotConsumers(mapper, writer);

    @Test
    void listingPayloadFromMarketplaceIsParsed() throws Exception {
        consumers.onListing("""
                {"idempotencyKey":"listing:3f0c2d8e-0d2a-4a43-9a3e-6b1b1c2d3e4f:7",
                 "listingId":"3f0c2d8e-0d2a-4a43-9a3e-6b1b1c2d3e4f",
                 "sellerId":"8b9f6d55-1c55-4f7e-9e0a-0e1d2c3b4a59",
                 "status":"ACTIVE","price":150000.00,"valueScore":0.42,
                 "cards":[{"efhubId":101,"playerId":"11111111-2222-3333-4444-555555555555"}],
                 "version":7,"occurredAt":1759312800.123456789,"addedLater":"ignored"}
                """);

        ArgumentCaptor<Snapshots.ListingSnapshot> captor = ArgumentCaptor.forClass(Snapshots.ListingSnapshot.class);
        verify(writer).applyListing(captor.capture());
        Snapshots.ListingSnapshot s = captor.getValue();
        assertThat(s.listingId()).isEqualTo(UUID.fromString("3f0c2d8e-0d2a-4a43-9a3e-6b1b1c2d3e4f"));
        assertThat(s.version()).isEqualTo(7);
        assertThat(s.valueScore()).isEqualTo(0.42);
        assertThat(s.cards()).containsExactly(new Snapshots.CardRef(101,
                UUID.fromString("11111111-2222-3333-4444-555555555555")));
        assertThat(s.occurredAt()).isEqualTo(Instant.ofEpochSecond(1759312800, 123456789));
    }

    @Test
    void cardPayloadWithIsoInstantsIsParsed() throws Exception {
        consumers.onCard("""
                {"idempotencyKey":"card:777:3","efhubId":777,"playerId":null,"type":"EPIC",
                 "overallRating":103,"metaTier":"META","metaPriority":40,
                 "activeFrom":"2026-09-01T00:00:00Z","activeUntil":null,"version":3,
                 "occurredAt":"2026-10-01T10:00:00Z"}
                """);

        ArgumentCaptor<Snapshots.CardSnapshot> captor = ArgumentCaptor.forClass(Snapshots.CardSnapshot.class);
        verify(writer).applyCard(captor.capture());
        assertThat(captor.getValue().efhubId()).isEqualTo(777);
        assertThat(captor.getValue().activeFrom()).isEqualTo(Instant.parse("2026-09-01T00:00:00Z"));
        assertThat(captor.getValue().playerId()).isNull();
    }

    @Test
    void likePayloadIsParsed() throws Exception {
        consumers.onLike("""
                {"idempotencyKey":"like:u:l:2","listingId":"3f0c2d8e-0d2a-4a43-9a3e-6b1b1c2d3e4f",
                 "userId":"8b9f6d55-1c55-4f7e-9e0a-0e1d2c3b4a59","liked":false,"version":2,
                 "occurredAt":1759312800.0}
                """);

        ArgumentCaptor<Snapshots.LikeToggled> captor = ArgumentCaptor.forClass(Snapshots.LikeToggled.class);
        verify(writer).applyLike(captor.capture());
        assertThat(captor.getValue().liked()).isFalse();
        assertThat(captor.getValue().version()).isEqualTo(2);
    }

    /** Xato tashqariga chiqadi — DefaultErrorHandler uni DLT'ga qo'yadi (Review Focus 4). */
    @Test
    void malformedPayloadThrows() {
        assertThatThrownBy(() -> consumers.onListing("{not json"))
                .isInstanceOf(JsonProcessingException.class);
        verifyNoInteractions(writer);
    }
}
```

`src/test/java/uz/efbazaar/recommendation/config/KafkaConfigTest.java`:

```java
package uz.efbazaar.recommendation.config;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class KafkaConfigTest {

    @Test
    void deadLetterGoesToSameTopicWithDltSuffixOnAnyPartition() {
        TopicPartition target = KafkaConfig.deadLetterFor(
                new ConsumerRecord<>("efbazaar.marketplace.listing-snapshot", 3, 10L, "k", "v"));

        assertThat(target.topic()).isEqualTo("efbazaar.marketplace.listing-snapshot.DLT");
        assertThat(target.partition()).isEqualTo(-1);
    }

    @Test
    void errorHandlerBuildsFromTheServiceProducerFactory() {
        var factory = new DefaultKafkaProducerFactory<String, Object>(Map.of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092",
                ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class,
                ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class));

        assertThat(new KafkaConfig().kafkaErrorHandler(factory)).isNotNull();
    }
}
```

- [ ] **Step 2: Testlar yiqilishini ko'ring**

Run: `cd backend/recommendation-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR — `ProjectionWriter`, `Snapshots`, `SnapshotConsumers`, `KafkaConfig` topilmadi.

- [ ] **Step 3: Projection klasslari**

`.../projection/ProjectionTopics.java`:

```java
package uz.efbazaar.recommendation.projection;

/** marketplace chiqaradigan snapshot topic'lari. Katalog: docs/kafka-topics.md. */
public final class ProjectionTopics {

    public static final String LISTING_SNAPSHOT = "efbazaar.marketplace.listing-snapshot";
    public static final String CARD_SNAPSHOT = "efbazaar.marketplace.card-snapshot";
    public static final String LIKE_TOGGLED = "efbazaar.marketplace.like-toggled";

    private ProjectionTopics() {
    }
}
```

`.../projection/Snapshots.java`:

```java
package uz.efbazaar.recommendation.projection;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * marketplace {@code RecommendationSnapshots} bilan bir xil maydonlar. Klasslar ataylab
 * o'zimizniki — {@code __TypeId__} headeridagi marketplace klass nomiga bog'lanmaymiz.
 */
public final class Snapshots {

    private Snapshots() {
    }

    public record CardRef(long efhubId, UUID playerId) {}

    public record ListingSnapshot(String idempotencyKey, UUID listingId, UUID sellerId, String status,
                                  BigDecimal price, Double valueScore, List<CardRef> cards,
                                  long version, Instant occurredAt) {}

    public record LikeToggled(String idempotencyKey, UUID listingId, UUID userId, boolean liked,
                              long version, Instant occurredAt) {}

    public record CardSnapshot(String idempotencyKey, long efhubId, UUID playerId, String type,
                               Integer overallRating, String metaTier, int metaPriority,
                               Instant activeFrom, Instant activeUntil, long version, Instant occurredAt) {}
}
```

`.../projection/ProjectionWriter.java`:

```java
package uz.efbazaar.recommendation.projection;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.recommendation.projection.Snapshots.CardRef;
import uz.efbazaar.recommendation.projection.Snapshots.CardSnapshot;
import uz.efbazaar.recommendation.projection.Snapshots.LikeToggled;
import uz.efbazaar.recommendation.projection.Snapshots.ListingSnapshot;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Snapshot'ni projection'ga yozadi. Ikki himoya: {@code consumed_events} aynan shu xabarning
 * takrorini, {@code version} esa kechikib kelgan eski holatni to'sadi.
 */
@Component
public class ProjectionWriter {

    private final JdbcTemplate jdbc;

    public ProjectionWriter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public boolean applyListing(ListingSnapshot s) {
        if (!claim(s.idempotencyKey())) return false;
        int changed = jdbc.update("""
                INSERT INTO listings_view (listing_id, seller_id, status, price, value_score, version, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, now())
                ON CONFLICT (listing_id) DO UPDATE
                   SET seller_id = EXCLUDED.seller_id,
                       status = EXCLUDED.status,
                       price = EXCLUDED.price,
                       value_score = EXCLUDED.value_score,
                       version = EXCLUDED.version,
                       updated_at = now()
                 WHERE listings_view.version < EXCLUDED.version
                """, s.listingId(), s.sellerId(), s.status(), s.price(), s.valueScore(), s.version());
        if (changed == 0) return false;

        jdbc.update("DELETE FROM listing_cards_view WHERE listing_id = ?", s.listingId());
        Map<Long, UUID> cards = new LinkedHashMap<>();
        if (s.cards() != null) {
            for (CardRef card : s.cards()) {
                if (card != null && card.playerId() != null) cards.putIfAbsent(card.efhubId(), card.playerId());
            }
        }
        List<Object[]> rows = cards.entrySet().stream()
                .map(e -> new Object[]{s.listingId(), e.getKey(), e.getValue()})
                .toList();
        if (!rows.isEmpty()) {
            jdbc.batchUpdate("INSERT INTO listing_cards_view (listing_id, efhub_id, player_id) VALUES (?, ?, ?)", rows);
        }
        return true;
    }

    @Transactional
    public boolean applyCard(CardSnapshot s) {
        if (!claim(s.idempotencyKey())) return false;
        return jdbc.update("""
                INSERT INTO cards_view (efhub_id, player_id, type, overall_rating, meta_tier, meta_priority,
                                        active_from, active_until, version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (efhub_id) DO UPDATE
                   SET player_id = EXCLUDED.player_id,
                       type = EXCLUDED.type,
                       overall_rating = EXCLUDED.overall_rating,
                       meta_tier = EXCLUDED.meta_tier,
                       meta_priority = EXCLUDED.meta_priority,
                       active_from = EXCLUDED.active_from,
                       active_until = EXCLUDED.active_until,
                       version = EXCLUDED.version
                 WHERE cards_view.version < EXCLUDED.version
                """, s.efhubId(), s.playerId(), s.type(), s.overallRating(), s.metaTier(), s.metaPriority(),
                timestamp(s.activeFrom()), timestamp(s.activeUntil()), s.version()) == 1;
    }

    @Transactional
    public boolean applyLike(LikeToggled s) {
        if (!claim(s.idempotencyKey())) return false;
        return jdbc.update("""
                INSERT INTO user_likes (user_id, listing_id, liked, version)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (user_id, listing_id) DO UPDATE
                   SET liked = EXCLUDED.liked,
                       version = EXCLUDED.version
                 WHERE user_likes.version < EXCLUDED.version
                """, s.userId(), s.listingId(), s.liked(), s.version()) == 1;
    }

    private boolean claim(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new IllegalArgumentException("idempotencyKey bo'sh");
        }
        return jdbc.update("INSERT INTO consumed_events (idempotency_key) VALUES (?) ON CONFLICT DO NOTHING",
                idempotencyKey) == 1;
    }

    private static Timestamp timestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }
}
```

`.../projection/SnapshotConsumers.java`:

```java
package uz.efbazaar.recommendation.projection;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/** Xom JSON → o'z record'larimiz → ProjectionWriter. O'qib bo'lmasa xato DLT'ga ketadi. */
@Component
public class SnapshotConsumers {

    private final ObjectMapper mapper;
    private final ProjectionWriter writer;

    public SnapshotConsumers(ObjectMapper mapper, ProjectionWriter writer) {
        this.mapper = mapper;
        this.writer = writer;
    }

    @KafkaListener(topics = ProjectionTopics.LISTING_SNAPSHOT)
    public void onListing(String payload) throws JsonProcessingException {
        writer.applyListing(mapper.readValue(payload, Snapshots.ListingSnapshot.class));
    }

    @KafkaListener(topics = ProjectionTopics.CARD_SNAPSHOT)
    public void onCard(String payload) throws JsonProcessingException {
        writer.applyCard(mapper.readValue(payload, Snapshots.CardSnapshot.class));
    }

    @KafkaListener(topics = ProjectionTopics.LIKE_TOGGLED)
    public void onLike(String payload) throws JsonProcessingException {
        writer.applyLike(mapper.readValue(payload, Snapshots.LikeToggled.class));
    }
}
```

`.../config/KafkaConfig.java`:

```java
package uz.efbazaar.recommendation.config;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.KafkaException;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.FixedBackOff;

import java.util.HashMap;
import java.util.Map;

/**
 * O'qib yoki yozib bo'lmagan xabar bitta offset'ga tushadi va {@code <topic>.DLT} ga
 * ketadi — consumer o'sha xabarni cheksiz qayta o'qimaydi (marketplace
 * {@code KafkaErrorHandlingConfig} bilan bir xil saboq).
 */
@Configuration
public class KafkaConfig {

    public static final String DLT_SUFFIX = ".DLT";

    @Bean
    DefaultErrorHandler kafkaErrorHandler(ProducerFactory<?, ?> producerFactory) {
        // Xom matnni o'zgarishsiz yozish uchun alohida String template (servisniki JsonSerializer).
        Map<String, Object> config = new HashMap<>(producerFactory.getConfigurationProperties());
        config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        KafkaTemplate<String, String> deadLetters = new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(config));

        DeadLetterPublishingRecoverer recoverer =
                new DeadLetterPublishingRecoverer(deadLetters, (record, ex) -> deadLetterFor(record));
        // Uch urinish soniya oralig'ida: DB'dagi qisqa uzilish uchun yetarli, buzilgan JSON
        // o'ninchi urinishda ham tuzalmaydi.
        DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, new FixedBackOff(1_000L, 2));
        handler.setLogLevel(KafkaException.Level.ERROR);
        return handler;
    }

    /** Partition -1 — broker tanlaydi (DLT'da partition kamroq bo'lishi mumkin). */
    static TopicPartition deadLetterFor(ConsumerRecord<?, ?> record) {
        return new TopicPartition(record.topic() + DLT_SUFFIX, -1);
    }
}
```

- [ ] **Step 4: Log forwarder nusxasi**

```bash
S=backend/recommendation-service/src/main/java/uz/efbazaar/recommendation
mkdir -p $S/observability
for f in KafkaLogForwarder LogEvent LogThrottle NotifyMarker; do
  sed -e 's/^package uz\.efbazaar\.marketplace\.observability;/package uz.efbazaar.recommendation.observability;/' \
      -e 's/"marketplace-service"/"recommendation-service"/' \
      backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/observability/$f.java \
      > $S/observability/$f.java
done
grep -rn 'marketplace' $S/observability
```
Expected: oxirgi `grep` hech narsa chiqarmaydi (chiqsa — u izoh; matnini "recommendation" ga moslang).

- [ ] **Step 5: application.yml — Kafka va log forward**

`spring:` xaritasi ichiga, `data:` blokidan keyin qo'shing:

```yaml
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
    consumer:
      group-id: recommendation-service
      # Birinchi ulanishda topic boshidan — A bosqichidan beri chiqqan snapshot'lar ham tushadi.
      auto-offset-reset: earliest
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      # Xom matn: JSON'ni SnapshotConsumers o'zi o'qiydi. StringDeserializer yiqilmaydi,
      # shuning uchun poll() ichida cheksiz qayta o'qish tsikli bo'lmaydi.
      value-deserializer: org.apache.kafka.common.serialization.StringDeserializer
```

`app:` xaritasi ichiga (`debug-errors` dan keyin):

```yaml
  logging:
    kafka-forward:
      # WARN/ERROR → efbazaar.system.log-event → bot → Telegram logs topigi.
      enabled: ${LOG_KAFKA_FORWARD_ENABLED:true}
```

- [ ] **Step 6: Testlar o'tishini ko'ring**

Run: `cd backend/recommendation-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"`
Expected: BUILD SUCCESS — `ProjectionWriterIT` 7, `SnapshotConsumersTest` 4, `KafkaConfigTest` 2, Task 1 testlari ham yashil (`RecommendationApplicationIT` listener'larni `auto-startup=false` bilan ko'taradi).

- [ ] **Step 7: Commit**

```bash
git add backend/recommendation-service
git commit -m "feat(recommendation): snapshot consumer'lari va projection, DLT, log forwarder"
```

---
### Task 3: Match engine — player filtri 1:1 ko'chirish

**Files:**
- Create: `.../match/Criterion.java`, `MatchCardCriterion.java`, `MatchRequest.java`, `MatchHit.java`, `MatchDetails.java`
- Create: `.../match/CardIdentityVerifier.java`, `.../match/MatchEngine.java`, `.../match/MatchController.java`, `.../match/MatchIdsResponse.java`
- Create (nusxa + sed): `.../match/MatchRequestParser.java`, `.../match/LegacyDreamTeamAdapter.java`
- Test (nusxa + sed): `src/test/java/uz/efbazaar/recommendation/match/MatchRequestParserTest.java`, `LegacyDreamTeamAdapterTest.java`
- Test: `src/test/java/uz/efbazaar/recommendation/match/MatchEngineIT.java`, `CardIdentityVerifierIT.java`, `MatchControllerTest.java`

**Interfaces:**
- Consumes: `listings_view`, `listing_cards_view`, `cards_view` (Task 1/2); `RecommendationException` (Task 1).
- Produces:
  - `record Criterion(long efhubId, UUID playerId, BigDecimal weight)`
  - `record MatchCardCriterion(long efhubId, UUID playerId, Importance importance)` — `weight() : int`, `toCriterion() : Criterion`; `enum Importance { NORMAL(1), PRIORITY(3) }`
  - `record MatchRequest(List<MatchCardCriterion> criteria, int strictness)` — `anyPositiveOverlap()`, `minimumScore() : BigDecimal`, `weighted() : List<Criterion>`, `priorityEfhubIds() : List<Long>`
  - `record MatchHit(UUID listingId, BigDecimal score, int exactCount, int alternateCount, int missingCount, List<Long> exactEfhubIds, List<Long> alternateEfhubIds, List<Long> missingEfhubIds, BigDecimal earnedWeight, BigDecimal possibleWeight)`
  - `record MatchDetails(...)` — marketplace bilan bir xil JSON; `static of(MatchHit hit, int strictness, List<Long> priorityEfhubIds)`, `static of(MatchHit hit, MatchRequest request)`
  - `MatchEngine.rank(MatchRequest request, int limit) : List<UUID>` va `MatchEngine.hits(List<Criterion> criteria, Collection<UUID> listingIds) : Map<UUID, MatchHit>`
  - `CardIdentityVerifier.verify(List<Claim>)`, `resolvePlayerIds(List<Long>) : Map<Long, UUID>`; `record Claim(long efhubId, UUID playerId)`
  - HTTP: `GET /api/v1/match` → `{ "ids": [...] }`; `GET /api/v1/match/details?ids=` → `{ "<uuid>": MatchDetails }`; `GET /api/v1/match/{listingId}` → `MatchDetails`. Hammasi `matchCard` (takrorlanadi) + `matchStrictness` yoki eski `dream_team` + `dream_team_min_match` qabul qiladi.

- [ ] **Step 1: Kichik record'lar**

`.../match/Criterion.java`:

```java
package uz.efbazaar.recommendation.match;

import java.math.BigDecimal;
import java.util.UUID;

/** Ball hisobidagi bitta kriteriy. Player filtrida og'irlik 1 yoki 3, lentada — profil og'irligi. */
public record Criterion(long efhubId, UUID playerId, BigDecimal weight) {
}
```

`.../match/MatchCardCriterion.java`:

```java
package uz.efbazaar.recommendation.match;

import java.math.BigDecimal;
import java.util.UUID;

public record MatchCardCriterion(long efhubId, UUID playerId, Importance importance) {

    public enum Importance {
        NORMAL(1), PRIORITY(3);

        private final int weight;

        Importance(int weight) {
            this.weight = weight;
        }

        public int weight() {
            return weight;
        }
    }

    public int weight() {
        return importance.weight();
    }

    public Criterion toCriterion() {
        return new Criterion(efhubId, playerId, BigDecimal.valueOf(weight()));
    }
}
```

`.../match/MatchRequest.java`:

```java
package uz.efbazaar.recommendation.match;

import java.math.BigDecimal;
import java.util.List;

public record MatchRequest(List<MatchCardCriterion> criteria, int strictness) {

    public MatchRequest {
        criteria = List.copyOf(criteria);
    }

    public boolean anyPositiveOverlap() {
        return strictness == 1;
    }

    public BigDecimal minimumScore() {
        if (anyPositiveOverlap()) {
            return BigDecimal.ZERO;
        }
        return BigDecimal.valueOf(strictness, 1);
    }

    public List<Criterion> weighted() {
        return criteria.stream().map(MatchCardCriterion::toCriterion).toList();
    }

    public List<Long> priorityEfhubIds() {
        return criteria.stream()
                .filter(criterion -> criterion.importance() == MatchCardCriterion.Importance.PRIORITY)
                .map(MatchCardCriterion::efhubId)
                .toList();
    }
}
```

`.../match/MatchHit.java`:

```java
package uz.efbazaar.recommendation.match;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record MatchHit(
        UUID listingId,
        BigDecimal score,
        int exactCount,
        int alternateCount,
        int missingCount,
        List<Long> exactEfhubIds,
        List<Long> alternateEfhubIds,
        List<Long> missingEfhubIds,
        BigDecimal earnedWeight,
        BigDecimal possibleWeight
) {
}
```

`.../match/MatchDetails.java`:

```java
package uz.efbazaar.recommendation.match;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/** JSON shakli marketplace {@code MatchDetails} bilan bir xil — frontend o'zgarmasin. */
public record MatchDetails(
        int percent,
        int exactCount,
        int alternateCount,
        int missingCount,
        int selectedCount,
        int strictness,
        List<Long> exactEfhubIds,
        List<Long> alternateEfhubIds,
        List<Long> missingEfhubIds,
        List<Long> priorityEfhubIds,
        BigDecimal earnedWeight,
        BigDecimal possibleWeight
) {

    public static MatchDetails of(MatchHit hit, MatchRequest request) {
        return of(hit, request.strictness(), request.priorityEfhubIds());
    }

    public static MatchDetails of(MatchHit hit, int strictness, List<Long> priorityEfhubIds) {
        int selected = hit.exactCount() + hit.alternateCount() + hit.missingCount();
        int percent = hit.score() == null ? 0 : hit.score().multiply(BigDecimal.valueOf(100))
                .setScale(0, RoundingMode.HALF_UP).intValue();
        return new MatchDetails(percent, hit.exactCount(), hit.alternateCount(), hit.missingCount(),
                selected, strictness, hit.exactEfhubIds(), hit.alternateEfhubIds(), hit.missingEfhubIds(),
                priorityEfhubIds, hit.earnedWeight(), hit.possibleWeight());
    }
}
```

`.../match/MatchIdsResponse.java`:

```java
package uz.efbazaar.recommendation.match;

import java.util.List;
import java.util.UUID;

public record MatchIdsResponse(List<UUID> ids) {
}
```

- [ ] **Step 2: Parser va eski havola adapteri — nusxa**

```bash
MS=backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service
MT=backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/service
RM=backend/recommendation-service/src/main/java/uz/efbazaar/recommendation/match
RT=backend/recommendation-service/src/test/java/uz/efbazaar/recommendation/match
mkdir -p $RM $RT
port() {
  sed -e 's/^package uz\.efbazaar\.marketplace\.service;/package uz.efbazaar.recommendation.match;/' \
      -e '/^import uz\.efbazaar\.marketplace\.dto\.MatchCardCriterion;/d' \
      -e '/^import uz\.efbazaar\.marketplace\.dto\.MatchRequest;/d' \
      -e 's/uz\.efbazaar\.marketplace\.exception\.MarketplaceException/uz.efbazaar.recommendation.exception.RecommendationException/' \
      -e 's/MarketplaceException/RecommendationException/g' \
      "$1" > "$2"
}
port $MS/MatchRequestParser.java      $RM/MatchRequestParser.java
port $MS/LegacyDreamTeamAdapter.java  $RM/LegacyDreamTeamAdapter.java
port $MT/MatchRequestParserTest.java     $RT/MatchRequestParserTest.java
port $MT/LegacyDreamTeamAdapterTest.java $RT/LegacyDreamTeamAdapterTest.java
grep -rn 'uz\.efbazaar\.marketplace' $RM $RT
```
Expected: oxirgi `grep` hech narsa chiqarmaydi. Mantiq va test tekshiruvlari **o'zgarmaydi** — bu 1:1 ko'chirish.

- [ ] **Step 3: Yiqiladigan testlarni yozing**

`src/test/java/uz/efbazaar/recommendation/match/MatchEngineIT.java`:

```java
package uz.efbazaar.recommendation.match;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.recommendation.match.MatchCardCriterion.Importance;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Oltin test: marketplace {@code PlayerMatchPersistenceIT} dagi holatlar projection ustida
 * bir xil ID va bir xil ball beradi (spec §9 "Match parity").
 */
@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(MatchEngine.class)
class MatchEngineIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired MatchEngine engine;
    @Autowired JdbcTemplate jdbc;

    private UUID listing(String status, Double valueScore) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listings_view (listing_id, seller_id, status, price, value_score, version)
                VALUES (?, ?, ?, 100000, ?, 1)
                """, id, UUID.randomUUID(), status, valueScore);
        return id;
    }

    private void card(UUID listingId, long efhubId, UUID playerId) {
        jdbc.update("INSERT INTO listing_cards_view (listing_id, efhub_id, player_id) VALUES (?, ?, ?)",
                listingId, efhubId, playerId);
    }

    private static MatchRequest request(int strictness, MatchCardCriterion... criteria) {
        return new MatchRequest(List.of(criteria), strictness);
    }

    @Test
    void goldenParityExactBeatsAlternateAndStrictnessCuts() {
        UUID player = UUID.randomUUID();
        UUID exact = listing("ACTIVE", null);
        UUID alternate = listing("ACTIVE", null);
        listing("ACTIVE", null);
        card(exact, 101L, player);
        card(alternate, 202L, player);
        MatchRequest seven = request(7, new MatchCardCriterion(101L, player, Importance.NORMAL));

        assertThat(engine.rank(seven, 1000)).containsExactly(exact, alternate);
        Map<UUID, MatchHit> hits = engine.hits(seven.weighted(), List.of(exact, alternate));
        assertThat(hits.get(exact).score()).isEqualByComparingTo("1.0");
        assertThat(hits.get(alternate).score()).isEqualByComparingTo("0.75");

        assertThat(engine.rank(request(8, seven.criteria().getFirst()), 1000)).containsExactly(exact);
    }

    @Test
    void strictnessOneNeedsAnyPositiveOverlap() {
        UUID player = UUID.randomUUID();
        UUID alternate = listing("ACTIVE", null);
        listing("ACTIVE", null);
        card(alternate, 202L, player);

        assertThat(engine.rank(request(1, new MatchCardCriterion(101L, player, Importance.NORMAL)), 1000))
                .containsExactly(alternate);
    }

    @Test
    void priorityWeightsTheScore() {
        UUID playerA = UUID.randomUUID();
        UUID playerB = UUID.randomUUID();
        UUID onlyNormal = listing("ACTIVE", null);
        UUID onlyPriority = listing("ACTIVE", null);
        card(onlyNormal, 101L, playerA);
        card(onlyPriority, 202L, playerB);
        MatchRequest req = request(2,
                new MatchCardCriterion(101L, playerA, Importance.NORMAL),
                new MatchCardCriterion(202L, playerB, Importance.PRIORITY));

        assertThat(engine.rank(req, 1000)).containsExactly(onlyPriority, onlyNormal);
        Map<UUID, MatchHit> hits = engine.hits(req.weighted(), List.of(onlyNormal, onlyPriority));
        assertThat(hits.get(onlyNormal).score()).isEqualByComparingTo("0.25");
        assertThat(hits.get(onlyPriority).score()).isEqualByComparingTo("0.75");
    }

    @Test
    void onlyActiveListingsAreRankedButDetailsWorkForAny() {
        UUID player = UUID.randomUUID();
        UUID sold = listing("SOLD", 0.9);
        card(sold, 101L, player);
        MatchRequest req = request(4, new MatchCardCriterion(101L, player, Importance.NORMAL));

        assertThat(engine.rank(req, 1000)).isEmpty();
        assertThat(engine.hits(req.weighted(), List.of(sold))).containsKey(sold);
    }

    @Test
    void equalScoresAreOrderedByValueScoreWithNullsLast() {
        UUID player = UUID.randomUUID();
        UUID low = listing("ACTIVE", 0.2);
        UUID high = listing("ACTIVE", 0.9);
        UUID unknown = listing("ACTIVE", null);
        for (UUID id : List.of(low, high, unknown)) card(id, 101L, player);

        assertThat(engine.rank(request(4, new MatchCardCriterion(101L, player, Importance.NORMAL)), 1000))
                .containsExactly(high, low, unknown);
    }

    @Test
    void limitCapsTheResult() {
        UUID player = UUID.randomUUID();
        for (int i = 0; i < 3; i++) card(listing("ACTIVE", null), 101L, player);

        assertThat(engine.rank(request(4, new MatchCardCriterion(101L, player, Importance.NORMAL)), 2))
                .hasSize(2);
    }

    @Test
    void detailsListExactAlternateMissingAndWeights() {
        UUID playerA = UUID.randomUUID();
        UUID playerB = UUID.randomUUID();
        UUID playerC = UUID.randomUUID();
        UUID id = listing("ACTIVE", null);
        card(id, 101L, playerA);
        card(id, 999L, playerB);
        MatchRequest req = request(4,
                new MatchCardCriterion(101L, playerA, Importance.NORMAL),
                new MatchCardCriterion(202L, playerB, Importance.PRIORITY),
                new MatchCardCriterion(303L, playerC, Importance.NORMAL));

        MatchHit hit = engine.hits(req.weighted(), List.of(id)).get(id);
        MatchDetails details = MatchDetails.of(hit, req);

        assertThat(hit.exactEfhubIds()).containsExactly(101L);
        assertThat(hit.alternateEfhubIds()).containsExactly(202L);
        assertThat(hit.missingEfhubIds()).containsExactly(303L);
        assertThat(hit.earnedWeight()).isEqualByComparingTo("3.25");
        assertThat(hit.possibleWeight()).isEqualByComparingTo("5");
        assertThat(details.percent()).isEqualTo(65);
        assertThat(details.selectedCount()).isEqualTo(3);
        assertThat(details.priorityEfhubIds()).containsExactly(202L);
    }

    @Test
    void unknownListingHasNoHit() {
        UUID player = UUID.randomUUID();
        assertThat(engine.hits(List.of(new Criterion(101L, player, java.math.BigDecimal.ONE)),
                List.of(UUID.randomUUID()))).isEmpty();
    }
}
```

`src/test/java/uz/efbazaar/recommendation/match/CardIdentityVerifierIT.java`:

```java
package uz.efbazaar.recommendation.match;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.recommendation.exception.RecommendationException;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(CardIdentityVerifier.class)
class CardIdentityVerifierIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final UUID PLAYER = UUID.randomUUID();

    @Autowired CardIdentityVerifier verifier;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void catalog() {
        jdbc.update("INSERT INTO cards_view (efhub_id, player_id, version) VALUES (101, ?, 1)", PLAYER);
        jdbc.update("INSERT INTO cards_view (efhub_id, player_id, version) VALUES (102, NULL, 1)");
    }

    @Test
    void knownPairPasses() {
        assertThatCode(() -> verifier.verify(List.of(new CardIdentityVerifier.Claim(101, PLAYER))))
                .doesNotThrowAnyException();
    }

    @Test
    void fabricatedPlayerIsRejected() {
        assertThatThrownBy(() -> verifier.verify(List.of(new CardIdentityVerifier.Claim(101, UUID.randomUUID()))))
                .isInstanceOf(RecommendationException.class)
                .extracting(e -> ((RecommendationException) e).getCode())
                .isEqualTo("invalid_attribute_value");
    }

    /** Replay'dan oldin cards_view bo'sh — 400, 500 emas (Review Focus 5). */
    @Test
    void unknownCardIsRejected() {
        assertThatThrownBy(() -> verifier.verify(List.of(new CardIdentityVerifier.Claim(555, PLAYER))))
                .isInstanceOf(RecommendationException.class);
    }

    @Test
    void resolveSkipsCardsWithoutPlayer() {
        assertThat(verifier.resolvePlayerIds(List.of(101L, 102L, 555L)))
                .containsOnlyKeys(101L)
                .containsEntry(101L, PLAYER);
    }
}
```

`src/test/java/uz/efbazaar/recommendation/match/MatchControllerTest.java`:

```java
package uz.efbazaar.recommendation.match;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.recommendation.security.HeaderAuthenticationFilter;
import uz.efbazaar.recommendation.security.SecurityConfig;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(MatchController.class)
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class,
        MatchRequestParser.class, LegacyDreamTeamAdapter.class})
class MatchControllerTest {

    @Autowired MockMvc mvc;
    @MockBean MatchEngine engine;
    @MockBean CardIdentityVerifier identities;

    private static final UUID PLAYER = UUID.randomUUID();
    private static final String CARD = "101:" + PLAYER + ":N";

    @Test
    void criteriaAreRequired() throws Exception {
        mvc.perform(get("/api/v1/match"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("match_required"));
    }

    @Test
    void returnsRankedIds() throws Exception {
        UUID id = UUID.randomUUID();
        when(engine.rank(any(MatchRequest.class), eq(MatchController.MAX_IDS))).thenReturn(List.of(id));

        mvc.perform(get("/api/v1/match").param("matchCard", CARD))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ids[0]").value(id.toString()));
    }

    @Test
    void detailsRejectTooManyIds() throws Exception {
        var request = get("/api/v1/match/details").param("matchCard", CARD);
        for (int i = 0; i <= MatchController.MAX_DETAIL_IDS; i++) request.param("ids", UUID.randomUUID().toString());

        mvc.perform(request)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("too_many_ids"));
    }

    @Test
    void singleListingUnknownToProjectionIs404() throws Exception {
        when(engine.hits(any(), any(Collection.class))).thenReturn(Map.of());

        mvc.perform(get("/api/v1/match/" + UUID.randomUUID()).param("matchCard", CARD))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("listing_not_found"));
    }
}
```

- [ ] **Step 4: Testlar yiqilishini ko'ring**

Run: `cd backend/recommendation-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR — `CardIdentityVerifier`, `MatchEngine`, `MatchController` topilmadi.

- [ ] **Step 5: CardIdentityVerifier**

`.../match/CardIdentityVerifier.java` (marketplace'dagi bilan bir xil API; manba `card_player_identities` o'rniga `cards_view`):

```java
package uz.efbazaar.recommendation.match;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.recommendation.exception.RecommendationException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Mijoz haqiqiy karta ID'siga to'qib chiqarilgan player ID'ni ulay olmasin. */
@Component
public class CardIdentityVerifier {

    public record Claim(long efhubId, UUID playerId) {
    }

    private final JdbcTemplate jdbc;

    public CardIdentityVerifier(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void verify(List<Claim> claims) {
        if (claims.isEmpty()) {
            return;
        }
        String values = claims.stream().map(claim -> "(?::bigint, ?::uuid)")
                .collect(Collectors.joining(", "));
        List<Object> args = new ArrayList<>(claims.size() * 2);
        for (Claim claim : claims) {
            args.add(claim.efhubId());
            args.add(claim.playerId().toString());
        }
        List<Long> invalid = jdbc.queryForList("""
                SELECT wanted.efhub_id
                FROM (VALUES %s) wanted(efhub_id, player_id)
                LEFT JOIN cards_view card
                  ON card.efhub_id = wanted.efhub_id
                 AND card.player_id = wanted.player_id
                WHERE card.efhub_id IS NULL
                """.formatted(values), Long.class, args.toArray());
        if (!invalid.isEmpty()) {
            throw RecommendationException.invalidAttributeValue("valuable_players",
                    "noma'lum yoki player_id mos kelmagan card: " + invalid.getFirst());
        }
    }

    /** Eski (faqat karta ID'li) tanlovni u tegishli o'yinchiga bog'laydi. */
    public Map<Long, UUID> resolvePlayerIds(List<Long> efhubIds) {
        if (efhubIds.isEmpty()) {
            return Map.of();
        }
        String placeholders = efhubIds.stream().map(ignored -> "?").collect(Collectors.joining(", "));
        Map<Long, UUID> resolved = new LinkedHashMap<>();
        jdbc.query("""
                        SELECT efhub_id, player_id
                        FROM cards_view
                        WHERE efhub_id IN (%s)
                          AND player_id IS NOT NULL
                        """.formatted(placeholders),
                (rs, row) -> Map.entry(rs.getLong("efhub_id"), rs.getObject("player_id", UUID.class)),
                efhubIds.toArray()).forEach(entry -> resolved.put(entry.getKey(), entry.getValue()));
        return resolved;
    }
}
```

- [ ] **Step 6: MatchEngine**

`.../match/MatchEngine.java`:

```java
package uz.efbazaar.recommendation.match;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * marketplace {@code JdbcListingMatchRepository} SQL'i projection ustida: exact karta 1.0,
 * shu o'yinchining boshqa kartasi 0.75, yo'q 0; {@code score = Σ(w·credit) / Σw}.
 */
@Repository
public class MatchEngine {

    private static final String PER_PLAYER = """
            per_player AS (
                SELECT listing.listing_id,
                       wanted.efhub_id,
                       wanted.player_id,
                       wanted.weight,
                       MAX(CASE
                           WHEN inventory.efhub_id = wanted.efhub_id THEN 1.0
                           WHEN inventory.player_id IS NOT NULL THEN 0.75
                           ELSE 0.0
                       END) AS credit
                FROM listings_view listing
                CROSS JOIN wanted
                LEFT JOIN listing_cards_view inventory
                  ON inventory.listing_id = listing.listing_id
                 AND inventory.player_id = wanted.player_id
                WHERE %s
                GROUP BY listing.listing_id, wanted.efhub_id, wanted.player_id, wanted.weight
            )""";

    private final JdbcTemplate jdbc;

    public MatchEngine(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Player filtri: chegaradan o'tgan ACTIVE e'lonlar. Tartib (P2):
     * {@code score DESC, value_score DESC NULLS LAST, listing_id}.
     */
    public List<UUID> rank(MatchRequest request, int limit) {
        List<Object> args = new ArrayList<>();
        String wanted = wanted(request.weighted(), args);
        String predicate = request.anyPositiveOverlap() ? "scored.score > ?" : "scored.score >= ?";
        args.add(request.minimumScore());
        args.add(limit);
        String sql = """
                WITH wanted(efhub_id, player_id, weight) AS (VALUES %s),
                %s,
                scored AS (
                    SELECT listing_id, SUM(weight * credit) / NULLIF(SUM(weight), 0) AS score
                    FROM per_player
                    GROUP BY listing_id
                )
                SELECT scored.listing_id
                FROM scored
                JOIN listings_view listing ON listing.listing_id = scored.listing_id
                WHERE %s
                ORDER BY scored.score DESC, listing.value_score DESC NULLS LAST, scored.listing_id ASC
                LIMIT ?
                """.formatted(wanted, PER_PLAYER.formatted("listing.status = 'ACTIVE'"), predicate);
        return jdbc.queryForList(sql, UUID.class, args.toArray());
    }

    /** Berilgan e'lonlar uchun to'liq tafsilot, holatidan qat'i nazar. Projection'da yo'q ID qaytmaydi. */
    public Map<UUID, MatchHit> hits(List<Criterion> criteria, Collection<UUID> listingIds) {
        if (criteria.isEmpty() || listingIds.isEmpty()) {
            return Map.of();
        }
        List<Object> args = new ArrayList<>();
        String wanted = wanted(criteria, args);
        String placeholders = listingIds.stream().map(ignored -> "?").collect(Collectors.joining(", "));
        args.addAll(listingIds);
        String sql = """
                WITH wanted(efhub_id, player_id, weight) AS (VALUES %s),
                %s
                SELECT listing_id,
                       SUM(weight * credit) / NULLIF(SUM(weight), 0) AS score,
                       COUNT(*) FILTER (WHERE credit = 1.0) AS exact_count,
                       COUNT(*) FILTER (WHERE credit = 0.75) AS alternate_count,
                       COUNT(*) FILTER (WHERE credit = 0.0) AS missing_count,
                       COALESCE(array_agg(efhub_id ORDER BY efhub_id) FILTER (WHERE credit = 1.0), '{}') AS exact_ids,
                       COALESCE(array_agg(efhub_id ORDER BY efhub_id) FILTER (WHERE credit = 0.75), '{}') AS alternate_ids,
                       COALESCE(array_agg(efhub_id ORDER BY efhub_id) FILTER (WHERE credit = 0.0), '{}') AS missing_ids,
                       SUM(weight * credit) AS earned_weight,
                       SUM(weight) AS possible_weight
                FROM per_player
                GROUP BY listing_id
                """.formatted(wanted, PER_PLAYER.formatted("listing.listing_id IN (" + placeholders + ")"));
        Map<UUID, MatchHit> result = new LinkedHashMap<>();
        jdbc.query(sql, (rs, row) -> mapHit(rs), args.toArray())
                .forEach(hit -> result.put(hit.listingId(), hit));
        return result;
    }

    /** VALUES qatorlari (efhub_id, player_id, weight) — FeedRanker ham ishlatadi. */
    public static String wanted(List<Criterion> criteria, List<Object> args) {
        for (Criterion criterion : criteria) {
            args.add(criterion.efhubId());
            args.add(criterion.playerId().toString());
            args.add(criterion.weight());
        }
        return criteria.stream()
                .map(criterion -> "(?::bigint, ?::uuid, ?::numeric)")
                .collect(Collectors.joining(", "));
    }

    private static MatchHit mapHit(ResultSet rs) throws SQLException {
        return new MatchHit(
                rs.getObject("listing_id", UUID.class),
                rs.getBigDecimal("score"),
                rs.getInt("exact_count"),
                rs.getInt("alternate_count"),
                rs.getInt("missing_count"),
                longs(rs.getArray("exact_ids")),
                longs(rs.getArray("alternate_ids")),
                longs(rs.getArray("missing_ids")),
                rs.getBigDecimal("earned_weight"),
                rs.getBigDecimal("possible_weight"));
    }

    private static List<Long> longs(Array array) throws SQLException {
        if (array == null) return List.of();
        Object raw = array.getArray();
        if (raw instanceof Long[] values) return List.of(values);
        if (raw instanceof Number[] values) return Arrays.stream(values).map(Number::longValue).toList();
        return List.of();
    }
}
```

- [ ] **Step 7: MatchController**

`.../match/MatchController.java`:

```java
package uz.efbazaar.recommendation.match;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.recommendation.exception.RecommendationException;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Player filtri. Faqat ID va ball — filtr, sahifalash va e'lon ko'rinishi marketplace'da
 * ({@code POST /listings/ranked}); birlashtirishni frontend qiladi.
 */
@RestController
@RequestMapping("/api/v1/match")
public class MatchController {

    public static final int MAX_IDS = 1000;
    public static final int MAX_DETAIL_IDS = 100;

    private final MatchEngine engine;
    private final MatchRequestParser parser;
    private final LegacyDreamTeamAdapter legacy;

    public MatchController(MatchEngine engine, MatchRequestParser parser, LegacyDreamTeamAdapter legacy) {
        this.engine = engine;
        this.parser = parser;
        this.legacy = legacy;
    }

    @GetMapping
    public MatchIdsResponse match(
            @RequestParam(name = "matchCard", required = false) List<String> matchCards,
            @RequestParam(name = "matchStrictness", required = false) Integer matchStrictness,
            @RequestParam(name = "dream_team", required = false) String legacyTeam,
            @RequestParam(name = "dream_team_min_match", required = false) String legacyMinimum) {
        MatchRequest request = resolve(matchCards, matchStrictness, legacyTeam, legacyMinimum);
        return new MatchIdsResponse(engine.rank(request, MAX_IDS));
    }

    @GetMapping("/details")
    public Map<UUID, MatchDetails> details(
            @RequestParam List<UUID> ids,
            @RequestParam(name = "matchCard", required = false) List<String> matchCards,
            @RequestParam(name = "matchStrictness", required = false) Integer matchStrictness,
            @RequestParam(name = "dream_team", required = false) String legacyTeam,
            @RequestParam(name = "dream_team_min_match", required = false) String legacyMinimum) {
        if (ids.isEmpty() || ids.size() > MAX_DETAIL_IDS) {
            throw RecommendationException.badRequest("too_many_ids",
                    "ids 1 dan " + MAX_DETAIL_IDS + " tagacha bo'lishi kerak");
        }
        MatchRequest request = resolve(matchCards, matchStrictness, legacyTeam, legacyMinimum);
        Map<UUID, MatchDetails> result = new LinkedHashMap<>();
        engine.hits(request.weighted(), new LinkedHashSet<>(ids))
                .forEach((id, hit) -> result.put(id, MatchDetails.of(hit, request)));
        return result;
    }

    @GetMapping("/{listingId}")
    public MatchDetails one(
            @PathVariable UUID listingId,
            @RequestParam(name = "matchCard", required = false) List<String> matchCards,
            @RequestParam(name = "matchStrictness", required = false) Integer matchStrictness,
            @RequestParam(name = "dream_team", required = false) String legacyTeam,
            @RequestParam(name = "dream_team_min_match", required = false) String legacyMinimum) {
        MatchRequest request = resolve(matchCards, matchStrictness, legacyTeam, legacyMinimum);
        MatchHit hit = engine.hits(request.weighted(), List.of(listingId)).get(listingId);
        if (hit == null) {
            throw RecommendationException.listingNotFound();
        }
        return MatchDetails.of(hit, request);
    }

    private MatchRequest resolve(List<String> matchCards, Integer strictness,
                                 String legacyTeam, String legacyMinimum) {
        return parser.parse(matchCards, strictness)
                .or(() -> legacy.parse(legacyTeam, legacyMinimum))
                .orElseThrow(() -> RecommendationException.badRequest("match_required",
                        "Kamida bitta matchCard kerak"));
    }
}
```

- [ ] **Step 8: Testlar o'tishini ko'ring**

Run: `cd backend/recommendation-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"`
Expected: BUILD SUCCESS — ko'chirilgan `MatchRequestParserTest` va `LegacyDreamTeamAdapterTest` marketplace'dagi bilan bir xil sonda o'tadi; `MatchEngineIT` 8, `CardIdentityVerifierIT` 4, `MatchControllerTest` 4.

- [ ] **Step 9: Commit**

```bash
git add backend/recommendation-service
git commit -m "feat(recommendation): match engine — player filtri projection ustida, 1:1"
```

---
### Task 4: Dream team — 1:1 ko'chirish

**Files:**
- Create (nusxa + sed): `.../dreamteam/DreamTeam.java`, `DreamTeamRequest.java`, `DreamTeamResponse.java`, `DreamTeamRepository.java`, `DreamTeamService.java`, `DreamTeamWriteLock.java`, `DreamTeamController.java`
- Test (nusxa + sed): `src/test/java/uz/efbazaar/recommendation/dreamteam/DreamTeamServiceTest.java`, `DreamTeamWriteLockTest.java`, `DreamTeamControllerTest.java`
- Test: `src/test/java/uz/efbazaar/recommendation/dreamteam/DreamTeamPersistenceIT.java`

**Interfaces:**
- Consumes: `CardIdentityVerifier` (Task 3, paket `uz.efbazaar.recommendation.match`), `AuthenticatedUser(UUID userId, List<String> roles)` (Task 1 — marketplace'dagidan farqli, `telegramId` yo'q), `RecommendationException` (Task 1), `dream_teams` jadvali (Task 1).
- Produces: `DreamTeamService.findMine/get/create/saveMine/update` — marketplace bilan bir xil imzolar; HTTP `GET/POST /api/v1/dream-teams`, `GET/PUT /api/v1/dream-teams/{id}`, `PUT /api/v1/dream-teams/me` — javob shakli `DreamTeamResponse(id, name, formation, slots, createdAt, updatedAt)`.
- Produces (Task 6 uchun): `dream_teams.slots` JSON shakli `[{"index":0,"position":"GK","w":1|3,"card":{"efhubId":<long>,"playerId":"<uuid>",...}}]`.

- [ ] **Step 1: Kod va testlarni nusxalang**

```bash
MP=backend/marketplace-service/src/main/java/uz/efbazaar/marketplace
MT=backend/marketplace-service/src/test/java/uz/efbazaar/marketplace
DM=backend/recommendation-service/src/main/java/uz/efbazaar/recommendation/dreamteam
DT=backend/recommendation-service/src/test/java/uz/efbazaar/recommendation/dreamteam
mkdir -p $DM $DT
port_dt() {
  sed -E \
      -e 's/^package uz\.efbazaar\.marketplace\.(domain|dto|repository|service|controller);/package uz.efbazaar.recommendation.dreamteam;/' \
      -e '/^import uz\.efbazaar\.marketplace\.(domain|dto|repository|service|controller)\.DreamTeam[A-Za-z]*;/d' \
      -e 's/uz\.efbazaar\.marketplace\.security\.AuthenticatedUser/uz.efbazaar.recommendation.security.AuthenticatedUser/' \
      -e 's/uz\.efbazaar\.marketplace\.exception\.MarketplaceException/uz.efbazaar.recommendation.exception.RecommendationException/' \
      -e 's/MarketplaceException/RecommendationException/g' \
      "$1" > "$2"
}
port_dt $MP/domain/DreamTeam.java              $DM/DreamTeam.java
port_dt $MP/dto/DreamTeamRequest.java          $DM/DreamTeamRequest.java
port_dt $MP/dto/DreamTeamResponse.java         $DM/DreamTeamResponse.java
port_dt $MP/repository/DreamTeamRepository.java $DM/DreamTeamRepository.java
port_dt $MP/service/DreamTeamService.java      $DM/DreamTeamService.java
port_dt $MP/service/DreamTeamWriteLock.java    $DM/DreamTeamWriteLock.java
port_dt $MP/controller/DreamTeamController.java $DM/DreamTeamController.java
port_dt $MT/service/DreamTeamServiceTest.java      $DT/DreamTeamServiceTest.java
port_dt $MT/service/DreamTeamWriteLockTest.java    $DT/DreamTeamWriteLockTest.java
port_dt $MT/controller/DreamTeamControllerTest.java $DT/DreamTeamControllerTest.java

# marketplace'da CardIdentityVerifier service paketida edi (import'siz) — endi match paketida.
sed -i '/^package /a import uz.efbazaar.recommendation.match.CardIdentityVerifier;' \
    $DM/DreamTeamService.java $DT/DreamTeamServiceTest.java
# rec'dagi AuthenticatedUser'da telegramId yo'q.
sed -i 's/new AuthenticatedUser(userId, null, /new AuthenticatedUser(userId, /' $DT/DreamTeamControllerTest.java

grep -rn 'uz\.efbazaar\.marketplace' $DM $DT
```
Expected: oxirgi `grep` hech narsa chiqarmaydi. Mantiq va tekshiruvlar **o'zgarmaydi**.

- [ ] **Step 2: Yiqiladigan persistence testini yozing**

`src/test/java/uz/efbazaar/recommendation/dreamteam/DreamTeamPersistenceIT.java`:

```java
package uz.efbazaar.recommendation.dreamteam;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.recommendation.match.CardIdentityVerifier;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Entity ↔ V1 sxema (ddl validate), JSONB slotlar va "bitta foydalanuvchiga bitta jamoa". */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import({DreamTeamService.class, DreamTeamWriteLock.class, CardIdentityVerifier.class})
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=validate")
class DreamTeamPersistenceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final UUID PLAYER = UUID.randomUUID();

    @Autowired DreamTeamService service;
    @Autowired DreamTeamRepository repository;
    @Autowired JdbcTemplate jdbc;

    private static DreamTeamRequest withGoalkeeper(String formation) {
        return new DreamTeamRequest("ignored", formation, List.of(Map.of(
                "index", 0, "w", 3,
                "card", Map.of("efhubId", 891, "playerId", PLAYER.toString(), "name", "Keeper"))));
    }

    @Test
    void saveMineTwiceKeepsOneRow() {
        jdbc.update("INSERT INTO cards_view (efhub_id, player_id, version) VALUES (891, ?, 1)", PLAYER);
        UUID user = UUID.randomUUID();

        service.saveMine(user, withGoalkeeper("4-3-3"));
        service.saveMine(user, new DreamTeamRequest("ignored", "4-2-3-1", List.of()));
        repository.flush();

        assertThat(jdbc.queryForObject("SELECT count(*) FROM dream_teams WHERE user_id = ?", Integer.class, user))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT formation FROM dream_teams WHERE user_id = ?", String.class, user))
                .isEqualTo("4-2-3-1");
    }

    @Test
    void slotsRoundTripThroughJsonb() {
        jdbc.update("INSERT INTO cards_view (efhub_id, player_id, version) VALUES (891, ?, 1)", PLAYER);
        UUID user = UUID.randomUUID();
        service.saveMine(user, withGoalkeeper("4-3-3"));
        repository.flush();

        assertThat(jdbc.queryForObject(
                "SELECT slots -> 0 -> 'card' ->> 'playerId' FROM dream_teams WHERE user_id = ?", String.class, user))
                .isEqualTo(PLAYER.toString());
        assertThat(jdbc.queryForObject(
                "SELECT (slots -> 0 ->> 'w')::int FROM dream_teams WHERE user_id = ?", Integer.class, user))
                .isEqualTo(3);
        assertThat(jdbc.queryForObject(
                "SELECT slots -> 0 ->> 'position' FROM dream_teams WHERE user_id = ?", String.class, user))
                .isEqualTo("GK");
    }

    @Test
    void databaseRejectsSecondTeamForSameUser() {
        UUID user = UUID.randomUUID();
        jdbc.update("INSERT INTO dream_teams (id, user_id, name) VALUES (?, ?, 'a')", UUID.randomUUID(), user);

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO dream_teams (id, user_id, name) VALUES (?, ?, 'b')", UUID.randomUUID(), user))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
```

- [ ] **Step 3: Testlarni ishga tushiring**

Run: `cd backend/recommendation-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"`
Expected: BUILD SUCCESS — ko'chirilgan testlar marketplace'dagi bilan bir xil sonda; `DreamTeamPersistenceIT` 3. Agar `DreamTeamPersistenceIT` Step 1'siz yozilgan bo'lsa, u avval kompilyatsiya xatosi bilan yiqiladi (RED), Step 1'dan keyin yashil.

- [ ] **Step 4: Commit**

```bash
git add backend/recommendation-service
git commit -m "feat(recommendation): dream team — marketplace'dan 1:1 ko'chirish"
```

---

### Task 5: Card interest — ko'chirish, shaxsiy qiziqish, admin sonlari, tozalash job'i

**Files:**
- Create (nusxa): `.../interest/CardInterestRequest.java`, `.../interest/CardInterestResponse.java`
- Create: `.../interest/CardInterestService.java`, `.../interest/CardInterestController.java`, `.../interest/UserCardInterestRepository.java`
- Create: `.../maintenance/RetentionJob.java`
- Modify: `application.yml` (`app.card-interest.hmac-secret`, `app.recommendation.retention-cron`)
- Test (nusxa + sed): `src/test/java/uz/efbazaar/recommendation/interest/CardInterestServiceTest.java`
- Test: `src/test/java/uz/efbazaar/recommendation/interest/CardInterestUserSignalTest.java`
- Test: `src/test/java/uz/efbazaar/recommendation/interest/UserCardInterestPersistenceIT.java`

**Interfaces:**
- Consumes: `CardIdentityVerifier.resolvePlayerIds` (Task 3); `user_card_interest`, `consumed_events` (Task 1).
- Produces: `UserCardInterestRepository.touch(UUID userId, Collection<Long> efhubIds)`, `deleteOlderThan(Duration age) : int`.
- Produces: `CardInterestService.recordApply(Collection<Long>, UUID userId, String networkIdentity) : CardInterestResponse`, `counts(Collection<Long>) : Map<Long, Counts>`, `record Counts(long days7, long days30)`.
- Produces: HTTP `POST /api/v1/card-interest/apply` (marketplace bilan bir xil shartnoma, `X-Interest-Network`), `GET /api/v1/card-interest/counts?ids=` → `{ "<efhubId>": { "days7": n, "days30": n } }` (faqat `ROLE_ADMIN`).
- Produces (Task 6 uchun): `user_card_interest(user_id, efhub_id, last_at)` qatorlari login qilgan foydalanuvchi uchun.

- [ ] **Step 1: DTO va mavjud testni nusxalang**

```bash
MC=backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/cards
MT=backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/cards
IM=backend/recommendation-service/src/main/java/uz/efbazaar/recommendation/interest
IT=backend/recommendation-service/src/test/java/uz/efbazaar/recommendation/interest
mkdir -p $IM $IT backend/recommendation-service/src/main/java/uz/efbazaar/recommendation/maintenance
for f in CardInterestRequest CardInterestResponse; do
  sed 's/^package uz\.efbazaar\.marketplace\.cards;/package uz.efbazaar.recommendation.interest;/' $MC/$f.java > $IM/$f.java
done
sed -e 's/^package uz\.efbazaar\.marketplace\.cards;/package uz.efbazaar.recommendation.interest;/' \
    -e 's/uz\.efbazaar\.marketplace\.exception\.MarketplaceException/uz.efbazaar.recommendation.exception.RecommendationException/' \
    -e 's/MarketplaceException/RecommendationException/g' \
    -e 's/uz\.efbazaar\.marketplace\.service\.CardIdentityVerifier/uz.efbazaar.recommendation.match.CardIdentityVerifier/' \
    -e 's/new CardInterestService(redis, identities, "secret", CLOCK)/new CardInterestService(redis, identities, mock(UserCardInterestRepository.class), "secret", CLOCK)/' \
    -e 's/mock(StringRedisTemplate.class), mock(CardIdentityVerifier.class), " ", CLOCK)/mock(StringRedisTemplate.class), mock(CardIdentityVerifier.class), mock(UserCardInterestRepository.class), " ", CLOCK)/' \
    -e 's/redis, mock(CardIdentityVerifier.class), "secret", CLOCK)/redis, mock(CardIdentityVerifier.class), mock(UserCardInterestRepository.class), "secret", CLOCK)/' \
    $MT/CardInterestServiceTest.java > $IT/CardInterestServiceTest.java
grep -n 'new CardInterestService' $IT/CardInterestServiceTest.java
grep -rn 'uz\.efbazaar\.marketplace' $IM $IT
```
Expected: har `new CardInterestService(` qatori (yoki uning davomi) `mock(UserCardInterestRepository.class)` ni o'z ichiga oladi; oxirgi `grep` bo'sh. Test tekshiruvlari **o'zgarmaydi**.

- [ ] **Step 2: Yiqiladigan yangi testlarni yozing**

`src/test/java/uz/efbazaar/recommendation/interest/CardInterestUserSignalTest.java`:

```java
package uz.efbazaar.recommendation.interest;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import uz.efbazaar.recommendation.exception.RecommendationException;
import uz.efbazaar.recommendation.match.CardIdentityVerifier;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Shaxsiy lenta uchun login qilgan foydalanuvchining qiziqishi saqlanadi; anonimniki — yo'q. */
class CardInterestUserSignalTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-01T10:00:00Z"), ZoneOffset.UTC);

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final CardIdentityVerifier identities = mock(CardIdentityVerifier.class);
    private final UserCardInterestRepository userInterest = mock(UserCardInterestRepository.class);
    private final CardInterestService service =
            new CardInterestService(redis, identities, userInterest, "secret", CLOCK);

    @Test
    void loggedInApplyRecordsPersonalInterest() {
        UUID user = UUID.randomUUID();
        when(identities.resolvePlayerIds(List.of(10L, 11L)))
                .thenReturn(Map.of(10L, UUID.randomUUID(), 11L, UUID.randomUUID()));

        service.recordApply(List.of(10L, 11L, 10L), user, null);

        verify(userInterest).touch(eq(user), argThat(ids -> ids.size() == 2 && ids.containsAll(List.of(10L, 11L))));
    }

    @Test
    void anonymousApplyStaysAnonymous() {
        when(identities.resolvePlayerIds(List.of(10L))).thenReturn(Map.of(10L, UUID.randomUUID()));

        service.recordApply(List.of(10L), null, "203.0.113.10");

        verifyNoInteractions(userInterest);
    }

    @Test
    void unknownCardIsRejectedBeforeAnyWrite() {
        when(identities.resolvePlayerIds(List.of(99L))).thenReturn(Map.of());

        assertThatThrownBy(() -> service.recordApply(List.of(99L), UUID.randomUUID(), null))
                .isInstanceOf(RecommendationException.class);
        verifyNoInteractions(userInterest);
    }
}
```

`src/test/java/uz/efbazaar/recommendation/interest/UserCardInterestPersistenceIT.java`:

```java
package uz.efbazaar.recommendation.interest;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.recommendation.maintenance.RetentionJob;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import({UserCardInterestRepository.class, RetentionJob.class})
class UserCardInterestPersistenceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired UserCardInterestRepository repository;
    @Autowired RetentionJob retention;
    @Autowired JdbcTemplate jdbc;

    @Test
    void touchUpsertsAndRefreshesLastAt() {
        UUID user = UUID.randomUUID();
        repository.touch(user, List.of(10L));
        jdbc.update("UPDATE user_card_interest SET last_at = now() - interval '10 days' WHERE user_id = ?", user);

        repository.touch(user, List.of(10L, 11L));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_card_interest WHERE user_id = ?",
                Integer.class, user)).isEqualTo(2);
        Instant lastAt = jdbc.queryForObject(
                "SELECT last_at FROM user_card_interest WHERE user_id = ? AND efhub_id = 10",
                java.sql.Timestamp.class, user).toInstant();
        assertThat(lastAt).isAfter(Instant.now().minusSeconds(60));
    }

    @Test
    void retentionDropsOnlyExpiredRows() {
        UUID user = UUID.randomUUID();
        jdbc.update("INSERT INTO user_card_interest VALUES (?, 1, now() - interval '91 days')", user);
        jdbc.update("INSERT INTO user_card_interest VALUES (?, 2, now() - interval '1 day')", user);
        jdbc.update("INSERT INTO consumed_events VALUES ('old', now() - interval '31 days')");
        jdbc.update("INSERT INTO consumed_events VALUES ('fresh', now())");

        retention.run();

        assertThat(jdbc.queryForList("SELECT efhub_id FROM user_card_interest WHERE user_id = ?", Long.class, user))
                .containsExactly(2L);
        assertThat(jdbc.queryForList("SELECT idempotency_key FROM consumed_events", String.class))
                .containsExactly("fresh");
    }
}
```

- [ ] **Step 3: Testlar yiqilishini ko'ring**

Run: `cd backend/recommendation-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR — `CardInterestService`, `UserCardInterestRepository`, `RetentionJob` topilmadi.

- [ ] **Step 4: UserCardInterestRepository va RetentionJob**

`.../interest/UserCardInterestRepository.java`:

```java
package uz.efbazaar.recommendation.interest;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** Login qilgan foydalanuvchi qaysi kartaga qiziqqani — shaxsiy lenta signali. */
@Repository
public class UserCardInterestRepository {

    private final JdbcTemplate jdbc;

    public UserCardInterestRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void touch(UUID userId, Collection<Long> efhubIds) {
        List<Object[]> rows = efhubIds.stream().map(id -> new Object[]{userId, id}).toList();
        if (rows.isEmpty()) return;
        jdbc.batchUpdate("""
                INSERT INTO user_card_interest (user_id, efhub_id, last_at)
                VALUES (?, ?, now())
                ON CONFLICT (user_id, efhub_id) DO UPDATE SET last_at = now()
                """, rows);
    }

    public int deleteOlderThan(Duration age) {
        return jdbc.update("DELETE FROM user_card_interest WHERE last_at < now() - make_interval(secs => ?)",
                age.toSeconds());
    }
}
```

`.../maintenance/RetentionJob.java`:

```java
package uz.efbazaar.recommendation.maintenance;

import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import uz.efbazaar.recommendation.interest.UserCardInterestRepository;

import java.time.Duration;

/**
 * Kunlik tozalash: shaxsiy qiziqish 90 kun (agregat sanagichlar bilan bir xil), qayta ishlangan
 * event kalitlari 30 kun — undan eski takrorni baribir {@code version} to'sadi.
 */
@Slf4j
@Component
public class RetentionJob {

    static final Duration INTEREST_RETENTION = Duration.ofDays(90);

    private final UserCardInterestRepository userInterest;
    private final JdbcTemplate jdbc;

    public RetentionJob(UserCardInterestRepository userInterest, JdbcTemplate jdbc) {
        this.userInterest = userInterest;
        this.jdbc = jdbc;
    }

    @Scheduled(cron = "${app.recommendation.retention-cron:0 30 3 * * *}", zone = "UTC")
    public void run() {
        int interest = userInterest.deleteOlderThan(INTEREST_RETENTION);
        int events = jdbc.update("DELETE FROM consumed_events WHERE consumed_at < now() - interval '30 days'");
        log.info("Retention: user_card_interest -{} , consumed_events -{}", interest, events);
    }
}
```

- [ ] **Step 5: CardInterestService va controller**

`.../interest/CardInterestService.java` (marketplace'dagi mantiq; farqi: `enrich(AdminCardPage)` yo'q — admin sahifasi `/counts` endpointidan oladi; login qilgan foydalanuvchi uchun `touch`):

```java
package uz.efbazaar.recommendation.interest;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import uz.efbazaar.recommendation.exception.RecommendationException;
import uz.efbazaar.recommendation.match.CardIdentityVerifier;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Maxfiy, takrorlanmaydigan xaridor qiziqishi. Redis kalitlari va HMAC marketplace bilan bir xil —
 * 30 kunlik tarix va dedupe ko'chishda yo'qolmaydi. META'ni hech qachon avtomatik o'zgartirmaydi.
 */
@Service
@Slf4j
public class CardInterestService {

    private static final int RETENTION_DAYS = 90;
    private static final int MAX_ACCEPTED_PER_IDENTITY_DAY = 100;
    private static final long TTL_SECONDS = Duration.ofDays(RETENTION_DAYS).toSeconds();
    private static final DefaultRedisScript<Long> RECORD_SCRIPT = new DefaultRedisScript<>("""
            if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
            local used = tonumber(redis.call('GET', KEYS[3]) or '0')
            if used >= tonumber(ARGV[3]) then return -1 end
            redis.call('SET', KEYS[1], '1', 'EX', ARGV[1])
            redis.call('INCR', KEYS[3])
            redis.call('EXPIRE', KEYS[3], ARGV[1])
            redis.call('HINCRBY', KEYS[2], ARGV[2], 1)
            redis.call('EXPIRE', KEYS[2], ARGV[1])
            return 1
            """, Long.class);

    private final StringRedisTemplate redis;
    private final CardIdentityVerifier identities;
    private final UserCardInterestRepository userInterest;
    private final byte[] hmacSecret;
    private final Clock clock;

    @Autowired
    public CardInterestService(StringRedisTemplate redis,
                               CardIdentityVerifier identities,
                               UserCardInterestRepository userInterest,
                               @Value("${app.card-interest.hmac-secret}") String hmacSecret) {
        this(redis, identities, userInterest, hmacSecret, Clock.systemUTC());
    }

    CardInterestService(StringRedisTemplate redis, CardIdentityVerifier identities,
                        UserCardInterestRepository userInterest, String hmacSecret, Clock clock) {
        if (hmacSecret == null || hmacSecret.isBlank()) {
            throw new IllegalStateException("CARD_INTEREST_HMAC_SECRET must be configured");
        }
        this.redis = redis;
        this.identities = identities;
        this.userInterest = userInterest;
        this.hmacSecret = hmacSecret.getBytes(StandardCharsets.UTF_8);
        this.clock = clock;
    }

    public CardInterestResponse recordApply(Collection<Long> rawIds, UUID userId, String trustedNetworkIdentity) {
        Set<Long> ids = new LinkedHashSet<>();
        for (Long id : rawIds) if (id != null && id > 0) ids.add(id);
        if (ids.isEmpty() || ids.size() > 11) throw invalid("1 dan 11 tagacha card kerak");
        Map<Long, UUID> valid = identities.resolvePlayerIds(new ArrayList<>(ids));
        if (!valid.keySet().containsAll(ids)) throw invalid("noma'lum card yuborildi");

        String identity = userId != null
                ? "user:" + userId
                : trustedNetworkIdentity == null || trustedNetworkIdentity.isBlank()
                    ? null
                    : "network:" + trustedNetworkIdentity.strip();
        if (identity == null) throw invalid("anonymous identity mavjud emas");
        if (userId != null) userInterest.touch(userId, ids);

        String identityHash = hmac(identity);
        String date = LocalDate.now(clock).toString();
        int accepted = 0;
        for (Long id : ids) {
            Long result = redis.execute(RECORD_SCRIPT,
                    List.of(dedupeKey(date, identityHash, id), dayKey(date), budgetKey(date, identityHash)),
                    String.valueOf(TTL_SECONDS), String.valueOf(id),
                    String.valueOf(MAX_ACCEPTED_PER_IDENTITY_DAY));
            if (Long.valueOf(1).equals(result)) accepted++;
        }
        return new CardInterestResponse(accepted, ids.size() - accepted);
    }

    public Map<Long, Counts> counts(Collection<Long> rawIds) {
        List<Long> ids = rawIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) return Map.of();
        try {
            return loadCounts(ids);
        } catch (RuntimeException exception) {
            log.warn("card interest aggregates unavailable, returning zeros: {}", exception.toString());
            Map<Long, Counts> fallback = new HashMap<>();
            ids.forEach(id -> fallback.put(id, new Counts(0, 0)));
            return fallback;
        }
    }

    private Map<Long, Counts> loadCounts(List<Long> ids) {
        Map<Long, long[]> totals = new HashMap<>();
        ids.forEach(id -> totals.put(id, new long[2]));
        List<Object> fields = ids.stream().map(String::valueOf).map(value -> (Object) value).toList();
        LocalDate today = LocalDate.now(clock);
        for (int offset = 0; offset < 30; offset++) {
            List<Object> values = redis.opsForHash().multiGet(dayKey(today.minusDays(offset).toString()), fields);
            for (int i = 0; i < ids.size(); i++) {
                long value = longValue(values == null || i >= values.size() ? null : values.get(i));
                totals.get(ids.get(i))[1] += value;
                if (offset < 7) totals.get(ids.get(i))[0] += value;
            }
        }
        Map<Long, Counts> result = new HashMap<>();
        totals.forEach((id, values) -> result.put(id, new Counts(values[0], values[1])));
        return result;
    }

    String hmac(String identity) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hmacSecret, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(identity.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("HMAC unavailable", exception);
        }
    }

    static String dedupeKey(String date, String identityHash, long efhubId) {
        return "card-interest:dedupe:" + date + ":" + identityHash + ":" + efhubId;
    }

    static String dayKey(String date) {
        return "card-interest:day:" + date;
    }

    static String budgetKey(String date, String identityHash) {
        return "card-interest:budget:" + date + ":" + identityHash;
    }

    private static long longValue(Object raw) {
        if (raw instanceof Number number) return number.longValue();
        if (raw instanceof String value) {
            try { return Long.parseLong(value); } catch (NumberFormatException ignored) { return 0; }
        }
        return 0;
    }

    private static RecommendationException invalid(String reason) {
        return new RecommendationException(HttpStatus.BAD_REQUEST, "invalid_card_interest", reason);
    }

    public record Counts(long days7, long days30) {}
}
```

`.../interest/CardInterestController.java`:

```java
package uz.efbazaar.recommendation.interest;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.recommendation.exception.RecommendationException;
import uz.efbazaar.recommendation.security.AuthenticatedUser;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/card-interest")
public class CardInterestController {

    static final int MAX_COUNT_IDS = 200;

    private final CardInterestService service;

    public CardInterestController(CardInterestService service) {
        this.service = service;
    }

    @PostMapping("/apply")
    public CardInterestResponse apply(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestHeader(name = "X-Interest-Network", required = false) String networkIdentity,
            @Valid @RequestBody CardInterestRequest request) {
        return service.recordApply(request.efhubIds(), user == null ? null : user.userId(), networkIdentity);
    }

    /** Admin kartalar sahifasi: 7 va 30 kunlik talab. Ruxsat — SecurityConfig (ROLE_ADMIN). */
    @GetMapping("/counts")
    public Map<Long, CardInterestService.Counts> counts(@RequestParam List<Long> ids) {
        if (ids.isEmpty() || ids.size() > MAX_COUNT_IDS) {
            throw RecommendationException.badRequest("too_many_ids",
                    "ids 1 dan " + MAX_COUNT_IDS + " tagacha bo'lishi kerak");
        }
        return service.counts(ids);
    }
}
```

`application.yml` — `app:` ichiga qo'shing:

```yaml
  card-interest:
    # Bo'sh bo'lsa servis ishga tushmaydi — marketplace bilan BIR XIL qiymat bo'lishi shart,
    # aks holda dedupe va 30 kunlik tarix uziladi.
    hmac-secret: ${CARD_INTEREST_HMAC_SECRET:}
  recommendation:
    retention-cron: ${REC_RETENTION_CRON:0 30 3 * * *}
```

- [ ] **Step 6: Testlar o'tishini ko'ring**

Run: `cd backend/recommendation-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"`
Expected: BUILD SUCCESS — ko'chirilgan `CardInterestServiceTest` marketplace'dagi bilan bir xil sonda, `CardInterestUserSignalTest` 3, `UserCardInterestPersistenceIT` 2, `RecommendationApplicationIT` (hmac `test-secret` bilan) yashil.

- [ ] **Step 7: Commit**

```bash
git add backend/recommendation-service
git commit -m "feat(recommendation): card interest — ko'chirish, shaxsiy qiziqish, admin sonlari, tozalash"
```

---
### Task 6: "Mening qiziqishlarim" lentasi — profil, tartib, sessiya snapshot'i

**Files:**
- Create: `.../feed/FeedProperties.java`, `ProfileSignal.java`, `ProfileRepository.java`, `ProfileService.java`, `ProfileHash.java`, `FeedRanker.java`, `FeedCache.java`, `RedisFeedCache.java`, `FeedResponse.java`, `FeedService.java`, `FeedController.java`
- Modify: `application.yml` (`app.recommendation.feed.*`)
- Test: `src/test/java/uz/efbazaar/recommendation/feed/ProfileHashTest.java`, `ProfileServiceTest.java`, `ProfileRepositoryIT.java`, `FeedRankerIT.java`, `FeedServiceTest.java`, `RedisFeedCacheTest.java`, `FeedControllerTest.java`

**Interfaces:**
- Consumes: `Criterion`, `MatchEngine.hits(List<Criterion>, Collection<UUID>)`, `MatchEngine.wanted(List<Criterion>, List<Object>) : String` (public static), `MatchDetails.of(MatchHit, int, List<Long>)` (Task 3); `dream_teams` slot shakli (Task 4); `user_card_interest` (Task 5); `listings_view`, `listing_cards_view`, `cards_view`, `user_likes` (Task 2).
- Produces:
  - `record FeedProperties(int maxIds, Duration snapshotTtl, BigDecimal metaBoost, int profileLimit, Duration interestWindow)` — prefiks `app.recommendation.feed`, default'lar 1000 / 30m / 1.5 / 50 / 30d.
  - `ProfileService.profile(UUID userId) : List<Criterion>` — og'irlik kamayishi, keyin `efhubId` o'sishi bo'yicha, ko'pi bilan `profileLimit`.
  - `ProfileHash.of(List<Criterion>) : String` (64 ta kichik hex), `ProfileHash.isWellFormed(String) : boolean`.
  - `FeedService.feed(UUID viewerId, String profileHash) : FeedResponse`, `FeedService.details(UUID viewerId, List<UUID> ids) : Map<UUID, MatchDetails>`.
  - `record FeedResponse(boolean empty, String profileHash, List<UUID> ids)`.
  - HTTP: `GET /api/v1/feed[?profileHash=]` → `FeedResponse`; `GET /api/v1/feed/details?ids=` → `{ "<uuid>": MatchDetails }` (1..100 ID).

**Profil qoidasi (spec §4.4):** dream team sloti → og'irlik 1 yoki 3 (`w`); like bosilgan (`liked = true`) e'londagi har karta → +1 (har e'lon uchun); oxirgi 30 kundagi `user_card_interest` → +1. Bir xil `efhub_id` yig'iladi. Karta hozir faol META bo'lsa (`meta_tier = 'META'` va `(active_from IS NULL OR active_from <= now())` va `(active_until IS NULL OR active_until > now())` — marketplace `CardFacts.isActiveMeta` bilan bir xil) og'irlik × `metaBoost`. Eng og'ir 50 ta.

**E'lon bali:** `earned = Σ weight·credit` (exact 1.0, shu o'yinchining boshqa kartasi 0.75). Tartib `earned DESC, value_score DESC NULLS LAST, listing_id`. Chiqariladi: `status ≠ ACTIVE`, ko'ruvchining o'z e'lonlari, u like bosgan e'lonlar, `earned = 0`.

- [ ] **Step 1: Yiqiladigan unit testlarni yozing**

`src/test/java/uz/efbazaar/recommendation/feed/ProfileHashTest.java`:

```java
package uz.efbazaar.recommendation.feed;

import org.junit.jupiter.api.Test;
import uz.efbazaar.recommendation.match.Criterion;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ProfileHashTest {

    private static final UUID P = UUID.randomUUID();
    private static final UUID Q = UUID.randomUUID();

    @Test
    void orderDoesNotMatterButWeightsDo() {
        List<Criterion> a = List.of(new Criterion(1, P, new BigDecimal("2")), new Criterion(2, Q, BigDecimal.ONE));
        List<Criterion> reversed = List.of(a.get(1), a.get(0));
        List<Criterion> heavier = List.of(new Criterion(1, P, new BigDecimal("3")), new Criterion(2, Q, BigDecimal.ONE));

        assertThat(ProfileHash.of(a)).isEqualTo(ProfileHash.of(reversed));
        assertThat(ProfileHash.of(a)).isNotEqualTo(ProfileHash.of(heavier));
    }

    @Test
    void trailingZerosDoNotChangeTheHash() {
        assertThat(ProfileHash.of(List.of(new Criterion(1, P, new BigDecimal("1.50")))))
                .isEqualTo(ProfileHash.of(List.of(new Criterion(1, P, new BigDecimal("1.5")))));
    }

    @Test
    void onlyLowercaseSha256HexIsWellFormed() {
        String hash = ProfileHash.of(List.of(new Criterion(1, P, BigDecimal.ONE)));

        assertThat(hash).hasSize(64);
        assertThat(ProfileHash.isWellFormed(hash)).isTrue();
        assertThat(ProfileHash.isWellFormed(null)).isFalse();
        assertThat(ProfileHash.isWellFormed("../" + hash.substring(3))).isFalse();
        assertThat(ProfileHash.isWellFormed(hash.toUpperCase())).isFalse();
    }
}
```

`src/test/java/uz/efbazaar/recommendation/feed/ProfileServiceTest.java`:

```java
package uz.efbazaar.recommendation.feed;

import org.junit.jupiter.api.Test;
import uz.efbazaar.recommendation.match.Criterion;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ProfileServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-01T10:00:00Z");
    private static final UUID USER = UUID.randomUUID();

    private final ProfileRepository repository = mock(ProfileRepository.class);

    private ProfileService service(int limit) {
        FeedProperties props = new FeedProperties(1000, Duration.ofMinutes(30), new BigDecimal("1.5"), limit,
                Duration.ofDays(30));
        return new ProfileService(repository, props, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void metaBoostSortingAndLimit() {
        UUID p = UUID.randomUUID();
        UUID q = UUID.randomUUID();
        UUID r = UUID.randomUUID();
        when(repository.signals(USER, NOW.minus(Duration.ofDays(30)))).thenReturn(List.of(
                new ProfileSignal(101, p, BigDecimal.ONE, true),
                new ProfileSignal(202, q, new BigDecimal("2"), false),
                new ProfileSignal(303, r, BigDecimal.ONE, false)));

        List<Criterion> profile = service(2).profile(USER);

        assertThat(profile).extracting(Criterion::efhubId).containsExactly(202L, 101L);
        assertThat(profile.get(1).weight()).isEqualByComparingTo("1.5");
    }

    @Test
    void equalWeightsAreOrderedByCardId() {
        when(repository.signals(USER, NOW.minus(Duration.ofDays(30)))).thenReturn(List.of(
                new ProfileSignal(303, UUID.randomUUID(), BigDecimal.ONE, false),
                new ProfileSignal(101, UUID.randomUUID(), BigDecimal.ONE, false)));

        assertThat(service(50).profile(USER)).extracting(Criterion::efhubId).containsExactly(101L, 303L);
    }
}
```

`src/test/java/uz/efbazaar/recommendation/feed/FeedServiceTest.java`:

```java
package uz.efbazaar.recommendation.feed;

import org.junit.jupiter.api.Test;
import uz.efbazaar.recommendation.match.Criterion;
import uz.efbazaar.recommendation.match.MatchDetails;
import uz.efbazaar.recommendation.match.MatchEngine;
import uz.efbazaar.recommendation.match.MatchHit;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class FeedServiceTest {

    static final class InMemoryCache implements FeedCache {
        final Map<String, List<UUID>> entries = new HashMap<>();

        @Override
        public Optional<List<UUID>> get(UUID userId, String profileHash) {
            return Optional.ofNullable(entries.get(userId + ":" + profileHash));
        }

        @Override
        public void put(UUID userId, String profileHash, List<UUID> ids) {
            entries.put(userId + ":" + profileHash, ids);
        }
    }

    private static final UUID USER = UUID.randomUUID();
    private static final FeedProperties PROPS = new FeedProperties(1000, Duration.ofMinutes(30),
            new BigDecimal("1.5"), 50, Duration.ofDays(30));

    private final ProfileService profiles = mock(ProfileService.class);
    private final FeedRanker ranker = mock(FeedRanker.class);
    private final MatchEngine engine = mock(MatchEngine.class);
    private final InMemoryCache cache = new InMemoryCache();
    private final FeedService service = new FeedService(profiles, ranker, engine, cache, PROPS);

    private static List<Criterion> profile(long efhubId, String weight) {
        return List.of(new Criterion(efhubId, UUID.randomUUID(), new BigDecimal(weight)));
    }

    @Test
    void guestGetsAnEmptyFeed() {
        assertThat(service.feed(null, null)).isEqualTo(FeedResponse.EMPTY);
        verifyNoInteractions(profiles, ranker);
    }

    @Test
    void emptyProfileGetsAnEmptyFeed() {
        when(profiles.profile(USER)).thenReturn(List.of());

        assertThat(service.feed(USER, null).empty()).isTrue();
        verifyNoInteractions(ranker);
    }

    @Test
    void firstPagePinsTheSnapshot() {
        List<Criterion> profile = profile(101, "1");
        UUID a = UUID.randomUUID();
        when(profiles.profile(USER)).thenReturn(profile);
        when(ranker.rank(profile, USER, 1000)).thenReturn(List.of(a));

        FeedResponse response = service.feed(USER, null);

        assertThat(response.empty()).isFalse();
        assertThat(response.ids()).containsExactly(a);
        assertThat(response.profileHash()).isEqualTo(ProfileHash.of(profile));
        assertThat(cache.get(USER, response.profileHash())).contains(List.of(a));
    }

    /** Sessiya o'rtasida like bosildi — joriy sahifalash o'zgarmaydi (spec §4.5). */
    @Test
    void pinnedHashSurvivesProfileChange() {
        List<Criterion> before = profile(101, "1");
        UUID a = UUID.randomUUID();
        when(profiles.profile(USER)).thenReturn(before);
        when(ranker.rank(before, USER, 1000)).thenReturn(List.of(a));
        String hash = service.feed(USER, null).profileHash();
        when(profiles.profile(USER)).thenReturn(profile(101, "2"));

        FeedResponse second = service.feed(USER, hash);

        assertThat(second.ids()).containsExactly(a);
        assertThat(second.profileHash()).isEqualTo(hash);
        verify(ranker, times(1)).rank(anyList(), any(), anyInt());
    }

    @Test
    void refreshWithoutHashUsesTheNewProfile() {
        List<Criterion> before = profile(101, "1");
        List<Criterion> after = profile(101, "2");
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        when(profiles.profile(USER)).thenReturn(before, after);
        when(ranker.rank(before, USER, 1000)).thenReturn(List.of(a));
        when(ranker.rank(after, USER, 1000)).thenReturn(List.of(b));

        String first = service.feed(USER, null).profileHash();
        FeedResponse refreshed = service.feed(USER, null);

        assertThat(refreshed.profileHash()).isNotEqualTo(first);
        assertThat(refreshed.ids()).containsExactly(b);
    }

    @Test
    void malformedHashIsIgnored() {
        List<Criterion> profile = profile(101, "1");
        when(profiles.profile(USER)).thenReturn(profile);
        when(ranker.rank(profile, USER, 1000)).thenReturn(List.of());
        cache.entries.put(USER + ":../evil", List.of(UUID.randomUUID()));

        FeedResponse response = service.feed(USER, "../evil");

        assertThat(response.profileHash()).isEqualTo(ProfileHash.of(profile));
    }

    @Test
    void profileWithoutMatchesIsEmpty() {
        List<Criterion> profile = profile(101, "1");
        when(profiles.profile(USER)).thenReturn(profile);
        when(ranker.rank(profile, USER, 1000)).thenReturn(List.of());

        FeedResponse response = service.feed(USER, null);

        assertThat(response.empty()).isTrue();
        assertThat(response.profileHash()).isNotNull();
    }

    @Test
    void detailsUseTheCurrentProfile() {
        List<Criterion> profile = profile(101, "1");
        UUID id = UUID.randomUUID();
        MatchHit hit = new MatchHit(id, BigDecimal.ONE, 1, 0, 0, List.of(101L), List.of(), List.of(),
                BigDecimal.ONE, BigDecimal.ONE);
        when(profiles.profile(USER)).thenReturn(profile);
        when(engine.hits(eq(profile), any())).thenReturn(Map.of(id, hit));

        Map<UUID, MatchDetails> details = service.details(USER, List.of(id));

        assertThat(details.get(id).percent()).isEqualTo(100);
        assertThat(details.get(id).strictness()).isZero();
    }

    @Test
    void guestDetailsAreEmpty() {
        assertThat(service.details(null, List.of(UUID.randomUUID()))).isEmpty();
        verifyNoInteractions(profiles, engine);
    }
}
```

`src/test/java/uz/efbazaar/recommendation/feed/RedisFeedCacheTest.java`:

```java
package uz.efbazaar.recommendation.feed;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RedisFeedCacheTest {

    private static final UUID USER = UUID.randomUUID();
    private static final String HASH = "a".repeat(64);
    private static final FeedProperties PROPS = new FeedProperties(1000, Duration.ofMinutes(30),
            new BigDecimal("1.5"), 50, Duration.ofDays(30));

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    private final RedisFeedCache cache = new RedisFeedCache(redis, PROPS);

    @Test
    void readsStoredSnapshot() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("rec:feed:" + USER + ":" + HASH)).thenReturn(a + "," + b);

        assertThat(cache.get(USER, HASH)).contains(List.of(a, b));
    }

    @Test
    void emptySnapshotIsAnEmptyListNotAMiss() {
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("rec:feed:" + USER + ":" + HASH)).thenReturn("");

        assertThat(cache.get(USER, HASH)).contains(List.of());
    }

    @Test
    void putUsesKeyAndTtl() {
        UUID a = UUID.randomUUID();
        when(redis.opsForValue()).thenReturn(values);

        cache.put(USER, HASH, List.of(a));

        verify(values).set("rec:feed:" + USER + ":" + HASH, a.toString(), Duration.ofMinutes(30));
    }

    /** Redis o'chiq — lenta joyida hisoblanadi, 500 yo'q (Review Focus 3). */
    @Test
    void redisFailureDegradesQuietly() {
        when(redis.opsForValue()).thenThrow(new RedisConnectionFailureException("down"));

        assertThat(cache.get(USER, HASH)).isEmpty();
        assertThatCode(() -> cache.put(USER, HASH, List.of(UUID.randomUUID()))).doesNotThrowAnyException();
    }
}
```

`src/test/java/uz/efbazaar/recommendation/feed/FeedControllerTest.java`:

```java
package uz.efbazaar.recommendation.feed;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.recommendation.security.HeaderAuthenticationFilter;
import uz.efbazaar.recommendation.security.SecurityConfig;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(FeedController.class)
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class})
class FeedControllerTest {

    @Autowired MockMvc mvc;
    @MockBean FeedService service;

    @Test
    void guestGetsEmptyFeed() throws Exception {
        when(service.feed(isNull(), isNull())).thenReturn(FeedResponse.EMPTY);

        mvc.perform(get("/api/v1/feed"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.empty").value(true))
                .andExpect(jsonPath("$.ids").isEmpty());
    }

    @Test
    void userIdComesFromTheHeader() throws Exception {
        UUID user = UUID.randomUUID();
        UUID id = UUID.randomUUID();
        when(service.feed(eq(user), eq("h"))).thenReturn(new FeedResponse(false, "h", List.of(id)));

        mvc.perform(get("/api/v1/feed").param("profileHash", "h").header("X-User-Id", user.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ids[0]").value(id.toString()));
    }

    @Test
    void detailsRejectTooManyIds() throws Exception {
        var request = get("/api/v1/feed/details");
        for (int i = 0; i <= FeedController.MAX_DETAIL_IDS; i++) request.param("ids", UUID.randomUUID().toString());

        mvc.perform(request)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("too_many_ids"));
    }
}
```

- [ ] **Step 2: Yiqiladigan IT'larni yozing**

`src/test/java/uz/efbazaar/recommendation/feed/ProfileRepositoryIT.java`:

```java
package uz.efbazaar.recommendation.feed;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(ProfileRepository.class)
class ProfileRepositoryIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final UUID P = UUID.randomUUID();
    private static final UUID Q = UUID.randomUUID();
    private static final UUID R = UUID.randomUUID();

    @Autowired ProfileRepository repository;
    @Autowired JdbcTemplate jdbc;

    private Instant since() {
        return Instant.now().minus(Duration.ofDays(30));
    }

    private void team(UUID user, String slotsJson) {
        jdbc.update("INSERT INTO dream_teams (id, user_id, name, slots) VALUES (?, ?, 'Mening jamoam', ?::jsonb)",
                UUID.randomUUID(), user, slotsJson);
    }

    private UUID listingWith(long efhubId, UUID player) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO listings_view (listing_id, seller_id, status, price, version) VALUES (?, ?, 'ACTIVE', 1, 1)",
                id, UUID.randomUUID());
        jdbc.update("INSERT INTO listing_cards_view VALUES (?, ?, ?)", id, efhubId, player);
        return id;
    }

    private void card(long efhubId, UUID player, String metaTier, String from, String until) {
        jdbc.update("""
                INSERT INTO cards_view (efhub_id, player_id, meta_tier, active_from, active_until, version)
                VALUES (?, ?, ?, ?::timestamptz, ?::timestamptz, 1)
                """, efhubId, player, metaTier, from, until);
    }

    private Map<Long, String> weights(UUID user) {
        return repository.signals(user, since()).stream().collect(Collectors.toMap(
                ProfileSignal::efhubId, s -> s.weight().stripTrailingZeros().toPlainString()));
    }

    @Test
    void dreamTeamLikesAndInterestAreSummedPerCard() {
        UUID user = UUID.randomUUID();
        team(user, "[{\"index\":0,\"position\":\"GK\",\"w\":3,\"card\":{\"efhubId\":101,\"playerId\":\"" + P + "\"}}]");
        UUID liked = listingWith(101, P);
        jdbc.update("INSERT INTO listing_cards_view VALUES (?, 202, ?)", liked, Q);
        jdbc.update("INSERT INTO user_likes VALUES (?, ?, true, 1)", user, liked);
        card(303, R, "NORMAL", null, null);
        jdbc.update("INSERT INTO user_card_interest VALUES (?, 303, now())", user);

        assertThat(weights(user)).containsExactlyInAnyOrderEntriesOf(Map.of(101L, "4", 202L, "1", 303L, "1"));
    }

    @Test
    void unlikedListingAndOldInterestDoNotCount() {
        UUID user = UUID.randomUUID();
        UUID listing = listingWith(101, P);
        jdbc.update("INSERT INTO user_likes VALUES (?, ?, false, 2)", user, listing);
        card(303, R, "NORMAL", null, null);
        jdbc.update("INSERT INTO user_card_interest VALUES (?, 303, now() - interval '40 days')", user);

        assertThat(repository.signals(user, since())).isEmpty();
    }

    @Test
    void interestOnCardMissingFromCatalogIsSkipped() {
        UUID user = UUID.randomUUID();
        jdbc.update("INSERT INTO user_card_interest VALUES (?, 999, now())", user);

        assertThat(repository.signals(user, since())).isEmpty();
    }

    /** marketplace'dan ko'chirilgan eski/buzilgan slot lentani yiqitmaydi (Review Focus 2). */
    @Test
    void malformedSlotIsSkipped() {
        UUID user = UUID.randomUUID();
        team(user, "[{\"index\":0,\"w\":1,\"card\":{\"efhubId\":\"abc\",\"playerId\":\"not-a-uuid\"}},"
                + "\"garbage\","
                + "{\"index\":1,\"w\":1,\"card\":{\"efhubId\":202,\"playerId\":\"" + Q + "\"}}]");

        assertThat(repository.signals(user, since())).extracting(ProfileSignal::efhubId).containsExactly(202L);
    }

    @Test
    void activeMetaFlagFollowsTheWindow() {
        UUID user = UUID.randomUUID();
        card(101, P, "META", "2026-01-01T00:00:00Z", null);
        card(202, Q, "META", "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z");
        card(303, R, "NORMAL", null, null);
        for (long id : List.of(101L, 202L, 303L)) {
            jdbc.update("INSERT INTO user_card_interest VALUES (?, ?, now())", user, id);
        }

        Map<Long, Boolean> meta = repository.signals(user, since()).stream()
                .collect(Collectors.toMap(ProfileSignal::efhubId, ProfileSignal::activeMeta));

        assertThat(meta).containsExactlyInAnyOrderEntriesOf(Map.of(101L, true, 202L, false, 303L, false));
    }
}
```

`src/test/java/uz/efbazaar/recommendation/feed/FeedRankerIT.java`:

```java
package uz.efbazaar.recommendation.feed;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.recommendation.match.Criterion;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(FeedRanker.class)
class FeedRankerIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final UUID VIEWER = UUID.randomUUID();
    private static final UUID P = UUID.randomUUID();
    private static final UUID Q = UUID.randomUUID();

    @Autowired FeedRanker ranker;
    @Autowired JdbcTemplate jdbc;

    private UUID listing(UUID seller, String status, Double valueScore) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listings_view (listing_id, seller_id, status, price, value_score, version)
                VALUES (?, ?, ?, 1, ?, 1)
                """, id, seller, status, valueScore);
        return id;
    }

    private UUID listing() {
        return listing(UUID.randomUUID(), "ACTIVE", null);
    }

    private void card(UUID listingId, long efhubId, UUID player) {
        jdbc.update("INSERT INTO listing_cards_view VALUES (?, ?, ?)", listingId, efhubId, player);
    }

    @Test
    void earnedThenValueScoreOrdersTheFeed() {
        List<Criterion> profile = List.of(
                new Criterion(101, P, new BigDecimal("3")),
                new Criterion(202, Q, BigDecimal.ONE));
        UUID both = listing();
        card(both, 101, P);
        card(both, 202, Q);                                          // 3 + 1 = 4
        UUID exactP = listing();
        card(exactP, 101, P);                                        // 3
        UUID alternateP = listing(UUID.randomUUID(), "ACTIVE", 0.9);
        card(alternateP, 555, P);                                    // 2.25
        UUID alternatePLow = listing(UUID.randomUUID(), "ACTIVE", 0.1);
        card(alternatePLow, 556, P);                                 // 2.25, past value_score

        assertThat(ranker.rank(profile, VIEWER, 1000))
                .containsExactly(both, exactP, alternateP, alternatePLow);
    }

    @Test
    void ownLikedInactiveAndUnrelatedListingsAreExcluded() {
        List<Criterion> profile = List.of(new Criterion(101, P, BigDecimal.ONE));
        UUID own = listing(VIEWER, "ACTIVE", null);
        card(own, 101, P);
        UUID liked = listing();
        card(liked, 101, P);
        jdbc.update("INSERT INTO user_likes VALUES (?, ?, true, 1)", VIEWER, liked);
        UUID unliked = listing();
        card(unliked, 101, P);
        jdbc.update("INSERT INTO user_likes VALUES (?, ?, false, 2)", VIEWER, unliked);
        UUID sold = listing(UUID.randomUUID(), "SOLD", null);
        card(sold, 101, P);
        UUID unrelated = listing();
        card(unrelated, 999, Q);

        assertThat(ranker.rank(profile, VIEWER, 1000)).containsExactly(unliked);
    }

    @Test
    void limitCapsTheSnapshot() {
        List<Criterion> profile = List.of(new Criterion(101, P, BigDecimal.ONE));
        for (int i = 0; i < 3; i++) card(listing(), 101, P);

        assertThat(ranker.rank(profile, VIEWER, 2)).hasSize(2);
    }
}
```

- [ ] **Step 3: Testlar yiqilishini ko'ring**

Run: `cd backend/recommendation-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"`
Expected: COMPILATION ERROR — `feed` paketidagi klasslar topilmadi.

- [ ] **Step 4: Sozlama, profil va hash**

`.../feed/FeedProperties.java`:

```java
package uz.efbazaar.recommendation.feed;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.math.BigDecimal;
import java.time.Duration;

/** Spec §4.4–4.5 konstantalari; prod ma'lumotiga qarab application.yml / env orqali sozlanadi. */
@ConfigurationProperties("app.recommendation.feed")
public record FeedProperties(
        @DefaultValue("1000") int maxIds,
        @DefaultValue("30m") Duration snapshotTtl,
        @DefaultValue("1.5") BigDecimal metaBoost,
        @DefaultValue("50") int profileLimit,
        @DefaultValue("30d") Duration interestWindow
) {
}
```

`.../feed/ProfileSignal.java`:

```java
package uz.efbazaar.recommendation.feed;

import java.math.BigDecimal;
import java.util.UUID;

/** Bitta karta bo'yicha yig'ilgan signal (META boost'gacha). */
public record ProfileSignal(long efhubId, UUID playerId, BigDecimal weight, boolean activeMeta) {
}
```

`.../feed/ProfileRepository.java`:

```java
package uz.efbazaar.recommendation.feed;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Profil so'rov paytida yig'iladi, alohida saqlanmaydi. Dream team slotlari JSONB — marketplace'dan
 * ko'chirilgan eski qatorlarda shakl buzilgan bo'lishi mumkin, shuning uchun ID'lar regex bilan
 * tekshirilib, keyin cast qilinadi: bitta yomon slot butun lentani yiqitmasin.
 */
@Repository
public class ProfileRepository {

    private static final String SQL = """
            WITH raw(efhub_id, player_id, weight) AS (
                SELECT (slot -> 'card' ->> 'efhubId')::bigint,
                       (slot -> 'card' ->> 'playerId')::uuid,
                       (CASE WHEN slot ->> 'w' = '3' THEN 3 ELSE 1 END)::numeric
                FROM dream_teams team
                CROSS JOIN LATERAL jsonb_array_elements(
                    CASE WHEN jsonb_typeof(team.slots) = 'array' THEN team.slots ELSE '[]'::jsonb END) slot
                WHERE team.user_id = ?
                  AND jsonb_typeof(slot) = 'object'
                  AND (slot -> 'card' ->> 'efhubId') ~ '^[0-9]{1,18}$'
                  AND (slot -> 'card' ->> 'playerId')
                      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                UNION ALL
                SELECT card.efhub_id, card.player_id, 1::numeric
                FROM user_likes liked
                JOIN listing_cards_view card ON card.listing_id = liked.listing_id
                WHERE liked.user_id = ? AND liked.liked
                UNION ALL
                SELECT interest.efhub_id, catalog.player_id, 1::numeric
                FROM user_card_interest interest
                JOIN cards_view catalog ON catalog.efhub_id = interest.efhub_id
                WHERE interest.user_id = ?
                  AND interest.last_at >= ?
                  AND catalog.player_id IS NOT NULL
            ),
            summed AS (
                SELECT efhub_id, (array_agg(player_id ORDER BY player_id))[1] AS player_id, SUM(weight) AS weight
                FROM raw
                GROUP BY efhub_id
            )
            SELECT summed.efhub_id,
                   summed.player_id,
                   summed.weight,
                   COALESCE(catalog.meta_tier = 'META'
                            AND (catalog.active_from IS NULL OR catalog.active_from <= now())
                            AND (catalog.active_until IS NULL OR catalog.active_until > now()), false) AS active_meta
            FROM summed
            LEFT JOIN cards_view catalog ON catalog.efhub_id = summed.efhub_id
            """;

    private final JdbcTemplate jdbc;

    public ProfileRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ProfileSignal> signals(UUID userId, Instant interestSince) {
        return jdbc.query(SQL, (rs, row) -> new ProfileSignal(
                        rs.getLong("efhub_id"),
                        rs.getObject("player_id", UUID.class),
                        rs.getBigDecimal("weight"),
                        rs.getBoolean("active_meta")),
                userId, userId, userId, Timestamp.from(interestSince));
    }
}
```

`.../feed/ProfileService.java`:

```java
package uz.efbazaar.recommendation.feed;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import uz.efbazaar.recommendation.match.Criterion;

import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class ProfileService {

    private final ProfileRepository repository;
    private final FeedProperties props;
    private final Clock clock;

    @Autowired
    public ProfileService(ProfileRepository repository, FeedProperties props) {
        this(repository, props, Clock.systemUTC());
    }

    ProfileService(ProfileRepository repository, FeedProperties props, Clock clock) {
        this.repository = repository;
        this.props = props;
        this.clock = clock;
    }

    /** Og'irlik kamayishi bo'yicha (teng bo'lsa karta ID), META boost bilan, eng ko'pi {@code profileLimit}. */
    public List<Criterion> profile(UUID userId) {
        Instant since = clock.instant().minus(props.interestWindow());
        return repository.signals(userId, since).stream()
                .map(signal -> new Criterion(signal.efhubId(), signal.playerId(),
                        signal.activeMeta() ? signal.weight().multiply(props.metaBoost()) : signal.weight()))
                .sorted(Comparator.comparing(Criterion::weight, Comparator.reverseOrder())
                        .thenComparingLong(Criterion::efhubId))
                .limit(props.profileLimit())
                .toList();
    }
}
```

`.../feed/ProfileHash.java`:

```java
package uz.efbazaar.recommendation.feed;

import uz.efbazaar.recommendation.match.Criterion;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** {@code sha256("efhubId:og'irlik,...")} — karta ID bo'yicha tartiblangan, og'irlik kanonik ko'rinishda. */
public final class ProfileHash {

    private static final Pattern WELL_FORMED = Pattern.compile("^[0-9a-f]{64}$");

    private ProfileHash() {
    }

    public static String of(List<Criterion> profile) {
        String canonical = profile.stream()
                .sorted(Comparator.comparingLong(Criterion::efhubId))
                .map(c -> c.efhubId() + ":" + c.weight().stripTrailingZeros().toPlainString())
                .collect(Collectors.joining(","));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /** Mijozdan kelgan qiymat Redis kalitiga tushadi — faqat aniq shakl qabul qilinadi. */
    public static boolean isWellFormed(String hash) {
        return hash != null && WELL_FORMED.matcher(hash).matches();
    }
}
```

- [ ] **Step 5: Tartib, kesh, servis, controller**

`.../feed/FeedRanker.java`:

```java
package uz.efbazaar.recommendation.feed;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import uz.efbazaar.recommendation.match.Criterion;
import uz.efbazaar.recommendation.match.MatchEngine;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Normallashtirilmagan match bali: {@code earned = Σ weight·credit}. Nomzod — profildagi
 * o'yinchilardan kamida bittasi bor e'lon (yo'q o'yinchi 0 beradi, natijaga ta'sir qilmaydi).
 */
@Repository
public class FeedRanker {

    private final JdbcTemplate jdbc;

    public FeedRanker(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<UUID> rank(List<Criterion> profile, UUID viewerId, int limit) {
        if (profile.isEmpty()) {
            return List.of();
        }
        List<Object> args = new ArrayList<>();
        String wanted = MatchEngine.wanted(profile, args);
        args.add(viewerId);
        args.add(viewerId);
        args.add(limit);
        String sql = """
                WITH wanted(efhub_id, player_id, weight) AS (VALUES %s),
                hits AS (
                    SELECT inventory.listing_id,
                           wanted.efhub_id,
                           wanted.weight,
                           MAX(CASE WHEN inventory.efhub_id = wanted.efhub_id THEN 1.0 ELSE 0.75 END) AS credit
                    FROM wanted
                    JOIN listing_cards_view inventory ON inventory.player_id = wanted.player_id
                    GROUP BY inventory.listing_id, wanted.efhub_id, wanted.weight
                )
                SELECT hits.listing_id
                FROM hits
                JOIN listings_view listing ON listing.listing_id = hits.listing_id
                WHERE listing.status = 'ACTIVE'
                  AND listing.seller_id <> ?
                  AND NOT EXISTS (
                      SELECT 1 FROM user_likes liked
                      WHERE liked.user_id = ? AND liked.listing_id = hits.listing_id AND liked.liked)
                GROUP BY hits.listing_id, listing.value_score
                HAVING SUM(hits.weight * hits.credit) > 0
                ORDER BY SUM(hits.weight * hits.credit) DESC,
                         listing.value_score DESC NULLS LAST,
                         hits.listing_id ASC
                LIMIT ?
                """.formatted(wanted);
        return jdbc.queryForList(sql, UUID.class, args.toArray());
    }
}
```

`.../feed/FeedCache.java`:

```java
package uz.efbazaar.recommendation.feed;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Sessiya snapshot'i: bitta profil hash'i uchun tartiblangan ID'lar. */
public interface FeedCache {

    Optional<List<UUID>> get(UUID userId, String profileHash);

    void put(UUID userId, String profileHash, List<UUID> ids);
}
```

`.../feed/RedisFeedCache.java`:

```java
package uz.efbazaar.recommendation.feed;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/** Redis o'chiq bo'lsa — keshsiz ishlaydi: har sahifa joyida hisoblanadi, barqarorlik yo'qoladi. */
@Slf4j
@Component
public class RedisFeedCache implements FeedCache {

    private final StringRedisTemplate redis;
    private final FeedProperties props;

    public RedisFeedCache(StringRedisTemplate redis, FeedProperties props) {
        this.redis = redis;
        this.props = props;
    }

    @Override
    public Optional<List<UUID>> get(UUID userId, String profileHash) {
        try {
            String raw = redis.opsForValue().get(key(userId, profileHash));
            if (raw == null) return Optional.empty();
            if (raw.isEmpty()) return Optional.of(List.of());
            return Optional.of(Arrays.stream(raw.split(",")).map(UUID::fromString).toList());
        } catch (RuntimeException e) {
            log.warn("Lenta snapshot'i o'qilmadi, joyida hisoblanadi: {}", e.toString());
            return Optional.empty();
        }
    }

    @Override
    public void put(UUID userId, String profileHash, List<UUID> ids) {
        try {
            redis.opsForValue().set(key(userId, profileHash),
                    ids.stream().map(UUID::toString).collect(Collectors.joining(",")),
                    props.snapshotTtl());
        } catch (RuntimeException e) {
            log.warn("Lenta snapshot'i saqlanmadi: {}", e.toString());
        }
    }

    static String key(UUID userId, String profileHash) {
        return "rec:feed:" + userId + ":" + profileHash;
    }
}
```

`.../feed/FeedResponse.java`:

```java
package uz.efbazaar.recommendation.feed;

import java.util.List;
import java.util.UUID;

/** {@code empty = true} → frontend "Katta bozor"ga o'tadi (mehmon, bo'sh profil yoki mos e'lon yo'q). */
public record FeedResponse(boolean empty, String profileHash, List<UUID> ids) {

    public static final FeedResponse EMPTY = new FeedResponse(true, null, List.of());

    public static FeedResponse of(String profileHash, List<UUID> ids) {
        return new FeedResponse(ids.isEmpty(), profileHash, ids);
    }
}
```

`.../feed/FeedService.java`:

```java
package uz.efbazaar.recommendation.feed;

import org.springframework.stereotype.Service;
import uz.efbazaar.recommendation.match.Criterion;
import uz.efbazaar.recommendation.match.MatchDetails;
import uz.efbazaar.recommendation.match.MatchEngine;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class FeedService {

    private final ProfileService profiles;
    private final FeedRanker ranker;
    private final MatchEngine engine;
    private final FeedCache cache;
    private final FeedProperties props;

    public FeedService(ProfileService profiles, FeedRanker ranker, MatchEngine engine,
                       FeedCache cache, FeedProperties props) {
        this.profiles = profiles;
        this.ranker = ranker;
        this.engine = engine;
        this.cache = cache;
        this.props = props;
    }

    /**
     * Mijoz birinchi javobdagi hash'ni qaytarsa va snapshot hali tirik bo'lsa — aynan o'sha ro'yxat
     * (sessiya ichida tartib o'zgarmaydi). Aks holda joriy profil bo'yicha yangi snapshot.
     */
    public FeedResponse feed(UUID viewerId, String requestedHash) {
        if (viewerId == null) {
            return FeedResponse.EMPTY;
        }
        if (ProfileHash.isWellFormed(requestedHash)) {
            Optional<List<UUID>> pinned = cache.get(viewerId, requestedHash);
            if (pinned.isPresent()) {
                return FeedResponse.of(requestedHash, pinned.get());
            }
        }
        List<Criterion> profile = profiles.profile(viewerId);
        if (profile.isEmpty()) {
            return FeedResponse.EMPTY;
        }
        String hash = ProfileHash.of(profile);
        Optional<List<UUID>> cached = cache.get(viewerId, hash);
        if (cached.isPresent()) {
            return FeedResponse.of(hash, cached.get());
        }
        List<UUID> ids = ranker.rank(profile, viewerId, props.maxIds());
        cache.put(viewerId, hash, ids);
        return FeedResponse.of(hash, ids);
    }

    /** Kartadagi "nega mos" izohi — joriy profil bo'yicha (P7). */
    public Map<UUID, MatchDetails> details(UUID viewerId, List<UUID> ids) {
        if (viewerId == null || ids.isEmpty()) {
            return Map.of();
        }
        List<Criterion> profile = profiles.profile(viewerId);
        if (profile.isEmpty()) {
            return Map.of();
        }
        Map<UUID, MatchDetails> result = new LinkedHashMap<>();
        engine.hits(profile, new LinkedHashSet<>(ids))
                .forEach((id, hit) -> result.put(id, MatchDetails.of(hit, 0, List.of())));
        return result;
    }
}
```

`.../feed/FeedController.java`:

```java
package uz.efbazaar.recommendation.feed;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.recommendation.exception.RecommendationException;
import uz.efbazaar.recommendation.match.MatchDetails;
import uz.efbazaar.recommendation.security.AuthenticatedUser;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** "Mening qiziqishlarim": faqat tartib. Filtr va sahifalash marketplace'da (POST /listings/ranked). */
@RestController
@RequestMapping("/api/v1/feed")
public class FeedController {

    public static final int MAX_DETAIL_IDS = 100;

    private final FeedService service;

    public FeedController(FeedService service) {
        this.service = service;
    }

    @GetMapping
    public FeedResponse feed(@AuthenticationPrincipal AuthenticatedUser viewer,
                             @RequestParam(required = false) String profileHash) {
        return service.feed(viewer == null ? null : viewer.userId(), profileHash);
    }

    @GetMapping("/details")
    public Map<UUID, MatchDetails> details(@AuthenticationPrincipal AuthenticatedUser viewer,
                                           @RequestParam List<UUID> ids) {
        if (ids.isEmpty() || ids.size() > MAX_DETAIL_IDS) {
            throw RecommendationException.badRequest("too_many_ids",
                    "ids 1 dan " + MAX_DETAIL_IDS + " tagacha bo'lishi kerak");
        }
        return service.details(viewer == null ? null : viewer.userId(), ids);
    }
}
```

`application.yml` — `app.recommendation:` ichiga (`retention-cron` yoniga):

```yaml
    feed:
      max-ids: ${REC_FEED_MAX_IDS:1000}
      snapshot-ttl: ${REC_FEED_SNAPSHOT_TTL:30m}
      meta-boost: ${REC_FEED_META_BOOST:1.5}
      profile-limit: ${REC_FEED_PROFILE_LIMIT:50}
      interest-window: ${REC_FEED_INTEREST_WINDOW:30d}
```

- [ ] **Step 6: Testlar o'tishini ko'ring**

Run: `cd backend/recommendation-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"`
Expected: BUILD SUCCESS — `ProfileHashTest` 3, `ProfileServiceTest` 2, `FeedServiceTest` 9, `RedisFeedCacheTest` 4, `FeedControllerTest` 3, `ProfileRepositoryIT` 5, `FeedRankerIT` 3; oldingi task testlari ham yashil.

- [ ] **Step 7: Commit**

```bash
git add backend/recommendation-service
git commit -m "feat(recommendation): Mening qiziqishlarim lentasi — profil, tartib, sessiya snapshot'i"
```

---
### Task 7: Infra — compose, nginx, CI, deploy, Prometheus

**Files:**
- Modify: `docker-compose.yml` (access-service blokidan keyin yangi servis)
- Modify: `nginx/nginx.conf` (card-interest rate-limit kaliti)
- Modify: `nginx/conf.d/backends.inc` (`$backend_rec`)
- Modify: `nginx/conf.d/efbazaar.conf` (443 dagi 503 bloki → proxy; 8080 ichki blokka ham)
- Modify: `.github/workflows/build.yml`, `.github/workflows/ci.yml`
- Modify: `deploy.sh` (`RECOMMENDATION_DB_NAME`, `recommendation_bootstrap`)
- Modify: `infra/prometheus/prometheus.yml` (target)
- Modify: `backend/auth-service/src/main/resources/application.yml` (faqat ulanish byudjeti izohi)

**Interfaces:**
- Consumes: servis porti 8083, `/actuator/health`, `/actuator/prometheus` (Task 1); env nomlari `POSTGRES_*`, `RECOMMENDATION_DB_NAME`, `REDIS_*`, `CARD_INTEREST_HMAC_SECRET`, `KAFKA_BOOTSTRAP_SERVERS`, `APP_DEBUG_ERRORS`.
- Produces: `https://efbazaar.uz/api/rec/v1/...` va ichki `http://nginx:8080/api/rec/v1/...` → servisning `/api/v1/...`; identity headerlar `X-User-Id`, `X-User-Roles`; `X-Interest-Network: $remote_addr`.

Bu task'da Java testi yo'q — tekshiruv har qadamdagi buyruqlar. Har o'zgarishdan keyin `git diff` ni ko'zdan kechiring.

- [ ] **Step 1: docker-compose.yml**

`access-service:` blokining oxiridan (`networks: - efbazaar-net`) keyin, `# ---------- Smart-admin worker (Plan C) ----------` izohidan OLDIN qo'shing:

```yaml
  # ---------- recommendation-service (lenta, player filtri, dream team, card interest) ----------
  # marketplace'dan faqat Kafka snapshot'lari orqali o'qiydi; uning bazasiga ulanmaydi.
  recommendation-service:
    image: ${IMAGE_REGISTRY:-ghcr.io}/${IMAGE_NAMESPACE:-abdurahmoniy/efbazaar}-recommendation-service:${IMAGE_TAG:-latest}
    build:
      context: ./backend/recommendation-service
    container_name: efbazaar-recommendation
    restart: unless-stopped
    logging: *default-logging
    environment:
      JAVA_OPTS: "-Xms64m -Xmx200m -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -XX:+ExitOnOutOfMemoryError -Djava.security.egd=file:/dev/./urandom"
      SPRING_PROFILES_ACTIVE: ${SPRING_PROFILES_ACTIVE}
      POSTGRES_HOST: ${POSTGRES_HOST}
      POSTGRES_PORT: ${POSTGRES_PORT}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${RECOMMENDATION_DB_NAME:-recommendation_db}
      REDIS_HOST: ${REDIS_HOST}
      REDIS_PORT: ${REDIS_PORT}
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      # marketplace bilan BIR XIL qiymat — card interest dedupe va 30 kunlik tarix umumiy.
      CARD_INTEREST_HMAC_SECRET: ${CARD_INTEREST_HMAC_SECRET}
      KAFKA_BOOTSTRAP_SERVERS: ${KAFKA_BOOTSTRAP_SERVERS}
      APP_DEBUG_ERRORS: ${APP_DEBUG_ERRORS:-false}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      kafka:
        condition: service_started
    mem_limit: 300m
    memswap_limit: 400m
    networks:
      - efbazaar-net
```

Run: `docker compose --env-file .env.example config --services | grep -x recommendation-service`
Expected: `recommendation-service`.

- [ ] **Step 2: nginx — backend, rate-limit, marshrutlar**

`nginx/conf.d/backends.inc` — `set $backend_access ...` qatoridan keyin:

```nginx
set $backend_rec         "recommendation-service:8083";
```

`nginx/nginx.conf` — card-interest kaliti endi ikkala yo'lni ham sanaydi:

```nginx
        ~^/api/(marketplace/|rec/)?v1/card-interest/apply(\?|$) $binary_remote_addr;
```
(eski qator: `~^/api/(marketplace/)?v1/card-interest/apply(\?|$) $binary_remote_addr;`)

`nginx/conf.d/efbazaar.conf` — 443 server'idagi butun `# ---------- /api/rec/ ----------` bloki (izoh + `location /api/rec/ { ... return 503 ... }`) quyidagiga almashtiriladi:

```nginx
    # ---------- recommendation-service (auth ixtiyoriy) ----------
    # Mehmon ham o'tadi: lenta unga bo'sh, player filtri ishlaydi. Dream team va
    # admin sonlari uchun ruxsatni servisning o'zi tekshiradi.
    location /api/rec/ {
        limit_req zone=card_interest burst=4 nodelay;
        limit_req_status 429;

        auth_request /_auth_verify;
        error_page 401 = @rec_anon;

        auth_request_set $user_id      $upstream_http_x_user_id;
        auth_request_set $user_roles   $upstream_http_x_user_roles;

        proxy_set_header X-User-Id     $user_id;
        proxy_set_header X-User-Roles  $user_roles;
        proxy_set_header X-Interest-Network $remote_addr;

        rewrite ^/api/rec/(.*)$ /api/$1 break;
        proxy_pass http://$backend_rec$uri$is_args$args;
        include /etc/nginx/conf.d/proxy-common.inc;
    }

    location @rec_anon {
        # Identity headerlarni tozalash — spoofing himoyasi.
        proxy_set_header X-User-Id     "";
        proxy_set_header X-User-Roles  "";
        proxy_set_header X-Interest-Network $remote_addr;

        rewrite ^/api/rec/(.*)$ /api/$1 break;
        proxy_pass http://$backend_rec$uri$is_args$args;
        include /etc/nginx/conf.d/proxy-common.inc;
    }
```

Xuddi shu fayldagi ichki `listen 8080;` server'ida, `location @access_anon_internal { ... }` blokidan keyin qo'shing (SSR shu yo'l bilan chiqadi):

```nginx
    # ---------- recommendation-service (SSR/frontend proxy target) ----------
    location /api/rec/ {
        auth_request /_auth_verify;
        error_page 401 = @rec_anon_internal;

        auth_request_set $user_id      $upstream_http_x_user_id;
        auth_request_set $user_roles   $upstream_http_x_user_roles;

        proxy_set_header X-User-Id     $user_id;
        proxy_set_header X-User-Roles  $user_roles;
        proxy_set_header X-Interest-Network $remote_addr;

        rewrite ^/api/rec/(.*)$ /api/$1 break;
        proxy_pass http://$backend_rec$uri$is_args$args;
        include /etc/nginx/conf.d/proxy-common.inc;
    }

    location @rec_anon_internal {
        proxy_set_header X-User-Id     "";
        proxy_set_header X-User-Roles  "";
        proxy_set_header X-Interest-Network $remote_addr;

        rewrite ^/api/rec/(.*)$ /api/$1 break;
        proxy_pass http://$backend_rec$uri$is_args$args;
        include /etc/nginx/conf.d/proxy-common.inc;
    }
```

Run: `grep -c 'backend_rec' nginx/conf.d/efbazaar.conf nginx/conf.d/backends.inc; grep -n 'recommendation_service_unavailable' nginx/conf.d/efbazaar.conf`
Expected: `efbazaar.conf:4`, `backends.inc:1`; ikkinchi `grep` bo'sh.

Run (sintaksis, sertifikatsiz):
```bash
docker run --rm -v "$PWD/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" -v "$PWD/nginx/conf.d:/etc/nginx/conf.d:ro" \
  --add-host recommendation-service:127.0.0.1 nginx:1.27-alpine nginx -t 2>&1 | tail -3
```
Expected: `syntax is ok` qatori bor. Sertifikat fayli topilmadi (`cannot load certificate`) degan xato chiqsa — bu muhit cheklovi, sintaksis emas; u holda `nginx -T` chiqishida `@rec_anon` va `@rec_anon_internal` borligini tekshiring va reportda yozing.

- [ ] **Step 3: CI — build.yml va ci.yml**

`.github/workflows/build.yml` — `filters:` ichida `access:` blokidan keyin:

```yaml
            recommendation:
              - 'backend/recommendation-service/**'
              - '!**/*.md'
```

`build-matrix` qadamida `access-service` qatoridan keyin:

```bash
          if changed "${{ steps.filter.outputs.recommendation }}";         then add recommendation-service backend/recommendation-service backend/recommendation-service/Dockerfile recommendation-service; fi
```

`.github/workflows/ci.yml`:
- `outputs:` ichida `access: ${{ steps.filter.outputs.access }}` dan keyin: `      recommendation: ${{ steps.filter.outputs.recommendation }}`
- `set_output access ...` dan keyin: `          set_output recommendation 'backend/recommendation-service/'`
- `add_java access-service ...` qatoridan keyin:

```bash
          if [ "${{ steps.filter.outputs.recommendation }}" = "true" ]; then add_java recommendation-service backend/recommendation-service; fi
```

Run: `python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]; print('ok')" .github/workflows/build.yml .github/workflows/ci.yml`
Expected: `ok`.

- [ ] **Step 4: deploy.sh**

`upsert_env .env ACCESS_DB_NAME             access_db` qatoridan keyin:

```bash
  upsert_env .env RECOMMENDATION_DB_NAME     recommendation_db
```

`access_bootstrap() { ... }` funksiyasidan keyin:

```bash
# ─── Recommendation-service bootstrap ───────────────────────────────────────
# recommendation_db ni yaratadi (yo'q bo'lsa). 2026-08-23 da o'chirilgan eski
# recommendation-service ham shu nomdagi bazani ishlatgan: undan jadval qolgan
# bo'lsa Flyway V1 ni qo'llamaydi va servis crash-loop'ga tushadi. Hech narsa
# o'chirilmaydi — faqat deploy logida aniq ko'rsatiladi; tozalash qo'lda
# (backend/recommendation-service/README.md → "Eski baza").
# ─────────────────────────────────────────────────────────────────────────────
recommendation_bootstrap() {
  local rec_db="${RECOMMENDATION_DB_NAME:-recommendation_db}"

  ensure_db "$rec_db"

  local foreign
  foreign=$(docker compose exec -T postgres psql -U efbazaar -d "$rec_db" -tAc "
      SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name NOT IN ('flyway_schema_history', 'listings_view', 'listing_cards_view',
                               'cards_view', 'user_likes', 'dream_teams', 'user_card_interest',
                               'consumed_events')" 2>/dev/null || echo "?")
  if [[ "$foreign" != "0" ]]; then
    echo "!! $rec_db da recommendation-service'ga tegishli bo'lmagan jadval(lar) bor: $foreign"
    echo "!! Flyway V1 qo'llanmasligi mumkin. Ko'ring: backend/recommendation-service/README.md → 'Eski baza'"
  fi
}
```

`access_bootstrap` chaqiruvidan keyin:

```bash
recommendation_bootstrap
```

Run: `bash -n deploy.sh && grep -n 'recommendation_bootstrap' deploy.sh`
Expected: sintaksis xatosiz; ta'rif va chaqiruv — 2 qator.

- [ ] **Step 5: Prometheus va ulanish byudjeti**

`infra/prometheus/prometheus.yml` — `job_name: efbazaar` target'lari ichida `- marketplace-service:8082` dan keyin:

```yaml
          - recommendation-service:8083
```

`backend/auth-service/src/main/resources/application.yml` — byudjet izohidagi ikki qator:

```yaml
    # Joriy taqsimot (jami 40, qolgan 10 — admin, backup, psql uchun):
    #   auth 6 | marketplace 8 (+cards 4) | trade 8 | payment 6 | access 4 | recommendation 4
```
(eski: `jami 36, qolgan 14` va `... | access 4`).

Run: `grep -n 'recommendation' infra/prometheus/prometheus.yml backend/auth-service/src/main/resources/application.yml`
Expected: 2 qator.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml nginx .github/workflows/build.yml .github/workflows/ci.yml deploy.sh \
        infra/prometheus/prometheus.yml backend/auth-service/src/main/resources/application.yml
git commit -m "chore(infra): recommendation-service — compose, nginx /api/rec, CI, deploy, Prometheus"
```

---

### Task 8: Ops skriptlari va hujjatlar

**Files:**
- Create: `scripts/rec-copy-dream-teams.sh`, `scripts/rec-verify-projection.sh`, `scripts/rec-compare-match.sh`
- Create: `backend/recommendation-service/README.md`
- Modify: `docs/kafka-topics.md`, `README.md`, `CLAUDE.md`, `nginx/README.md`, `backend/marketplace-service/README.md` ("Rejada" izohi), `docs/superpowers/specs/2026-09-30-recommendation-service-design.md` (holat qatori)

**Interfaces:**
- Consumes: container nomi `efbazaar-postgres`, bazalar `marketplace_db` / `recommendation_db` (env `MARKETPLACE_DB_NAME`, `RECOMMENDATION_DB_NAME`), `dream_teams` ikkala bazada bir xil ustunlar (Task 1), public yo'llar `/api/marketplace/v1/listings`, `/api/rec/v1/match` (Task 7).

- [ ] **Step 1: dream team ko'chirish skripti**

`scripts/rec-copy-dream-teams.sh`:

```bash
#!/usr/bin/env bash
# marketplace_db.dream_teams → recommendation_db.dream_teams.
#
# Takrorlansa zararsiz: bir foydalanuvchi uchun YANGIROQ updated_at g'olib.
# B deploy'dan keyin bir marta, C (frontend) deploy'idan oldin yana bir marta
# ishga tushiriladi — oradagi o'zgarishlar ham o'tadi.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC_DB="${MARKETPLACE_DB_NAME:-marketplace_db}"
DST_DB="${RECOMMENDATION_DB_NAME:-recommendation_db}"

read -r -d '' SCRIPT <<'SH' || true
set -eu
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$SRC_DB" \
  -c "\copy (SELECT id, user_id, name, formation, slots, created_at, updated_at FROM dream_teams) TO STDOUT WITH CSV" \
| psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$DST_DB" \
  -c "CREATE TEMP TABLE incoming (LIKE dream_teams)" \
  -c "\copy incoming FROM STDIN WITH CSV" \
  -c "INSERT INTO dream_teams SELECT * FROM incoming
      ON CONFLICT (user_id) DO UPDATE
         SET id = EXCLUDED.id, name = EXCLUDED.name, formation = EXCLUDED.formation,
             slots = EXCLUDED.slots, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
       WHERE dream_teams.updated_at < EXCLUDED.updated_at" \
  -c "SELECT (SELECT count(*) FROM incoming) AS marketplace_rows, (SELECT count(*) FROM dream_teams) AS recommendation_rows"
SH

docker exec -i -e SRC_DB="$SRC_DB" -e DST_DB="$DST_DB" efbazaar-postgres sh -c "$SCRIPT"
```

- [ ] **Step 2: projection solishtirish skripti**

`scripts/rec-verify-projection.sh`:

```bash
#!/usr/bin/env bash
# Replay'dan keyin: marketplace manbasi va recommendation projection'i qatorlar soni bo'yicha.
# Farq bo'lsa 1 bilan chiqadi. Faqat o'qiydi.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC_DB="${MARKETPLACE_DB_NAME:-marketplace_db}"
DST_DB="${RECOMMENDATION_DB_NAME:-recommendation_db}"

q() { docker exec -i efbazaar-postgres sh -c "psql -U \"\$POSTGRES_USER\" -d $1 -tAc \"$2\""; }

check() {
  local name="$1" left="$2" right="$3"
  local status="OK"
  [[ "$left" == "$right" ]] || { status="FARQ"; FAILED=1; }
  printf '%-22s marketplace=%-8s recommendation=%-8s %s\n' "$name" "$left" "$right" "$status"
}

FAILED=0
check "e'lonlar (jami)"   "$(q "$SRC_DB" "SELECT count(*) FROM listings")" \
                          "$(q "$DST_DB" "SELECT count(*) FROM listings_view")"
check "e'lonlar (ACTIVE)" "$(q "$SRC_DB" "SELECT count(*) FROM listings WHERE status = 'ACTIVE'")" \
                          "$(q "$DST_DB" "SELECT count(*) FROM listings_view WHERE status = 'ACTIVE'")"
check "e'lon kartalari"   "$(q "$SRC_DB" "SELECT count(*) FROM listing_cards")" \
                          "$(q "$DST_DB" "SELECT count(*) FROM listing_cards_view")"
check "like'lar"          "$(q "$SRC_DB" "SELECT count(*) FROM listing_likes")" \
                          "$(q "$DST_DB" "SELECT count(*) FROM user_likes WHERE liked")"
echo "kartalar (cards_view): $(q "$DST_DB" "SELECT count(*) FROM cards_view")"
exit "$FAILED"
```

- [ ] **Step 3: match solishtirish skripti**

`scripts/rec-compare-match.sh`:

```bash
#!/usr/bin/env bash
# Bir xil player filtri uchun marketplace va recommendation natijasini solishtiradi (ID to'plami).
# Tartib ataylab solishtirilmaydi: marketplace teng ballarni created_at bilan, recommendation
# value_score bilan ajratadi (B rejasi, P2).
#
#   scripts/rec-compare-match.sh '<efhubId>:<playerId>:N' ['<efhubId>:<playerId>:P' ...] [-s 4]
#
# Kerak: curl, jq. Default host https://efbazaar.uz (BASE_URL bilan o'zgartiriladi).
set -euo pipefail

BASE_URL="${BASE_URL:-https://efbazaar.uz}"
STRICTNESS=4
CARDS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s) STRICTNESS="$2"; shift 2 ;;
    *)  CARDS+=("$1"); shift ;;
  esac
done
[[ ${#CARDS[@]} -gt 0 ]] || { echo "kamida bitta matchCard kerak" >&2; exit 2; }

QS="matchStrictness=$STRICTNESS"
for c in "${CARDS[@]}"; do QS+="&matchCard=$(jq -rn --arg v "$c" '$v|@uri')"; done

market=$(curl -fsS "$BASE_URL/api/marketplace/v1/listings?$QS&size=1000" | jq -r '.content[].id' | sort)
rec=$(curl -fsS "$BASE_URL/api/rec/v1/match?$QS" | jq -r '.ids[]' | sort)

echo "marketplace: $(printf '%s' "$market" | grep -c . || true)  recommendation: $(printf '%s' "$rec" | grep -c . || true)"
if diff <(printf '%s\n' "$market") <(printf '%s\n' "$rec") >/dev/null; then
  echo "OK — ID to'plamlari bir xil"
else
  echo "FARQ (< faqat marketplace, > faqat recommendation):"
  diff <(printf '%s\n' "$market") <(printf '%s\n' "$rec") || true
  exit 1
fi
```

```bash
chmod +x scripts/rec-copy-dream-teams.sh scripts/rec-verify-projection.sh scripts/rec-compare-match.sh
bash -n scripts/rec-copy-dream-teams.sh scripts/rec-verify-projection.sh scripts/rec-compare-match.sh
```
Expected: sintaksis xatosiz.

- [ ] **Step 4: Servis README**

`backend/recommendation-service/README.md`:

```markdown
# recommendation-service

"Kimga qaysi akkount mos" — bozorning **Mening qiziqishlarim** lentasi, player filtri (match),
dream team va card interest. Faqat **tartiblaydi**: qaysi e'lon, qanday tartibda, nega mos.
Filtr, sahifalash va e'lon ko'rinishi marketplace'da (`POST /api/v1/listings/ranked`);
ikkalasini frontend birlashtiradi. marketplace'ni HTTP orqali chaqirmaydi.

Dizayn: [spec](../../docs/superpowers/specs/2026-09-30-recommendation-service-design.md).

| | |
|---|---|
| Port | 8083 |
| Public yo'l | `/api/rec/**` → `/api/**` (auth ixtiyoriy; mehmonga lenta bo'sh) |
| DB | `RECOMMENDATION_DB_NAME` (`recommendation_db`), Hikari 4 |
| Redis | lenta snapshot'i `rec:feed:{userId}:{profileHash}` (30 daq.); card interest `card-interest:*` (marketplace bilan umumiy) |
| Kafka | o'qiydi: `listing-snapshot`, `card-snapshot`, `like-toggled` (group `recommendation-service`); xato → `<topic>.DLT` |

## API (`/api/v1/...`)

| Endpoint | Javob |
|---|---|
| `GET /feed[?profileHash=]` | `{ empty, profileHash, ids }` — sessiya snapshot'idagi to'liq tartib (≤1000). Keyingi sahifalarda birinchi javobdagi `profileHash` qaytariladi |
| `GET /feed/details?ids=` | `{ id: MatchDetails }` — joriy profil bo'yicha "nega mos" (≤100 ID) |
| `GET /match?matchCard=..&matchStrictness=..` | `{ ids }` — player filtri, chegaradan o'tgan ACTIVE e'lonlar (≤1000). Eski `dream_team`/`dream_team_min_match` ham qabul qilinadi |
| `GET /match/details?ids=..&matchCard=..` | `{ id: MatchDetails }` (≤100 ID) |
| `GET /match/{listingId}?matchCard=..` | `MatchDetails`; projection'da yo'q e'lon → 404 |
| `GET/POST /dream-teams`, `GET/PUT /dream-teams/{id}`, `PUT /dream-teams/me` | marketplace'dagi shartnoma 1:1 (login shart) |
| `POST /card-interest/apply` | marketplace'dagi shartnoma 1:1; login qilgan bo'lsa `user_card_interest` ga ham yoziladi |
| `GET /card-interest/counts?ids=` | `{ efhubId: { days7, days30 } }` — faqat `ROLE_ADMIN` (≤200 ID) |

`matchCard` formati `efhubId:playerId:N|P`; `matchStrictness` 1..10 (1 = istalgan moslik).
Ball: exact karta 1.0, shu o'yinchining boshqa kartasi 0.75; og'irlik N=1, P=3.
Tartib: `score DESC, value_score DESC NULLS LAST, listing_id` (marketplace'da ikkinchi kalit
`created_at` edi — projection'da yo'q va "eng yangi tepada" tartibidan voz kechilgan).

## Lenta

Profil so'rov paytida yig'iladi: dream team sloti (1 yoki 3) + like bosilgan e'londagi har karta (+1)
+ oxirgi 30 kundagi card interest (+1); bir xil karta yig'iladi; faol META × 1.5; eng og'ir 50 ta.
E'lon bali `Σ og'irlik × kredit`, tartib `ball DESC, value_score DESC NULLS LAST, id`.
Chiqariladi: ACTIVE bo'lmagan, o'z e'loni, allaqachon like bosilgan, ball 0.
`profileHash` = profilning sha256; o'sha hash bilan kelgan so'rov snapshot tirik bo'lsa aynan o'sha
ro'yxatni oladi — sessiya ichida tartib o'zgarmaydi. Redis o'chiq bo'lsa har so'rov joyida hisoblanadi.

Konfiguratsiya: `app.recommendation.feed.*` (`REC_FEED_MAX_IDS`, `REC_FEED_SNAPSHOT_TTL`,
`REC_FEED_META_BOOST`, `REC_FEED_PROFILE_LIMIT`, `REC_FEED_INTEREST_WINDOW`).

## Jadvallar

| Jadval | Manba |
|---|---|
| `listings_view`, `listing_cards_view` | `listing-snapshot` (kartalar har snapshot'da to'liq almashadi) |
| `cards_view` | `card-snapshot` |
| `user_likes` | `like-toggled` (unlike → `liked = false`) |
| `dream_teams` | o'zi (marketplace'dan bir martalik ko'chirish — pastda) |
| `user_card_interest` | `POST /card-interest/apply` (login qilgan); 90 kun |
| `consumed_events` | barcha consumerlar; 30 kun |

Takror va tartibsiz xabar: `consumed_events` (aynan shu xabar) + `version` (eski holat) to'sadi.
Tozalash — `RetentionJob` (`REC_RETENTION_CRON`, default `0 30 3 * * *` UTC).

## Env

`POSTGRES_*`, `RECOMMENDATION_DB_NAME`, `REDIS_*`, `KAFKA_BOOTSTRAP_SERVERS`,
`CARD_INTEREST_HMAC_SECRET` (**shart**, marketplace bilan bir xil — bo'sh bo'lsa servis ishga tushmaydi),
`APP_DEBUG_ERRORS`, `LOG_KAFKA_FORWARD_ENABLED`.

## Ehtiyot bo'ling

- **Replay'dan oldin `cards_view` bo'sh** — har `matchCard` va dream team saqlash 400 qaytaradi.
  Frontend'ni ulashdan oldin replay va tekshiruv (pastda) shart.
- **Eski baza.** 2026-08-23 da o'chirilgan eski recommendation-service ham `recommendation_db` ni ishlatgan.
  Unda begona jadval qolgan bo'lsa Flyway V1 qo'llanmaydi (`baseline-on-migrate` ataylab o'chiq) va
  servis crash-loop'ga tushadi; `deploy.sh` buni logda ko'rsatadi. Tekshirish:
  `docker exec efbazaar-postgres psql -U efbazaar -d recommendation_db -c '\dt'`.
  Jadvallar keraksiz ekaniga ishonch hosil qilingach (va faqat shunda) bazani qayta yaratish:
  `dropdb` + `createdb` — bu qo'lda, ma'lumotni yo'qotadigan amal.
- **HMAC secret** marketplace bilan farq qilsa card interest dedupe va 30 kunlik sonlar ikkiga bo'linadi.
- Ulanish byudjeti — `backend/auth-service/src/main/resources/application.yml` izohida.

## Birinchi deploy (runbook)

1. Deploy (`recommendation-service` qorong'i: frontend hali chaqirmaydi). Loglarda Flyway V1 va
   `Started RecommendationApplication` borligini tekshiring.
2. Replay — marketplace barcha e'lon, karta va like'ni qayta yuboradi:
   `docker exec efbazaar-marketplace wget -qO- --post-data='' --header="X-Internal-Secret: $INTERNAL_API_SECRET" http://localhost:8082/internal/marketplace/v1/rec/replay`
3. Bir necha daqiqadan keyin: `scripts/rec-verify-projection.sh` — hammasi `OK`.
4. Dream team'lar: `scripts/rec-copy-dream-teams.sh` (C deploy'idan oldin yana bir marta).
5. Player filtri: bir nechta haqiqiy `matchCard` bilan `scripts/rec-compare-match.sh` — `OK`.
```

- [ ] **Step 5: Umumiy hujjatlar**

`docs/kafka-topics.md` — `## marketplace` jadvalida uch qatorning "Consumer(lar)" ustuni `recommendation (B bosqichidan)` → `recommendation (projection; xato → `<topic>.DLT`)`.

`README.md` — komponentlar jadvalida `access-service` qatoridan keyin:

```markdown
| recommendation-service | `backend/recommendation-service` | Spring Boot | 8083 | `/api/rec/**` | [README](backend/recommendation-service/README.md) |
```
va "Ma'lumotlar" bo'limida bazalar ro'yxati: `auth, marketplace, trade, payment, access, recommendation`.

`CLAUDE.md`:
- Repo strukturasida `access-service/` qatoridan keyin:
  `│   ├── recommendation-service/ # Lenta, player filtri (match), dream team, card interest — Spring Boot, port 8083`
  (`access-service` qatoridagi `└──` ni `├──` ga, yangisini `└──` ga moslang).
- "Servislar va portlar" jadvalida `auth-service` va `marketplace-service` orasiga (port tartibida, 8082 dan keyin):
  `| recommendation-service | 8083 | /api/rec/** (auth ixtiyoriy; marketplace bilan faqat Kafka) |`

`nginx/README.md` — marshrutlar jadvalidagi `/api/rec/**` qatori:
`| `/api/rec/**` | recommendation-service | ixtiyoriy (token yo'q → `@rec_anon`, identity headerlar tozalanadi) |`

`backend/marketplace-service/README.md` — "**Rejada:** dream team, card match va card interest ..." izohi:

```markdown
> **Ko'chirilmoqda:** dream team, card match va card interest `recommendation-service` da ham bor
> (B bosqichi, qorong'i). Frontend C bosqichida unga o'tadi, D bosqichida bu yerdan o'chiriladi —
> shu orada bu qismlarga o'zgartirish ikkala servisda ham kerak bo'ladi.
```

`docs/superpowers/specs/2026-09-30-recommendation-service-design.md` — 3-qator holati:
`Sana: 2026-09-30 · Holat: A (marketplace) va B (recommendation-service, qorong'i) bajarilgan; C, D — navbatda`.

- [ ] **Step 6: Tekshiruv va commit**

Run: `git diff --check && grep -rn 'recommendation (B bosqichidan)' docs/kafka-topics.md`
Expected: `git diff --check` xatosiz; `grep` bo'sh.

```bash
git add scripts/rec-copy-dream-teams.sh scripts/rec-verify-projection.sh scripts/rec-compare-match.sh \
        backend/recommendation-service/README.md docs/kafka-topics.md README.md CLAUDE.md nginx/README.md \
        backend/marketplace-service/README.md docs/superpowers/specs/2026-09-30-recommendation-service-design.md
git commit -m "docs(recommendation): README, runbook, ops skriptlari, topic va servis jadvallari"
```

---

## Yakuniy tekshiruv (oxirgi task'dan keyin)

```bash
cd backend/recommendation-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"
cd ../marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"   # marketplace tegilmagan — regressiya yo'qligini tasdiqlash
cd ../auth-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q verify -DargLine="-Dapi.version=1.44"          # faqat izoh o'zgargan
cd ../../ && docker build -t efbazaar-rec-final backend/recommendation-service
git diff --check origin/main...HEAD
git status --short   # crypto_vectors.json o'zgargan bo'lsa: git checkout smart-admin-worker/tests/fixtures/crypto_vectors.json
```

Merge'dan keyingi qadamlar — servis README'sidagi "Birinchi deploy (runbook)".
