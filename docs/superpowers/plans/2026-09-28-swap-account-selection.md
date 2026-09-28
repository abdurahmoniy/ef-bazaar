# Obmenda xaridor akkountini tanlash — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obmen (`SWAP` / `SWAP_SURCHARGE`) savdosida xaridor o'z profilidagi akkountlardan birini (yoki "Boshqa") tanlaydi, chatda ikkala taraf kim nima olishini ko'radi, savdo tugaganda tanlangan akkount sotuvchiga to'liq ko'chadi.

**Architecture:** trade-service xaridor akkountini marketplace'ning yangi ichki endpoint'i orqali tekshiradi va qisqa snapshot'ini taklifda (Redis hash) hamda savdo qatorida (`give_account_id` + `give_account_snapshot jsonb`) saqlaydi. `trade-succeeded` hodisasi `giveAccountId` ni olib boradi; marketplace akkountni xaridordan arxivlab, sotuvchiga to'liq nusxa ochadi va akkountning e'loni bo'lsa uni `SOLD` qiladi. Frontend qabul oynasiga akkount tanlash bo'limini, taklif kartasiga `⇄` qatorini, pinned bar'ga "Siz olasiz" qatorini va drawer'ga ikkala akkount blokini qo'shadi.

**Tech Stack:** Java 21, Spring Boot 3, JPA/Hibernate, Flyway, Redis, Kafka, JUnit 5 + Mockito + Testcontainers; Next.js/React 18, TypeScript, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-28-swap-account-selection-design.md`

## Global Constraints

- Faqat `TradeKind.SWAP` va `TradeKind.SWAP_SURCHARGE`. `SALE` da `giveAccountId` → `400`.
- `giveAccountId` ni faqat xaridor (`buyerId`) yubora oladi; sotuvchi yuborsa → `400`.
- `giveAccountId == null` = "Boshqa": hozirgi xatti-harakat bit-ma-bit o'zgarmaydi (bo'sh "Obmendan kelgan akkount" kartochkasi).
- Marketplace javob bermasa → savdo ochilmaydi (fail-closed, `502`/`503` — mavjud `ListingTermsClient` naqshi `502 BAD_GATEWAY` qaytaradi, shu ishlatiladi).
- Band akkount → `409`. Begona / faol emas → `400`.
- Spec'dagi 4-tekshiruv ("akkount obmendagi e'lonning o'z akkounti emas") alohida yozilmaydi: e'lon akkountining egasi sotuvchi, `giveAccountId` esa xaridorniki bo'lishi shart — egasi tekshiruvi buni allaqachon qamraydi.
- Snapshot savdo davomida o'zgarmaydi.
- `archivedReason = SWAPPED_ON_PLATFORM` — ustun `VARCHAR(24)`, CHECK yo'q, marketplace migratsiyasi kerak emas.
- Flyway: V-fayllar immutable. Yangi trade-service migratsiya raqamini yozishdan oldin `ls backend/trade-service/src/main/resources/db/migration | sort -V | tail -1` VA `git ls-tree --name-only origin/main backend/trade-service/src/main/resources/db/migration/ | sort -V | tail -1` ni tekshir. Rejada `V28` deb yozilgan — kattarog'i bo'lsa keyingisini ol.
- Java build: `JAVA_HOME=~/.jdks/openjdk-21.0.2`; Testcontainers uchun `-DargLine="-Dapi.version=1.44"`. Yakuniy tekshiruv `mvn -B -ntp clean verify` (ITlar failsafe'da; `mvn test` yetarli emas).
- Frontend: Node 22, `npm ci --no-audit --no-fund`; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. `package.json` o'zgarsa `package-lock.json` ham commit qilinadi (bu rejada yangi paket yo'q).
- UI matnlari o'zbekcha, chatdagi mavjud apostrof uslubi (`’` / `‘`) saqlanadi.
- Mini App: tanlash ro'yxati `max-h-64 overflow-y-auto`, tap maqsadlari `min-h-11`.
- Commit xabarlari: `feat(trade): ...`, `feat(marketplace): ...`, `feat(frontend): ...`. Claude imzosi, `Co-Authored-By`, `Claude-Session` qo'shilmaydi.
- **Frontend'da taklifni faqat sotuvchi yuboradi** (`ProposeModal` doim `sellerId: viewerId`). Shuning uchun frontend'da akkount tanlash faqat qabul oynasida (`AcceptModal`). Backend spec bo'yicha xaridor taklifini ham qo'llaydi.

## Review Focus

1. Ikki xaridor bir vaqtda bitta akkountni ikki savdoga qabul qiladi — ikkinchisi `409` olishi kerak (DB darajasida qisman unique indeks; Task 2 IT).
2. Taklif ochiq turgan 10 daqiqada xaridor tanlangan akkountni bozordan olib tashlaydi yoki o'chiradi — accept `400` qaytarishi kerak, savdo ochilmasligi kerak (Task 4 testi: accept'da qayta tekshiruv).
3. `trade-succeeded` qayta yetkaziladi — sotuvchida ikkinchi nusxa ochilmasligi, e'lon ikki marta belgilanmasligi kerak (Task 6 idempotentlik testi).
4. Xaridorning profilida akkount yo'q — qabul oynasi faqat "Boshqa" bilan ishlashi, yuborish bloklanmasligi kerak (Task 8 testi).
5. Eski frontend (giveAccountId yubormaydi) sotuvchi ochgan obmenni qabul qiladi — "Boshqa" sifatida ishlashi kerak, `400` emas (Task 4 testi).

---

### Task 1: marketplace — ichki akkount qisqachasi endpoint'i

**Files:**
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/controller/InternalAccountController.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/controller/InternalAccountControllerTest.java`

**Interfaces:**
- Produces: `GET /internal/marketplace/v1/accounts/{id}` → JSON
  `{ id: UUID, ownerId: UUID, status: "ACTIVE"|"ARCHIVED", title: String|null, coverMessageId: String|null, summary: String, teamStrength: Integer|null, currentListingId: UUID|null }`. Topilmasa `404`.
  `/internal/**` allaqachon `InternalSecretFilter` bilan himoyalangan (`SecurityConfig.java:88-91`).

- [ ] **Step 1: Failing test**

```java
package uz.efbazaar.marketplace.controller;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.account.UserAccount;
import uz.efbazaar.marketplace.account.UserAccountRepository;
import uz.efbazaar.marketplace.account.UserAccountStatus;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class InternalAccountControllerTest {

    private final UserAccountRepository accounts = mock(UserAccountRepository.class);
    private final InternalAccountController controller = new InternalAccountController(accounts);

    @Test
    void summarisesTheAccountForTradeService() {
        UUID id = UUID.randomUUID();
        UUID owner = UUID.randomUUID();
        UUID listing = UUID.randomUUID();
        when(accounts.findById(id)).thenReturn(Optional.of(UserAccount.builder()
                .id(id).ownerId(owner).title("Asosiy akk")
                .description("Juda   kuchli\nakkount " + "x".repeat(200))
                .attributes(new HashMap<>(Map.of("team_strength", 3250)))
                .mediaMessageIds(new ArrayList<>(List.of("m-1", "m-2")))
                .status(UserAccountStatus.ACTIVE).currentListingId(listing).build()));

        var summary = controller.summary(id);

        assertThat(summary.ownerId()).isEqualTo(owner);
        assertThat(summary.status()).isEqualTo("ACTIVE");
        assertThat(summary.title()).isEqualTo("Asosiy akk");
        assertThat(summary.coverMessageId()).isEqualTo("m-1");
        assertThat(summary.summary()).startsWith("Juda kuchli akkount").hasSizeLessThanOrEqualTo(81);
        assertThat(summary.teamStrength()).isEqualTo(3250);
        assertThat(summary.currentListingId()).isEqualTo(listing);
    }

    @Test
    void emptyFieldsStayEmpty() {
        UUID id = UUID.randomUUID();
        when(accounts.findById(id)).thenReturn(Optional.of(UserAccount.builder()
                .id(id).ownerId(UUID.randomUUID()).attributes(new HashMap<>())
                .mediaMessageIds(new ArrayList<>()).status(UserAccountStatus.ARCHIVED).build()));

        var summary = controller.summary(id);

        assertThat(summary.coverMessageId()).isNull();
        assertThat(summary.summary()).isEmpty();
        assertThat(summary.teamStrength()).isNull();
        assertThat(summary.status()).isEqualTo("ARCHIVED");
    }

    @Test
    void unknownAccountIs404() {
        UUID id = UUID.randomUUID();
        when(accounts.findById(id)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> controller.summary(id))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }
}
```

