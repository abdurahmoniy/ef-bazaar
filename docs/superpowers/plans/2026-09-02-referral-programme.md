# Referral Programme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every user gets an invite link; whoever joins through it and completes their first trade earns the referrer a configurable reward, paid into their wallet and visible to admins as a leaderboard.

**Architecture:** marketplace-service owns referral codes, the referral graph and the reward trigger. trade-service publishes a new `trade-succeeded` event. payment-service posts the reward to the ledger. The frontend captures the code from the URL before registration and claims it after.

**Tech Stack:** Java 21, Spring Boot 3.x, PostgreSQL 16 + Flyway, Kafka, Next.js + Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-partners-and-referrals-design.md` (§3.1, §4.4, §5, §7.2, §7.4, §7.6)

## Global Constraints

- **Flyway `V<n>__*.sql` files are immutable once merged.** Next free number in marketplace-service is **V41**, in payment-service **V11**. Never edit a merged V file — add a new one. CI job `guard-migrations` blocks the PR otherwise.
- **`sellerId`/`userId` never comes from a request body** — only from `X-User-Id`, surfaced as `@AuthenticationPrincipal AuthenticatedUser user` → `user.userId()`.
- **Services never touch another service's database.** Cross-service reads go over the `/internal` HTTP APIs or Kafka.
- **Kafka topics are `efbazaar.<service>.<event>`**, lower case, hyphenated.
- **Kafka events published from inside a `@Transactional` method must fire after commit** via `TransactionSynchronizationManager.registerSynchronization(...)`. `BotSettingsService.touch` is the reference implementation.
- **Never write `api.version` into a pom or config file.** Command line only.
- **No "Generated with Claude" or `Co-Authored-By: Claude` in commits, PRs or code.**
- **Never stage `frontend/package-lock.json`** unless `frontend/package.json` changed in the same commit — then it must be staged.
- **Money is `long` tiyin in payment-service and `BigDecimal` so'm in marketplace-service.** 1 so'm = 100 tiyin. Convert at the client boundary, as `PartnerFeeClient` does.
- **Nested `@Repository` interfaces are supported** — `NestedJpaRepositoriesConfig` sets `considerNestedRepositories = true`. Follow the `PartnerRepositories` holder-class pattern.
- **Java build:** `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test` from the service directory. The ambient JDK 25 fails on Lombok.
- **Frontend tests:** `npm test` (vitest) from `frontend/`.
- **UI copy is Uzbek.** Match the tone of the existing partner screens.

---

## File Structure

**marketplace-service** — new package `uz.efbazaar.marketplace.referral`:

| File | Responsibility |
|---|---|
| `db/migration/V41__referrals.sql` | The three tables |
| `referral/Referral.java` | The graph edge: who referred whom, and whether it paid |
| `referral/ReferralCode.java` | One user, one code |
| `referral/ReferralSettings.java` | Single-row reward amount |
| `referral/ReferralRepositories.java` | Holder class with the three nested repositories |
| `referral/ReferralCodeService.java` | Issues and resolves codes |
| `referral/ReferralService.java` | Claiming, the reward decision, admin reads |
| `referral/ReferralRewardClient.java` | marketplace → payment |
| `referral/ReferralDtos.java` | Request/response records |
| `referral/ReferralController.java` | `/api/v1/referrals` — the user's own |
| `referral/AdminReferralController.java` | `/api/v1/admin/referrals` |
| `kafka/TradeSucceededConsumer.java` | Fires the reward |
| `kafka/TradeSucceededDto.java` | Event payload |

**trade-service:** `kafka/TradeEvents.java`, `kafka/TradeEventPublisher.java`, `trade/service/TradeStateHandler.java`.

**payment-service:** `db/migration/V11__referral_reward_kind.sql`, `wallet/domain/TransactionKind.java`, new package `uz.efbazaar.payment.referral` with `ReferralRewardService` and `InternalReferralRewardController`.

**frontend:** `src/lib/referral-capture.ts`, `src/lib/referrals.ts`, `src/components/referral/referral-capture.tsx`, `src/components/referral/invite-panel.tsx`, `src/app/invite/page.tsx`, `src/components/admin/admin-referrals.tsx`, `src/app/admin/referrals/page.tsx`, plus edits to `src/app/layout.tsx` and `src/components/admin/admin-shell.tsx`.

---

### Task 1: Referral schema and entities

**Files:**
- Create: `backend/marketplace-service/src/main/resources/db/migration/V41__referrals.sql`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ReferralCode.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/Referral.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ReferralSettings.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ReferralRepositories.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/referral/ReferralSchemaIT.java`

**Interfaces:**
- Produces: `ReferralCode(userId, code, createdAt)`, `Referral(referredUserId, referrerUserId, partnerChannelId, createdAt, rewardedAt, rewardSom)`, `ReferralSettings(id, rewardSom, updatedAt, updatedBy)`, and `ReferralRepositories.{ReferralCodeRepository, ReferralRepository, ReferralSettingsRepository}`.

- [ ] **Step 1: Write the migration**

`V41__referrals.sql`:

```sql
-- Referal dasturi. Hamkorlikdan mustaqil: taklif qilish har bir
-- foydalanuvchining imkoniyati, hamkor esa shunchaki kanali bor odam.

-- Har foydalanuvchiga bitta taklif kodi. Kod tasodifiy: ismdan
-- yasalgani kanal/ism o'zgarganda buziladi, ketma-ket raqam esa
-- birovning kodini taxmin qilishga imkon beradi.
CREATE TABLE user_referral_codes (
    user_id    uuid        PRIMARY KEY,
    code       text        NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Mukofot summasi. Bitta qatorli sozlama — partner_settings kabi.
CREATE TABLE referral_settings (
    id         smallint      PRIMARY KEY,
    reward_som numeric(14,2) NOT NULL,
    updated_at timestamptz   NOT NULL DEFAULT now(),
    updated_by uuid,

    CONSTRAINT chk_referral_settings_singleton CHECK (id = 1),
    CONSTRAINT chk_referral_settings_reward    CHECK (reward_som >= 0)
);
INSERT INTO referral_settings (id, reward_som) VALUES (1, 5000.00);

-- Kim kimni olib keldi.
--
-- referred_user_id PRIMARY KEY — "bitta ro'yxat, bitta referal"
-- qoidasi shu yerda, kodda emas. Ikkinchi taklif qiluvchi o'sha odamni
-- da'vo qila olmaydi, chunki baza qatorni qabul qilmaydi.
--
-- rewarded_at ayni paytda "faqat birinchi savdo" qorovuli ham: uni
-- birinchi muvaffaqiyatli savdo muhrlaydi, keyingilari muhrlangan
-- holda topadi. Foydalanuvchining savdolarini sanash bir haqiqatning
-- ikkinchi manbasi bo'lardi.
CREATE TABLE referrals (
    referred_user_id   uuid          PRIMARY KEY,
    referrer_user_id   uuid          NOT NULL,
    -- Hamkor kanali orqali kelgan bo'lsa. Ikkinchi bosqichgacha NULL.
    partner_channel_id uuid,
    created_at         timestamptz   NOT NULL DEFAULT now(),
    rewarded_at        timestamptz,
    reward_som         numeric(14,2),

    CONSTRAINT chk_referrals_not_self CHECK (referrer_user_id <> referred_user_id),
    -- To'langan bo'lsa summa ham bor: yarim yozilgan qator hisobotni
    -- jimgina buzadi.
    CONSTRAINT chk_referrals_reward_pair CHECK (
        (rewarded_at IS NULL     AND reward_som IS NULL)
     OR (rewarded_at IS NOT NULL AND reward_som IS NOT NULL))
);

CREATE INDEX idx_referrals_referrer ON referrals (referrer_user_id, created_at DESC);
```

- [ ] **Step 2: Write the failing test**

`ReferralSchemaIT.java` — copy the container/annotation preamble from `partner/AdminBadgeQueryIT.java` verbatim (same `@DataJpaTest`, `@Testcontainers`, `@TestPropertySource` block and the `Config` inner class), then:

```java
@Test
@DisplayName("a user cannot refer themselves")
void selfReferralRejected() {
    UUID me = UUID.randomUUID();
    assertThatThrownBy(() -> {
        referrals.saveAndFlush(new Referral(me, me, null));
    }).isInstanceOf(DataIntegrityViolationException.class);
}

@Test
@DisplayName("a second referrer cannot claim someone already referred")
void onePerReferredUser() {
    UUID referred = UUID.randomUUID();
    referrals.saveAndFlush(new Referral(referred, UUID.randomUUID(), null));

    Referral second = new Referral(referred, UUID.randomUUID(), null);
    assertThatThrownBy(() -> referrals.saveAndFlush(second))
            .isInstanceOf(DataIntegrityViolationException.class);
}

@Test
@DisplayName("a rewarded row must carry the amount that was paid")
void rewardedAtRequiresAmount() {
    Referral r = referrals.saveAndFlush(
            new Referral(UUID.randomUUID(), UUID.randomUUID(), null));
    r.setRewardedAt(Instant.now());   // amount left null
    assertThatThrownBy(() -> referrals.saveAndFlush(r))
            .isInstanceOf(DataIntegrityViolationException.class);
}

@Test
@DisplayName("the reward default is seeded")
void settingsSeeded() {
    assertThat(settings.findById(ReferralSettings.SINGLETON_ID))
            .get()
            .extracting(ReferralSettings::getRewardSom)
            .isEqualTo(new BigDecimal("5000.00"));
}
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ReferralSchemaIT
```

Expected: compilation failure — `Referral`, `ReferralSettings` and the repositories do not exist yet.

- [ ] **Step 4: Write the entities**

`ReferralCode.java`:

