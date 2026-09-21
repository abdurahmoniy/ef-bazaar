# My accounts inventory — Phase 1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every user an account inventory in marketplace-service — accounts they build once, keep up to date, and publish to the market whenever they want — and make listing creation start from it.

**Architecture:** A new `user_accounts` aggregate in marketplace-service holds the listing payload minus the selling terms, plus a private email. Publishing copies the account into a listing and keeps a link (`current_listing_id`); editing a linked account writes the same fields onto that listing through the existing `ListingService`. Every listing created the old way gets an account behind it. The profile tab "E'lonlarim" becomes "Akkountlarim", and `/marketplace/new` starts with "pick an account or describe a new one".

**Tech Stack:** Java 21, Spring Boot 3.3, JPA + Flyway (Postgres 16), JDBC for the card inventory, MapStruct, JUnit 5 + Mockito + MockMvc (`@WebMvcTest`); Next.js App Router, React 18, vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-09-18-my-accounts-inventory-design.md`

## Global Constraints

- Owning service: **marketplace-service** only. Phase 1 adds no Kafka topic and touches no other service.
- Account email is owner-only: never written to `listings`, never present in `ListingResponse`. Publishing copies an explicit allow-list of fields.
- Passwords are never stored on an account.
- An account may hold incomplete attributes; required-attribute validation happens only on publish, through the existing listing path.
- Price, `priceNegotiable` and the `exchange_mode` attribute belong to the listing, never to the account.
- Another user's account answers `404`, never `403`.
- Migration file: the next free `V<n>` — verify with `ls backend/marketplace-service/src/main/resources/db/migration | sort -V | tail -3` **and** `git ls-tree --name-only origin/main backend/marketplace-service/src/main/resources/db/migration/`. At the time of writing the next free number is **V65**. A merged `V` file is immutable: never edit one, add a new file.
- Java: `JAVA_HOME=~/.jdks/openjdk-21.0.2` is required for `mvn`.
- Frontend UI copy is Uzbek; code comments follow the surrounding file's language.
- Commit after every task with the repo's format: `feat(marketplace): ...`, `feat(frontend): ...`.

---

## File Structure

**marketplace-service** — new package `uz.efbazaar.marketplace.account`, so the feature is one folder rather than seven layer folders:

- `account/UserAccount.java` — entity
- `account/UserAccountStatus.java`, `account/EmailSource.java`, `account/ArchivedReason.java` — enums
- `account/UserAccountRepository.java`
- `account/UserAccountCardInventory.java` — JDBC squad rows, mirrors `service/ListingCardInventory.java`
- `account/UserAccountService.java` — CRUD + ownership
- `account/UserAccountPublisher.java` — publish / unpublish / propagate; the only class that talks to `ListingService`
- `account/UserAccountController.java`
- `account/dto/…` — `UserAccountResponse`, `UserAccountCreateRequest`, `UserAccountUpdateRequest`, `UserAccountEmailRequest`, `PublishAccountRequest`
- `account/UserAccountBackfill.java` — one-time repair, mirrors `service/ListingCardInventoryBackfill.java`
- `db/migration/V65__user_accounts.sql`

Modified: `service/ListingService.java` (create → also create an account; `markSold` → archive it), `exception/MarketplaceException.java` (three factories).

**frontend**:

- `lib/accounts-types.ts` — `UserAccountResponse` and request shapes
- `lib/accounts-client.ts` — browser calls through `/api/marketplace/...`
- `lib/accounts-server.ts` — SSR reads
- `lib/accounts-actions.ts` — server actions (publish, unpublish, delete, email)
- `components/profile/profile-accounts.tsx` — the tab body
- `components/profile/account-card.tsx` — one card: badge, masked email, actions
- `components/profile/publish-account-dialog.tsx`
- `components/marketplace/account-form.tsx` — thin wrapper over `ListingForm` in account mode
- `components/marketplace/listing-source-step.tsx` — the new first step on `/marketplace/new`
- `app/profile/accounts/new/page.tsx`, `app/profile/accounts/[id]/page.tsx`

Modified: `components/profile/profile-tabs.tsx`, `app/profile/page.tsx`, `components/marketplace/listing-form.tsx` (a `mode` prop), `app/marketplace/new/page.tsx`.

`listing-form.tsx` is 2 429 lines. This plan does **not** restructure it: it adds one `mode` prop that hides the pricing step and swaps the submit target. A split is a separate piece of work and mixing it in would make every task here unreviewable.

---

### Task 1: Accounts table, entity and squad inventory

**Files:**
- Create: `backend/marketplace-service/src/main/resources/db/migration/V65__user_accounts.sql`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/account/UserAccount.java`
- Create: `.../account/UserAccountStatus.java`, `.../account/EmailSource.java`, `.../account/ArchivedReason.java`
- Create: `.../account/UserAccountRepository.java`
- Create: `.../account/UserAccountCardInventory.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/account/UserAccountCardInventoryTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces: `UserAccount` (Lombok `@Getter @Setter @Builder`), `UserAccountRepository.findByOwnerIdAndStatusOrderByCreatedAtDesc(UUID, UserAccountStatus)`, `findByIdAndOwnerId(UUID, UUID)`, `findByCurrentListingId(UUID)`, `existsBySourceListingId(UUID)`; `UserAccountCardInventory.replace(UUID accountId, Object rawCards)`.

- [ ] **Step 1: Write the failing test**

```java
// UserAccountCardInventoryTest.java
package uz.efbazaar.marketplace.account;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.assertj.core.api.Assertions.assertThat;
import org.mockito.ArgumentCaptor;

class UserAccountCardInventoryTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final UserAccountCardInventory inventory =
            new UserAccountCardInventory(jdbc, new ObjectMapper());

    @Test
    void replace_clearsThenInsertsEveryValidCard() {
        UUID accountId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        List<Object> cards = List.of(
                Map.of("efhub_id", 1234, "player_id", playerId.toString(), "name", "Messi"),
                Map.of("name", "no ids at all"));   // dropped

        inventory.replace(accountId, cards);

        verify(jdbc).update("DELETE FROM user_account_cards WHERE account_id = ?", accountId);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Object[]>> rows = ArgumentCaptor.forClass(List.class);
        verify(jdbc).batchUpdate(anyString(), rows.capture());
        assertThat(rows.getValue()).hasSize(1);
        assertThat(rows.getValue().get(0)[0]).isEqualTo(accountId);
        assertThat(rows.getValue().get(0)[1]).isEqualTo(1234L);
        assertThat(rows.getValue().get(0)[2]).isEqualTo(playerId);
    }

    @Test
    void replace_withNoCards_doesNotBatchInsert() {
        inventory.replace(UUID.randomUUID(), null);
        verify(jdbc, never()).batchUpdate(anyString(), any(List.class));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest=UserAccountCardInventoryTest`
Expected: FAIL — `UserAccountCardInventory` does not exist (compilation error).

- [ ] **Step 3: Write the migration**

```sql
-- V65__user_accounts.sql
-- Foydalanuvchi egalik qiladigan akkount inventari. E'lon endi akkountning
-- holati: bozorga chiqarilgan bo'lsa current_listing_id to'ldiriladi.
CREATE TABLE user_accounts (
    id                 UUID PRIMARY KEY,
    owner_id           UUID        NOT NULL,
    title              TEXT,
    description        TEXT,
    attributes         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    media_message_ids  TEXT[]      NOT NULL DEFAULT '{}',
    email              TEXT,
    email_source       VARCHAR(16),
    mailbox_id         UUID,
    status             VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    current_listing_id UUID,
    source_listing_id  UUID,
    archived_reason    VARCHAR(24),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_accounts_owner_idx
    ON user_accounts (owner_id, status, created_at DESC);

-- Bitta e'lon ortida bitta akkount. Qisman indeks: bozorda bo'lmagan
-- akkountlarda ustun NULL va ular bir-biriga xalaqit bermaydi.
CREATE UNIQUE INDEX user_accounts_current_listing_idx
    ON user_accounts (current_listing_id) WHERE current_listing_id IS NOT NULL;

CREATE UNIQUE INDEX user_accounts_source_listing_idx
    ON user_accounts (source_listing_id) WHERE source_listing_id IS NOT NULL;

-- listing_cards bilan bir xil shakl: qidiruv va o'yinchi statistikasi
-- ikkalasida ham bitta kod yo'li bilan ishlashi uchun.
CREATE TABLE user_account_cards (
    account_id UUID   NOT NULL REFERENCES user_accounts (id) ON DELETE CASCADE,
    efhub_id   BIGINT NOT NULL,
    player_id  UUID   NOT NULL,
    ordinal    INT    NOT NULL,
    snapshot   JSONB  NOT NULL,
    CONSTRAINT user_account_cards_unique_player UNIQUE (account_id, player_id)
);

CREATE INDEX user_account_cards_player_idx
    ON user_account_cards (player_id, account_id);
```

- [ ] **Step 4: Write the entity, enums and repository**

```java
// UserAccountStatus.java
package uz.efbazaar.marketplace.account;

public enum UserAccountStatus { ACTIVE, ARCHIVED }

// EmailSource.java
public enum EmailSource { MANUAL, PLATFORM }

// ArchivedReason.java — nega ro'yxatdan chiqdi degan savolga javob beradi
public enum ArchivedReason { SOLD_ON_PLATFORM, SOLD_ELSEWHERE, BY_OWNER }
```

```java
// UserAccount.java — Listing entity bilan bir xil uslub (JdbcTypeCode JSON/ARRAY)
@Entity
@Table(name = "user_accounts")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class UserAccount {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    private String title;

    @Column(columnDefinition = "text")
    private String description;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> attributes = new HashMap<>();

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "media_message_ids", columnDefinition = "text[]")
    @Builder.Default
    private List<String> mediaMessageIds = new ArrayList<>();

    private String email;

    @Enumerated(EnumType.STRING)
    @Column(name = "email_source", length = 16)
    private EmailSource emailSource;

    @Column(name = "mailbox_id")
    private UUID mailboxId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private UserAccountStatus status = UserAccountStatus.ACTIVE;

    @Column(name = "current_listing_id")
    private UUID currentListingId;

    @Column(name = "source_listing_id")
    private UUID sourceListingId;

    @Enumerated(EnumType.STRING)
    @Column(name = "archived_reason", length = 24)
    private ArchivedReason archivedReason;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist void prePersist() {
        if (id == null) id = UUID.randomUUID();
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate void preUpdate() { updatedAt = Instant.now(); }

    public boolean isOnMarket() { return currentListingId != null; }
}
```

```java
// UserAccountRepository.java
public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {
    List<UserAccount> findByOwnerIdAndStatusOrderByCreatedAtDesc(UUID ownerId, UserAccountStatus status);
    Optional<UserAccount> findByIdAndOwnerId(UUID id, UUID ownerId);
    Optional<UserAccount> findByCurrentListingId(UUID listingId);
    boolean existsBySourceListingId(UUID listingId);
}
```

- [ ] **Step 5: Write `UserAccountCardInventory`**

Copy `service/ListingCardInventory.java` verbatim and change three things: the class name, `listing_cards` → `user_account_cards`, and `listing_id` → `account_id`. The parsing helpers (`longValue`, `uuidValue`, `json`) are identical — the card JSON shape is the same.

```java
@Component
@RequiredArgsConstructor
public class UserAccountCardInventory {

    private static final String INSERT = """
            INSERT INTO user_account_cards (account_id, efhub_id, player_id, ordinal, snapshot)
            VALUES (?, ?, ?, ?, ?::jsonb)
            """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    @Transactional
    public void replace(UUID accountId, Object rawCards) {
        jdbc.update("DELETE FROM user_account_cards WHERE account_id = ?", accountId);
        List<Object[]> rows = rows(accountId, rawCards);
        if (!rows.isEmpty()) {
            jdbc.batchUpdate(INSERT, rows);
        }
    }
    // rows(...), json(...), longValue(...), uuidValue(...) — ListingCardInventory'dagidek
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest=UserAccountCardInventoryTest`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/marketplace-service/src/main/resources/db/migration/V65__user_accounts.sql \
        backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/account \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/account
git commit -m "feat(marketplace): akkount inventari jadvallari va entity"
```

---

### Task 2: Account CRUD service and API

**Files:**
- Create: `.../account/UserAccountService.java`
- Create: `.../account/dto/UserAccountResponse.java`, `UserAccountCreateRequest.java`, `UserAccountUpdateRequest.java`, `UserAccountEmailRequest.java`
- Create: `.../account/UserAccountController.java`
- Modify: `.../exception/MarketplaceException.java` (add `accountNotFound()`, `accountOnMarket()`, `accountAlreadyPublished(UUID listingId)`)
- Test: `.../account/UserAccountServiceTest.java`, `.../account/UserAccountControllerTest.java`

**Interfaces:**
- Consumes: Task 1's entity, repository and inventory.
- Produces:
  - `UserAccountService.list(UUID ownerId) : List<UserAccount>`
  - `UserAccountService.get(UUID id, UUID ownerId) : UserAccount`
  - `UserAccountService.create(UUID ownerId, UserAccountCreateRequest) : UserAccount`
  - `UserAccountService.update(UUID id, UUID ownerId, UserAccountUpdateRequest) : UserAccount`
  - `UserAccountService.setEmail(UUID id, UUID ownerId, String email) : UserAccount`
  - `UserAccountService.delete(UUID id, UUID ownerId) : void`
  - `UserAccountResponse.of(UserAccount) : UserAccountResponse` (computed `onMarket` flag — a `static of` factory, per the repo rule for computed fields)

- [ ] **Step 1: Write the failing service test**

```java
// UserAccountServiceTest.java
@ExtendWith(MockitoExtension.class)
class UserAccountServiceTest {

    @Mock UserAccountRepository accounts;
    @Mock UserAccountCardInventory inventory;
    @InjectMocks UserAccountService service;

    private final UUID ownerId = UUID.randomUUID();
    private final UUID accountId = UUID.randomUUID();

    private UserAccount account() {
        return UserAccount.builder().id(accountId).ownerId(ownerId)
                .status(UserAccountStatus.ACTIVE).attributes(new HashMap<>()).build();
    }

    @Test
    void get_refusesSomeoneElsesAccount() {
        UUID stranger = UUID.randomUUID();
        when(accounts.findByIdAndOwnerId(accountId, stranger)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.get(accountId, stranger))
                .isInstanceOf(MarketplaceException.class)
                .extracting("status").isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void update_writesSquadInventory() {
        UserAccount existing = account();
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(existing));
        when(accounts.saveAndFlush(existing)).thenReturn(existing);
        Map<String, Object> attributes = Map.of("valuable_players",
                List.of(Map.of("efhub_id", 1, "player_id", UUID.randomUUID().toString())));

        service.update(accountId, ownerId, new UserAccountUpdateRequest(
                "Asosiy", "tavsif", attributes, List.of("msg-1")));

        assertThat(existing.getTitle()).isEqualTo("Asosiy");
        verify(inventory).replace(accountId, attributes.get("valuable_players"));
    }

    @Test
    void delete_refusesWhileOnMarket() {
        UserAccount published = account();
        published.setCurrentListingId(UUID.randomUUID());
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(published));

        assertThatThrownBy(() -> service.delete(accountId, ownerId))
                .isInstanceOf(MarketplaceException.class)
                .extracting("status").isEqualTo(HttpStatus.CONFLICT);
        verify(accounts, never()).delete(any());
    }

    @Test
    void setEmail_marksItManual_andClearsMailboxLink() {
        UserAccount existing = account();
        existing.setMailboxId(UUID.randomUUID());
        existing.setEmailSource(EmailSource.PLATFORM);
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(existing));
        when(accounts.saveAndFlush(existing)).thenReturn(existing);

        service.setEmail(accountId, ownerId, "men@example.com");

        assertThat(existing.getEmail()).isEqualTo("men@example.com");
        assertThat(existing.getEmailSource()).isEqualTo(EmailSource.MANUAL);
        assertThat(existing.getMailboxId()).isNull();
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest=UserAccountServiceTest`
Expected: FAIL — `UserAccountService` does not exist.

- [ ] **Step 3: Add the exception factories**

```java
// MarketplaceException.java — mavjud fabrikalar uslubida
public static MarketplaceException accountNotFound() {
    return new MarketplaceException(HttpStatus.NOT_FOUND, "account_not_found",
            "Akkount topilmadi");
}

/** Bozorda turgan akkount o'chirilmaydi — avval e'lon yechiladi. */
public static MarketplaceException accountOnMarket() {
    return new MarketplaceException(HttpStatus.CONFLICT, "account_on_market",
            "Akkount bozorda turibdi. Avval uni bozordan oling");
}

public static MarketplaceException accountAlreadyPublished(UUID listingId) {
    return new MarketplaceException(HttpStatus.CONFLICT, "account_already_published",
            "Bu akkount allaqachon bozorda: " + listingId);
}
```

Read the existing constructor signature before writing these — copy whatever `listingNotFound()` uses.

- [ ] **Step 4: Write the DTOs**

```java
public record UserAccountCreateRequest(
        @Size(max = 120) String title,
        @Size(max = 4000) String description,
        Map<String, Object> attributes,
        List<String> mediaMessageIds) {}

public record UserAccountUpdateRequest(
        @Size(max = 120) String title,
        @Size(max = 4000) String description,
        Map<String, Object> attributes,
        List<String> mediaMessageIds) {}

public record UserAccountEmailRequest(@Email @Size(max = 200) String email) {}

@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserAccountResponse(
        UUID id, String title, String description,
        Map<String, Object> attributes, List<String> mediaMessageIds,
        String email, EmailSource emailSource,
        UserAccountStatus status, ArchivedReason archivedReason,
        boolean onMarket, UUID currentListingId,
        Instant createdAt, Instant updatedAt) {

    /** Hisoblanadigan maydon (onMarket) bor — shuning uchun MapStruct emas, static of. */
    public static UserAccountResponse of(UserAccount a) {
        return new UserAccountResponse(a.getId(), a.getTitle(), a.getDescription(),
                a.getAttributes(), a.getMediaMessageIds(), a.getEmail(), a.getEmailSource(),
                a.getStatus(), a.getArchivedReason(), a.isOnMarket(), a.getCurrentListingId(),
                a.getCreatedAt(), a.getUpdatedAt());
    }
}
```

- [ ] **Step 5: Write the service**

```java
@Slf4j
@Service
@RequiredArgsConstructor
public class UserAccountService {

    private final UserAccountRepository accounts;
    private final UserAccountCardInventory inventory;

    @Transactional(readOnly = true)
    public List<UserAccount> list(UUID ownerId) {
        return accounts.findByOwnerIdAndStatusOrderByCreatedAtDesc(ownerId, UserAccountStatus.ACTIVE);
    }

    @Transactional(readOnly = true)
    public UserAccount get(UUID id, UUID ownerId) {
        return accounts.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(MarketplaceException::accountNotFound);
    }

    @Transactional
    public UserAccount create(UUID ownerId, UserAccountCreateRequest request) {
        UserAccount account = UserAccount.builder()
                .id(UUID.randomUUID())
                .ownerId(ownerId)
                .title(request.title())
                .description(request.description())
                .attributes(request.attributes() == null ? new HashMap<>() : new HashMap<>(request.attributes()))
                .mediaMessageIds(request.mediaMessageIds() == null ? new ArrayList<>() : new ArrayList<>(request.mediaMessageIds()))
                .status(UserAccountStatus.ACTIVE)
                .build();
        UserAccount saved = accounts.saveAndFlush(account);
        inventory.replace(saved.getId(), saved.getAttributes().get("valuable_players"));
        log.info("Account created: id={} ownerId={}", saved.getId(), ownerId);
        return saved;
    }

    @Transactional
    public UserAccount update(UUID id, UUID ownerId, UserAccountUpdateRequest request) {
        UserAccount account = get(id, ownerId);
        if (request.title() != null) account.setTitle(request.title());
        if (request.description() != null) account.setDescription(request.description());
        if (request.attributes() != null) account.setAttributes(new HashMap<>(request.attributes()));
        if (request.mediaMessageIds() != null) account.setMediaMessageIds(new ArrayList<>(request.mediaMessageIds()));
        UserAccount saved = accounts.saveAndFlush(account);
        inventory.replace(saved.getId(), saved.getAttributes().get("valuable_players"));
        return saved;
    }

    @Transactional
    public UserAccount setEmail(UUID id, UUID ownerId, String email) {
        UserAccount account = get(id, ownerId);
        account.setEmail(email);
        // Qo'lda kiritilgan manzil platforma pochtasining o'rnini bosadi:
        // eski mailbox havolasi qolsa, u endi noto'g'ri qutini ko'rsatardi.
        account.setEmailSource(email == null || email.isBlank() ? null : EmailSource.MANUAL);
        account.setMailboxId(null);
        return accounts.saveAndFlush(account);
    }

    @Transactional
    public void delete(UUID id, UUID ownerId) {
        UserAccount account = get(id, ownerId);
        if (account.isOnMarket()) {
            throw MarketplaceException.accountOnMarket();
        }
        accounts.delete(account);
        log.info("Account deleted: id={} ownerId={}", id, ownerId);
    }
}
```

Note the ownership rule: `get` reads by id **and** owner, so a stranger's id answers `accountNotFound()` (404) rather than revealing that the row exists.

- [ ] **Step 6: Run the service test**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest=UserAccountServiceTest`
Expected: PASS (4 tests).

- [ ] **Step 7: Write the controller test**

```java
@WebMvcTest(UserAccountController.class)
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class, InternalSecretFilter.class})
class UserAccountControllerTest {

    @Autowired MockMvc mvc;
    @MockBean UserAccountService accounts;

    @Test
    void list_returnsOnlyMyAccounts() throws Exception {
        UUID ownerId = UUID.randomUUID();
        when(accounts.list(ownerId)).thenReturn(List.of());
        mvc.perform(get("/api/v1/accounts").header("X-User-Id", ownerId.toString())
                        .header("X-User-Roles", "ROLE_USER"))
                .andExpect(status().isOk());
        verify(accounts).list(ownerId);
    }

    @Test
    void anonymousRequestIsRejected() throws Exception {
        mvc.perform(get("/api/v1/accounts")).andExpect(status().isUnauthorized());
    }
}
```

The controller has no publisher dependency yet — publish/unpublish arrive in Task 3, and that task adds its own `@MockBean` line to this test.

- [ ] **Step 8: Write the controller**

```java
@RestController
@RequestMapping("/api/v1/accounts")
@RequiredArgsConstructor
public class UserAccountController {

    private final UserAccountService accounts;

    @GetMapping
    public List<UserAccountResponse> list(@AuthenticationPrincipal AuthenticatedUser user) {
        return accounts.list(user.userId()).stream().map(UserAccountResponse::of).toList();
    }

    @GetMapping("/{id}")
    public UserAccountResponse get(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id) {
        return UserAccountResponse.of(accounts.get(id, user.userId()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserAccountResponse create(@AuthenticationPrincipal AuthenticatedUser user,
                                      @Valid @RequestBody UserAccountCreateRequest request) {
        return UserAccountResponse.of(accounts.create(user.userId(), request));
    }

    @PatchMapping("/{id}")
    public UserAccountResponse update(@AuthenticationPrincipal AuthenticatedUser user,
                                      @PathVariable UUID id,
                                      @Valid @RequestBody UserAccountUpdateRequest request) {
        return UserAccountResponse.of(accounts.update(id, user.userId(), request));
    }

    @PatchMapping("/{id}/email")
    public UserAccountResponse setEmail(@AuthenticationPrincipal AuthenticatedUser user,
                                        @PathVariable UUID id,
                                        @Valid @RequestBody UserAccountEmailRequest request) {
        return UserAccountResponse.of(accounts.setEmail(id, user.userId(), request.email()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id) {
        accounts.delete(id, user.userId());
    }
}
```

Check `config/SecurityConfig.java` before running: `/api/v1/accounts/**` must require an authenticated principal. If the chain's default is `authenticated()`, nothing to add; if routes are listed explicitly, add this one.

- [ ] **Step 9: Run both tests**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest='UserAccount*Test'`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/account \
        backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/exception/MarketplaceException.java \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/account
git commit -m "feat(marketplace): akkount CRUD API"
```

---

### Task 3: Publish and unpublish

**Files:**
- Create: `.../account/UserAccountPublisher.java`
- Create: `.../account/dto/PublishAccountRequest.java`
- Modify: `.../account/UserAccountController.java` (two routes)
- Test: `.../account/UserAccountPublisherTest.java`

**Interfaces:**
- Consumes: `UserAccountRepository`, `ListingService.delete(UUID id, UUID sellerId)`, and one new seam written in this task:
  `ListingService.createWithUploadedMedia(UUID sellerId, ListingCreateRequest request, List<String> mediaMessageIds) : Listing`
  — the existing `create(...)` minus `mediaService.validate(files)` and `mediaService.uploadToBot(...)`, because an account's photos are already in Telegram. Extract the shared tail of `create` (save → `accountLink` → channel orders → official channel → `events.listingCreated`) into a private method both call, so the two paths cannot drift.
- Produces: `UserAccountPublisher.publish(UUID accountId, UUID ownerId, PublishAccountRequest) : Listing`, `UserAccountPublisher.unpublish(UUID accountId, UUID ownerId) : UserAccount`.

- [ ] **Step 1: Write the failing test**

```java
@ExtendWith(MockitoExtension.class)
class UserAccountPublisherTest {

    @Mock UserAccountRepository accounts;
    @Mock ListingService listings;
    @InjectMocks UserAccountPublisher publisher;

    private final UUID ownerId = UUID.randomUUID();
    private final UUID accountId = UUID.randomUUID();

    private UserAccount account() {
        return UserAccount.builder().id(accountId).ownerId(ownerId)
                .description("tavsif").attributes(new HashMap<>(Map.of("platform", "MOBILE")))
                .mediaMessageIds(new ArrayList<>(List.of("msg-1")))
                .email("private@efbazaar.uz").emailSource(EmailSource.PLATFORM)
                .status(UserAccountStatus.ACTIVE).build();
    }

    @Test
    void publish_createsListingFromAccount_withoutTheEmail() {
        UserAccount account = account();
        UUID listingId = UUID.randomUUID();
        Listing created = new Listing();
        created.setId(listingId);
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(account));
        when(listings.createWithUploadedMedia(eq(ownerId), any(ListingCreateRequest.class), eq(List.of("msg-1"))))
                .thenReturn(created);
        when(accounts.saveAndFlush(account)).thenReturn(account);

        publisher.publish(accountId, ownerId, new PublishAccountRequest(
                new BigDecimal("2400000"), true, "EXCHANGE_ONLY", null));

        ArgumentCaptor<ListingCreateRequest> sent = ArgumentCaptor.forClass(ListingCreateRequest.class);
        verify(listings).createWithUploadedMedia(eq(ownerId), sent.capture(), eq(List.of("msg-1")));
        assertThat(sent.getValue().description()).isEqualTo("tavsif");
        assertThat(sent.getValue().price()).isEqualByComparingTo("2400000");
        assertThat(sent.getValue().attributes()).containsEntry("platform", "MOBILE");
        assertThat(sent.getValue().attributes()).containsEntry("exchange_mode", "EXCHANGE_ONLY");
        assertThat(sent.getValue().attributes().toString()).doesNotContain("efbazaar.uz");
        assertThat(account.getCurrentListingId()).isEqualTo(listingId);
    }

    @Test
    void publish_refusesAnAccountAlreadyOnTheMarket() {
        UserAccount published = account();
        published.setCurrentListingId(UUID.randomUUID());
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(published));

        assertThatThrownBy(() -> publisher.publish(accountId, ownerId,
                new PublishAccountRequest(new BigDecimal("2400000"), false, null, null)))
                .isInstanceOf(MarketplaceException.class)
                .extracting("status").isEqualTo(HttpStatus.CONFLICT);
        verifyNoInteractions(listings);
    }

    @Test
    void unpublish_deletesTheListingAndClearsTheLink() {
        UserAccount published = account();
        UUID listingId = UUID.randomUUID();
        published.setCurrentListingId(listingId);
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(published));
        when(accounts.saveAndFlush(published)).thenReturn(published);

        publisher.unpublish(accountId, ownerId);

        verify(listings).delete(listingId, ownerId);
        assertThat(published.getCurrentListingId()).isNull();
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest=UserAccountPublisherTest`
Expected: FAIL — `PublishAccountRequest` / publisher methods missing.

- [ ] **Step 3: Write the request DTO and the publisher**

```java
public record PublishAccountRequest(
        @NotNull @DecimalMin(value = "5000.00") BigDecimal price,
        boolean priceNegotiable,
        String exchangeMode,          // null, EXCHANGE_ONLY, EXCHANGE_WITH_SURCHARGE, BOTH
        List<UUID> channelIds) {}
```

```java
@Slf4j
@Service
@RequiredArgsConstructor
public class UserAccountPublisher {

    /**
     * E'longa KO'CHIRILADIGAN maydonlar ro'yxati ataylab aniq sanaladi.
     * "Emaildan boshqa hammasi" qoidasi bo'lganda, keyinchalik qo'shilgan
     * maxfiy ustun o'z-o'zidan e'longa sirg'alib o'tardi.
     */
    private final UserAccountRepository accounts;
    private final ListingService listings;

    /** Egalik shu yerda ham tekshiriladi: publisher UserAccountService'ga bog'lanmaydi (Task 4 dagi tsikl). */
    private UserAccount owned(UUID accountId, UUID ownerId) {
        return accounts.findByIdAndOwnerId(accountId, ownerId)
                .orElseThrow(MarketplaceException::accountNotFound);
    }

    @Transactional
    public Listing publish(UUID accountId, UUID ownerId, PublishAccountRequest request) {
        UserAccount account = owned(accountId, ownerId);
        if (account.isOnMarket()) {
            throw MarketplaceException.accountAlreadyPublished(account.getCurrentListingId());
        }

        Map<String, Object> attributes = new HashMap<>(account.getAttributes());
        if (request.exchangeMode() != null) {
            attributes.put("exchange_mode", request.exchangeMode());
        }

        ListingCreateRequest listingRequest = new ListingCreateRequest(
                account.getDescription(), request.price(), request.priceNegotiable(),
                attributes, request.channelIds());

        // Rasmlar allaqachon Telegram'da — qayta yuklash ham, tekshirish ham
        // kerak emas, faqat message id lar ko'chiriladi.
        Listing listing = listings.createWithUploadedMedia(
                ownerId, listingRequest, account.getMediaMessageIds());

        account.setCurrentListingId(listing.getId());
        accounts.saveAndFlush(account);
        log.info("Account published: accountId={} listingId={}", accountId, listing.getId());
        return listing;
    }

    @Transactional
    public UserAccount unpublish(UUID accountId, UUID ownerId) {
        UserAccount account = owned(accountId, ownerId);
        if (account.isOnMarket()) {
            listings.delete(account.getCurrentListingId(), ownerId);
            account.setCurrentListingId(null);
        }
        return accounts.saveAndFlush(account);
    }
}
```

Write `ListingService.createWithUploadedMedia` in this task and give it its own unit test: it must skip `mediaService.validate` and `mediaService.uploadToBot` entirely, set the passed ids on the listing, and still run the shared tail (`persistence.saveWithCardInventory`, channel orders, official channel, `events.listingCreated`). An account whose `mediaMessageIds` is empty must be refused before the listing is created — `MarketplaceException` with a message telling the user to add photos — because a listing with no photo is not publishable today either.

- [ ] **Step 4: Add the two routes**

```java
@PostMapping("/{id}/publish")
public ListingResponse publish(@AuthenticationPrincipal AuthenticatedUser user,
                               @PathVariable UUID id,
                               @Valid @RequestBody PublishAccountRequest request) {
    return assembler.assemble(publisher.publish(id, user.userId(), request), user.userId());
}

@PostMapping("/{id}/unpublish")
public UserAccountResponse unpublish(@AuthenticationPrincipal AuthenticatedUser user,
                                     @PathVariable UUID id) {
    return UserAccountResponse.of(publisher.unpublish(id, user.userId()));
}
```

`ListingViewAssembler` is how `ListingController` turns a `Listing` into a `ListingResponse` — inject the same bean.

- [ ] **Step 5: Run the tests**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest='UserAccount*Test'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/account \
        backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/account
git commit -m "feat(marketplace): akkountni bozorga chiqarish va bozordan olish"
```

---

### Task 4: Edits reach the live listing

**Files:**
- Modify: `.../account/UserAccountService.java` (call the publisher after a save)
- Modify: `.../account/UserAccountPublisher.java` (add `propagate`)
- Test: `.../account/UserAccountPropagationTest.java`

**Interfaces:**
- Consumes: a second seam written in this task —
  `ListingService.updateContent(UUID id, UUID sellerId, ListingUpdateRequest request, List<String> mediaMessageIds) : Listing`
  — the existing `update(...)` with the media replaced from ids instead of uploads (`ListingUpdateRequest` carries no media field, and the account's photos are already in Telegram).
- Produces: `UserAccountPublisher.propagate(UserAccount account) : void` — no-op when the account is not on the market.

- [ ] **Step 1: Write the failing test**

```java
@ExtendWith(MockitoExtension.class)
class UserAccountPropagationTest {

    @Mock UserAccountRepository accounts;
    @Mock ListingService listings;
    @InjectMocks UserAccountPublisher publisher;

    @Test
    void propagate_copiesContentButNeverPriceOrExchangeTerms() {
        UUID listingId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UserAccount account = UserAccount.builder()
                .id(UUID.randomUUID()).ownerId(ownerId).currentListingId(listingId)
                .description("yangilangan tavsif")
                .attributes(new HashMap<>(Map.of("platform", "MOBILE", "team_strength", 3150)))
                .mediaMessageIds(new ArrayList<>(List.of("msg-2"))).build();

        publisher.propagate(account);

        ArgumentCaptor<ListingUpdateRequest> sent = ArgumentCaptor.forClass(ListingUpdateRequest.class);
        verify(listings).updateContent(eq(listingId), eq(ownerId), sent.capture(), eq(List.of("msg-2")));
        assertThat(sent.getValue().description()).isEqualTo("yangilangan tavsif");
        assertThat(sent.getValue().attributes()).containsEntry("team_strength", 3150);
        assertThat(sent.getValue().attributes()).doesNotContainKey("exchange_mode");
        // null narx va null priceNegotiable: ListingMapper NullValuePropertyMappingStrategy.IGNORE
        // bilan ishlaydi, ya'ni e'londagi joriy qiymatlar tegilmaydi.
        assertThat(sent.getValue().price()).isNull();
        assertThat(sent.getValue().priceNegotiable()).isNull();
    }

    @Test
    void propagate_doesNothingWhenTheAccountIsNotOnTheMarket() {
        UserAccount idle = UserAccount.builder().id(UUID.randomUUID()).ownerId(UUID.randomUUID()).build();
        publisher.propagate(idle);
        verifyNoInteractions(listings);
    }

    @Test
    void propagate_unlinksWhenTheListingIsGone() {
        UUID listingId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UserAccount account = UserAccount.builder()
                .id(UUID.randomUUID()).ownerId(ownerId).currentListingId(listingId)
                .attributes(new HashMap<>()).build();
        when(listings.updateContent(eq(listingId), eq(ownerId), any(), any()))
                .thenThrow(MarketplaceException.listingNotFound());

        publisher.propagate(account);

        assertThat(account.getCurrentListingId()).isNull();
        verify(accounts).saveAndFlush(account);
    }
}
```

`ListingUpdateRequest` is `(String description, BigDecimal price, Boolean priceNegotiable, Map<String, Object> attributes)` — all nullable, and `ListingMapper` is configured with `NullValuePropertyMappingStrategy.IGNORE`, so passing null for the two price fields leaves the listing's own values alone.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest=UserAccountPropagationTest`
Expected: FAIL — `propagate` does not exist.

- [ ] **Step 3: Implement `propagate`**

```java
/** Sotuv shartlari akkountga tegishli emas — ular e'londa qoladi. */
private static final Set<String> LISTING_ONLY_ATTRIBUTES = Set.of("exchange_mode");

@Transactional
public void propagate(UserAccount account) {
    if (!account.isOnMarket()) return;

    Map<String, Object> attributes = new HashMap<>(account.getAttributes());
    LISTING_ONLY_ATTRIBUTES.forEach(attributes::remove);

    try {
        listings.updateContent(account.getCurrentListingId(), account.getOwnerId(),
                new ListingUpdateRequest(account.getDescription(), null, null, attributes),
                account.getMediaMessageIds());
    } catch (MarketplaceException e) {
        // E'lon sotilgan yoki o'chirilgan: akkount saqlanadi, bog'lanish uziladi.
        log.info("Propagation skipped, unlinking: accountId={} listingId={} code={}",
                account.getId(), account.getCurrentListingId(), e.getCode());
        account.setCurrentListingId(null);
        accounts.saveAndFlush(account);
    }
}
```

Removing `exchange_mode` from the copy means the listing keeps whatever the seller chose at publish time — `ListingService.update` merges attributes, so an absent key is left alone. Verify that with a quick read of `AttributeValidator.validate`: if it rejects a payload missing a required key, pass the listing's current `exchange_mode` through instead of removing it, and adjust the test.

- [ ] **Step 4: Call it from the service**

```java
// UserAccountService.update(...) — saqlangandan keyin
UserAccount saved = accounts.saveAndFlush(account);
inventory.replace(saved.getId(), saved.getAttributes().get("valuable_players"));
publisher.propagate(saved);
return saved;
```

No cycle: Task 3's publisher reads ownership straight from `UserAccountRepository` and never injects `UserAccountService`, so the service can depend on the publisher.

- [ ] **Step 5: Run the tests**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest='UserAccount*Test'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/account \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/account
git commit -m "feat(marketplace): akkount tahriri bozordagi e'longa ham tushadi"
```

---

### Task 5: Every listing gets an account; selling archives it

**Files:**
- Modify: `.../service/ListingService.java` (`create`, `markSold`)
- Create: `.../account/ListingAccountLink.java` — the seam ListingService calls, so the listing path does not learn the account model
- Test: `.../account/ListingAccountLinkTest.java`, `.../service/ListingServiceAccountHookTest.java`

**Interfaces:**
- Consumes: `UserAccountRepository`, `UserAccountCardInventory`.
- Produces:
  - `ListingAccountLink.onListingCreated(Listing listing) : void` — creates an ACTIVE account from the listing, sets `sourceListingId` and `currentListingId`; skips when `existsBySourceListingId` is true (replay safety).
  - `ListingAccountLink.onListingSoldByOwner(UUID listingId) : void` — archives the linked account with `SOLD_ELSEWHERE`, clears `email`, `emailSource`, `mailboxId`, `currentListingId`.

- [ ] **Step 1: Write the failing test**

```java
@ExtendWith(MockitoExtension.class)
class ListingAccountLinkTest {

    @Mock UserAccountRepository accounts;
    @Mock UserAccountCardInventory inventory;
    @InjectMocks ListingAccountLink link;

    @Test
    void onListingCreated_buildsAnAccountBehindTheListing() {
        UUID sellerId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setId(UUID.randomUUID());
        listing.setSellerId(sellerId);
        listing.setDescription("tavsif");
        listing.setAttributes(new HashMap<>(Map.of("platform", "MOBILE", "exchange_mode", "BOTH")));
        listing.setMediaMessageIds(new ArrayList<>(List.of("msg-1")));
        when(accounts.existsBySourceListingId(listing.getId())).thenReturn(false);
        when(accounts.saveAndFlush(any(UserAccount.class))).thenAnswer(i -> i.getArgument(0));

        link.onListingCreated(listing);

        ArgumentCaptor<UserAccount> saved = ArgumentCaptor.forClass(UserAccount.class);
        verify(accounts).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getOwnerId()).isEqualTo(sellerId);
        assertThat(saved.getValue().getCurrentListingId()).isEqualTo(listing.getId());
        assertThat(saved.getValue().getSourceListingId()).isEqualTo(listing.getId());
        // Sotuv sharti akkountga ko'chmaydi
        assertThat(saved.getValue().getAttributes()).doesNotContainKey("exchange_mode");
        assertThat(saved.getValue().getEmail()).isNull();
    }

    @Test
    void onListingCreated_isIdempotent() {
        Listing listing = new Listing();
        listing.setId(UUID.randomUUID());
        listing.setSellerId(UUID.randomUUID());
        when(accounts.existsBySourceListingId(listing.getId())).thenReturn(true);

        link.onListingCreated(listing);

        verify(accounts, never()).saveAndFlush(any());
    }

    @Test
    void onListingSoldByOwner_archivesAndDetachesTheEmail() {
        UUID listingId = UUID.randomUUID();
        UserAccount account = UserAccount.builder()
                .id(UUID.randomUUID()).ownerId(UUID.randomUUID())
                .currentListingId(listingId).email("a@efbazaar.uz")
                .emailSource(EmailSource.PLATFORM).mailboxId(UUID.randomUUID())
                .status(UserAccountStatus.ACTIVE).build();
        when(accounts.findByCurrentListingId(listingId)).thenReturn(Optional.of(account));

        link.onListingSoldByOwner(listingId);

        assertThat(account.getStatus()).isEqualTo(UserAccountStatus.ARCHIVED);
        assertThat(account.getArchivedReason()).isEqualTo(ArchivedReason.SOLD_ELSEWHERE);
        assertThat(account.getEmail()).isNull();
        assertThat(account.getMailboxId()).isNull();
        assertThat(account.getCurrentListingId()).isNull();
        verify(accounts).saveAndFlush(account);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest=ListingAccountLinkTest`
Expected: FAIL — `ListingAccountLink` does not exist.

- [ ] **Step 3: Write `ListingAccountLink`**

Mirror the assertions above. `onListingCreated` copies description, attributes (minus `exchange_mode`), media ids and squad rows; `onListingSoldByOwner` archives. Both are `@Transactional` and log one line each.

- [ ] **Step 4: Call it from `ListingService`**

```java
// create(...) — persistence.saveWithCardInventory(listing) dan KEYIN, kanal
// buyurtmasidan OLDIN; akkountsiz e'lon yarim qurilgan yozuv bo'lib qolardi.
Listing saved = persistence.saveWithCardInventory(listing);
accountLink.onListingCreated(saved);

// markSold(...) — e'lon SOLD bo'lgandan keyin
Listing saved = listings.save(listing);
accountLink.onListingSoldByOwner(saved.getId());
```

Inject `ListingAccountLink` into `ListingService`. Publishing from an account must not create a second account: `UserAccountPublisher.publish` already links `currentListingId`, so set `sourceListingId` on that account in `publish` (Task 3) before calling `listings.create`, or have `publish` pass a flag; the `existsBySourceListingId` guard then makes the hook a no-op. Pick the version that keeps `ListingService` unaware of accounts and note it in the commit message.

- [ ] **Step 5: Write the hook test for `ListingService`**

Extend an existing `ListingService` unit test (or add `ListingServiceAccountHookTest`) asserting that `create` calls `onListingCreated` once with the saved listing, and `markSold` calls `onListingSoldByOwner` with its id.

- [ ] **Step 6: Run the tests**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest='ListingAccountLinkTest,ListingServiceAccountHookTest'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/marketplace-service/src/main/java/uz/efbazaar/marketplace \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace
git commit -m "feat(marketplace): har e'lon ortida akkount, sotilganda arxivlanadi"
```

---

### Task 6: Backfill accounts for existing listings

**Files:**
- Create: `.../account/UserAccountBackfill.java`
- Modify: `backend/marketplace-service/src/main/resources/application.yml` (`app.user-account-backfill.enabled`, `batch-size`)
- Modify: `.env.example`, `docker-compose.yml` (`USER_ACCOUNT_BACKFILL_ENABLED`)
- Test: `.../account/UserAccountBackfillTest.java`

**Interfaces:**
- Consumes: `JdbcTemplate`, `ListingAccountLink.onListingCreated` (reuse — one definition of "what an account made from a listing looks like").
- Produces: nothing other code calls.

- [ ] **Step 1: Write the failing test**

```java
@ExtendWith(MockitoExtension.class)
class UserAccountBackfillTest {

    @Mock JdbcTemplate jdbc;
    @Mock ListingAccountLink link;

    @Test
    void backfill_walksActiveListingsAndStopsWhenThePageIsEmpty() throws Exception {
        Listing first = new Listing();
        first.setId(UUID.randomUUID());
        first.setSellerId(UUID.randomUUID());
        when(jdbc.query(anyString(), ArgumentMatchers.<RowMapper<Listing>>any(), any(), any(), anyInt()))
                .thenReturn(List.of(first))
                .thenReturn(List.of());

        new UserAccountBackfill(jdbc, link, 200).run(new DefaultApplicationArguments());

        verify(link).onListingCreated(first);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest=UserAccountBackfillTest`
Expected: FAIL — class missing.

- [ ] **Step 3: Write the runner**

Copy the shape of `service/ListingCardInventoryBackfill.java`: `@ConditionalOnProperty(prefix = "app.user-account-backfill", name = "enabled", havingValue = "true")`, keyset pagination by `listing.id`, and this page query:

```sql
SELECT l.id, l.seller_id, l.description, l.attributes, l.media_message_ids
FROM listings l
WHERE (?::uuid IS NULL OR l.id > ?::uuid)
  AND l.status = 'ACTIVE'
  AND NOT EXISTS (SELECT 1 FROM user_accounts a WHERE a.source_listing_id = l.id)
ORDER BY l.id
LIMIT ?
```

`SOLD` and `DELETED` listings are deliberately excluded — a sold account is not the seller's any more. One failing row logs and the cursor still advances, exactly as the card backfill does.

- [ ] **Step 4: Wire the config**

```yaml
# application.yml
app:
  user-account-backfill:
    enabled: ${USER_ACCOUNT_BACKFILL_ENABLED:false}
    batch-size: 200
```

Add `USER_ACCOUNT_BACKFILL_ENABLED=true` to `.env.example` with a comment saying it is a one-time repair that is safe to leave on, and pass it through the `marketplace-service` block in `docker-compose.yml`.

- [ ] **Step 5: Run the test**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -Dtest=UserAccountBackfillTest`
Expected: PASS.

- [ ] **Step 6: Run the whole backend suite**

Run: `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -DargLine="-Dapi.version=1.44"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/marketplace-service .env.example docker-compose.yml
git commit -m "feat(marketplace): mavjud e'lonlar uchun akkount backfill"
```

---

### Task 7: Frontend data layer

**Files:**
- Create: `frontend/src/lib/accounts-types.ts`, `accounts-client.ts`, `accounts-server.ts`, `accounts-actions.ts`
- Test: `frontend/src/lib/accounts-client.test.ts`

**Interfaces:**
- Consumes: the Task 2/3 API.
- Produces:
  - types `UserAccountResponse`, `PublishAccountRequest`
  - client: `getMyAccounts()`, `createAccount(body)`, `updateAccount(id, body)`, `setAccountEmail(id, email)`, `deleteAccount(id)`, `publishAccount(id, body)`, `unpublishAccount(id)`
  - server: `getMyAccountsServer()`, `getAccountServer(id)`
  - actions: `publishAccountAction`, `unpublishAccountAction`, `deleteAccountAction` returning `{ ok: true } | { ok: false; message: string }`, the shape `lib/marketplace-actions.ts` already uses.

- [ ] **Step 1: Write the failing test**

```ts
// accounts-client.test.ts
import { describe, expect, it, vi } from 'vitest';
import { publishAccount, setAccountEmail } from './accounts-client';

describe('accounts client', () => {
  it('publishes through the marketplace proxy path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'listing-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await publishAccount('acc-1', { price: 2400000, priceNegotiable: true, exchangeMode: null, channelIds: [] });

    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/marketplace/v1/accounts/acc-1/publish');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'include' });
  });

  it('sends a cleared email as null, not an empty string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'acc-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await setAccountEmail('acc-1', '   ');

    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ email: null });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/lib/accounts-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the modules**

Follow `lib/access-requirements.ts` for the client shape (`buildMarketplaceApiPath`, `credentials: 'include'`, an error class carrying `code`), `lib/marketplace-server.ts` for the SSR reads (`safeFetch` with the `MARKETPLACE_PREFIX`), and `lib/marketplace-actions.ts` for the server actions.

- [ ] **Step 4: Run the test**

Run: `cd frontend && npx vitest run src/lib/accounts-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
cd frontend && npx tsc --noEmit -p . && npx eslint src/lib/accounts-*.ts
git add frontend/src/lib
git commit -m "feat(frontend): akkountlar API qatlami"
```

---

### Task 8: The accounts tab

**Files:**
- Create: `frontend/src/components/profile/profile-accounts.tsx`, `account-card.tsx`
- Modify: `frontend/src/components/profile/profile-tabs.tsx`, `frontend/src/app/profile/page.tsx`
- Test: `frontend/src/components/profile/account-card.test.ts`

**Interfaces:**
- Consumes: Task 7's types, `getMyAccountsServer()`, the three actions.
- Produces: `<ProfileAccounts accounts={UserAccountResponse[]} />`, `<AccountCard account={…} />`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountCard } from './account-card';
import type { UserAccountResponse } from '@/lib/accounts-types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/accounts-actions', () => ({
  deleteAccountAction: vi.fn(), unpublishAccountAction: vi.fn(),
}));

const account = (over: Partial<UserAccountResponse> = {}): UserAccountResponse => ({
  id: 'acc-1', title: 'Asosiy akkount', description: '', attributes: {}, mediaMessageIds: [],
  email: 'a7f2@efbazaar.uz', emailSource: 'PLATFORM', status: 'ACTIVE',
  onMarket: false, currentListingId: null, createdAt: '2026-09-18T00:00:00Z', updatedAt: '',
  ...over,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); });

async function render(over: Partial<UserAccountResponse> = {}) {
  await act(async () => root.render(createElement(AccountCard, { account: account(over) })));
}

describe('AccountCard', () => {
  it('keeps the email masked until it is revealed', async () => {
    await render();
    expect(container.textContent).not.toContain('a7f2@efbazaar.uz');
    const reveal = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes("Ko'rsatish"))!;
    await act(async () => reveal.click());
    expect(container.textContent).toContain('a7f2@efbazaar.uz');
  });

  it('shows the Bozorda badge and hides delete while published', async () => {
    await render({ onMarket: true, currentListingId: 'listing-1' });
    expect(container.textContent).toContain('Bozorda');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.includes("O'chirish"))).toBe(false);
  });

  it('offers publishing when the account is idle', async () => {
    await render();
    expect(container.textContent).toContain("Bozorga chiqarish");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/components/profile/account-card.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Write the components**

`AccountCard`: photo (first media id through `listingMediaUrl`), title, an attribute summary line, the masked email with a `Ko'rsatish` toggle, squad count, and — when `onMarket` — a `Bozorda` badge linking to `/marketplace/{currentListingId}`. Actions: `Tahrirlash` (links to `/profile/accounts/{id}`), `Bozorga chiqarish` or `Bozordan olish`, and `O'chirish` only when idle, using the same two-click confirm as `listing-owner-actions.tsx`.

`ProfileAccounts`: the grid plus the empty state ("Sizda hali akkount yo'q" + a link to `/profile/accounts/new`).

- [ ] **Step 4: Swap the tab**

In `profile-tabs.tsx` rename the id `listings` → `accounts` and the label `E'lonlarim` → `Akkountlarim` (keep the `Package` icon). In `app/profile/page.tsx` update `ProfileTabId`, `VALID_TABS`, the header copy and the data fetch: `accounts` loads `getMyAccountsServer()`, `favorites` still loads `getMyFavorites()`. Keep `?tab=listings` working by mapping the old value to `accounts` in `resolveTab`, so links people already have do not 404.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/components/profile && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/profile frontend/src/app/profile
git commit -m "feat(frontend): profilda Akkountlarim bo'limi"
```

---

### Task 9: Account create and edit screens

**Files:**
- Modify: `frontend/src/components/marketplace/listing-form.tsx` (add `mode`)
- Create: `frontend/src/components/marketplace/account-form.tsx`
- Create: `frontend/src/app/profile/accounts/new/page.tsx`, `frontend/src/app/profile/accounts/[id]/page.tsx`
- Test: `frontend/src/components/marketplace/account-form.test.ts`

**Interfaces:**
- Consumes: `createAccount`, `updateAccount` from Task 7; `ListingForm`'s existing steps.
- Produces: `<AccountForm attributeDefinitions initial?={UserAccountResponse} />`.

- [ ] **Step 1: Write the failing test**

Render `AccountForm` with no `initial` and assert: the step list has no `pricing` step, the review step shows no price, and submitting calls `createAccount` with `{ description, attributes, mediaMessageIds }` and no `price` key.

```ts
const createAccount = vi.fn().mockResolvedValue({ id: 'acc-1' });
vi.mock('@/lib/accounts-client', () => ({ createAccount, updateAccount: vi.fn() }));
// …render, fill the minimum, submit…
expect(Object.keys(createAccount.mock.calls[0][0])).not.toContain('price');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/components/marketplace/account-form.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Add `mode` to `ListingForm`**

```tsx
type ListingFormMode = 'listing' | 'account';

// STEPS is currently a module-level const; make it a function of the mode:
const STEPS_BY_MODE: Record<ListingFormMode, readonly StepId[]> = {
  listing: ['photos', 'basics', 'gameplay', 'pricing', 'review'],
  account: ['photos', 'basics', 'gameplay', 'review'],
};
```

Thread `mode` through `validateStep` (skip pricing rules in account mode), the review step (hide price and channel selection), the draft key (`efbazaar:account-draft-v1`, so a half-finished account never leaks into a listing draft) and `buildRequest` (account mode emits the account payload and calls the account API). Everything else — photos, attributes, squad picker — is untouched.

- [ ] **Step 4: Write `AccountForm` and the two pages**

`AccountForm` is a thin wrapper: it renders `ListingForm` with `mode="account"`, passes `initial` when editing, and shows a notice above the form when `initial?.onMarket` is true: "O'zgarishlar bozordagi e'longa ham tushadi."

Pages: `/profile/accounts/new` renders it empty; `/profile/accounts/[id]` loads the account server-side with `getAccountServer(id)` and renders it filled, `notFound()` when the read fails.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/components/marketplace && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/marketplace frontend/src/app/profile/accounts
git commit -m "feat(frontend): akkount yaratish va tahrirlash ekranlari"
```

---

### Task 10: Publish dialog

**Files:**
- Create: `frontend/src/components/profile/publish-account-dialog.tsx`
- Modify: `frontend/src/components/profile/account-card.tsx` (open it)
- Test: `frontend/src/components/profile/publish-account-dialog.test.ts`

**Interfaces:**
- Consumes: `publishAccount` from Task 7, `ChannelCard` picker already used by the listing form's pricing step.
- Produces: `<PublishAccountDialog account onClose onPublished />`.

- [ ] **Step 1: Write the failing test**

Assert three things: submitting sends `{ price, priceNegotiable, exchangeMode, channelIds }` to `publishAccount`; a price below 5 000 so'm is refused client-side with a visible message; a failed call shows the server message and leaves the dialog open.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/components/profile/publish-account-dialog.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the dialog**

Reuse the modal shape from `components/admin/admin-access-requirements.tsx` (fixed overlay, `role="dialog"`, Escape to close). Fields: price with the same formatting helper the listing form's pricing step uses, a negotiable checkbox, exchange terms select (`Obmen yo'q / Faqat obmen / Obmen + doplata / Ikkalasi`), and the partner channel picker. On success call `onPublished()`, which refreshes the profile route.

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/components/profile && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/profile
git commit -m "feat(frontend): akkountni bozorga chiqarish oynasi"
```

---

### Task 11: `/marketplace/new` starts from an account

**Files:**
- Create: `frontend/src/components/marketplace/listing-source-step.tsx`
- Modify: `frontend/src/app/marketplace/new/page.tsx`
- Test: `frontend/src/components/marketplace/listing-source-step.test.ts`

**Interfaces:**
- Consumes: `getMyAccountsServer()` (server side, passed down as a prop), `publishAccount`.
- Produces: `<ListingSourceStep accounts={UserAccountResponse[]} onNew={() => void} />`.

- [ ] **Step 1: Write the failing test**

```ts
it('offers both paths when the user has accounts', async () => {
  await render([account(), account({ id: 'acc-2' })]);
  expect(container.textContent).toContain('Akkountlarimdan tanlash');
  expect(container.textContent).toContain('(2)');
  expect(container.textContent).toContain("Yangi akkount ma'lumotlarini kiritish");
});

it('skips straight to the form when there are no accounts', async () => {
  await render([]);
  expect(container.textContent).not.toContain('Akkountlarimdan tanlash');
  expect(onNew).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/components/marketplace/listing-source-step.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the step and wire the page**

Two large buttons. "Akkountlarimdan tanlash (N)" opens the account list; picking one opens the publish dialog from Task 10 and, on success, routes to the new listing. "Yangi akkount ma'lumotlarini kiritish" renders today's `ListingForm` in `listing` mode — which, thanks to Task 5, creates the account behind the listing with no checkbox and no extra UI.

`app/marketplace/new/page.tsx` loads the accounts server-side and passes them in. Accounts that are already `onMarket` are shown greyed with "bozorda" and cannot be picked.

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/components/marketplace && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Run everything**

Run: `cd frontend && npx vitest run && npx eslint src` and `cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp test -DargLine="-Dapi.version=1.44"`
Expected: PASS on both.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): e'lon berish akkountdan boshlanadi"
```

---

## Manual verification before merge

1. Create an account from `/profile/accounts/new`, add a squad, save. It appears under Akkountlarim with no email.
2. Attach an email by hand; reload; it is masked and reveals on tap.
3. Publish it: the listing appears on the market, the card shows **Bozorda**, and the listing page shows no email anywhere (check the network response too).
4. Edit the account (add a player, change the description): the live listing shows the change; its price is unchanged.
5. Mark the listing sold from the listing owner actions: the account is archived and its email is gone.
6. Create a listing the old way from `/marketplace/new`: an account appears behind it, linked, with no email.
7. Start marketplace-service with `USER_ACCOUNT_BACKFILL_ENABLED=true` twice: the second run creates nothing.