- [ ] **Step 2: Run — FAIL (class yo'q)**

Run (in `backend/marketplace-service`): `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp -q test -Dtest=InternalAccountControllerTest`
Expected: compilation error `cannot find symbol InternalAccountController`.

- [ ] **Step 3: Implement**

```java
package uz.efbazaar.marketplace.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.account.UserAccount;
import uz.efbazaar.marketplace.account.UserAccountRepository;

import java.util.List;
import java.util.UUID;

/**
 * Obmenda xaridor beradigan akkountning qisqachasi — trade-service uchun.
 *
 * <p>trade-service egasini, holatini va e'lonini tekshiradi, qolganini esa
 * savdoga snapshot qilib yozadi: sotuvchi xaridorning shaxsiy akkountlarini
 * o'qiy olmaydi, lekin nima olishini ko'rishi kerak.
 */
@RestController
@RequestMapping("/internal/marketplace/v1/accounts")
@RequiredArgsConstructor
public class InternalAccountController {

    private static final int SUMMARY_LIMIT = 80;

    private final UserAccountRepository accounts;

    public record AccountSummary(UUID id, UUID ownerId, String status, String title,
                                 String coverMessageId, String summary,
                                 Integer teamStrength, UUID currentListingId) {}

    @GetMapping("/{id}")
    public AccountSummary summary(@PathVariable UUID id) {
        UserAccount a = accounts.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Akkount topilmadi"));
        List<String> media = a.getMediaMessageIds();
        return new AccountSummary(a.getId(), a.getOwnerId(), a.getStatus().name(), a.getTitle(),
                media == null || media.isEmpty() ? null : media.get(0),
                shorten(a.getDescription()),
                teamStrength(a.getAttributes() == null ? null : a.getAttributes().get("team_strength")),
                a.getCurrentListingId());
    }

    private static String shorten(String description) {
        if (description == null) return "";
        String flat = description.replaceAll("\\s+", " ").trim();
        return flat.length() <= SUMMARY_LIMIT ? flat : flat.substring(0, SUMMARY_LIMIT) + "…";
    }

    private static Integer teamStrength(Object raw) {
        if (raw == null) return null;
        try {
            int value = Integer.parseInt(raw.toString().trim());
            return value > 0 ? value : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
```

- [ ] **Step 4: Run — PASS**

Run: `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp -q test -Dtest=InternalAccountControllerTest`
Expected: `Tests run: 3, Failures: 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/controller/InternalAccountController.java \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/controller/InternalAccountControllerTest.java
git commit -m "feat(marketplace): akkount qisqachasi uchun ichki endpoint"
```

---

### Task 2: trade-service — savdo qatorida `give_account` va snapshot

**Files:**
- Create: `backend/trade-service/src/main/resources/db/migration/V28__trade_give_account.sql`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/GiveAccountSnapshot.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/Trade.java` (after `adminFeePayer` field, ~line 118)
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/TradeResponse.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeRepository.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java` (`toResponse` ~line 346; new `attachGiveAccount`)
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/GiveAccountPersistenceIT.java`

**Interfaces:**
- Produces:
  - `record GiveAccountSnapshot(UUID id, String title, String coverMessageId, String summary, Integer teamStrength)` with `Map<String,Object> toMap()` and `static GiveAccountSnapshot fromMap(UUID id, Map<String,Object>)` (null-safe).
  - `Trade.giveAccountId: UUID`, `Trade.giveAccountSnapshot: Map<String,Object>`.
  - `TradeResponse.giveAccount: GiveAccountSnapshot` (last component; existing 20- and 21-arg constructors keep working).
  - `TradeRepository.existsLiveWithGiveAccount(UUID accountId, Collection<TradeState> states): boolean`
  - `TradeRepository.existsLiveWithListing(UUID listingId, Collection<TradeState> states): boolean`
  - `TradeRepository.findGiveAccountIdsOfBuyer(UUID buyerId, Collection<TradeState> states): List<UUID>`
  - `TradeService.attachGiveAccount(UUID tradeId, GiveAccountSnapshot snapshot, ParticipantRole role): TradeResponse` — `@Transactional`, writes both columns, returns `toResponse(t, role)`.

- [ ] **Step 1: Migration**

```sql
-- Obmenda xaridor beradigan akkount. NULL = "Boshqa" (platformadan tashqari).
ALTER TABLE trades ADD COLUMN give_account_id UUID;
ALTER TABLE trades ADD COLUMN give_account_snapshot JSONB;

-- Bitta akkount bir vaqtda faqat bitta tirik savdoda berilishi mumkin.
-- Ilova tekshiruvi poygada ikkalasini ham o'tkazib yuborishi mumkin — bu oxirgi to'siq.
CREATE UNIQUE INDEX ux_trades_live_give_account
    ON trades (give_account_id)
    WHERE give_account_id IS NOT NULL
      AND state NOT IN ('SUCCESS', 'REJECTED', 'ORPHANED');
```

- [ ] **Step 2: Failing IT**

```java
package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import uz.efbazaar.trade.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Import(StubEscrowConfig.class)
class GiveAccountPersistenceIT extends AbstractIntegrationIT {

    @Autowired TradeService trades;
    @Autowired TradeRepository tradeRepo;

    private UUID openSwap(UUID buyer) {
        return trades.openTrade(UUID.randomUUID(), UUID.randomUUID(), buyer, 0L,
                null, null, UUID.randomUUID(), null, TradeMode.SMART, null, null,
                TradeKind.SWAP, 500_000L).id();
    }

    @Test
    void theSnapshotIsStoredAndReturnedToBothSides() {
        UUID buyer = UUID.randomUUID();
        UUID tradeId = openSwap(buyer);
        UUID account = UUID.randomUUID();
        var snapshot = new GiveAccountSnapshot(account, "Asosiy akk", "m-1", "Kuchli akkount", 3250);

        var response = trades.attachGiveAccount(tradeId, snapshot, ParticipantRole.BUYER);

        assertThat(response.giveAccount()).isEqualTo(snapshot);
        Trade saved = tradeRepo.findById(tradeId).orElseThrow();
        assertThat(saved.getGiveAccountId()).isEqualTo(account);
        assertThat(trades.toResponse(saved, ParticipantRole.SELLER).giveAccount()).isEqualTo(snapshot);
        assertThat(tradeRepo.existsLiveWithGiveAccount(account, TradeState.nonTerminal())).isTrue();
        assertThat(tradeRepo.findGiveAccountIdsOfBuyer(buyer, TradeState.nonTerminal())).containsExactly(account);
    }

    @Test
    void aTradeWithoutAChosenAccountHasNoSnapshot() {
        UUID tradeId = openSwap(UUID.randomUUID());
        Trade saved = tradeRepo.findById(tradeId).orElseThrow();
        assertThat(trades.toResponse(saved, ParticipantRole.SELLER).giveAccount()).isNull();
    }

    @Test
    void oneAccountCannotBeGivenInTwoLiveTrades() {
        UUID account = UUID.randomUUID();
        var snapshot = new GiveAccountSnapshot(account, null, null, "", null);
        trades.attachGiveAccount(openSwap(UUID.randomUUID()), snapshot, ParticipantRole.BUYER);
        UUID second = openSwap(UUID.randomUUID());

        assertThatThrownBy(() -> trades.attachGiveAccount(second, snapshot, ParticipantRole.BUYER))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aLiveTradeOnTheListingIsDetected() {
        UUID listing = UUID.randomUUID();
        trades.openTrade(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 0L,
                null, null, listing, null, TradeMode.SMART, null, null, TradeKind.SWAP, 500_000L);
        assertThat(tradeRepo.existsLiveWithListing(listing, TradeState.nonTerminal())).isTrue();
        assertThat(tradeRepo.existsLiveWithListing(UUID.randomUUID(), TradeState.nonTerminal())).isFalse();
    }
}
```

Note: check `AbstractIntegrationIT` / `StubEscrowConfig` packages via `SwapTradeIT` imports and copy them exactly.

- [ ] **Step 3: Run — FAIL**

Run (in `backend/trade-service`): `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp -q verify -Dit.test=GiveAccountPersistenceIT -Dtest=NoSuchTest -Dsurefire.failIfNoSpecifiedTests=false -DargLine="-Dapi.version=1.44"`
Expected: compilation error (`GiveAccountSnapshot`, `attachGiveAccount` missing).

- [ ] **Step 4: Implement**

`GiveAccountSnapshot.java`:

```java
package uz.efbazaar.trade.trade.domain;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Obmenda xaridor beradigan akkountning savdo ochilgan paytdagi ko'rinishi.
 *
 * <p>Nusxa, havola emas: savdo davomida xaridor akkountni tahrirlasa ham
 * ikkala taraf kelishilgan narsani ko'radi. Sotuvchi esa xaridorning shaxsiy
 * akkountlarini boshqa yo'l bilan o'qiy olmaydi.
 */
public record GiveAccountSnapshot(UUID id, String title, String coverMessageId,
                                  String summary, Integer teamStrength) {

    public Map<String, Object> toMap() {
        Map<String, Object> m = new HashMap<>();
        m.put("title", title);
        m.put("coverMessageId", coverMessageId);
        m.put("summary", summary);
        m.put("teamStrength", teamStrength);
        return m;
    }

    public static GiveAccountSnapshot fromMap(UUID id, Map<String, Object> m) {
        if (id == null) return null;
        if (m == null) return new GiveAccountSnapshot(id, null, null, "", null);
        Object ts = m.get("teamStrength");
        return new GiveAccountSnapshot(id,
                (String) m.get("title"),
                (String) m.get("coverMessageId"),
                m.get("summary") == null ? "" : m.get("summary").toString(),
                ts instanceof Number n ? n.intValue() : null);
    }
}
```

`Trade.java` — add after the `adminFeePayer` field (keep imports `org.hibernate.annotations.JdbcTypeCode`, `org.hibernate.type.SqlTypes`, `java.util.Map`):

```java
    /** Obmenda xaridor beradigan akkount. null — "Boshqa" yoki obmen emas. */
    @Column(name = "give_account_id")
    private UUID giveAccountId;

    /** {@link GiveAccountSnapshot#toMap()} — savdo ochilgandagi ko'rinish. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "give_account_snapshot", columnDefinition = "jsonb")
    private Map<String, Object> giveAccountSnapshot;
```

`TradeResponse.java` — append a component and keep the old 21-arg shape as a constructor:

```java
        Instant updatedAt,
        AdminFeePayer adminFeePayer,
        /** Obmenda xaridor beradigan akkount. null — tanlanmagan ("Boshqa") yoki sotuv. */
        GiveAccountSnapshot giveAccount
) {
    public TradeResponse(UUID id, TradeState state, UUID sellerId, UUID buyerId, long priceUzs, UUID mailboxId, String mailboxEmail, UUID chatId, Instant createdAt, Instant expiresAt, Instant stateDeadline, ParticipantRole role, UUID passwordMessageId, String emailChangeVerificationCode, TradeKind kind, List<TradeSideResponse> sides, String counterpartMailboxEmail, String loginVerificationCode, Instant confirmUnlocksAt, Instant updatedAt, AdminFeePayer adminFeePayer) {
        this(id, state, sellerId, buyerId, priceUzs, mailboxId, mailboxEmail, chatId, createdAt, expiresAt, stateDeadline, role, passwordMessageId, emailChangeVerificationCode, kind, sides, counterpartMailboxEmail, loginVerificationCode, confirmUnlocksAt, updatedAt, adminFeePayer, null);
    }

    public TradeResponse(UUID id, TradeState state, UUID sellerId, UUID buyerId, long priceUzs, UUID mailboxId, String mailboxEmail, UUID chatId, Instant createdAt, Instant expiresAt, Instant stateDeadline, ParticipantRole role, UUID passwordMessageId, String emailChangeVerificationCode, TradeKind kind, List<TradeSideResponse> sides, String counterpartMailboxEmail, String loginVerificationCode, Instant confirmUnlocksAt, Instant updatedAt) {
        this(id, state, sellerId, buyerId, priceUzs, mailboxId, mailboxEmail, chatId, createdAt, expiresAt, stateDeadline, role, passwordMessageId, emailChangeVerificationCode, kind, sides, counterpartMailboxEmail, loginVerificationCode, confirmUnlocksAt, updatedAt, AdminFeePayer.SELLER, null);
    }
}
```

(Import `uz.efbazaar.trade.trade.domain.GiveAccountSnapshot`.)

`TradeRepository.java` — next to `existsLiveInChat`:

```java
    @Query("""
            SELECT COUNT(t) > 0 FROM Trade t
             WHERE t.giveAccountId = :accountId
               AND t.state IN :states
            """)
    boolean existsLiveWithGiveAccount(@Param("accountId") UUID accountId,
                                      @Param("states") java.util.Collection<TradeState> states);

    @Query("""
            SELECT COUNT(t) > 0 FROM Trade t
             WHERE t.listingId = :listingId
               AND t.state IN :states
            """)
    boolean existsLiveWithListing(@Param("listingId") UUID listingId,
                                  @Param("states") java.util.Collection<TradeState> states);

    /** Qabul oynasida "Savdoda" belgisi uchun. */
    @Query("""
            SELECT t.giveAccountId FROM Trade t
             WHERE t.buyerId = :buyerId
               AND t.giveAccountId IS NOT NULL
               AND t.state IN :states
            """)
    List<UUID> findGiveAccountIdsOfBuyer(@Param("buyerId") UUID buyerId,
                                         @Param("states") java.util.Collection<TradeState> states);
```

`TradeService.java` — in `toResponse`, change the last constructor argument list end from `null, t.getUpdatedAt(), t.getAdminFeePayer());` to:

```java
                null, t.getUpdatedAt(), t.getAdminFeePayer(),
                GiveAccountSnapshot.fromMap(t.getGiveAccountId(), t.getGiveAccountSnapshot()));
```

and add below `toResponse`:

```java
    /**
     * Obmenda xaridor tanlagan akkountni savdoga yozadi.
     *
     * <p>{@code saveAndFlush}: qisman unique indeks poygani shu yerda ushlaydi,
     * accept tranzaksiyasi esa butunlay orqaga qaytadi.
     */
    @Transactional
    public TradeResponse attachGiveAccount(UUID tradeId, GiveAccountSnapshot snapshot, ParticipantRole role) {
        Trade t = trades.findById(tradeId).orElseThrow();
        t.setGiveAccountId(snapshot.id());
        t.setGiveAccountSnapshot(snapshot.toMap());
        trades.saveAndFlush(t);
        return toResponse(t, role);
    }
```

- [ ] **Step 5: Run — PASS**

Same command as Step 3. Expected: `Tests run: 4, Failures: 0, Errors: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/trade-service/src/main/resources/db/migration/V28__trade_give_account.sql \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/GiveAccountSnapshot.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/Trade.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/TradeResponse.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeRepository.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/trade/GiveAccountPersistenceIT.java
git commit -m "feat(trade): savdoda obmen akkounti snapshot'i"
```

---

### Task 3: trade-service — `AccountSummaryClient` va `SwapAccountGuard`

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/marketplace/AccountSummaryClient.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/SwapAccountGuard.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/SwapAccountGuardTest.java`

**Interfaces:**
- Consumes: Task 1 endpoint; Task 2 `TradeRepository.existsLiveWithGiveAccount`, `existsLiveWithListing`, `GiveAccountSnapshot`.
- Produces:
  - `AccountSummaryClient.fetch(UUID accountId): AccountSummaryClient.AccountSummary` — `record AccountSummary(UUID id, UUID ownerId, String status, String title, String coverMessageId, String summary, Integer teamStrength, UUID currentListingId)`. 404 → `ResponseStatusException(400, "Bu akkount sizga tegishli emas yoki faol emas")`; other failures → `502`.
  - `SwapAccountGuard.check(UUID accountId, UUID buyerId, TradeKind kind): GiveAccountSnapshot` — returns `null` when `accountId == null`; throws `400` for SALE, foreign/inactive account; `409` when busy.