```java
package uz.efbazaar.marketplace.referral;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Foydalanuvchining taklif kodi. Birinchi so'ralganda yaratiladi. */
@Entity
@Table(name = "user_referral_codes")
@Getter
@Setter
@NoArgsConstructor
public class ReferralCode {

    @Id
    @Column(name = "user_id", nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID userId;

    @Column(nullable = false, unique = true, updatable = false)
    private String code;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public ReferralCode(UUID userId, String code) {
        this.userId = userId;
        this.code = code;
    }
}
```

`Referral.java`:

```java
package uz.efbazaar.marketplace.referral;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Kim kimni platformaga olib keldi.
 *
 * <p>{@code rewardedAt} ikki vazifani bajaradi: to'lov vaqtini yozadi va
 * "faqat birinchi savdo" qorovuli bo'lib turadi. Ikkinchi savdo uni
 * allaqachon muhrlangan holda topadi.
 */
@Entity
@Table(name = "referrals")
@Getter
@Setter
@NoArgsConstructor
public class Referral {

    @Id
    @Column(name = "referred_user_id", nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID referredUserId;

    @Column(name = "referrer_user_id", nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID referrerUserId;

    /** Hamkor kanali orqali kelgan bo'lsa. Ikkinchi bosqichgacha null. */
    @Column(name = "partner_channel_id", columnDefinition = "uuid")
    private UUID partnerChannelId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "rewarded_at")
    private Instant rewardedAt;

    @Column(name = "reward_som")
    private BigDecimal rewardSom;

    public Referral(UUID referredUserId, UUID referrerUserId, UUID partnerChannelId) {
        this.referredUserId = referredUserId;
        this.referrerUserId = referrerUserId;
        this.partnerChannelId = partnerChannelId;
    }
}
```

`ReferralSettings.java` — same shape as `PartnerSettings`:

```java
package uz.efbazaar.marketplace.referral;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Referal mukofoti — bitta qatorli sozlama jadvali. */
@Entity
@Table(name = "referral_settings")
@Getter
@Setter
@NoArgsConstructor
public class ReferralSettings {

    public static final short SINGLETON_ID = 1;

    @Id
    @Column(nullable = false, updatable = false)
    private Short id = SINGLETON_ID;

    @Column(name = "reward_som", nullable = false)
    private BigDecimal rewardSom;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "updated_by", columnDefinition = "uuid")
    private UUID updatedBy;
}
```

`ReferralRepositories.java`:

```java
package uz.efbazaar.marketplace.referral;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class ReferralRepositories {

    private ReferralRepositories() {}

    public interface ReferralCodeRepository extends JpaRepository<ReferralCode, UUID> {
        Optional<ReferralCode> findByCode(String code);
        boolean existsByCode(String code);
    }

    public interface ReferralRepository extends JpaRepository<Referral, UUID> {
        List<Referral> findByReferrerUserIdOrderByCreatedAtDesc(UUID referrerUserId);
        Page<Referral> findByReferrerUserIdOrderByCreatedAtDesc(UUID referrerUserId, Pageable pageable);
        long countByReferrerUserId(UUID referrerUserId);
    }

    public interface ReferralSettingsRepository extends JpaRepository<ReferralSettings, Short> {}
}
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ReferralSchemaIT
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Mutation-check the constraints**

Temporarily delete `CONSTRAINT chk_referrals_not_self` from the migration, drop the test database volume so Flyway reruns (`mvn test` uses a fresh Testcontainer, so just rerun), and confirm `selfReferralRejected` fails. Restore the line.

A constraint nobody has watched fail is a guess, not a guard.

- [ ] **Step 7: Commit**

```bash
git add backend/marketplace-service/src/main/resources/db/migration/V41__referrals.sql \
        backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/referral/
git commit -m "feat(referrals): the referral graph, codes and reward setting

referred_user_id is the primary key, so 'one registration, one referrer'
is enforced by the database rather than by a check somebody can forget.
rewarded_at doubles as the 'first trade only' guard: the first successful
trade stamps it and every later one finds it stamped, so nothing has to
count a user's trades."
```

---

### Task 2: Issuing and resolving codes

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ReferralCodeService.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/referral/ReferralCodeServiceTest.java`

**Interfaces:**
- Consumes: `ReferralRepositories.ReferralCodeRepository` (Task 1).
- Produces: `ReferralCodeService.codeFor(UUID userId) -> String` and `ReferralCodeService.resolve(String code) -> Optional<UUID>`.

- [ ] **Step 1: Write the failing test**

```java
package uz.efbazaar.marketplace.referral;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralCodeRepository;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReferralCodeServiceTest {

    private ReferralCodeRepository codes;
    private ReferralCodeService service;
    private Map<UUID, ReferralCode> stored;

    @BeforeEach
    void setUp() {
        codes = mock(ReferralCodeRepository.class);
        stored = new HashMap<>();
        when(codes.findById(any())).thenAnswer(i -> Optional.ofNullable(stored.get(i.getArgument(0))));
        when(codes.save(any(ReferralCode.class))).thenAnswer(i -> {
            ReferralCode c = i.getArgument(0);
            stored.put(c.getUserId(), c);
            return c;
        });
        when(codes.existsByCode(anyString())).thenReturn(false);
        service = new ReferralCodeService(codes);
    }

    @Test
    @DisplayName("the same user always gets the same code")
    void stableCode() {
        UUID user = UUID.randomUUID();
        assertThat(service.codeFor(user)).isEqualTo(service.codeFor(user));
    }

    @Test
    @DisplayName("different users get different codes")
    void distinctCodes() {
        assertThat(service.codeFor(UUID.randomUUID()))
                .isNotEqualTo(service.codeFor(UUID.randomUUID()));
    }

    @Test
    @DisplayName("a code is not derived from the user id")
    void codeIsNotGuessable() {
        UUID user = UUID.randomUUID();
        String code = service.codeFor(user);
        assertThat(user.toString().replace("-", "").toUpperCase())
                .doesNotContain(code);
    }

    @Test
    @DisplayName("a taken code is retried rather than issued twice")
    void retriesOnCollision() {
        when(codes.existsByCode(anyString())).thenReturn(true, false);
        assertThat(service.codeFor(UUID.randomUUID())).isNotBlank();
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ReferralCodeServiceTest
```

Expected: compilation failure — `ReferralCodeService` does not exist.

- [ ] **Step 3: Write the implementation**

```java
package uz.efbazaar.marketplace.referral;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralCodeRepository;

import java.security.SecureRandom;
import java.util.Optional;
import java.util.UUID;

/**
 * Taklif kodlarini beradi va yechadi.
 *
 * <p>Kod tasodifiy va foydalanuvchi identifikatoridan yasalmagan. Ismdan
 * yasalgan kod ism o'zgarganda buziladi; ketma-ket raqam esa birovning
 * kodini taxmin qilib, uning nomidan taklif qilishga imkon beradi.
 */
@Service
@RequiredArgsConstructor
public class ReferralCodeService {

    /** O'xshash belgilar (0/O, 1/I) yo'q — kod og'zaki ham uzatiladi. */
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int LENGTH = 8;
    private static final int MAX_ATTEMPTS = 10;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final ReferralCodeRepository codes;

    /** Foydalanuvchining kodi; birinchi murojaatda yaratiladi. */
    @Transactional
    public String codeFor(UUID userId) {
        return codes.findById(userId)
                .map(ReferralCode::getCode)
                .orElseGet(() -> codes.save(new ReferralCode(userId, freshCode())).getCode());
    }

    /** Kod egasini topadi. Noma'lum kod — bo'sh natija, xato emas. */
    @Transactional(readOnly = true)
    public Optional<UUID> resolve(String code) {
        if (code == null || code.isBlank()) return Optional.empty();
        return codes.findByCode(code.trim().toUpperCase()).map(ReferralCode::getUserId);
    }

    private String freshCode() {
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            String candidate = random();
            if (!codes.existsByCode(candidate)) return candidate;
        }
        // 32^8 ta variantdan keyin ham to'qnashuv — bu tasodif emas,
        // nosozlik. Jimgina takrorlanadigan kod berishdan ko'ra yiqilgani
        // yaxshi: takroriy kod ikki odamning referalini aralashtiradi.
        throw new IllegalStateException("Referal kodi yaratilmadi: " + MAX_ATTEMPTS + " urinish to'qnashdi");
    }

    private String random() {
        StringBuilder sb = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ReferralCodeServiceTest
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ReferralCodeService.java \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/referral/ReferralCodeServiceTest.java
git commit -m "feat(referrals): issue and resolve invite codes

Codes are random rather than derived from the user id. A derived code
would let anyone reconstruct somebody else's link and refer in their
name; a sequential one would let them guess it."
```

---

### Task 3: Claiming a referral

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ReferralService.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ReferralDtos.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ReferralController.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/referral/ReferralServiceTest.java`

**Interfaces:**
- Consumes: `ReferralCodeService.resolve` (Task 2), `ReferralRepositories.ReferralRepository` (Task 1), `AuthSummaryClient.resolve(UUID) -> Optional<UserSummary>` with `UserSummary.createdAt()`.
- Produces: `ReferralService.claim(UUID claimantId, String code) -> boolean` (true when a row was written), `ReferralService.myReferrals(UUID userId) -> MyReferralsResponse`, and the DTO records below.

- [ ] **Step 1: Write the failing test**

```java
package uz.efbazaar.marketplace.referral;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralSettingsRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import uz.efbazaar.marketplace.security.AuthSummaryClient.UserSummary;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Da'vo qoidalari.
 *
 * <p>Bu yerdagi xato birovning referalini o'g'irlaydi yoki eski
 * foydalanuvchini yangi deb hisoblab, hech kim olib kelmagan odam uchun
 * mukofot to'laydi.
 */
class ReferralServiceTest {

    private ReferralRepository referrals;
    private ReferralCodeService codes;
    private AuthSummaryClient users;
    private ReferralService service;