- [ ] **Step 1: Failing test**

```java
package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.marketplace.AccountSummaryClient;
import uz.efbazaar.trade.trade.domain.GiveAccountSnapshot;
import uz.efbazaar.trade.trade.domain.TradeKind;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.SwapAccountGuard;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class SwapAccountGuardTest {

    private final AccountSummaryClient client = mock(AccountSummaryClient.class);
    private final TradeRepository trades = mock(TradeRepository.class);
    private final SwapAccountGuard guard = new SwapAccountGuard(client, trades);
    private final UUID buyer = UUID.randomUUID();
    private final UUID account = UUID.randomUUID();

    private void account(UUID owner, String status, UUID listing) {
        when(client.fetch(account)).thenReturn(new AccountSummaryClient.AccountSummary(
                account, owner, status, "Asosiy akk", "m-1", "Kuchli", 3250, listing));
    }

    private static int status(Throwable e) {
        return ((ResponseStatusException) e).getStatusCode().value();
    }

    @Test
    void noAccountMeansOtherAndSkipsMarketplace() {
        assertThat(guard.check(null, buyer, TradeKind.SWAP)).isNull();
        verifyNoInteractions(client, trades);
    }

    @Test
    void aSaleCannotCarryAnAccount() {
        assertThatThrownBy(() -> guard.check(account, buyer, TradeKind.SALE))
                .satisfies(e -> assertThat(status(e)).isEqualTo(400));
        verifyNoInteractions(client);
    }

    @Test
    void returnsTheSnapshotOfAFreeOwnAccount() {
        account(buyer, "ACTIVE", null);
        assertThat(guard.check(account, buyer, TradeKind.SWAP_SURCHARGE))
                .isEqualTo(new GiveAccountSnapshot(account, "Asosiy akk", "m-1", "Kuchli", 3250));
    }

    @Test
    void someoneElsesAccountIsRefused() {
        account(UUID.randomUUID(), "ACTIVE", null);
        assertThatThrownBy(() -> guard.check(account, buyer, TradeKind.SWAP))
                .satisfies(e -> assertThat(status(e)).isEqualTo(400));
    }

    @Test
    void anArchivedAccountIsRefused() {
        account(buyer, "ARCHIVED", null);
        assertThatThrownBy(() -> guard.check(account, buyer, TradeKind.SWAP))
                .satisfies(e -> assertThat(status(e)).isEqualTo(400));
    }

    @Test
    void anAccountAlreadyGivenInALiveTradeIsBusy() {
        account(buyer, "ACTIVE", null);
        when(trades.existsLiveWithGiveAccount(eq(account), any())).thenReturn(true);
        assertThatThrownBy(() -> guard.check(account, buyer, TradeKind.SWAP))
                .satisfies(e -> assertThat(status(e)).isEqualTo(409));
    }

    @Test
    void anAccountWhoseListingIsBeingSoldIsBusy() {
        UUID listing = UUID.randomUUID();
        account(buyer, "ACTIVE", listing);
        when(trades.existsLiveWithListing(eq(listing), any())).thenReturn(true);
        assertThatThrownBy(() -> guard.check(account, buyer, TradeKind.SWAP))
                .satisfies(e -> assertThat(status(e)).isEqualTo(409));
    }

    @Test
    void aListedButIdleAccountIsAllowed() {
        UUID listing = UUID.randomUUID();
        account(buyer, "ACTIVE", listing);
        assertThat(guard.check(account, buyer, TradeKind.SWAP)).isNotNull();
    }

    @Test
    void marketplaceOutageBlocksTheTrade() {
        when(client.fetch(account)).thenThrow(new ResponseStatusException(HttpStatus.BAD_GATEWAY, "down"));
        assertThatThrownBy(() -> guard.check(account, buyer, TradeKind.SWAP))
                .satisfies(e -> assertThat(status(e)).isEqualTo(502));
    }
}
```

- [ ] **Step 2: Run — FAIL**

Run (in `backend/trade-service`): `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp -q test -Dtest=SwapAccountGuardTest`
Expected: compilation error (`AccountSummaryClient`, `SwapAccountGuard` missing).

- [ ] **Step 3: Implement**

`AccountSummaryClient.java` (mirror `ListingTermsClient`):

```java
package uz.efbazaar.trade.marketplace;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * Obmenda xaridor beradigan akkount — marketplace'ning o'z ma'lumoti.
 *
 * <p>Egasi va holati klientdan olinmaydi: aks holda xaridor birovning
 * akkountini "beraman" deb yozib, sotuvchini aldashi mumkin edi.
 */
@Slf4j
@Component
public class AccountSummaryClient {

    private static final String HEADER = "X-Internal-Secret";

    public record AccountSummary(UUID id, UUID ownerId, String status, String title,
                                 String coverMessageId, String summary,
                                 Integer teamStrength, UUID currentListingId) {}

    private final RestClient http;
    private final String secret;

    public AccountSummaryClient(@Qualifier("marketplaceClient") RestClient http,
                                @Value("${app.auth.internal-secret:}") String secret) {
        this.http = http;
        this.secret = secret;
    }

    public AccountSummary fetch(UUID accountId) {
        try {
            AccountSummary summary = http.get()
                    .uri("/internal/marketplace/v1/accounts/{id}", accountId)
                    .header(HEADER, secret)
                    .retrieve()
                    .body(AccountSummary.class);
            if (summary == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Akkountni o'qib bo'lmadi");
            }
            return summary;
        } catch (HttpClientErrorException.NotFound e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu akkount sizga tegishli emas yoki faol emas");
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Could not read account {}: {}", accountId, e.toString());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Akkountni o'qib bo'lmadi — keyinroq urinib ko'ring");
        }
    }
}
```

`SwapAccountGuard.java`:

```java
package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.marketplace.AccountSummaryClient;
import uz.efbazaar.trade.trade.domain.GiveAccountSnapshot;
import uz.efbazaar.trade.trade.domain.TradeKind;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.UUID;

/**
 * Obmenda xaridor beradigan akkount haqiqatan uniki va bo'shmi.
 *
 * <p>Taklifda ham, qabulda ham chaqiriladi: taklif 10 daqiqa yashaydi va
 * shu orada akkount boshqa savdoga kirib qolishi yoki o'chirilishi mumkin.
 */
@Component
@RequiredArgsConstructor
public class SwapAccountGuard {

    private final AccountSummaryClient accounts;
    private final TradeRepository trades;

    /** @return snapshot, yoki {@code accountId == null} ("Boshqa") bo'lsa null */
    public GiveAccountSnapshot check(UUID accountId, UUID buyerId, TradeKind kind) {
        if (accountId == null) return null;
        if (!kind.isSwap()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Akkount faqat obmenda tanlanadi");
        }
        var a = accounts.fetch(accountId);
        if (!buyerId.equals(a.ownerId()) || !"ACTIVE".equals(a.status())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu akkount sizga tegishli emas yoki faol emas");
        }
        var live = TradeState.nonTerminal();
        if (trades.existsLiveWithGiveAccount(accountId, live)
                || (a.currentListingId() != null && trades.existsLiveWithListing(a.currentListingId(), live))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bu akkount boshqa savdoda");
        }
        return new GiveAccountSnapshot(a.id(), a.title(), a.coverMessageId(),
                a.summary() == null ? "" : a.summary(), a.teamStrength());
    }
}
```

- [ ] **Step 4: Run — PASS**

Run: `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp -q test -Dtest=SwapAccountGuardTest`
Expected: `Tests run: 9, Failures: 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/marketplace/AccountSummaryClient.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/SwapAccountGuard.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/trade/SwapAccountGuardTest.java
git commit -m "feat(trade): obmen akkountini tekshiruvchi guard"
```

---

### Task 4: trade-service — taklif va qabulda `giveAccountId`

**Files:**
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalCreateRequest.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalAcceptRequest.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalDetailsResponse.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeProposalController.java:49-58`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeProposalService.java`
- Modify (constructor arg only): the 3 test files that call `new TradeProposalService(` — find with `grep -rln "new TradeProposalService(" backend/trade-service/src/test`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/SwapAccountProposalTest.java`

**Interfaces:**
- Consumes: Task 3 `SwapAccountGuard.check(UUID, UUID, TradeKind)`; Task 2 `TradeService.attachGiveAccount(UUID, GiveAccountSnapshot, ParticipantRole)`.
- Produces:
  - `ProposalCreateRequest.giveAccountId: UUID` (new last component; existing 11- and 12-arg constructors kept, passing `null`).
  - `ProposalAcceptRequest(UUID cardId, UUID giveAccountId)` + `ProposalAcceptRequest(UUID cardId)` constructor.
  - `TradeProposalService.accept(UUID accepter, UUID proposalId, UUID cardId, UUID giveAccountId)`; old 3-arg `accept` delegates with `null`.
  - `ProposalDetailsResponse.giveAccount: GiveAccountSnapshot` (new last component; existing constructors pass `null`).
  - Redis hash fields: `giveAccountId`, `giveAccountTitle`, `giveAccountCover`, `giveAccountSummary`, `giveAccountTs` (empty string when absent).
  - `TradeProposalService` constructor gains a last parameter `SwapAccountGuard swapAccounts`.

- [ ] **Step 1: Failing test**

```java
package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.service.TradeAdminProfileService;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.marketplace.ListingTermsClient;
import uz.efbazaar.trade.payment.EscrowClient;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.*;