    private final UUID newcomer = UUID.randomUUID();
    private final UUID referrer = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        referrals = mock(ReferralRepository.class);
        codes = mock(ReferralCodeService.class);
        users = mock(AuthSummaryClient.class);
        service = new ReferralService(referrals, codes,
                mock(ReferralSettingsRepository.class), users, mock(ReferralRewardClient.class));

        when(codes.resolve("GOODCODE")).thenReturn(Optional.of(referrer));
        when(referrals.findById(newcomer)).thenReturn(Optional.empty());
        whenAccountAge(Duration.ofMinutes(2));
    }

    private void whenAccountAge(Duration age) {
        when(users.resolve(newcomer)).thenReturn(Optional.of(new UserSummary(
                newcomer, "Yangi", null, null, false, Instant.now().minus(age), false)));
    }

    @Test
    @DisplayName("a fresh account claims the code it arrived with")
    void claims() {
        assertThat(service.claim(newcomer, "GOODCODE")).isTrue();
        verify(referrals).save(any(Referral.class));
    }

    @Test
    @DisplayName("an account older than the window claims nothing")
    void tooOld() {
        whenAccountAge(Duration.ofDays(400));
        assertThat(service.claim(newcomer, "GOODCODE")).isFalse();
        verify(referrals, never()).save(any());
    }

    @Test
    @DisplayName("an already-referred user cannot be claimed again")
    void alreadyReferred() {
        when(referrals.findById(newcomer))
                .thenReturn(Optional.of(new Referral(newcomer, UUID.randomUUID(), null)));
        assertThat(service.claim(newcomer, "GOODCODE")).isFalse();
        verify(referrals, never()).save(any());
    }

    @Test
    @DisplayName("a user cannot refer themselves")
    void selfReferral() {
        when(codes.resolve("MYOWNCODE")).thenReturn(Optional.of(newcomer));
        assertThat(service.claim(newcomer, "MYOWNCODE")).isFalse();
        verify(referrals, never()).save(any());
    }

    @Test
    @DisplayName("an unknown code claims nothing and does not throw")
    void unknownCode() {
        when(codes.resolve("NOSUCH")).thenReturn(Optional.empty());
        assertThat(service.claim(newcomer, "NOSUCH")).isFalse();
        verify(referrals, never()).save(any());
    }

    @Test
    @DisplayName("a user auth has never heard of claims nothing")
    void unknownUser() {
        when(users.resolve(newcomer)).thenReturn(Optional.empty());
        assertThat(service.claim(newcomer, "GOODCODE")).isFalse();
        verify(referrals, never()).save(any());
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ReferralServiceTest
```

Expected: compilation failure — `ReferralService`, `ReferralRewardClient` do not exist.

- [ ] **Step 3: Write `ReferralDtos`**

```java
package uz.efbazaar.marketplace.referral;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ReferralDtos {

    private ReferralDtos() {}

    public record ClaimRequest(@NotBlank String code) {}

    public record ClaimResponse(boolean claimed) {}

    /** Foydalanuvchining o'z taklif sahifasi. */
    public record MyReferralsResponse(
            String code,
            long invitedCount,
            long rewardedCount,
            BigDecimal earnedSom,
            BigDecimal rewardSom,
            List<InvitedUser> invited) {}

    /** Taklif qilingan odam — ismi admin/foydalanuvchi panelida qo'shiladi. */
    public record InvitedUser(
            UUID userId,
            String displayName,
            Instant joinedAt,
            Instant rewardedAt,
            BigDecimal rewardSom) {}

    /** Adminka reytingi. */
    public record ReferrerRow(
            UUID userId,
            String displayName,
            String telegramUsername,
            long invitedCount,
            long rewardedCount,
            BigDecimal earnedSom) {}

    public record ReferralSettingsResponse(BigDecimal rewardSom, Instant updatedAt) {
        public static ReferralSettingsResponse from(ReferralSettings s) {
            return new ReferralSettingsResponse(s.getRewardSom(), s.getUpdatedAt());
        }
    }

    public record UpdateReferralSettingsRequest(@PositiveOrZero BigDecimal rewardSom) {}
}
```

- [ ] **Step 4: Write `ReferralService` (claim path only for now)**

```java
package uz.efbazaar.marketplace.referral;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralSettingsRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Referal da'vosi va mukofot qarori.
 *
 * <p>DA'VO FAQAT YANGI AKKOUNT UCHUN. Aks holda uch yil oldin ro'yxatdan
 * o'tgan odam bugun havolani bosib, kimningdir referaliga aylanib qolardi.
 * Akkount yoshini brauzerdan kelgan "bu ro'yxatdan o'tish edi" bayrog'i
 * emas, auth-service aytadi: bayroqni yolg'on qo'yishga sababi bor yagona
 * tomon aynan klient.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReferralService {

    /**
     * Ro'yxatdan o'tgandan keyin da'vo qilish uchun berilgan vaqt. Bir
     * soat — brauzer so'rovi kechikishi yoki foydalanuvchi sahifani qayta
     * yuklashi uchun yetarlicha keng, eski akkountni ichkariga kiritish
     * uchun juda tor.
     */
    private static final Duration CLAIM_WINDOW = Duration.ofHours(1);

    private final ReferralRepository referrals;
    private final ReferralCodeService codes;
    private final ReferralSettingsRepository settingsRepository;
    private final AuthSummaryClient users;
    private final ReferralRewardClient rewards;

    /** @return qator yozilgan bo'lsa true. Rad etish xato emas — sukut. */
    @Transactional
    public boolean claim(UUID claimantId, String code) {
        Optional<UUID> referrer = codes.resolve(code);
        if (referrer.isEmpty()) return false;
        if (referrer.get().equals(claimantId)) return false;
        if (referrals.findById(claimantId).isPresent()) return false;
        if (!isFreshAccount(claimantId)) return false;

        try {
            referrals.save(new Referral(claimantId, referrer.get(), null));
        } catch (DataIntegrityViolationException e) {
            // Ikki so'rov bir vaqtda kelgan: birinchisi yozdi, ikkinchisi
            // birlamchi kalitga urildi. Natija to'g'ri, aytadigan xato yo'q.
            log.debug("Referal da'vosi allaqachon yozilgan: {}", claimantId);
            return false;
        }
        log.info("Referal yozildi: {} -> {}", referrer.get(), claimantId);
        return true;
    }

    private boolean isFreshAccount(UUID userId) {
        return users.resolve(userId)
                .map(u -> u.createdAt() != null
                        && u.createdAt().isAfter(Instant.now().minus(CLAIM_WINDOW)))
                .orElse(false);
    }

    ReferralSettings settings() {
        return settingsRepository.findById(ReferralSettings.SINGLETON_ID)
                .orElseThrow(() -> new IllegalStateException("referral_settings qatori yo'q"));
    }
}
```

- [ ] **Step 5: Write a stub `ReferralRewardClient` so the service compiles**

Task 6 fills it in. A stub with the final signature keeps this task compiling without inventing a name that later changes.

```java
package uz.efbazaar.marketplace.referral;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.UUID;

/** marketplace → payment: referal mukofoti. To'ldirilishi — 6-vazifa. */
@Component
public class ReferralRewardClient {

    public void reward(UUID referredUserId, UUID referrerUserId, BigDecimal rewardSom) {
        throw new UnsupportedOperationException("6-vazifada quriladi");
    }
}
```

- [ ] **Step 6: Write `ReferralController`**

```java
package uz.efbazaar.marketplace.referral;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.referral.ReferralDtos.ClaimRequest;
import uz.efbazaar.marketplace.referral.ReferralDtos.ClaimResponse;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

/** Foydalanuvchi tomoni — taklif havolasi. */
@RestController
@RequestMapping("/api/v1/referrals")
@RequiredArgsConstructor
public class ReferralController {

    private final ReferralService service;

    /**
     * Ro'yxatdan o'tgandan keyin brauzer saqlab qo'ygan kodni yuboradi.
     *
     * <p>Rad etish 200 va {@code claimed: false} bilan qaytadi, 4xx bilan
     * emas: kod eskirgan yoki foydalanuvchi allaqachon taklif qilingan
     * bo'lishi mutlaqo normal va ekranda xato ko'rsatadigan hodisa emas.
     */
    @PostMapping("/claim")
    public ClaimResponse claim(@AuthenticationPrincipal AuthenticatedUser user,
                               @Valid @RequestBody ClaimRequest request) {
        return new ClaimResponse(service.claim(user.userId(), request.code()));
    }
}
```

- [ ] **Step 7: Run the test and confirm it passes**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ReferralServiceTest
```

Expected: PASS, 6 tests.

- [ ] **Step 8: Mutation-check the age window**

Change `isFreshAccount` to `return true;` and rerun. `tooOld` and `unknownUser` must fail. Restore.

- [ ] **Step 9: Commit**

```bash
git add backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/referral/ReferralServiceTest.java
git commit -m "feat(referrals): claim a referral, for new accounts only

The age of the claiming account comes from auth-service rather than from
a flag the browser sends. The client is the one party with a reason to
claim a three-year-old account is brand new.

A rejected claim returns 200 with claimed:false. An expired code or an
already-referred user is ordinary, not an error worth a red banner."
```

---

### Task 4: trade-service publishes `trade-succeeded`

**Files:**
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/TradeEvents.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/TradeEventPublisher.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateHandler.java` (the `case SUCCESS ->` branch, around line 243-285)
- Modify: `CLAUDE.md` (the Kafka topic list)
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/kafka/TradeSucceededPublishTest.java`

**Interfaces:**
- Produces: topic `efbazaar.trade.trade-succeeded`, payload `TradeEvents.TradeSucceeded(UUID tradeId, UUID buyerId, UUID sellerId, String mode, Instant occurredAt)`, published by `TradeEventPublisher.tradeSucceeded(Trade trade)`.

- [ ] **Step 1: Write the failing test**

```java
package uz.efbazaar.trade.kafka;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class TradeSucceededPublishTest {

    @Test
    @DisplayName("the event carries both parties and the mode")
    void publishesBothParties() {
        @SuppressWarnings("unchecked")
        KafkaTemplate<String, Object> kafka = mock(KafkaTemplate.class);
        TradeEventPublisher publisher = new TradeEventPublisher(kafka);

        Trade trade = new Trade();
        trade.setId(UUID.randomUUID());
        trade.setBuyerId(UUID.randomUUID());
        trade.setSellerId(UUID.randomUUID());
        trade.setMode(TradeMode.SMART);

        publisher.tradeSucceeded(trade);

        var topic = forClass(String.class);
        var key = forClass(String.class);
        var payload = forClass(Object.class);
        verify(kafka).send(topic.capture(), key.capture(), payload.capture());

        assertThat(topic.getValue()).isEqualTo("efbazaar.trade.trade-succeeded");
        assertThat(payload.getValue())
                .isInstanceOf(TradeEvents.TradeSucceeded.class)
                .satisfies(p -> {
                    var e = (TradeEvents.TradeSucceeded) p;
                    assertThat(e.buyerId()).isEqualTo(trade.getBuyerId());
                    assertThat(e.sellerId()).isEqualTo(trade.getSellerId());
                    assertThat(e.mode()).isEqualTo("SMART");
                });
    }
}
```

Note: `Trade` uses Lombok `@Setter`, and `TradeEventPublisher` has a single `KafkaTemplate` constructor argument — check both before writing, and if `send` is wrapped by a private helper with a different arity, capture on whatever `send` overload `TradeEventPublisher.send` actually calls.

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd backend/trade-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=TradeSucceededPublishTest
```

Expected: compilation failure — `tradeSucceeded` and `TradeSucceeded` do not exist.

- [ ] **Step 3: Add the topic and payload to `TradeEvents`**

Beside the other topic constants:

```java
    public static final String TOPIC_TRADE_SUCCEEDED       = "efbazaar.trade.trade-succeeded";
```

And beside the other records:

```java
    /**
     * A trade completed successfully. marketplace-service uses it to pay the
     * referral reward for whichever party was on their first trade.
     *
     * <p>Both modes are published. A HUMAN trade never touches the wallet, but
     * the referred user completed a trade either way, and the reward buys an
     * active user rather than a commission. {@code mode} travels so a later
     * policy can tell them apart without a new event.
     *
     * <p>Deliberately carries no commission figure: nothing downstream divides
     * the reward, and {@code EscrowClient.settle} discards its response body
     * today, so carrying one would mean changing it to serve a field nobody
     * reads.
     */
    public record TradeSucceeded(
            UUID tradeId,
            UUID buyerId,
            UUID sellerId,
            String mode,
            Instant occurredAt) {}
```

- [ ] **Step 4: Add the publisher method**

In `TradeEventPublisher`, beside `tradeClosed`:

```java
    public void tradeSucceeded(Trade trade) {
        send(TradeEvents.TOPIC_TRADE_SUCCEEDED, trade.getId().toString(),
                new TradeEvents.TradeSucceeded(
                        trade.getId(),
                        trade.getBuyerId(),
                        trade.getSellerId(),
                        trade.getMode().name(),
                        Instant.now()));
    }
```

- [ ] **Step 5: Publish it from the SUCCESS branch**

In `TradeStateHandler`, in `case SUCCESS ->`, immediately after the existing `if (trade.getChatId() != null) { events.tradeClosed(trade); }`:

```java
                // Unconditional, unlike listingSold above: a trade opened from
                // a spec has no listing but its parties are still users who
                // completed a trade, and the referral reward is about them.
                events.tradeSucceeded(trade);
```

- [ ] **Step 6: Add the topic to CLAUDE.md**

In the Kafka topic block, after `efbazaar.trade.trade-closed`:

```
efbazaar.trade.trade-succeeded       # trade-service → marketplace-service (referal mukofoti)
```

- [ ] **Step 7: Run the test and the module suite**

```bash
cd backend/trade-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=TradeSucceededPublishTest
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test
```

Expected: PASS. The full suite must stay green — `TradeStateHandler` is exercised by existing state-machine tests, and any of them that mock `TradeEventPublisher` strictly will now see one more call.

- [ ] **Step 8: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/ \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateHandler.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/kafka/TradeSucceededPublishTest.java \
        CLAUDE.md
git commit -m "feat(trade): announce a trade that succeeded

listing-sold is the closest existing event and does not fit: it is
published only when the trade has a listing, so one opened from a spec
produces none, and it describes a listing changing hands rather than a
trade completing.

Both trade modes are published. A HUMAN trade never touches the wallet,
but its parties still completed a trade, and what the referral reward
buys is an active user, not a commission."
```

---

### Task 5: payment-service pays the reward

**Files:**
- Create: `backend/payment-service/src/main/resources/db/migration/V11__referral_reward_kind.sql`
- Modify: `backend/payment-service/src/main/java/uz/efbazaar/payment/wallet/domain/TransactionKind.java`
- Create: `backend/payment-service/src/main/java/uz/efbazaar/payment/referral/ReferralRewardService.java`
- Create: `backend/payment-service/src/main/java/uz/efbazaar/payment/referral/InternalReferralRewardController.java`
- Test: `backend/payment-service/src/test/java/uz/efbazaar/payment/referral/ReferralRewardServiceTest.java`

**Interfaces:**
- Consumes: `LedgerService.post(TransactionKind, String idempotencyKey, UUID createdBy, String description, List<Posting>)` and `Posting(LedgerAccount, UUID userId, long amountTiyin)`.
- Produces: `POST /internal/referrals/reward` with body `{ referredUserId, referrerUserId, rewardTiyin }`, and `ReferralRewardService.reward(UUID referredUserId, UUID referrerUserId, long rewardTiyin)`.

- [ ] **Step 1: Check whether `transaction_kind` is constrained in the database**

```bash
cd backend/payment-service
grep -rn "kind" src/main/resources/db/migration/*.sql | grep -i "check\|enum"
```

If a CHECK constraint lists the allowed kinds, `V11` must **replace** it (drop and recreate) with `REFERRAL_REWARD` added — a CHECK cannot be extended in place. If the column is plain text with no constraint, `V11` is not needed at all; delete it from this task and say so in the commit message.

- [ ] **Step 2: Write the migration, if step 1 says one is needed**

```sql
-- REFERRAL_REWARD qo'shiladi. CHECK'ni kengaytirib bo'lmaydi — faqat
-- almashtirish mumkin, shuning uchun eskisi tushiriladi.
ALTER TABLE ledger_transactions DROP CONSTRAINT chk_transaction_kind;
ALTER TABLE ledger_transactions ADD CONSTRAINT chk_transaction_kind CHECK (
    kind IN ('DEPOSIT', 'TRADE_HOLD', 'TRADE_SETTLE', 'TRADE_RELEASE',
             'WITHDRAW_RESERVE', 'WITHDRAW_FULFIL', 'WITHDRAW_CANCEL',
             'PARTNER_FEE', 'REFERRAL_REWARD', 'ADJUSTMENT')
);
```

Replace the table and constraint names with whatever step 1 found, and keep every kind that is already listed — dropping one silently breaks a path in production.

- [ ] **Step 3: Write the failing test**

```java
package uz.efbazaar.payment.referral;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Mukofot ledger yozuvi.
 *
 * <p>Yozuvlar yig'indisi nolga teng bo'lmasa kitob buziladi va buni
 * hisobot chiqargunimizcha hech kim sezmaydi.
 */
class ReferralRewardServiceTest {

    private LedgerService ledger;
    private ReferralRewardService service;

    private final UUID referred = UUID.randomUUID();
    private final UUID referrer = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        ledger = mock(LedgerService.class);
        service = new ReferralRewardService(ledger);
    }

    @Test
    @DisplayName("the postings sum to zero and credit the referrer")
    void balancedPostings() {
        service.reward(referred, referrer, 500_000L);

        @SuppressWarnings("unchecked")
        var postings = (org.mockito.ArgumentCaptor<List<Posting>>)
                (org.mockito.ArgumentCaptor<?>) forClass(List.class);
        verify(ledger).post(eq(TransactionKind.REFERRAL_REWARD), anyString(),
                any(), anyString(), postings.capture());

        assertThat(postings.getValue().stream().mapToLong(Posting::amountTiyin).sum()).isZero();
        assertThat(postings.getValue())
                .contains(new Posting(LedgerAccount.USER_AVAILABLE, referrer, -500_000L))
                .contains(new Posting(LedgerAccount.PLATFORM_REVENUE, null, 500_000L));
    }

    @Test
    @DisplayName("the idempotency key is the referred user, so a redelivery pays once")
    void keyedOnReferredUser() {
        service.reward(referred, referrer, 500_000L);
        verify(ledger).post(any(), eq("referral-reward:" + referred), any(), anyString(), any());
    }

    @Test
    @DisplayName("a zero reward posts nothing rather than a zero entry")
    void zeroRewardPostsNothing() {
        service.reward(referred, referrer, 0L);
        verify(ledger, never()).post(any(), anyString(), any(), anyString(), any());
    }

    @Test
    @DisplayName("a negative reward is refused")
    void negativeRefused() {
        assertThatThrownBy(() -> service.reward(referred, referrer, -1L))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
```

- [ ] **Step 4: Run it and confirm it fails**

```bash
cd backend/payment-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ReferralRewardServiceTest
```

Expected: compilation failure — `ReferralRewardService` and `TransactionKind.REFERRAL_REWARD` do not exist.

- [ ] **Step 5: Add the transaction kind**

In `TransactionKind.java`, after `PARTNER_FEE`:

```java
    /** Referal mukofoti — platforma foydalanuvchi jalb qilish uchun to'laydi. */
    REFERRAL_REWARD,
```

- [ ] **Step 6: Write `ReferralRewardService`**

```java
package uz.efbazaar.payment.referral;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;

/**
 * Referal mukofotini taklif qiluvchining hamyoniga yozadi.
 *
 * <p>Bu savdo komissiyasidan kesib olinmaydi — platformaning foydalanuvchi
 * jalb qilish xarajati. Shuning uchun u savdoning o'z tranzaksiyasiga
 * qo'shilmaydi: u tranzaksiya o'sha savdoning komissiyasiga tenglashishi
 * kerak.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReferralRewardService {

    private final LedgerService ledger;

    /**
     * @param referredUserId idempotentlik kaliti — bir odam uchun bir marta.
     */
    @Transactional
    public void reward(UUID referredUserId, UUID referrerUserId, long rewardTiyin) {
        if (rewardTiyin < 0) {
            throw new IllegalArgumentException("Mukofot manfiy bo'lishi mumkin emas: " + rewardTiyin);
        }
        // Nol summani yozmaymiz: chk_entry_non_zero nol yozuvni rad etadi,
        // va "hech narsa to'lanmadi" ni yozib qo'yishning ma'nosi yo'q.
        if (rewardTiyin == 0) return;

        ledger.post(TransactionKind.REFERRAL_REWARD,
                "referral-reward:" + referredUserId, null,
                "referral reward for " + referredUserId,
                List.of(
                        new Posting(LedgerAccount.PLATFORM_REVENUE, null, rewardTiyin),
                        new Posting(LedgerAccount.USER_AVAILABLE, referrerUserId, -rewardTiyin)));

        log.info("Referal mukofoti to'landi: {} tiyin, {} -> {}",
                rewardTiyin, referredUserId, referrerUserId);
    }
}
```

- [ ] **Step 7: Write the internal controller**

Copy the class-level annotations and the internal-secret guard from `uz.efbazaar.payment.partner.InternalPartnerFeeController` exactly — including whatever filter or annotation enforces `X-Internal-Secret` — so this endpoint is protected identically.

```java
package uz.efbazaar.payment.referral;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** marketplace-service chaqiradi. Tashqi tarmoqdan nginx to'sadi. */
@RestController
@RequestMapping("/internal/referrals")
@RequiredArgsConstructor
public class InternalReferralRewardController {

    private final ReferralRewardService service;

    @PostMapping("/reward")
    public void reward(@Valid @RequestBody RewardRequest request) {
        service.reward(request.referredUserId(), request.referrerUserId(), request.rewardTiyin());
    }

    public record RewardRequest(
            @NotNull UUID referredUserId,
            @NotNull UUID referrerUserId,
            @PositiveOrZero long rewardTiyin) {}
}
```

- [ ] **Step 8: Run the test and confirm it passes**

```bash
cd backend/payment-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ReferralRewardServiceTest
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/payment-service/src/main/java/uz/efbazaar/payment/referral/ \
        backend/payment-service/src/main/java/uz/efbazaar/payment/wallet/domain/TransactionKind.java \
        backend/payment-service/src/main/resources/db/migration/ \
        backend/payment-service/src/test/java/uz/efbazaar/payment/referral/
git commit -m "feat(payments): pay the referral reward into the referrer's wallet

Not carved out of the commission — this is what the platform spends to
acquire a user, so it cannot ride inside the settle transaction, which
has to balance against that trade's own fee.

The idempotency key is the referred user, not the trade. One reward per
person, ever, however many times the event is redelivered."
```

---

### Task 6: marketplace fires the reward

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeSucceededDto.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeSucceededConsumer.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ReferralRewardClient.java` (replace the Task 3 stub)
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ReferralService.java` (add `rewardFor`)
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/referral/ReferralRewardTest.java`

**Interfaces:**
- Consumes: `ReferralRewardService` over HTTP (Task 5), `TradeEvents.TradeSucceeded` shape (Task 4).
- Produces: `ReferralService.rewardFor(UUID tradeId, UUID buyerId, UUID sellerId)` — evaluates both parties.

- [ ] **Step 1: Write the failing test**

```java
package uz.efbazaar.marketplace.referral;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralSettingsRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Mukofot qarori.
 *
 * <p>"Faqat birinchi savdo" qoidasi shu yerda sinaladi. U buzilsa har
 * savdodan to'lanadi va buni hech kim darhol sezmaydi — hisobot
 * chiqarilgunicha.
 */
class ReferralRewardTest {

    private ReferralRepository referrals;
    private ReferralRewardClient rewards;
    private ReferralSettingsRepository settings;
    private ReferralService service;

    private final UUID trade = UUID.randomUUID();
    private final UUID buyer = UUID.randomUUID();
    private final UUID seller = UUID.randomUUID();
    private final UUID buyersReferrer = UUID.randomUUID();
    private final UUID sellersReferrer = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        referrals = mock(ReferralRepository.class);
        rewards = mock(ReferralRewardClient.class);
        settings = mock(ReferralSettingsRepository.class);

        ReferralSettings s = new ReferralSettings();
        s.setRewardSom(new BigDecimal("5000.00"));
        when(settings.findById(ReferralSettings.SINGLETON_ID)).thenReturn(Optional.of(s));

        when(referrals.findById(any())).thenReturn(Optional.empty());
        when(referrals.save(any())).thenAnswer(i -> i.getArgument(0));

        service = new ReferralService(referrals, mock(ReferralCodeService.class),
                settings, mock(AuthSummaryClient.class), rewards);
    }

    private Referral unrewarded(UUID referred, UUID referrer) {
        return new Referral(referred, referrer, null);
    }

    @Test
    @DisplayName("the referrer of a first-time buyer is paid")
    void paysBuyersReferrer() {
        when(referrals.findById(buyer)).thenReturn(Optional.of(unrewarded(buyer, buyersReferrer)));

        service.rewardFor(trade, buyer, seller);

        verify(rewards).reward(eq(buyer), eq(buyersReferrer), eq(new BigDecimal("5000.00")));
    }

    @Test
    @DisplayName("the side the referred user was on does not matter")
    void paysSellersReferrer() {
        when(referrals.findById(seller)).thenReturn(Optional.of(unrewarded(seller, sellersReferrer)));

        service.rewardFor(trade, buyer, seller);

        verify(rewards).reward(eq(seller), eq(sellersReferrer), any());
    }

    @Test
    @DisplayName("two first-timers with different referrers pay both")
    void paysBoth() {
        when(referrals.findById(buyer)).thenReturn(Optional.of(unrewarded(buyer, buyersReferrer)));
        when(referrals.findById(seller)).thenReturn(Optional.of(unrewarded(seller, sellersReferrer)));

        service.rewardFor(trade, buyer, seller);

        verify(rewards).reward(eq(buyer), eq(buyersReferrer), any());
        verify(rewards).reward(eq(seller), eq(sellersReferrer), any());
    }

    @Test
    @DisplayName("a second trade pays nothing")
    void onlyTheFirstTrade() {
        Referral already = unrewarded(buyer, buyersReferrer);
        already.setRewardedAt(Instant.now());
        already.setRewardSom(new BigDecimal("5000.00"));
        when(referrals.findById(buyer)).thenReturn(Optional.of(already));

        service.rewardFor(trade, buyer, seller);

        verify(rewards, never()).reward(any(), any(), any());
    }

    @Test
    @DisplayName("a user nobody referred pays nothing")
    void noReferral() {
        service.rewardFor(trade, buyer, seller);
        verify(rewards, never()).reward(any(), any(), any());
    }

    @Test
    @DisplayName("the amount paid is stamped on the row, not re-read later")
    void freezesTheAmount() {
        Referral row = unrewarded(buyer, buyersReferrer);
        when(referrals.findById(buyer)).thenReturn(Optional.of(row));

        service.rewardFor(trade, buyer, seller);

        assertThat(row.getRewardedAt()).isNotNull();
        assertThat(row.getRewardSom()).isEqualTo(new BigDecimal("5000.00"));
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ReferralRewardTest
```

Expected: failure — `rewardFor` does not exist.

- [ ] **Step 3: Add `rewardFor` to `ReferralService`**

```java
    /**
     * Savdo muvaffaqiyatli yopildi — ikkala tarafni ham tekshiradi.
     *
     * <p>Ikkalasi ham birinchi savdosida bo'lsa, ikkala taklif qiluvchi
     * ham oladi. Ikki odam platformaga olib kelingan va ikkalasi ham
     * so'ralgan ishni bajargan.
     *
     * <p>Bitta tarafning to'lovi yiqilsa ikkinchisi baribir ko'riladi:
     * ular bir-biriga bog'liq emas, va biri tufayli ikkinchisini
     * yo'qotish sababsiz zarar.
     */
    @Transactional
    public void rewardFor(UUID tradeId, UUID buyerId, UUID sellerId) {
        BigDecimal amount = settings().getRewardSom();
        rewardParty(tradeId, buyerId, amount);
        if (!sellerId.equals(buyerId)) {
            rewardParty(tradeId, sellerId, amount);
        }
    }

    private void rewardParty(UUID tradeId, UUID userId, BigDecimal amount) {
        Optional<Referral> found = referrals.findById(userId);
        if (found.isEmpty()) return;

        Referral referral = found.get();
        // rewardedAt "faqat birinchi savdo" qorovuli: birinchi savdo uni
        // muhrlaydi, keyingilari muhrlangan holda topadi.
        if (referral.getRewardedAt() != null) return;

        try {
            rewards.reward(userId, referral.getReferrerUserId(), amount);
        } catch (RuntimeException e) {
            // Muhr qo'yilmaydi — hodisa qayta yetkazilganda yana urinamiz.
            // payment tarafda kalit bir xil, ikki marta to'lanmaydi.
            log.error("Referal mukofoti to'lanmadi (savdo={}, user={})", tradeId, userId, e);
            return;
        }
        referral.setRewardedAt(Instant.now());
        // Summa qatorga muhrlanadi: sozlama ertaga o'zgarsa tarix
        // qayta yozilmasin va adminka to'langanini ko'rsatsin, bugun
        // sozlanganini emas.
        referral.setRewardSom(amount);
        referrals.save(referral);
    }
```

Add the imports `java.math.BigDecimal` and `java.util.Optional` if they are not already present.

- [ ] **Step 4: Replace the `ReferralRewardClient` stub**

```java
package uz.efbazaar.marketplace.referral;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.util.UUID;

/**
 * Referal mukofotini payment-service'ga yozdiradi.
 *
 * <p>Yo'nalish marketplace → payment, {@code PartnerFeeClient} bilan bir
 * xil. Teskarisi hech qachon qurilmaydi: payment savdoni yopish uchun
 * marketplace tirik bo'lishiga muhtoj bo'lmasligi kerak.
 */
@Slf4j
@Component
public class ReferralRewardClient {

    private static final BigDecimal TIYIN_PER_SOM = BigDecimal.valueOf(100);

    private final RestClient http;
    private final String secret;

    public ReferralRewardClient(
            @Value("${app.payment.internal-base-url:http://payment-service:8087}") String baseUrl,
            @Value("${app.internal.secret:}") String secret,
            RestClient.Builder builder) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(5).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(20).toMillis());
        this.http = builder.baseUrl(baseUrl).requestFactory(factory).build();
        this.secret = secret;
    }

    public void reward(UUID referredUserId, UUID referrerUserId, BigDecimal rewardSom) {
        long tiyin = rewardSom.multiply(TIYIN_PER_SOM).setScale(0, RoundingMode.HALF_UP).longValue();
        if (tiyin <= 0) return;

        http.post()
                .uri("/internal/referrals/reward")
                .header("X-Internal-Secret", secret)
                .contentType(MediaType.APPLICATION_JSON)
                .body(new RewardRequest(referredUserId, referrerUserId, tiyin))
                .retrieve()
                .toBodilessEntity();
    }

    private record RewardRequest(UUID referredUserId, UUID referrerUserId, long rewardTiyin) {}
}
```

Check `application.yml` for the actual property names `app.payment.internal-base-url` and `app.internal.secret` — copy whatever `PartnerFeeClient` uses rather than trusting these.

- [ ] **Step 5: Write the DTO and consumer**

`TradeSucceededDto.java`:

```java
package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