import java.math.BigDecimal;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SwapAccountProposalTest {
    private final UUID seller = UUID.randomUUID();
    private final UUID buyer = UUID.randomUUID();
    private final UUID listing = UUID.randomUUID();
    private final UUID proposal = UUID.randomUUID();
    private final UUID account = UUID.randomUUID();
    private final GiveAccountSnapshot snapshot = new GiveAccountSnapshot(account, "Asosiy akk", "m-1", "Kuchli", 3250);

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final HashOperations<String, Object, Object> hashes = mock(HashOperations.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    private final TradeService trades = mock(TradeService.class);
    private final EscrowClient escrow = mock(EscrowClient.class);
    private final ListingTermsClient listings = mock(ListingTermsClient.class);
    private final SwapAccountGuard guard = mock(SwapAccountGuard.class);
    private final TradeProposalService service = new TradeProposalService(redis,
            mock(TradeEventPublisher.class), trades, mock(TradeAuditService.class),
            mock(TradeAdminProfileService.class), escrow, listings, guard);

    private TradeResponse trade(TradeKind kind) {
        return new TradeResponse(UUID.randomUUID(), null, seller, buyer, 0,
                null, null, null, null, null, null, null, null, null, kind, null, null, null, null, null);
    }

    private void storedProposal(UUID proposer, TradeKind kind, Map<String, String> extra) {
        when(redis.opsForHash()).thenReturn(hashes);
        Map<Object, Object> raw = new HashMap<>(Map.of(
                "proposerUserId", proposer.toString(), "sellerId", seller.toString(),
                "buyerId", buyer.toString(), "amountUzs", kind == TradeKind.SWAP ? "0" : "5000",
                "listingId", listing.toString(), "kind", kind.name()));
        raw.putAll(extra);
        when(hashes.entries(anyString())).thenReturn(raw);
        when(listings.fetch(listing)).thenReturn(new ListingTermsClient.ListingTerms(
                listing, seller, BigDecimal.valueOf(20000), "ACTIVE", "BOTH"));
        TradeResponse opened = trade(kind);
        when(trades.openTrade(any(UUID.class), eq(seller), eq(buyer), anyLong(), any(), any(), eq(listing),
                any(), any(), any(), any(), eq(kind), anyLong(), any())).thenReturn(opened);
        when(trades.attachGiveAccount(any(), any(), any())).thenReturn(opened);
    }

    @Test
    void theBuyerPicksTheirAccountWhenAcceptingASellersSwap() {
        storedProposal(seller, TradeKind.SWAP, Map.of());
        when(guard.check(account, buyer, TradeKind.SWAP)).thenReturn(snapshot);

        service.accept(buyer, proposal, null, account);

        verify(trades).attachGiveAccount(any(UUID.class), eq(snapshot), eq(ParticipantRole.BUYER));
    }

    @Test
    void acceptingWithoutAnAccountIsOther() {
        // Eski frontend giveAccountId yubormaydi — "Boshqa" sifatida o'tishi kerak.
        storedProposal(seller, TradeKind.SWAP, Map.of());

        service.accept(buyer, proposal, null, null);

        verify(guard).check(null, buyer, TradeKind.SWAP);
        verify(trades, never()).attachGiveAccount(any(), any(), any());
    }

    @Test
    void theSellerCannotChooseTheBuyersAccount() {
        storedProposal(buyer, TradeKind.SWAP, Map.of());
        assertThatThrownBy(() -> service.accept(seller, proposal, null, account))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(escrow);
        verify(trades, never()).openTrade(any(UUID.class), any(), any(), anyLong(), any(), any(), any(),
                any(), any(), any(), any(), any(), anyLong(), any());
    }

    @Test
    void aBuyersOwnProposalKeepsItsAccountAndIsRecheckedAtAccept() {
        storedProposal(buyer, TradeKind.SWAP, Map.of("giveAccountId", account.toString()));
        when(guard.check(account, buyer, TradeKind.SWAP)).thenReturn(snapshot);

        service.accept(seller, proposal, null, null);

        verify(guard).check(account, buyer, TradeKind.SWAP);
        verify(trades).attachGiveAccount(any(UUID.class), eq(snapshot), eq(ParticipantRole.SELLER));
    }

    @Test
    void anAccountThatBecameBusyStopsTheAcceptBeforeMoneyMoves() {
        storedProposal(seller, TradeKind.SWAP_SURCHARGE, Map.of());
        when(guard.check(account, buyer, TradeKind.SWAP_SURCHARGE))
                .thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "busy"));

        assertThatThrownBy(() -> service.accept(buyer, proposal, null, account))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(escrow);
    }

    @Test
    void aBuyersSwapProposalStoresTheCheckedSnapshot() {
        when(redis.opsForHash()).thenReturn(hashes);
        when(redis.opsForValue()).thenReturn(values);
        when(guard.check(account, buyer, TradeKind.SWAP)).thenReturn(snapshot);
        var smart = new ProposalCreateRequest(UUID.randomUUID(), seller, seller, buyer,
                0L, null, listing, TradeMode.SMART, null, null, TradeKind.SWAP, null, account);
        when(listings.fetch(listing)).thenReturn(new ListingTermsClient.ListingTerms(
                listing, seller, BigDecimal.valueOf(20000), "ACTIVE", "BOTH"));
        when(escrow.quote(any(), any(), any(), anyLong(), anyLong(), any()))
                .thenReturn(new EscrowClient.Quote(0, 0, 0));

        service.create(buyer, smart);

        @SuppressWarnings("unchecked")
        var captor = org.mockito.ArgumentCaptor.forClass(Map.class);
        verify(hashes).putAll(anyString(), captor.capture());
        assertThat(captor.getValue()).containsEntry("giveAccountId", account.toString())
                .containsEntry("giveAccountTitle", "Asosiy akk")
                .containsEntry("giveAccountCover", "m-1")
                .containsEntry("giveAccountTs", "3250");
    }

    @Test
    void aSellerCannotAttachAnAccountToTheirProposal() {
        var request = new ProposalCreateRequest(UUID.randomUUID(), buyer, seller, buyer,
                0L, null, listing, TradeMode.SMART, null, null, TradeKind.SWAP, null, account);
        assertThatThrownBy(() -> service.create(seller, request)).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(redis);
    }
}
```

- [ ] **Step 2: Run — FAIL**

Run: `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp -q test -Dtest=SwapAccountProposalTest`
Expected: compilation errors (constructor arity, `accept` 4-arg, `ProposalCreateRequest` 13-arg).

- [ ] **Step 3: Implement DTOs**

`ProposalCreateRequest` — add the component after `AdminFeePayer adminFeePayer`:

```java
        AdminFeePayer adminFeePayer,
        /** Obmenda xaridor beradigan akkount. Faqat xaridor yuboradi; null — "Boshqa". */
        UUID giveAccountId
) {
    public ProposalCreateRequest(UUID marketplaceChatId, UUID otherPartyUserId, UUID sellerId, UUID buyerId,
                                 Long amountUzs, UUID cardId, UUID listingId, TradeMode mode, UUID adminId,
                                 Long adminFeeUzs, TradeKind kind, AdminFeePayer adminFeePayer) {
        this(marketplaceChatId, otherPartyUserId, sellerId, buyerId, amountUzs, cardId, listingId,
                mode, adminId, adminFeeUzs, kind, adminFeePayer, null);
    }
```

and change the existing 11-arg constructor's delegation to `..., kind, null, null);`.

`ProposalAcceptRequest`:

```java
public record ProposalAcceptRequest(UUID cardId, UUID giveAccountId) {
    public ProposalAcceptRequest(UUID cardId) {
        this(cardId, null);
    }
}
```

(Extend the Javadoc with one line: `giveAccountId` — sotuvchi ochgan obmenni qabul qilayotgan xaridorning akkounti; null — "Boshqa".)

`ProposalDetailsResponse` — add `GiveAccountSnapshot giveAccount` after `Long sellerHoldTiyin`; add a 16-arg constructor passing `null`, and change the 12-arg constructor to pass `..., null, null, null, null)`.

`TradeProposalController.accept`:

```java
                proposals.accept(me.userId(), proposalId,
                        req == null ? null : req.cardId(),
                        req == null ? null : req.giveAccountId()));
```

- [ ] **Step 4: Implement service**

In `TradeProposalService`:

1. Field: `private final SwapAccountGuard swapAccounts;` (last field → last constructor param).
2. In `create`, right after the `counterpart` / distinct-parties check:

```java
        if (req.giveAccountId() != null && !proposerUserId.equals(req.buyerId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Obmen akkountini faqat xaridor tanlaydi");
        }
        GiveAccountSnapshot give = swapAccounts.check(req.giveAccountId(), req.buyerId(), req.kindOrDefault());
```

3. After `hash.put("adminFeeUzs", ...)`:

```java
        putGiveAccount(hash, give);
```

4. Helpers at the bottom:

```java
    private static void putGiveAccount(Map<String, String> hash, GiveAccountSnapshot give) {
        hash.put("giveAccountId",      give == null ? "" : give.id().toString());
        hash.put("giveAccountTitle",   give == null || give.title() == null ? "" : give.title());
        hash.put("giveAccountCover",   give == null || give.coverMessageId() == null ? "" : give.coverMessageId());
        hash.put("giveAccountSummary", give == null || give.summary() == null ? "" : give.summary());
        hash.put("giveAccountTs",      give == null || give.teamStrength() == null ? "" : give.teamStrength().toString());
    }

    private static GiveAccountSnapshot readGiveAccount(Map<Object, Object> raw) {
        UUID id = optionalUuid(raw.get("giveAccountId"));
        if (id == null) return null;
        Long ts = optionalLong(raw.get("giveAccountTs"));
        return new GiveAccountSnapshot(id,
                blankToNull(raw.get("giveAccountTitle")),
                blankToNull(raw.get("giveAccountCover")),
                raw.get("giveAccountSummary") == null ? "" : raw.get("giveAccountSummary").toString(),
                ts == null ? null : ts.intValue());
    }

    private static String blankToNull(Object v) {
        return v == null || v.toString().isBlank() ? null : v.toString();
    }
```

5. In `findActiveProposalByChatId`, pass `readGiveAccount(raw)` as the new last argument of `ProposalDetailsResponse`.

6. Replace `accept` signature:

```java
    @Transactional
    public TradeResponse accept(UUID accepterUserId, UUID proposalId, UUID accepterCardId) {
        return accept(accepterUserId, proposalId, accepterCardId, null);
    }

    @Transactional
    public TradeResponse accept(UUID accepterUserId, UUID proposalId, UUID accepterCardId, UUID giveAccountId) {
```

7. Inside `accept`, right after `TradeKind kind = ...` is computed (before the amount check):

```java
        // Xaridor taklif qilgan bo'lsa akkount taklifda; sotuvchi taklif qilgan
        // bo'lsa uni qabul qilayotgan xaridor hozir tanlaydi. Qolgan holatda
        // (sotuvchi qabul qilyapti) akkount yuborish — boshqa odamning mulkini
        // tanlash, rad etiladi.
        UUID chosenAccount;
        if (proposerUserId.equals(buyerId)) {
            if (giveAccountId != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Obmen akkountini faqat xaridor tanlaydi");
            }
            chosenAccount = optionalUuid(raw.get("giveAccountId"));
        } else {
            chosenAccount = giveAccountId;
        }
        // Qayta tekshiruv: taklif yashagan 10 daqiqada akkount band bo'lishi yoki o'chishi mumkin.
        GiveAccountSnapshot give = swapAccounts.check(chosenAccount, buyerId, kind);
```

8. Right after the `try { trade = trades.openTrade(...) } catch ...` block, before `redis.delete(mainKey)`:

```java
        if (give != null) {
            trade = trades.attachGiveAccount(trade.id(), give,
                    accepterUserId.equals(sellerId) ? ParticipantRole.SELLER : ParticipantRole.BUYER);
        }
```

Note: `attachGiveAccount` failure (unique index race) happens after `escrow.hold`. Wrap it inside the existing `try` so the existing `catch` releases the hold — i.e. put the `if (give != null) {...}` block **inside** the `try` right after `trade = trades.openTrade(...)`.

9. Update the 3 existing test files: append `, mock(SwapAccountGuard.class)` to each `new TradeProposalService(...)` call. With a plain Mockito mock, `check(...)` returns `null` = "Boshqa", so their behaviour is unchanged.

- [ ] **Step 5: Run — PASS**

Run: `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp -q test -Dtest='SwapAccountProposalTest,SellerProposalKindsTest,ProposalFeePayerTest,ProposalRejectionTest,ProposalAmountValidationTest,SwapDecisionTest'`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeProposalController.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeProposalService.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/trade
git commit -m "feat(trade): obmen taklifi va qabulida xaridor akkounti"
```

---

### Task 5: trade-service — band akkountlar endpoint'i va hodisada `giveAccountId`

**Files:**
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeController.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java` (new `busyGiveAccounts`)
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/TradeEvents.java:302` (`TradeSucceeded`)
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/TradeEventPublisher.java:115-125`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/GiveAccountPersistenceIT.java` (extend)
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/kafka/TradeSucceededGiveAccountTest.java`

**Interfaces:**
- Consumes: Task 2 `findGiveAccountIdsOfBuyer`, `Trade.getGiveAccountId()`.
- Produces:
  - `GET /api/v1/trades/busy-accounts` → `List<UUID>` (the caller's accounts given in live trades).
  - `TradeService.busyGiveAccounts(UUID userId): List<UUID>`.
  - `TradeEvents.TradeSucceeded` gains `UUID giveAccountId` **before** `Instant occurredAt` (JSON field name `giveAccountId`).

- [ ] **Step 1: Failing tests**

Add to `GiveAccountPersistenceIT`:

```java
    @Test
    void busyAccountsListsOnlyTheCallersLiveGivenAccounts() {
        UUID buyer = UUID.randomUUID();
        UUID account = UUID.randomUUID();
        trades.attachGiveAccount(openSwap(buyer), new GiveAccountSnapshot(account, null, null, "", null),
                ParticipantRole.BUYER);

        assertThat(trades.busyGiveAccounts(buyer)).containsExactly(account);
        assertThat(trades.busyGiveAccounts(UUID.randomUUID())).isEmpty();
    }
```

Create `TradeSucceededGiveAccountTest.java` — inspect `TradeEventPublisher`'s constructor and `send(...)` first; construct it with a mocked `KafkaTemplate` exactly the way an existing publisher test does (find one with `grep -rln "new TradeEventPublisher(" backend/trade-service/src/test`). If none exists, instead assert on the record directly:

```java
package uz.efbazaar.trade.kafka;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TradeSucceededGiveAccountTest {

    @Test
    void theEventCarriesTheGivenAccount() throws Exception {
        UUID account = UUID.randomUUID();
        var event = new TradeEvents.TradeSucceeded(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "SMART", "SWAP", account, Instant.now());

        String json = new com.fasterxml.jackson.databind.ObjectMapper()
                .findAndRegisterModules().writeValueAsString(event);

        assertThat(json).contains("\"giveAccountId\":\"" + account + "\"");
    }
}
```

- [ ] **Step 2: Run — FAIL** (compile errors: `busyGiveAccounts`, 8-arg `TradeSucceeded`).

Run: `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp -q test -Dtest=TradeSucceededGiveAccountTest`

- [ ] **Step 3: Implement**

`TradeEvents.TradeSucceeded` — insert before `Instant occurredAt`:

```java
            /** Obmenda xaridor bergan akkount; null — "Boshqa" yoki sotuv. marketplace uni sotuvchiga ko'chiradi. */
            UUID giveAccountId,
```

`TradeEventPublisher.tradeSucceeded` — add `trade.getGiveAccountId(),` before `Instant.now()`.
Fix any other `new TradeEvents.TradeSucceeded(` call sites (`grep -rn "new TradeEvents.TradeSucceeded(" backend/trade-service/src`) by adding `null` in that position.

`TradeService`:

```java
    @Transactional(readOnly = true)
    public List<UUID> busyGiveAccounts(UUID userId) {
        return trades.findGiveAccountIdsOfBuyer(userId, TradeState.nonTerminal());
    }
```

`TradeController` — add above `listMine`:

```java
    /**
     * Joriy foydalanuvchining tirik obmenlarda berilayotgan akkountlari —
     * qabul oynasida ular "Savdoda" deb o'chiq ko'rsatiladi.
     */
    @GetMapping("/busy-accounts")
    public List<UUID> busyAccounts(@AuthenticationPrincipal AuthenticatedUser me) {
        return trades.busyGiveAccounts(me.userId());
    }
```

- [ ] **Step 4: Run — PASS**

Run: `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp -q verify -Dtest=TradeSucceededGiveAccountTest -Dit.test=GiveAccountPersistenceIT -DargLine="-Dapi.version=1.44"`
Expected: both pass.

- [ ] **Step 5: Full trade-service verify**

Run (in `backend/trade-service`): `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp clean verify -DargLine="-Dapi.version=1.44"`
Expected: `BUILD SUCCESS`; Surefire and Failsafe summaries both `Failures: 0, Errors: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/trade-service/src
git commit -m "feat(trade): band obmen akkountlari va trade-succeeded'da giveAccountId"
```

---

### Task 6: marketplace — tanlangan akkountni sotuvchiga ko'chirish

**Files:**
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeSucceededDto.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/account/ArchivedReason.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/account/ListingAccountLink.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeSucceededConsumer.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/account/SwapAccountHandoverTest.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/kafka/TradeSucceededConsumerSwapTest.java`
- Modify (call sites only): existing tests calling `onTradeSucceeded(` with 5 args and `new TradeSucceededDto(` — find with `grep -rn "onTradeSucceeded(\|new TradeSucceededDto(" backend/marketplace-service/src/test`

**Interfaces:**
- Consumes: Task 5 event field `giveAccountId`.
- Produces:
  - `TradeSucceededDto.giveAccountId: UUID` (before `occurredAt`).
  - `ArchivedReason.SWAPPED_ON_PLATFORM`.
  - `ListingAccountLink.onTradeSucceeded(UUID tradeId, UUID listingId, UUID buyerId, UUID sellerId, String kind, UUID giveAccountId): UUID` — returns the listing id to close (the given account's `currentListingId`), or `null`. The old 5-arg overload delegates with `giveAccountId = null`.

- [ ] **Step 1: Failing tests**

`SwapAccountHandoverTest.java`:

```java
package uz.efbazaar.marketplace.account;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SwapAccountHandoverTest {

    @Mock UserAccountRepository accounts;
    @Mock UserAccountCardInventory inventory;
    @Mock ListingRepository listings;
    @Mock PendingAccountEmailRepository pendingEmails;
    @InjectMocks ListingAccountLink link;

    private final UUID tradeId = UUID.randomUUID();
    private final UUID listingId = UUID.randomUUID();
    private final UUID sellerId = UUID.randomUUID();
    private final UUID buyerId = UUID.randomUUID();
    private final UUID givenId = UUID.randomUUID();

    private UserAccount given(UUID currentListing) {
        return UserAccount.builder()
                .id(givenId).ownerId(buyerId).title("Asosiy akk").description("Kuchli akkount")
                .attributes(new HashMap<>(Map.of("team_strength", 3250, "valuable_players", List.of())))
                .mediaMessageIds(new ArrayList<>(List.of("m-1")))
                .email("buyer@efbazaar.uz").emailSource(EmailSource.PLATFORM).mailboxId(UUID.randomUUID())
                .status(UserAccountStatus.ACTIVE).currentListingId(currentListing).build();
    }

    private void common(UserAccount given) {
        when(accounts.findById(givenId)).thenReturn(Optional.of(given));
        when(accounts.findByOwnerIdAndSourceTradeId(any(), any())).thenReturn(Optional.empty());
        when(pendingEmails.findByTradeIdAndUserId(any(), any())).thenReturn(Optional.empty());
        when(accounts.saveAndFlush(any(UserAccount.class))).thenAnswer(i -> i.getArgument(0));
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setDescription("e'lon");
        listing.setAttributes(new HashMap<>());
        listing.setMediaMessageIds(new ArrayList<>());
        when(listings.findById(listingId)).thenReturn(Optional.of(listing));
    }

    private UserAccount savedFor(UUID owner) {
        ArgumentCaptor<UserAccount> saved = ArgumentCaptor.forClass(UserAccount.class);
        verify(accounts, atLeastOnce()).saveAndFlush(saved.capture());
        return saved.getAllValues().stream().filter(a -> owner.equals(a.getOwnerId())
                && tradeId.equals(a.getSourceTradeId())).findFirst().orElseThrow();
    }

    @Test
    void theSellerReceivesAFullCopyAndTheBuyersIsArchived() {
        UserAccount given = given(null);
        common(given);

        UUID toClose = link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, "SWAP", givenId);

        assertThat(toClose).isNull();
        assertThat(given.getStatus()).isEqualTo(UserAccountStatus.ARCHIVED);
        assertThat(given.getArchivedReason()).isEqualTo(ArchivedReason.SWAPPED_ON_PLATFORM);
        assertThat(given.getEmail()).isNull();
        assertThat(given.getMailboxId()).isNull();

        UserAccount seller = savedFor(sellerId);
        assertThat(seller.getTitle()).isEqualTo("Asosiy akk");
        assertThat(seller.getDescription()).isEqualTo("Kuchli akkount");
        assertThat(seller.getMediaMessageIds()).containsExactly("m-1");
        assertThat(seller.getAttributes()).containsEntry("team_strength", 3250);
        assertThat(seller.getStatus()).isEqualTo(UserAccountStatus.ACTIVE);
        verify(inventory).replace(eq(seller.getId()), any());
    }

    @Test
    void noBareCardIsOpenedWhenAnAccountWasChosen() {
        common(given(null));

        link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, "SWAP", givenId);

        ArgumentCaptor<UserAccount> saved = ArgumentCaptor.forClass(UserAccount.class);
        verify(accounts, atLeastOnce()).saveAndFlush(saved.capture());
        assertThat(saved.getAllValues()).noneMatch(a -> "Obmendan kelgan akkount".equals(a.getTitle()));
    }

    @Test
    void aListedAccountReturnsItsListingToClose() {
        UUID listed = UUID.randomUUID();
        UserAccount given = given(listed);
        common(given);

        UUID toClose = link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, "SWAP_SURCHARGE", givenId);

        assertThat(toClose).isEqualTo(listed);
        assertThat(given.getCurrentListingId()).isNull();
    }

    @Test
    void redeliveryDoesNothing() {
        common(given(null));
        when(accounts.findByOwnerIdAndSourceTradeId(sellerId, tradeId))
                .thenReturn(Optional.of(UserAccount.builder().id(UUID.randomUUID()).ownerId(sellerId).build()));

        UUID toClose = link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, "SWAP", givenId);

        assertThat(toClose).isNull();
        verify(accounts, never()).saveAndFlush(argThat(a -> sellerId.equals(a.getOwnerId())));
    }

    @Test
    void otherKeepsTheBareCard() {
        common(given(null));

        link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, "SWAP", null);

        assertThat(savedFor(sellerId).getTitle()).isEqualTo("Obmendan kelgan akkount");
        verify(accounts, never()).findById(givenId);
    }
}
```

(Add `import static org.mockito.ArgumentMatchers.argThat; import static org.mockito.ArgumentMatchers.eq;`. Check the real package of `ListingRepository` from `AccountTradeHandoverTest` imports.)

`TradeSucceededConsumerSwapTest.java`:

```java
package uz.efbazaar.marketplace.kafka;

import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.account.ListingAccountLink;
import uz.efbazaar.marketplace.service.ListingService;
import uz.efbazaar.marketplace.service.ReferralService;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TradeSucceededConsumerSwapTest {

    private final ReferralService referrals = mock(ReferralService.class);
    private final ListingAccountLink accounts = mock(ListingAccountLink.class);
    private final ListingService listingService = mock(ListingService.class);
    private final TradeSucceededConsumer consumer = new TradeSucceededConsumer(referrals, accounts, listingService);

    @Test
    void theGivenAccountsListingIsMarkedSoldToTheSeller() {
        UUID trade = UUID.randomUUID(), buyer = UUID.randomUUID(), seller = UUID.randomUUID();
        UUID listing = UUID.randomUUID(), given = UUID.randomUUID(), givenListing = UUID.randomUUID();
        when(accounts.onTradeSucceeded(trade, listing, buyer, seller, "SWAP", given)).thenReturn(givenListing);

        consumer.onTradeSucceeded(new TradeSucceededDto(trade, buyer, seller, listing, "SMART", "SWAP", given, Instant.now()));

        verify(listingService).markSold(eq(givenListing), eq(seller), any(Instant.class));
    }

    @Test
    void nothingIsClosedWithoutAListedAccount() {
        UUID trade = UUID.randomUUID();
        when(accounts.onTradeSucceeded(any(), any(), any(), any(), any(), any())).thenReturn(null);

        consumer.onTradeSucceeded(new TradeSucceededDto(trade, UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "SMART", "SWAP", null, Instant.now()));

        verifyNoInteractions(listingService);
    }
}
```

(Check the real package of `ReferralService` from `TradeSucceededConsumer` imports.)

- [ ] **Step 2: Run — FAIL**

Run (in `backend/marketplace-service`): `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp -q test -Dtest='SwapAccountHandoverTest,TradeSucceededConsumerSwapTest'`
Expected: compilation errors.

- [ ] **Step 3: Implement**

`ArchivedReason`: add `SWAPPED_ON_PLATFORM` with Javadoc `/** Platformadagi obmenda boshqa tarafga berildi. */`.

`TradeSucceededDto`: add `/** Obmenda xaridor bergan akkount; eski hodisalarda yo'q. */ UUID giveAccountId,` before `Instant occurredAt`.

`ListingAccountLink`:

```java
    @Transactional
    public void onTradeSucceeded(UUID tradeId, UUID listingId, UUID buyerId, UUID sellerId, String kind) {
        onTradeSucceeded(tradeId, listingId, buyerId, sellerId, kind, null);
    }

    /**
     * @param giveAccountId obmenda xaridor bergan akkount; null — "Boshqa"
     * @return yopilishi kerak bo'lgan e'lon (berilgan akkountning e'loni) yoki null
     */
    @Transactional
    public UUID onTradeSucceeded(UUID tradeId, UUID listingId, UUID buyerId, UUID sellerId,
                                 String kind, UUID giveAccountId) {
        boolean swap = "SWAP".equals(kind) || "SWAP_SURCHARGE".equals(kind);
        UUID listingToClose = null;
        if (swap && giveAccountId != null) {
            listingToClose = handOverGivenAccount(tradeId, giveAccountId, buyerId, sellerId);
        } else {
            openAccountForSwapRecipient(tradeId, sellerId, swap);
        }
        // ... the existing body from `if (listingId == null || buyerId == null || tradeId == null)`
        //     unchanged, with every bare `return;` replaced by `return listingToClose;`
        //     and a final `return listingToClose;` at the end.
    }

    /**
     * Obmenda xaridor tanlagan akkount sotuvchiga ko'chadi.
     *
     * <p>Xuddi sotuvdagidek: berayotgan tarafda arxivga tushadi, oluvchida
     * to'liq nusxa ochiladi. Bo'sh kartochka ochilmaydi — ma'lumot bor.
     */
    private UUID handOverGivenAccount(UUID tradeId, UUID giveAccountId, UUID buyerId, UUID sellerId) {
        if (tradeId == null || sellerId == null) return null;
        if (accounts.findByOwnerIdAndSourceTradeId(sellerId, tradeId).isPresent()) {
            log.debug("Swap account for trade {} already moved to {}", tradeId, sellerId);
            return null;
        }
        UserAccount given = accounts.findById(giveAccountId).orElse(null);
        if (given == null || !given.getOwnerId().equals(buyerId)) {
            log.warn("Given account {} is gone or not the buyer's — seller {} gets a bare card from trade {}",
                    giveAccountId, sellerId, tradeId);
            openAccountForSwapRecipient(tradeId, sellerId, true);
            return null;
        }
        UUID listingToClose = given.getCurrentListingId();

        given.setStatus(UserAccountStatus.ARCHIVED);
        given.setArchivedReason(ArchivedReason.SWAPPED_ON_PLATFORM);
        given.setEmail(null);
        given.setEmailSource(null);
        given.setMailboxId(null);
        given.setCurrentListingId(null);
        accounts.saveAndFlush(given);

        UserAccount received = UserAccount.builder()
                .id(UUID.randomUUID())
                .ownerId(sellerId)
                .title(given.getTitle())
                .description(given.getDescription())
                .attributes(given.getAttributes() == null ? new HashMap<>() : new HashMap<>(given.getAttributes()))
                .mediaMessageIds(given.getMediaMessageIds() == null
                        ? new ArrayList<>() : new ArrayList<>(given.getMediaMessageIds()))
                .status(UserAccountStatus.ACTIVE)
                .sourceTradeId(tradeId)
                .build();
        pendingEmails.findByTradeIdAndUserId(tradeId, sellerId).ifPresent(pending -> {
            received.setEmail(pending.getEmail());
            received.setEmailSource(EmailSource.PLATFORM);
            pendingEmails.delete(pending);
        });
        UserAccount saved = accounts.saveAndFlush(received);
        inventory.replace(saved.getId(), given.getAttributes() == null ? null : given.getAttributes().get(SQUAD_KEY));
        log.info("Swap account handed over: from={} to={} tradeId={}", given.getId(), saved.getId(), tradeId);
        return listingToClose;
    }
```

`TradeSucceededConsumer` — add `private final uz.efbazaar.marketplace.service.ListingService listingService;` and replace the `accounts.onTradeSucceeded(...)` line:

```java
        UUID givenListing = accounts.onTradeSucceeded(e.tradeId(), e.listingId(), e.buyerId(),
                e.sellerId(), e.kind(), e.giveAccountId());
        // Berilgan akkount bozorda turgan bo'lsa, e'loni endi yolg'on: u sotuvchiga o'tdi.
        // markSold idempotent va kanal postlarini ham belgilaydi.
        if (givenListing != null) {
            listingService.markSold(givenListing, e.sellerId(), java.time.Instant.now());
        }
```

Check for a dependency cycle: `ListingService` → `ListingAccountLink` exists; `TradeSucceededConsumer` → `ListingService` does not form a cycle (consumer is a leaf).

Fix existing test call sites of `new TradeSucceededDto(` (add `null` before `occurredAt`) and `new TradeSucceededConsumer(` (add `mock(ListingService.class)`).

- [ ] **Step 4: Run — PASS**

Run: `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp -q test -Dtest='SwapAccountHandoverTest,TradeSucceededConsumerSwapTest,AccountTradeHandoverTest,AccountTradeOriginTest,ListingAccountLinkTest'`
Expected: all pass.

- [ ] **Step 5: Full marketplace verify**

Run (in `backend/marketplace-service`): `JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp clean verify -DargLine="-Dapi.version=1.44"`
Expected: `BUILD SUCCESS`, Surefire + Failsafe `Failures: 0, Errors: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/marketplace-service/src
git commit -m "feat(marketplace): obmenda tanlangan akkount sotuvchiga ko'chadi"
```

---

### Task 7: frontend — tiplar, model va API

**Files:**
- Modify: `frontend/src/lib/trade-types.ts` (`TradeResponse`, `PendingProposalResponse`, `ProposalAcceptRequest`)
- Modify: `frontend/src/lib/accounts-types.ts:10` (`AccountArchivedReason`)
- Modify: `frontend/src/components/chat/trade-context.tsx` (`PendingProposal` gets `giveAccount`; map it from `PendingProposalResponse` wherever `kind` is mapped — search `kind: initialPendingProposal.kind` and the fetched-proposal mapping near line 211)
- Create: `frontend/src/lib/swap-accounts.ts`
- Test: `frontend/src/lib/swap-accounts.test.ts`

**Interfaces:**
- Produces:
  - `interface GiveAccountSnapshot { id: string; title: string | null; coverMessageId: string | null; summary: string; teamStrength: number | null }` in `trade-types.ts`.
  - `TradeResponse.giveAccount?: GiveAccountSnapshot | null`, `PendingProposalResponse.giveAccount?: GiveAccountSnapshot | null`, `ProposalAcceptRequest.giveAccountId?: string`.
  - `swap-accounts.ts`:
    - `type SwapSide = { title: string; coverUrl: string | null; teamStrength: number | null; external: boolean }`
    - `listingSide(listing: { description: string; mediaMessageIds?: string[]; coverMessageId?: string | null; attributes?: Record<string, unknown> } | null): SwapSide | null`
    - `givenSide(snapshot: GiveAccountSnapshot | null | undefined): SwapSide` — `external: true` + title `'Platformadan tashqari akkount'` when snapshot is null.
    - `receivedSide(trade: Pick<TradeResponse,'sellerId'|'buyerId'|'giveAccount'>, viewerId: string, listing: SwapSide | null): SwapSide | null` — seller → `givenSide(trade.giveAccount)`, buyer → `listing`, else `null`.
    - `accountTitle(account: Pick<UserAccountResponse,'title'|'description'>): string` — title, else first description line, else `'Nomsiz akkount'`.
    - `fetchBusyAccountIds(): Promise<Set<string>>` — `GET /api/trade/v1/trades/busy-accounts`; on failure returns empty set.

- [ ] **Step 1: Failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountTitle, fetchBusyAccountIds, givenSide, listingSide, receivedSide } from './swap-accounts';

describe('swap accounts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('describes a chosen account from its snapshot', () => {
    const side = givenSide({ id: 'a', title: 'Asosiy akk', coverMessageId: 'm-1', summary: 'Kuchli', teamStrength: 3250 });
    expect(side).toMatchObject({ title: 'Asosiy akk', teamStrength: 3250, external: false });
    expect(side.coverUrl).toContain('m-1');
  });

  it('describes Other as an off-platform account', () => {
    expect(givenSide(null)).toEqual({ title: 'Platformadan tashqari akkount', coverUrl: null, teamStrength: null, external: true });
  });

  it('falls back to the summary when the account has no title', () => {
    expect(givenSide({ id: 'a', title: null, coverMessageId: null, summary: 'Kuchli akkount', teamStrength: null }).title).toBe('Kuchli akkount');
  });

  it('describes the listing side from its first line and cover', () => {
    const side = listingSide({ description: 'TS 3100 akk\nbatafsil', mediaMessageIds: ['m-9'], attributes: { team_strength: 3100 } });
    expect(side).toMatchObject({ title: 'TS 3100 akk', teamStrength: 3100, external: false });
    expect(side?.coverUrl).toContain('m-9');
  });

  it('shows each viewer what they receive', () => {
    const trade = { sellerId: 's', buyerId: 'b', giveAccount: { id: 'a', title: 'Asosiy akk', coverMessageId: null, summary: '', teamStrength: null } };
    const listing = listingSide({ description: 'E’lon akk', mediaMessageIds: [] });
    expect(receivedSide(trade, 's', listing)?.title).toBe('Asosiy akk');
    expect(receivedSide(trade, 'b', listing)?.title).toBe('E’lon akk');
    expect(receivedSide(trade, 'x', listing)).toBeNull();
  });

  it('names untitled accounts by their description', () => {
    expect(accountTitle({ title: '  ', description: 'Birinchi qator\nikkinchi' })).toBe('Birinchi qator');
    expect(accountTitle({ title: null, description: null })).toBe('Nomsiz akkount');
  });

  it('reads busy account ids and tolerates failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(['a', 'b'])));
    expect(await fetchBusyAccountIds()).toEqual(new Set(['a', 'b']));
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe('/api/trade/v1/trades/busy-accounts');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 502 })));
    expect(await fetchBusyAccountIds()).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run (in `frontend`): `npx vitest run src/lib/swap-accounts.test.ts`