public record TradeSucceededDto(
        UUID tradeId,
        UUID buyerId,
        UUID sellerId,
        String mode,
        Instant occurredAt) {}
```

`TradeSucceededConsumer.java`:

```java
package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.referral.ReferralService;

/**
 * Savdo muvaffaqiyatli yopilganda referal mukofotini ishga soladi.
 *
 * <p>Qayta yetkazilishi zararsiz: mukofot bir marta to'lanadi, chunki
 * {@code referrals.rewarded_at} muhrlangan bo'ladi va payment tarafdagi
 * idempotentlik kaliti ham bir xil.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeSucceededConsumer {

    private final ReferralService referrals;

    @KafkaListener(
            topics = "efbazaar.trade.trade-succeeded",
            groupId = "marketplace-trade-succeeded",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.TradeSucceededDto",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onTradeSucceeded(TradeSucceededDto e) {
        referrals.rewardFor(e.tradeId(), e.buyerId(), e.sellerId());
    }
}
```

- [ ] **Step 6: Run the test and confirm it passes**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ReferralRewardTest
```

Expected: PASS, 6 tests.

- [ ] **Step 7: Mutation-check the first-trade guard**

Remove the `if (referral.getRewardedAt() != null) return;` line and rerun. `onlyTheFirstTrade` must fail. Restore it.

- [ ] **Step 8: Commit**

```bash
git add backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeSucceeded* \
        backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/referral/ReferralRewardTest.java
git commit -m "feat(referrals): pay the referrer when their newcomer first trades

Both parties are evaluated and both may pay: a trade between two
first-timers brought two people to the platform.

A failed payout leaves rewarded_at unstamped so the next redelivery
retries, and the payment side is keyed on the referred user, so a retry
that arrives after a success pays nothing."
```

---

### Task 7: The user's own referral page, and the admin section

**Files:**
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ReferralService.java` (add `myReferrals`, `leaderboard`, `invitedBy`, `updateSettings`)
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ReferralController.java` (add `GET /me`)
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/AdminReferralController.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/referral/ReferralReadModelTest.java`

**Interfaces:**
- Produces: `GET /api/v1/referrals/me -> MyReferralsResponse`; `GET /api/v1/admin/referrals -> List<ReferrerRow>`; `GET /api/v1/admin/referrals/{userId} -> List<InvitedUser>`; `GET|PUT /api/v1/admin/referrals/settings -> ReferralSettingsResponse`.

- [ ] **Step 1: Add the leaderboard query to `ReferralRepository`**

```java
        /**
         * Reyting: kim nechta odam olib kelgan.
         *
         * <p>Ismlar bu yerda emas — ular auth-service'da. Kontroller
         * identifikatorlarni bitta {@code resolveAll} chaqiruvi bilan
         * to'ldiradi, har qator uchun alohida so'rov qilmaydi.
         */
        @Query("""
               select r.referrerUserId as userId,
                      count(r) as invitedCount,
                      sum(case when r.rewardedAt is not null then 1 else 0 end) as rewardedCount,
                      coalesce(sum(r.rewardSom), 0) as earnedSom
               from Referral r
               group by r.referrerUserId
               order by count(r) desc
               """)
        List<ReferrerProjection> leaderboard(Pageable pageable);

        interface ReferrerProjection {
            UUID getUserId();
            long getInvitedCount();
            long getRewardedCount();
            BigDecimal getEarnedSom();
        }
```

Add `org.springframework.data.jpa.repository.Query` and `java.math.BigDecimal` to the imports.

- [ ] **Step 2: Write the failing test**

```java
package uz.efbazaar.marketplace.referral;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralSettingsRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import uz.efbazaar.marketplace.security.AuthSummaryClient.UserSummary;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReferralReadModelTest {

    @Test
    @DisplayName("my page shows the code, the count and what it earned")
    void myReferrals() {
        UUID me = UUID.randomUUID();
        UUID invitedA = UUID.randomUUID();
        UUID invitedB = UUID.randomUUID();

        ReferralRepository referrals = mock(ReferralRepository.class);
        ReferralCodeService codes = mock(ReferralCodeService.class);
        ReferralSettingsRepository settingsRepo = mock(ReferralSettingsRepository.class);
        AuthSummaryClient users = mock(AuthSummaryClient.class);

        Referral paid = new Referral(invitedA, me, null);
        paid.setRewardedAt(Instant.now());
        paid.setRewardSom(new BigDecimal("5000.00"));
        Referral unpaid = new Referral(invitedB, me, null);

        when(codes.codeFor(me)).thenReturn("ABCD2345");
        when(referrals.findByReferrerUserIdOrderByCreatedAtDesc(me))
                .thenReturn(List.of(paid, unpaid));

        ReferralSettings s = new ReferralSettings();
        s.setRewardSom(new BigDecimal("5000.00"));
        when(settingsRepo.findById(ReferralSettings.SINGLETON_ID)).thenReturn(Optional.of(s));

        when(users.resolveAll(any())).thenReturn(Map.of(
                invitedA, new UserSummary(invitedA, "Aziz", null, null, false, Instant.now(), false),
                invitedB, new UserSummary(invitedB, "Bekzod", null, null, false, Instant.now(), false)));

        ReferralService service = new ReferralService(referrals, codes, settingsRepo, users,
                mock(ReferralRewardClient.class));

        var response = service.myReferrals(me);

        assertThat(response.code()).isEqualTo("ABCD2345");
        assertThat(response.invitedCount()).isEqualTo(2);
        assertThat(response.rewardedCount()).isEqualTo(1);
        assertThat(response.earnedSom()).isEqualByComparingTo("5000.00");
        assertThat(response.invited()).extracting("displayName")
                .containsExactlyInAnyOrder("Aziz", "Bekzod");
    }
}
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ReferralReadModelTest
```

Expected: failure — `myReferrals` does not exist.

- [ ] **Step 4: Add the read methods to `ReferralService`**

```java
    /** Foydalanuvchining o'z taklif sahifasi. */
    @Transactional
    public MyReferralsResponse myReferrals(UUID userId) {
        String code = codes.codeFor(userId);
        List<Referral> rows = referrals.findByReferrerUserIdOrderByCreatedAtDesc(userId);

        Map<UUID, UserSummary> names = rows.isEmpty()
                ? Map.of()
                : users.resolveAll(rows.stream().map(Referral::getReferredUserId).toList());

        BigDecimal earned = rows.stream()
                .map(Referral::getRewardSom)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new MyReferralsResponse(
                code,
                rows.size(),
                rows.stream().filter(r -> r.getRewardedAt() != null).count(),
                earned,
                settings().getRewardSom(),
                rows.stream().map(r -> new InvitedUser(
                        r.getReferredUserId(),
                        displayName(names, r.getReferredUserId()),
                        r.getCreatedAt(),
                        r.getRewardedAt(),
                        r.getRewardSom())).toList());
    }

    /** Adminka reytingi. */
    @Transactional(readOnly = true)
    public List<ReferrerRow> leaderboard(Pageable pageable) {
        var rows = referrals.leaderboard(pageable);
        Map<UUID, UserSummary> names = rows.isEmpty()
                ? Map.of()
                : users.resolveAll(rows.stream().map(ReferrerProjection::getUserId).toList());

        return rows.stream().map(r -> {
            UserSummary u = names.get(r.getUserId());
            return new ReferrerRow(
                    r.getUserId(),
                    u == null ? null : u.displayName(),
                    u == null ? null : u.telegramUsername(),
                    r.getInvitedCount(),
                    r.getRewardedCount(),
                    r.getEarnedSom());
        }).toList();
    }

    /** Bitta taklif qiluvchi kimlarni olib kelgan. */
    @Transactional(readOnly = true)
    public List<InvitedUser> invitedBy(UUID referrerId) {
        List<Referral> rows = referrals.findByReferrerUserIdOrderByCreatedAtDesc(referrerId);
        Map<UUID, UserSummary> names = rows.isEmpty()
                ? Map.of()
                : users.resolveAll(rows.stream().map(Referral::getReferredUserId).toList());
        return rows.stream().map(r -> new InvitedUser(
                r.getReferredUserId(),
                displayName(names, r.getReferredUserId()),
                r.getCreatedAt(),
                r.getRewardedAt(),
                r.getRewardSom())).toList();
    }

    @Transactional
    public ReferralSettings updateSettings(BigDecimal rewardSom, UUID adminId) {
        ReferralSettings s = settings();
        s.setRewardSom(rewardSom);
        s.setUpdatedAt(Instant.now());
        s.setUpdatedBy(adminId);
        return settingsRepository.save(s);
    }

    private static String displayName(Map<UUID, UserSummary> names, UUID id) {
        UserSummary u = names.get(id);
        return u == null ? null : u.displayName();
    }