Expected: FAIL — cannot resolve `./swap-accounts`.

- [ ] **Step 3: Implement**

Types in `trade-types.ts` (add `GiveAccountSnapshot` above `TradeResponse`; add the optional fields listed in Interfaces). `accounts-types.ts`: `'SOLD_ON_PLATFORM' | 'SOLD_ELSEWHERE' | 'BY_OWNER' | 'SWAPPED_ON_PLATFORM'`. `trade-context.tsx`: `giveAccount?: GiveAccountSnapshot | null` on `PendingProposal`, copied from the response in every place the response is mapped.

`swap-accounts.ts`:

```ts
import type { UserAccountResponse } from '@/lib/accounts-types';
import { listingMediaUrl } from '@/lib/marketplace-media';
import type { GiveAccountSnapshot, TradeResponse } from '@/lib/trade-types';

export type SwapSide = { title: string; coverUrl: string | null; teamStrength: number | null; external: boolean };

const EXTERNAL: SwapSide = { title: 'Platformadan tashqari akkount', coverUrl: null, teamStrength: null, external: true };

function firstLine(text: string | null | undefined) {
  return text?.split('\n')[0]?.trim() ?? '';
}

function positiveNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function accountTitle(account: Pick<UserAccountResponse, 'title' | 'description'>): string {
  return account.title?.trim() || firstLine(account.description) || 'Nomsiz akkount';
}

export function givenSide(snapshot: GiveAccountSnapshot | null | undefined): SwapSide {
  if (!snapshot) return EXTERNAL;
  return {
    title: snapshot.title?.trim() || firstLine(snapshot.summary) || 'Nomsiz akkount',
    coverUrl: snapshot.coverMessageId ? listingMediaUrl(snapshot.coverMessageId) : null,
    teamStrength: positiveNumber(snapshot.teamStrength),
    external: false,
  };
}

export function listingSide(listing: {
  description: string;
  mediaMessageIds?: string[];
  coverMessageId?: string | null;
  attributes?: Record<string, unknown>;
} | null): SwapSide | null {
  if (!listing) return null;
  const cover = listing.coverMessageId ?? listing.mediaMessageIds?.[0] ?? null;
  return {
    title: firstLine(listing.description) || 'E’lon',
    coverUrl: cover ? listingMediaUrl(cover) : null,
    teamStrength: positiveNumber(listing.attributes?.team_strength),
    external: false,
  };
}

export function receivedSide(
  trade: Pick<TradeResponse, 'sellerId' | 'buyerId' | 'giveAccount'>,
  viewerId: string,
  listing: SwapSide | null,
): SwapSide | null {
  if (trade.sellerId === viewerId) return givenSide(trade.giveAccount);
  if (trade.buyerId === viewerId) return listing;
  return null;
}

export async function fetchBusyAccountIds(): Promise<Set<string>> {
  try {
    const response = await fetch('/api/trade/v1/trades/busy-accounts', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return new Set();
    return new Set((await response.json()) as string[]);
  } catch {
    return new Set();
  }
}
```

- [ ] **Step 4: Run — PASS**

Run: `npx vitest run src/lib/swap-accounts.test.ts && npm run typecheck`
Expected: 7 tests pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/trade-types.ts frontend/src/lib/accounts-types.ts frontend/src/lib/swap-accounts.ts \
        frontend/src/lib/swap-accounts.test.ts frontend/src/components/chat/trade-context.tsx