```

Add the imports the compiler asks for, and make `settings()` public so the controllers can read it.

- [ ] **Step 5: Add `GET /me` to `ReferralController`**

```java
    @GetMapping("/me")
    public MyReferralsResponse me(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.myReferrals(user.userId());
    }
```

- [ ] **Step 6: Write `AdminReferralController`**

```java
package uz.efbazaar.marketplace.referral;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.referral.ReferralDtos.InvitedUser;
import uz.efbazaar.marketplace.referral.ReferralDtos.ReferralSettingsResponse;
import uz.efbazaar.marketplace.referral.ReferralDtos.ReferrerRow;
import uz.efbazaar.marketplace.referral.ReferralDtos.UpdateReferralSettingsRequest;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

/** Adminka "Referallar" bo'limi — /api/v1/admin/** SecurityConfig'da ROLE_ADMIN. */
@RestController
@RequestMapping("/api/v1/admin/referrals")
@RequiredArgsConstructor
public class AdminReferralController {

    private final ReferralService service;

    /** Reyting: kim eng ko'p odam olib kelayapti. */
    @GetMapping
    public List<ReferrerRow> leaderboard(@PageableDefault(size = 50) Pageable pageable) {
        return service.leaderboard(pageable);
    }

    @GetMapping("/{userId}")
    public List<InvitedUser> invited(@PathVariable UUID userId) {
        return service.invitedBy(userId);
    }