git commit -m "feat(frontend): obmen akkounti tiplari va yordamchilari"
```

---

### Task 8: frontend — qabul oynasida akkount tanlash

**Files:**
- Create: `frontend/src/components/chat/swap-account-picker.tsx`
- Modify: `frontend/src/components/chat/trade-panel.tsx` — `AcceptModal` (~line 2274-2395)
- Test: `frontend/src/components/chat/swap-account-picker.test.ts`
- Test: `frontend/src/components/chat/trade-panel-ux.test.ts` (extend) — or a new `trade-accept-swap-account.test.ts` using the same mocked-context pattern as `trade-accept-payment.test.ts`

**Interfaces:**
- Consumes: Task 7 `accountTitle`, `fetchBusyAccountIds`; existing `getMyAccounts()` from `@/lib/accounts-client` (returns `ActionResult<UserAccountResponse[]>` — open the file to confirm the `ok`/`data` shape).
- Produces:
  - `SWAP_OTHER = 'OTHER'` constant.
  - `<SwapAccountPicker value={string | null} onChange={(v: string) => void} />` — `value` is an account id, `SWAP_OTHER`, or `null` (nothing picked).
  - `AcceptModal` sends `{ giveAccountId }` to `postProposalAccept` when a real account is picked, `{}` for Other; submit disabled while `value === null` on a swap proposed by the seller.

- [ ] **Step 1: Failing test (picker)**

```ts
// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SWAP_OTHER, SwapAccountPicker } from './swap-account-picker';
import type { UserAccountResponse } from '@/lib/accounts-types';

vi.mock('@/lib/accounts-client', () => ({ getMyAccounts: vi.fn() }));
vi.mock('@/lib/swap-accounts', async (orig) => ({ ...(await orig<object>()), fetchBusyAccountIds: vi.fn() }));
import { getMyAccounts } from '@/lib/accounts-client';
import { fetchBusyAccountIds } from '@/lib/swap-accounts';

let root: Root;
let container: HTMLDivElement;
let picked: string | null;

function account(id: string, title: string | null, extra: Partial<UserAccountResponse> = {}): UserAccountResponse {
  return { id, title, description: 'Kuchli akkount\nbatafsil', attributes: {}, mediaMessageIds: ['m-' + id], email: null,
    emailSource: null, status: 'ACTIVE', onMarket: false, currentListingId: null, createdAt: '', updatedAt: '', ...extra };
}

function Harness() {
  const [value, setValue] = useState<string | null>(null);
  picked = value;
  return createElement(SwapAccountPicker, { value, onChange: setValue });
}

const radios = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

it('lists own accounts with title and Other, nothing preselected', async () => {
  vi.mocked(getMyAccounts).mockResolvedValue({ ok: true, data: [account('a', 'Asosiy akk'), account('b', null)] } as never);
  vi.mocked(fetchBusyAccountIds).mockResolvedValue(new Set());
  await act(async () => root.render(createElement(Harness)));

  expect(radios().map(r => r.textContent)).toEqual([
    expect.stringContaining('Asosiy akk'), expect.stringContaining('Kuchli akkount'), expect.stringContaining('Boshqa'),
  ]);
  expect(radios().every(r => r.getAttribute('aria-checked') === 'false')).toBe(true);
  expect(container.querySelector('img')?.getAttribute('src')).toContain('m-a');
});

it('picks an account or Other', async () => {
  vi.mocked(getMyAccounts).mockResolvedValue({ ok: true, data: [account('a', 'Asosiy akk')] } as never);
  vi.mocked(fetchBusyAccountIds).mockResolvedValue(new Set());
  await act(async () => root.render(createElement(Harness)));

  await act(async () => radios()[0].click());
  expect(picked).toBe('a');
  await act(async () => radios()[1].click());
  expect(picked).toBe(SWAP_OTHER);
});

it('disables accounts busy in another trade', async () => {
  vi.mocked(getMyAccounts).mockResolvedValue({ ok: true, data: [account('a', 'Asosiy akk')] } as never);
  vi.mocked(fetchBusyAccountIds).mockResolvedValue(new Set(['a']));
  await act(async () => root.render(createElement(Harness)));

  expect(radios()[0].disabled).toBe(true);
  expect(radios()[0].textContent).toContain('Savdoda');
});

it('hides archived accounts', async () => {
  vi.mocked(getMyAccounts).mockResolvedValue({ ok: true, data: [account('a', 'Eski', { status: 'ARCHIVED' })] } as never);
  vi.mocked(fetchBusyAccountIds).mockResolvedValue(new Set());
  await act(async () => root.render(createElement(Harness)));

  expect(radios()).toHaveLength(1);
});

it('with no accounts, Other is selected and a link to add one is shown', async () => {
  vi.mocked(getMyAccounts).mockResolvedValue({ ok: true, data: [] } as never);
  vi.mocked(fetchBusyAccountIds).mockResolvedValue(new Set());
  await act(async () => root.render(createElement(Harness)));

  expect(picked).toBe(SWAP_OTHER);
  expect(container.textContent).toContain('Profilga akkount qo‘shish');
});
```

- [ ] **Step 2: Run — FAIL**

Run (in `frontend`): `npx vitest run src/components/chat/swap-account-picker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement picker**

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMyAccounts } from '@/lib/accounts-client';
import type { UserAccountResponse } from '@/lib/accounts-types';
import { listingMediaUrl } from '@/lib/marketplace-media';
import { accountTitle, fetchBusyAccountIds } from '@/lib/swap-accounts';
import { cn } from '@/lib/utils';

export const SWAP_OTHER = 'OTHER';

/**
 * Obmenda xaridor beradigan akkount.
 *
 * <p>Hech narsa oldindan tanlanmaydi: "Boshqa" ham ongli tanlov bo'lishi
 * kerak, aks holda odam o'ylamasdan platformadan tashqari akkount bilan
 * savdo ochib yuborardi. Ro'yxat balandligi cheklangan — Mini App'da
 * oyna cho'zilib ketmasligi uchun.
 */
export function SwapAccountPicker({ value, onChange }: { value: string | null; onChange: (value: string) => void }) {
  const [accounts, setAccounts] = useState<UserAccountResponse[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    void (async () => {
      const [result, busyIds] = await Promise.all([getMyAccounts(), fetchBusyAccountIds()]);
      if (!active) return;
      const list = result.ok ? result.data.filter(a => a.status === 'ACTIVE') : [];
      setAccounts(list);
      setBusy(busyIds);
      if (list.length === 0) onChange(SWAP_OTHER);
    })();
    return () => { active = false; };
    // onChange is a state setter from the parent; the list loads once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (accounts === null) return <p className="text-xs text-muted-foreground">Akkountlar yuklanmoqda…</p>;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold">Qaysi akkountingizni berasiz?</p>
      <div role="radiogroup" aria-label="Beriladigan akkount" className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
        {accounts.map(account => {
          const isBusy = busy.has(account.id);
          const cover = account.mediaMessageIds[0] ? listingMediaUrl(account.mediaMessageIds[0]) : null;
          const checked = value === account.id;
          return (
            <button key={account.id} type="button" role="radio" aria-checked={checked} disabled={isBusy}
              onClick={() => onChange(account.id)}
              className={cn('flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition',
                checked ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted/60', isBusy && 'opacity-50')}>
              {cover
                ? <img src={cover} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                : <span className="h-10 w-10 shrink-0 rounded-md bg-muted" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{accountTitle(account)}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {isBusy ? 'Savdoda' : account.description?.split('\n')[0]?.trim() || '—'}
                </span>
              </span>
            </button>
          );
        })}
        <button type="button" role="radio" aria-checked={value === SWAP_OTHER} onClick={() => onChange(SWAP_OTHER)}
          className={cn('flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition',
            value === SWAP_OTHER ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted/60')}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-dashed border-border text-muted-foreground" aria-hidden="true">?</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Boshqa</span>
            <span className="block truncate text-[11px] text-muted-foreground">Akkount platformaga kiritilmagan</span>
          </span>
        </button>
      </div>
      {accounts.length === 0 && (
        <Link href="/profile?tab=accounts" className="inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-2 hover:underline">
          Profilga akkount qo‘shish
        </Link>
      )}
    </div>
  );
}
```

Before committing: confirm the profile accounts tab URL (`grep -rn "tab=accounts\|accounts'" frontend/src/app/profile frontend/src/components/profile | head`) and use the real one; confirm `cn` path.

- [ ] **Step 4: Run — PASS (picker)**

Run: `npx vitest run src/components/chat/swap-account-picker.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Failing test (AcceptModal wiring)**

Create `frontend/src/components/chat/trade-accept-swap-account.test.ts`, copying the setup block (mocks, `render`, `click`, `beforeEach` fetch stub) from `trade-accept-payment.test.ts`. Use a context where `proposal` is `{ kind: 'SWAP', proposerUserId: sellerId, buyerId: viewerId, sellerId, priceUzs: 0, mode: 'SMART', ... }` with zero hold (so the plain form path renders), and `showAcceptModal: true`. Mock `./swap-account-picker` to render two buttons that call `onChange('acc-1')` and `onChange('OTHER')`:

```ts
vi.mock('./swap-account-picker', () => ({
  SWAP_OTHER: 'OTHER',
  SwapAccountPicker: ({ onChange }: { onChange: (v: string) => void }) =>
    createElement('div', null,
      createElement('button', { type: 'button', onClick: () => onChange('acc-1') }, 'pick-acc'),
      createElement('button', { type: 'button', onClick: () => onChange('OTHER') }, 'pick-other')),
}));

const acceptBody = () => JSON.parse(String(calls('/accept')[0][1]!.body));

it('blocks accepting a seller swap until an account or Other is picked', async () => {
  await render();
  expect(button('Qabul qilish')!.disabled).toBe(true);
});

it('sends the picked account id', async () => {
  await render();
  await click('pick-acc');
  await click('Qabul qilish');
  expect(acceptBody()).toEqual({ giveAccountId: 'acc-1' });
});

it('sends no account for Other', async () => {
  await render();
  await click('pick-other');
  await click('Qabul qilish');
  expect(acceptBody()).toEqual({});
});

it('does not show the picker on a sale', async () => {
  context.proposal = { ...context.proposal!, kind: 'SALE', priceUzs: 50000 };
  await render();
  expect(button('pick-acc')).toBeUndefined();
});
```

Adjust the exact submit button label to what `AcceptModal` renders (read lines ~2340-2395 first). Run: `npx vitest run src/components/chat/trade-accept-swap-account.test.ts` — expected FAIL (picker not rendered / body `{}`).

- [ ] **Step 6: Wire AcceptModal**

In `AcceptModal`:

```tsx
  const pickingAccount = isSwap(proposal.kind) && proposal.proposerUserId !== viewerId && proposal.buyerId === viewerId;
  const [giveAccount, setGiveAccount] = useState<string | null>(null);
  const acceptPayload: ProposalAcceptRequest =
    pickingAccount && giveAccount && giveAccount !== SWAP_OTHER ? { giveAccountId: giveAccount } : {};
  const accountMissing = pickingAccount && giveAccount === null;
```

- `handleSubmit`: `if (requiresAdmin || accountMissing) return;` and use `acceptPayload` instead of `{}`.
- Payment path: render `{pickingAccount && <SwapAccountPicker value={giveAccount} onChange={setGiveAccount} />}` above `<TradeAcceptPayment ...>` inside the same `ModalShell`, pass `onAccept={() => postProposalAccept(proposal.id, acceptPayload)}` and add `unavailable={unavailable || accountMissing}`.
- Plain form path: render the picker as the first child of the `<form>`; add `disabled={submitting || accountMissing}` to the submit `Button`.
- Imports: `import { SWAP_OTHER, SwapAccountPicker } from './swap-account-picker';`.

- [ ] **Step 7: Run — PASS**

Run: `npx vitest run src/components/chat/trade-accept-swap-account.test.ts src/components/chat/trade-accept-payment.test.ts src/components/chat/trade-panel-ux.test.ts`
Expected: all pass (payment tests use SALE, unaffected).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/chat/swap-account-picker.tsx frontend/src/components/chat/swap-account-picker.test.ts \
        frontend/src/components/chat/trade-accept-swap-account.test.ts frontend/src/components/chat/trade-panel.tsx
git commit -m "feat(frontend): obmen qabulida akkount tanlash"
```

---

### Task 9: frontend — taklif kartasi, pinned bar va drawer'da kim nima oladi

**Files:**
- Create: `frontend/src/components/chat/swap-accounts-summary.tsx`
- Modify: `frontend/src/components/chat/trade-proposal-message-card.tsx` (between the listing link and the amount row, ~line 70)
- Modify: `frontend/src/components/chat/trade-pinned-bar.tsx` — `ActiveTradePinnedBar` (~line 262), after the `actionRequired && partnerFinished` line inside the button
- Modify: `frontend/src/components/chat/trade-panel.tsx` — `TradeDetails` (~line 527), after the admin-fee line
- Test: `frontend/src/components/chat/swap-accounts-summary.test.ts`

**Interfaces:**
- Consumes: Task 7 `SwapSide`, `givenSide`, `listingSide`, `receivedSide`; context `listing`, `accountRequest`, `trades`, `viewerId`.
- Produces:
  - `<SwapPair left={SwapSide | null} right={SwapSide | null} rightPending?: boolean />` — two columns with `⇄`; `rightPending` renders "Xaridor tanlaydi".
  - `<ReceivedLine side={SwapSide} />` — "Siz olasiz: [24px img] Nom".
  - `<GiveReceiveBlock give={SwapSide | null} receive={SwapSide | null} />` — drawer block.
  - `useSwapListingSide(listingId?: string | null): SwapSide | null` — from context `listing` / `accountRequest.listing` matching the id.

- [ ] **Step 1: Failing test**

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GiveReceiveBlock, ReceivedLine, SwapPair } from './swap-accounts-summary';
import type { SwapSide } from '@/lib/swap-accounts';

const listing: SwapSide = { title: 'E’lon akk', coverUrl: '/photo/m-1', teamStrength: 3100, external: false };
const given: SwapSide = { title: 'Asosiy akk', coverUrl: null, teamStrength: 3250, external: false };
const external: SwapSide = { title: 'Platformadan tashqari akkount', coverUrl: null, teamStrength: null, external: true };

describe('swap accounts summary', () => {
  it('shows both accounts side by side', () => {
    const html = renderToStaticMarkup(createElement(SwapPair, { left: listing, right: given }));
    expect(html).toContain('E’lon akk');
    expect(html).toContain('Asosiy akk');
    expect(html).toContain('⇄');
    expect(html).toContain('TS 3250');
  });

  it('says the buyer will choose while a seller swap is pending', () => {
    const html = renderToStaticMarkup(createElement(SwapPair, { left: listing, right: null, rightPending: true }));
    expect(html).toContain('Xaridor tanlaydi');
  });

  it('marks an off-platform account', () => {
    expect(renderToStaticMarkup(createElement(SwapPair, { left: listing, right: external })))
      .toContain('Platformadan tashqari akkount');
  });

  it('tells the viewer what they receive in one line', () => {
    const html = renderToStaticMarkup(createElement(ReceivedLine, { side: given }));
    expect(html).toContain('Siz olasiz');
    expect(html).toContain('Asosiy akk');
  });

  it('lists give and receive in the drawer', () => {
    const html = renderToStaticMarkup(createElement(GiveReceiveBlock, { give: listing, receive: given }));
    expect(html).toMatch(/Siz berasiz[\s\S]*E’lon akk[\s\S]*Siz olasiz[\s\S]*Asosiy akk/);
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npx vitest run src/components/chat/swap-accounts-summary.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement components**

```tsx
'use client';

import { ChevronRight } from 'lucide-react';
import type { SwapSide } from '@/lib/swap-accounts';
import { listingSide } from '@/lib/swap-accounts';
import { useTradeContext } from './trade-context';

function Thumb({ side, size }: { side: SwapSide; size: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-6 w-6 rounded' : 'h-10 w-10 rounded-md';
  return side.coverUrl
    ? <img src={side.coverUrl} alt="" className={`${cls} shrink-0 object-cover`} />
    : <span className={`${cls} shrink-0 bg-muted ${side.external ? 'border border-dashed border-border' : ''}`} aria-hidden="true" />;
}

function Column({ side, pending }: { side: SwapSide | null; pending?: boolean }) {
  if (!side) {
    return <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="h-10 w-10 shrink-0 rounded-md border border-dashed border-border" aria-hidden="true" />
      <span className="truncate text-xs text-muted-foreground">{pending ? 'Xaridor tanlaydi' : '—'}</span>
    </div>;
  }
  return <div className="flex min-w-0 flex-1 items-center gap-2">
    <Thumb side={side} size="md" />
    <span className="min-w-0">
      <span className={`block truncate text-xs font-medium ${side.external ? 'text-muted-foreground' : 'text-foreground'}`}>{side.title}</span>
      {side.teamStrength && <span className="block text-[11px] text-muted-foreground">TS {side.teamStrength}</span>}
    </span>
  </div>;
}

/** Taklif kartasida: chapda e'lon akkounti, o'ngda xaridor beradigani. */
export function SwapPair({ left, right, rightPending = false }: { left: SwapSide | null; right: SwapSide | null; rightPending?: boolean }) {
  return <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2">
    <Column side={left} />
    <span className="shrink-0 text-sm text-muted-foreground" aria-label="almashadi">⇄</span>
    <Column side={right} pending={rightPending} />
  </div>;
}

/** Pinned bar'dagi bitta qator — har kim faqat o'zi OLADIGANini ko'radi. */
export function ReceivedLine({ side }: { side: SwapSide }) {
  return <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
    <Thumb side={side} size="sm" />
    <span className="shrink-0">Siz olasiz:</span>
    <span className="truncate font-medium text-foreground">{side.title}</span>
    <ChevronRight className="ml-auto h-3 w-3 shrink-0" aria-hidden="true" />
  </span>;
}

/** Drawer: ikkala akkount to'liq. */
export function GiveReceiveBlock({ give, receive }: { give: SwapSide | null; receive: SwapSide | null }) {
  return <dl className="space-y-2 text-sm">
    <div><dt className="mb-1 text-xs text-muted-foreground">Siz berasiz</dt><dd><Column side={give} /></dd></div>
    <div><dt className="mb-1 text-xs text-muted-foreground">Siz olasiz</dt><dd><Column side={receive} /></dd></div>
  </dl>;
}

/** E'lon akkounti — chat kontekstidagi e'lon yoki so'ralgan akkountdan. */
export function useSwapListingSide(listingId?: string | null): SwapSide | null {
  const { listing, accountRequest } = useTradeContext();
  const request = accountRequest?.listing;
  if (request && (!listingId || request.id === listingId)) return listingSide(request);
  if (listing && (!listingId || listing.id === listingId)) return listingSide(listing);
  return null;
}
```

Check that `accountRequest.listing` has `description`, `coverMessageId` (it does per `ProposeModal` usage) — if `attributes` is missing on it the `listingSide` param already treats it as optional.

- [ ] **Step 4: Run — PASS**

Run: `npx vitest run src/components/chat/swap-accounts-summary.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Wire into card, pinned bar, drawer**

`trade-proposal-message-card.tsx` — after the `{listingId && (<Link .../>)}` block:

```tsx
        {(kind === 'SWAP' || kind === 'SWAP_SURCHARGE') && (
          <SwapPair left={listingSideForCard} right={rightSide} rightPending={outcome === 'PENDING' && !rightSide} />
        )}
```

with, near the top of the component:

```tsx
  const { trades } = useTradeContext();
  const listingSideForCard = useSwapListingSide(listingId);
  // Qabul qilingandan keyin taklifni savdoga bog'laydigan id yo'q. `trades`
  // allaqachon shu chatniki: taklifdan keyin ochilgan birinchi savdo — o'shaning o'zi.
  const acceptedTrade = outcome === 'ACCEPTED'
    ? trades?.filter(t => !!t.createdAt && t.createdAt >= message.createdAt)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
    : undefined;
  const pendingGive = matching?.giveAccount;
  const rightSide = acceptedTrade ? givenSide(acceptedTrade.giveAccount)
    : pendingGive ? givenSide(pendingGive) : null;
```

(`trades` is already on `TradeContextValue` and is loaded per chat via `GET /trades?chatId=`, so no listing/chat filter is needed. If `createdAt` is optional in the frontend `TradeResponse` type, the `!!t.createdAt` guard keeps typecheck happy.)

`trade-pinned-bar.tsx` — in `ActiveTradePinnedBar`:

```tsx
  const listingSideForBar = useSwapListingSide(null);
  const received = isSwap(trade.kind) ? receivedSide(trade, viewerId, listingSideForBar) : null;
```

and inside the button's grid, as the last child:

```tsx
          {received && <ReceivedLine side={received} />}
```

`trade-panel.tsx` — `TradeDetails`, after the admin-fee `<p>`:

```tsx
      {isSwap(trade.kind) && <SwapGiveReceive trade={trade} viewerId={viewerId} />}
```

with a small component in the same file:

```tsx
function SwapGiveReceive({ trade, viewerId }: { trade: TradeResponse; viewerId: string }) {
  const listing = useSwapListingSide(null);
  const given = givenSide(trade.giveAccount);
  const isSeller = trade.sellerId === viewerId;
  return <GiveReceiveBlock give={isSeller ? listing : given} receive={isSeller ? given : listing} />;
}
```

- [ ] **Step 6: Tests for wiring**

Extend `trade-proposal-message-card.test.ts` with one case: pending `SWAP` proposal from the seller (message `content: '0'`, `initialPendingProposal.kind: 'SWAP'`) renders `'⇄'` and `'Xaridor tanlaydi'`. Extend `trade-pinned-bar.test.ts` with one case: an active `SWAP` trade viewed by the seller with `giveAccount: { id: 'a', title: 'Asosiy akk', ... }` renders `'Siz olasiz'` and `'Asosiy akk'`; viewed by the buyer renders the listing's first description line. Follow the existing test files' setup exactly.

Run: `npx vitest run src/components/chat/`
Expected: all chat tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/chat/swap-accounts-summary.tsx frontend/src/components/chat/swap-accounts-summary.test.ts \
        frontend/src/components/chat/trade-proposal-message-card.tsx frontend/src/components/chat/trade-proposal-message-card.test.ts \
        frontend/src/components/chat/trade-pinned-bar.tsx frontend/src/components/chat/trade-pinned-bar.test.ts \
        frontend/src/components/chat/trade-panel.tsx frontend/src/lib/trade-types.ts
git commit -m "feat(frontend): chatda obmen akkountlari ko'rinishi"
```

---

### Task 10: Yakuniy tekshiruv

- [ ] **Step 1: Rebase va migratsiya raqami**

```bash
git fetch -q && git rebase origin/main
ls backend/trade-service/src/main/resources/db/migration | sort -V | tail -3
```

Agar `origin/main` da `V28__` paydo bo'lgan bo'lsa — o'zimiznikini keyingi bo'sh raqamga `git mv` qil (hali main'ga tushmagan, rename ruxsat).

- [ ] **Step 2: Backend**

```bash
cd backend/trade-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp clean verify -DargLine="-Dapi.version=1.44"
cd ../marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp clean verify -DargLine="-Dapi.version=1.44"
```

Expected: both `BUILD SUCCESS`; check Surefire and Failsafe summaries (failures, errors, skipped).

- [ ] **Step 3: Bot** — bot `efbazaar.trade.trade-succeeded` ni o'qimaydi (2026-09-28 da tekshirildi: `grep -rn "trade-succeeded" bot/src/main` bo'sh). Rebase'dan keyin shu grep'ni qayta ishga tushir; natija chiqsa, `cd bot && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp clean verify`.

- [ ] **Step 4: Frontend**

```bash
cd frontend && npm ci --no-audit --no-fund && npm run typecheck && npm run lint && npm test && npm run build
```

Expected: all four succeed.

- [ ] **Step 5: Diff tekshiruvi**

```bash
git diff origin/main --stat && git diff origin/main --check
```

Faqat rejadagi fayllar; secret yo'q.

- [ ] **Step 6: Mini App vizual tekshiruvi** — `run` skill bilan frontend'ni ko'tarib, 375px kenglikda qabul oynasi (akkountli / akkountsiz), taklif kartasi va pinned bar'ni skrinshot qil; matn qirqilishi va gorizontal scroll yo'qligini tasdiqla.