    @GetMapping("/settings")
    public ReferralSettingsResponse settings() {
        return ReferralSettingsResponse.from(service.settings());
    }

    @PutMapping("/settings")
    public ReferralSettingsResponse updateSettings(
            @AuthenticationPrincipal AuthenticatedUser admin,
            @Valid @RequestBody UpdateReferralSettingsRequest request) {
        return ReferralSettingsResponse.from(
                service.updateSettings(request.rewardSom(), admin.userId()));
    }
}
```

- [ ] **Step 7: Run the test and the module suite**

```bash
cd backend/marketplace-service
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ReferralReadModelTest
JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test
```

Expected: PASS.

- [ ] **Step 8: Verify the leaderboard query against a real database**

Add the leaderboard case to `ReferralSchemaIT` — a JPQL aggregate with a projection interface is exactly the shape that compiles, passes against mocks and fails against Postgres:

```java
@Test
@DisplayName("the leaderboard ranks by invited count against a real database")
void leaderboardRanks() {
    UUID busy = UUID.randomUUID();
    UUID quiet = UUID.randomUUID();
    referrals.saveAndFlush(new Referral(UUID.randomUUID(), busy, null));
    referrals.saveAndFlush(new Referral(UUID.randomUUID(), busy, null));
    referrals.saveAndFlush(new Referral(UUID.randomUUID(), quiet, null));

    var rows = referrals.leaderboard(PageRequest.of(0, 10));

    assertThat(rows).extracting(r -> r.getUserId()).containsExactly(busy, quiet);
    assertThat(rows.get(0).getInvitedCount()).isEqualTo(2);
}
```

Run: `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test -Dtest=ReferralSchemaIT`. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/referral/ \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/referral/
git commit -m "feat(referrals): read models for the user's page and the admin section

Names are resolved in one batch call to auth rather than per row. The
leaderboard is exercised against a real Postgres: a JPQL aggregate with
a projection interface is the shape that passes against mocks and fails
against the database."
```

---

### Task 8: Frontend — capture the code and show the invite page

**Files:**
- Create: `frontend/src/lib/referral-capture.ts`
- Create: `frontend/src/lib/referral-capture.test.ts`
- Create: `frontend/src/lib/referrals.ts`
- Create: `frontend/src/components/referral/referral-capture.tsx`
- Create: `frontend/src/components/referral/invite-panel.tsx`
- Create: `frontend/src/app/invite/page.tsx`
- Modify: `frontend/src/app/layout.tsx` (mount `<ReferralCapture />`)
- Modify: `frontend/src/components/navigation/user-menu.tsx` (link to `/invite`)

**Interfaces:**
- Consumes: `GET /api/v1/referrals/me`, `POST /api/v1/referrals/claim`.
- Produces: `readCodeFromSearch(search: string): string | null`, `storeCode(code: string): void`, `takeStoredCode(): string | null`, and `getMyReferrals(): Promise<MyReferrals>`.

- [ ] **Step 1: Write the failing test**

`referral-capture.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { readCodeFromSearch, storeCode, takeStoredCode } from './referral-capture';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe('readCodeFromSearch', () => {
  it('reads the invite link parameter', () => {
    expect(readCodeFromSearch('?ref=ABCD2345')).toBe('ABCD2345');
  });

  it('reads the channel post parameter', () => {
    expect(readCodeFromSearch('?p=ABCD2345')).toBe('ABCD2345');
  });

  it('normalises to upper case', () => {
    expect(readCodeFromSearch('?ref=abcd2345')).toBe('ABCD2345');
  });

  it('rejects anything that is not a code', () => {
    expect(readCodeFromSearch('?ref=<script>')).toBeNull();
    expect(readCodeFromSearch('?ref=')).toBeNull();
    expect(readCodeFromSearch('?other=ABCD2345')).toBeNull();
    expect(readCodeFromSearch('')).toBeNull();
  });
});

describe('stored code', () => {
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  });

  it('survives until it is taken', () => {
    storeCode('ABCD2345');
    expect(takeStoredCode()).toBe('ABCD2345');
  });

  it('is taken only once', () => {
    storeCode('ABCD2345');
    takeStoredCode();
    expect(takeStoredCode()).toBeNull();
  });

  it('the last link before registering wins', () => {
    storeCode('AAAA1111');
    storeCode('BBBB2222');
    expect(takeStoredCode()).toBe('BBBB2222');
  });

  it('survives storage being unavailable', () => {
    globalThis.localStorage = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
      removeItem() { throw new Error('blocked'); },
    } as unknown as Storage;
    expect(() => storeCode('ABCD2345')).not.toThrow();
    expect(takeStoredCode()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd frontend
npm test -- referral-capture
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `referral-capture.ts`**

```ts
/**
 * Taklif kodini URL'dan olib, ro'yxatdan o'tishgacha saqlab turadi.
 *
 * Ikki havola shakli bir xil narsani yozadi: `?ref=` — shaxsiy taklif
 * havolasi, `?p=` — kanaldagi e'lon posti. Ikkalasi ham kanalni yoki
 * odamni ko'rsatadigan bitta kodni olib yuradi, va oxirgi bosilgani
 * g'olib.
 */

const KEY = 'efbazaar.referral.code';

/** Kod shakli — ReferralCodeService dagi alifbo va uzunlik. */
const CODE = /^[A-Z0-9]{8}$/;

export function readCodeFromSearch(search: string): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const raw = params.get('ref') ?? params.get('p');
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return CODE.test(code) ? code : null;
}

/**
 * Saqlash muvaffaqiyatsiz bo'lsa jimgina o'tib ketamiz. Maxfiy rejimda
 * yoki sayt ma'lumotlari o'chirilgan brauzerda localStorage otadi, va
 * bu sahifani buzishga arzimaydi — referal yo'qoladi, xolos.
 */
export function storeCode(code: string): void {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* saqlab bo'lmadi — referalsiz davom etamiz */
  }
}

/** O'qiydi va o'chiradi: kod bir marta da'vo qilinadi. */
export function takeStoredCode(): string | null {
  try {
    const code = localStorage.getItem(KEY);
    if (code) localStorage.removeItem(KEY);
    return code;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd frontend
npm test -- referral-capture
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Write `referrals.ts`**

Follow `src/lib/partners.ts` — same `buildMarketplaceApiPath` import and the same fetch/error shape.

```ts
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

export interface InvitedUser {
  userId: string;
  displayName: string | null;
  joinedAt: string;
  rewardedAt: string | null;
  rewardSom: number | null;
}

export interface MyReferrals {
  code: string;
  invitedCount: number;
  rewardedCount: number;
  earnedSom: number;
  rewardSom: number;
  invited: InvitedUser[];
}

export async function getMyReferrals(): Promise<MyReferrals> {
  const response = await fetch(buildMarketplaceApiPath('/v1/referrals/me'), {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Referal maʼlumotlari yuklanmadi');
  return response.json();
}

/**
 * Ro'yxatdan o'tgandan keyin saqlangan kodni yuboradi.
 *
 * Rad etish xato emas: kod eskirgan yoki foydalanuvchi allaqachon
 * taklif qilingan bo'lishi normal, va bu ekranda ko'rsatiladigan
 * hodisa emas.
 */
export async function claimReferral(code: string): Promise<boolean> {
  const response = await fetch(buildMarketplaceApiPath('/v1/referrals/claim'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) return false;
  const body = await response.json();
  return body.claimed === true;
}
```

Check `buildMarketplaceApiPath`'s expected prefix in `partners.ts` and match it exactly — `/v1/...` versus `/api/v1/...` differs by helper.

- [ ] **Step 6: Write `referral-capture.tsx`**

```tsx
'use client';

import { useEffect } from 'react';

import { claimReferral } from '@/lib/referrals';
import { readCodeFromSearch, storeCode, takeStoredCode } from '@/lib/referral-capture';

/**
 * Har sahifada ishlaydi, hech nima chizmaydi.
 *
 * Ikki ish qiladi: URL'dagi kodni saqlaydi, va foydalanuvchi kirgan
 * bo'lsa saqlanganini da'vo qiladi. Anonim bosishni tashlab yuborsak
 * dasturning butun maqsadini yo'qotamiz — hali ro'yxatdan o'tmagan odam
 * aynan olib kelinishi kerak bo'lgan odam.
 */
export function ReferralCapture({ authenticated }: { authenticated: boolean }) {
  useEffect(() => {
    const code = readCodeFromSearch(window.location.search);
    if (code) storeCode(code);
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    const code = takeStoredCode();
    if (!code) return;
    void claimReferral(code);
  }, [authenticated]);

  return null;
}
```

- [ ] **Step 7: Mount it in the root layout**

In `src/app/layout.tsx`, inside the body, pass whether the user is signed in — the layout already resolves the user for the navigation, so reuse that value rather than fetching again:

```tsx
<ReferralCapture authenticated={!!user} />
```

- [ ] **Step 8: Write `invite-panel.tsx` and `app/invite/page.tsx`**

The panel is a client component modelled on `partner-dashboard.tsx`: same `mx-auto max-w-2xl space-y-4 p-4` shell, same loading spinner, same card styling. It shows

- the full link `${origin}/?ref=${code}` with a copy button,
- `invitedCount` and `rewardedCount`,
- `earnedSom` and the current `rewardSom` ("Har bir taklif qilingan foydalanuvchi birinchi savdosini yakunlaganda hisobingizga N so'm tushadi"),
- the `invited` list with each person's name, join date and whether they have traded yet.

The page is a server component, matching `app/partner/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

import { InvitePanel } from '@/components/referral/invite-panel';
import { getMe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function InvitePage() {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/invite');
  return <InvitePanel />;
}
```

- [ ] **Step 9: Add the menu entry**

In `src/components/navigation/user-menu.tsx`, beside the partner entry, add an entry pointing at `/invite` labelled "Do'st taklif qilish".

A page that works only when you type its URL cannot be validated by clicking around, because testing it means already knowing the URL. `/hamkorlik` shipped with no link twice for exactly this reason. If `user-menu.test.ts` guards destinations, add `/invite` to it.

- [ ] **Step 10: Run the frontend suite**

```bash
cd frontend
npm test
npm run lint
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lib/referral-capture.ts frontend/src/lib/referral-capture.test.ts \
        frontend/src/lib/referrals.ts frontend/src/components/referral/ \
        frontend/src/app/invite/ frontend/src/app/layout.tsx \
        frontend/src/components/navigation/user-menu.tsx
git commit -m "feat(frontend): capture the invite code and show the invite page

Both link shapes write the same stored code and the last one before
registering wins, so somebody who saw a listing in a channel and never
touched an invite link still counts.

The code is stored before registration and claimed after. Dropping the
anonymous click would discard the beginning of every conversion the
programme exists to produce."
```

---

### Task 9: Frontend — the admin referrals section

**Files:**
- Create: `frontend/src/lib/admin-referrals.ts`
- Create: `frontend/src/components/admin/admin-referrals.tsx`
- Create: `frontend/src/app/admin/referrals/page.tsx`
- Modify: `frontend/src/components/admin/admin-shell.tsx` (`ADMIN_NAV_GROUPS`)
- Test: `frontend/src/components/admin/admin-referrals.test.ts`

**Interfaces:**
- Consumes: `GET /api/v1/admin/referrals`, `GET /api/v1/admin/referrals/{userId}`, `GET|PUT /api/v1/admin/referrals/settings`.

- [ ] **Step 1: Check the existing nav test**

```bash
cd frontend
npm test -- admin-shell
```

There is a test asserting every `src/app/admin/*/page.tsx` has a nav entry. Adding the page without the entry must make it fail — that is the point of this step. Note whether it passes now, so you know the failure in step 4 is yours.

- [ ] **Step 2: Write the failing test**

`admin-referrals.test.ts` — test the pure pieces, not the JSX:

```ts
import { describe, expect, it } from 'vitest';

import { formatEarned, sortByInvited } from './admin-referrals';

describe('sortByInvited', () => {
  it('ranks the busiest referrer first', () => {
    const rows = [
      { userId: 'a', invitedCount: 3, rewardedCount: 1, earnedSom: 5000 },
      { userId: 'b', invitedCount: 9, rewardedCount: 4, earnedSom: 20000 },
    ];
    expect(sortByInvited(rows).map((r) => r.userId)).toEqual(['b', 'a']);
  });

  it('breaks a tie by what was actually earned', () => {
    const rows = [
      { userId: 'a', invitedCount: 5, rewardedCount: 1, earnedSom: 5000 },
      { userId: 'b', invitedCount: 5, rewardedCount: 3, earnedSom: 15000 },
    ];
    expect(sortByInvited(rows).map((r) => r.userId)).toEqual(['b', 'a']);
  });
});

describe('formatEarned', () => {
  it('groups thousands the Uzbek way', () => {
    expect(formatEarned(1234567)).toBe('1 234 567');
  });

  it('shows a dash rather than a zero for a referrer who has earned nothing', () => {
    expect(formatEarned(0)).toBe('—');
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
cd frontend
npm test -- admin-referrals
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write the component and the page**

`admin-referrals.tsx` exports the two pure helpers plus the `AdminReferrals` client component:

```ts
export interface ReferrerRow {
  userId: string;
  displayName?: string | null;
  telegramUsername?: string | null;
  invitedCount: number;
  rewardedCount: number;
  earnedSom: number;
}

/** Reyting: ko'p olib kelgan yuqorida; tenglashsa haqiqatan to'langani hal qiladi. */
export function sortByInvited<T extends { invitedCount: number; earnedSom: number }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => b.invitedCount - a.invitedCount || b.earnedSom - a.earnedSom,
  );
}

export function formatEarned(som: number): string {
  if (!som) return '—';
  return som.toLocaleString('uz-UZ').replace(/ /g, ' ');
}
```

The component itself: a table of referrers (name, username, invited, rewarded, earned), a row click that expands into the people that referrer brought (`GET /admin/referrals/{userId}`), and a settings card with the reward amount and a save button. Model the layout and the loading/error handling on `src/components/admin/admin-partners.tsx`.

`app/admin/referrals/page.tsx` mirrors `app/admin/partners/page.tsx` exactly, including its admin guard.

- [ ] **Step 5: Add the nav entry**

In `admin-shell.tsx`, add `/admin/referrals` to `ADMIN_NAV_GROUPS` with a label of "Referallar" and a `Users`-family icon from `lucide-react`.

Not `AdminTabs` — that component is dead code and nothing renders it. Editing it is how `/admin/bot` shipped reachable only by typing its URL.

- [ ] **Step 6: Run the frontend suite**

```bash
cd frontend
npm test
npm run lint
```

Expected: PASS, including the `admin-shell` nav test that would have failed in step 1 had the entry been missing.

- [ ] **Step 7: Put the top referrers on the main admin dashboard**

Spec §7.6. The section page answers "who referred whom"; the dashboard answers the question the
section pages cannot — *who is growing the platform right now* — and it is the reason this data is
worth collecting from people who will never be partners.

Find the admin dashboard page (`frontend/src/app/admin/page.tsx` or whatever `/admin` renders) and
add a card showing the top five rows from `sortByInvited`, each linking to
`/admin/referrals#<userId>`, with a "Barchasi" link to `/admin/referrals`.

Reuse `sortByInvited` and `formatEarned` from `admin-referrals.tsx` rather than re-deriving the
ranking. Two orderings that drift apart would have the dashboard and the section disagree about who
is top, and nobody would know which to believe.

- [ ] **Step 8: Mutation-check the nav guard**

Remove the `/admin/referrals` entry from `ADMIN_NAV_GROUPS` and run `npm test -- admin-shell`. It must fail. Restore it.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/admin-referrals.ts frontend/src/components/admin/admin-referrals.tsx \
        frontend/src/components/admin/admin-referrals.test.ts \
        frontend/src/app/admin/referrals/ frontend/src/app/admin/page.tsx \
        frontend/src/components/admin/admin-shell.tsx
git commit -m "feat(admin): the referrals section and the referrer leaderboard

Ranked by how many people each referrer brought, with ties broken by
what was actually paid out — a referrer with five names and one trade is
worth less than one with five names and three.

The nav entry goes in ADMIN_NAV_GROUPS, not AdminTabs. AdminTabs is dead
code, which is how /admin/bot shipped reachable only by typing its URL."
```

---

## Verification before calling this done

- [ ] `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test` — green
- [ ] `cd backend/payment-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test` — green
- [ ] `cd backend/trade-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -q test` — green
- [ ] `cd frontend && npm test && npm run lint` — green
- [ ] `git log --oneline origin/main..HEAD` shows nine commits and no Claude attribution
- [ ] `docker compose config` still parses if any compose file was touched

## Out of scope — the second plan

Everything in §3.1 `partner_channels`, §4.1 the posting fee, §4.2 the trade share, §4.3 the monthly payment, §6 posting, §7.1 the channel picker, §7.3 the partner panel and §7.5 the partner dashboard belongs to the partner advertising plan, which reuses `referrals`, the link codes and the click capture built here.
