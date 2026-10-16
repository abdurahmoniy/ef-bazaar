# Custom Mailboxes & Account Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users claim a self-named mailbox (`ali@efbazaar.uz`, MAX also `@efootball.uz`), link a Konami account to it through a guided email-change + forgot-password check, and get a verified badge (gold border for custom boxes); admins can open mailboxes on either domain.

**Architecture:** trade-service owns custom mailboxes and a `mailbox_link_sessions` state machine, reusing smart-admin-worker's IMAP pollers (email-change code, reset link). On success trade-service publishes `efbazaar.trade.account-email-verified`; marketplace writes the email + `email_verified`. When marketplace drops a linked email (sale, swap, manual edit, relink) it publishes `efbazaar.marketplace.account-email-unlinked`; trade-service frees the box. Frontend adds a claim page, a link wizard, badges, hints and a "free mailbox" banner.

**Tech Stack:** Java 21 / Spring Boot 3.3.4 (trade-service, marketplace-service), Flyway, Kafka, Python 3.12 (smart-admin-worker, pytest), Next.js 16 / React 19 / Tailwind / shadcn, vitest.

**Spec:** `docs/superpowers/specs/2026-10-16-custom-mailboxes-design.md` (read the "Plan-time deviations" section at its end).

## Global Constraints

- URLs, API paths, fields, code identifiers in English; only UI copy in Uzbek.
- Every new screen works in light and dark mode (theme tokens only, contrast ≥ 4.5:1).
- Custom local part: 5–24 chars, `^[a-z0-9]{5,24}$`, lowercased before checks.
- Reserved local parts: `admin, administrator, support, postmaster, abuse, noreply, hostmaster, webmaster, root, info, mail, efbazaar, efootball, konami, trade, pending, help, security, billing`.
- Allowed domains: env `MAILBOX_DOMAINS=efbazaar.uz,efootball.uz` (first = default). `efootball.uz` only for plans in `trade.mailbox.premium-domain-plans=MAX,STAFF`.
- Custom boxes count against entitlement `mailbox.custom_slots`; unknown entitlement row = 0 (fail closed); `null` value = unlimited.
- Custom boxes are never used by trades and never deleted on downgrade (locked instead).
- One account per mailbox. Each link step lasts 15 minutes.
- Forgot-password is only a check: the reset mail arriving is enough; the reset link is never relayed or logged.
- Flyway V-files are immutable; next numbers: trade-service `V31`, marketplace `V78`. Re-check `sort -V` and `origin/main` before creating.
- Endpoint/topic/table/env changes update the component README and `docs/kafka-topics.md` in the same commit.
- Commits: `feat(scope): ...`, no Claude signature / Co-Authored-By / session lines.
- Java build: `JAVA_HOME=~/.jdks/openjdk-21.0.2`, tests via `mvn -B -ntp verify -DargLine="-Dapi.version=1.44"` (ITs run in failsafe; `mvn test` skips them).
- Frontend: `npm run lint && npm run typecheck && npm test` in `frontend/`; commit `package-lock.json` if `package.json` changes.

## Review Focus

1. Two users claiming the same name at the same moment — exactly one wins, the other gets `409 TAKEN` (unique index on `mailboxes.email`, not a check-then-insert).
2. Worker restarted since the box was provisioned (in-memory password cache empty) — link session polling must still work, because the poll request now carries the encrypted credentials.
3. Account sold while its custom box is linked — box shows as free and the user is notified; the next link session for that box is accepted.
4. A RANDOM mailbox that is in a live trade — verifying it is refused (`409 mailbox_in_trade`) so a trade's IMAP poller is not hijacked.
5. Plan downgrade from MAX to PRO with 3 custom boxes — 2 lock (not deleted), random-box locking is unaffected, and a link session on a locked box is refused (`403 mailbox_locked`).

---

## File Structure

**trade-service** (`backend/trade-service/src/main/java/uz/efbazaar/trade/`)
- `resources/db/migration/V31__custom_mailboxes_and_link_sessions.sql` — `mailboxes.kind`, `mailboxes.linked_account_id`, `mailbox_link_sessions`.
- `mailbox/domain/MailboxKind.java` — `RANDOM | CUSTOM`.
- `mailbox/config/MailboxDomains.java` — parsed `MAILBOX_DOMAINS` + premium plans.
- `mailbox/custom/CustomNamePolicy.java` — pure validation (format + reserved).
- `mailbox/custom/CustomMailboxService.java` — availability, claim, list.
- `mailbox/custom/CustomMailboxController.java` — `/api/v1/mailboxes/custom/**`.
- `mailbox/custom/dto/*` — request/response records.
- `plan/service/CustomSlotService.java` — custom limit (fail closed) + locked custom ids.
- `mailbox/link/MailboxLinkSession.java`, `LinkSessionState.java`, `MailboxLinkSessionRepository.java`, `LinkSessionService.java`, `LinkSessionController.java`, `LinkSessionSweeper.java`, `dto/*`.
- `kafka/AccountEmailUnlinkedConsumer.java`.
- Modified: `Mailbox.java`, `MailboxRepository.java`, `MailboxAccessService.java`, `MailboxSlotService.java` (javadoc only), `AdminMailboxController.java`, `CreateMailboxRequest.java`, `MailboxResponse.java`, `MailboxMapper.java`, `TradeEvents.java`, `TradeEventPublisher.java`, `KonamiEmailReceivedConsumer.java`, `KonamiEmailChangeCodeConsumer.java`, `application.yml`, `README.md`.

**smart-admin-worker** — `kafka/events.py`, `kafka/topics.py`, `handlers/mailbox_provision.py`, `handlers/imap_poll.py`, new `handlers/imap_poll_stop.py`, `main.py`, tests under `tests/`.

**marketplace-service** — `V78__account_email_verified.sql`, `account/EmailSource.java`, `account/UserAccount.java`, `account/ListingAccountLink.java`, `account/UserAccountService.java`, response DTO, new `kafka/AccountEmailVerifiedConsumer.java` + DTO, `event/MarketplaceEvents.java`, `event/MarketplaceEventPublisher.java`, `domain/NotificationType.java`, `push/NotificationPushEvent.java`, `README.md`.

**frontend** (`frontend/src/`)
- `lib/custom-mailbox.ts` (+ `.test.ts`) — name rules, availability → UI state, plan → offer.
- `lib/custom-mailbox-client.ts` — fetch wrappers.
- `lib/link-session.ts` (+ `.test.ts`) — session state → step view model.
- `app/mailboxes/custom/page.tsx`, `components/mailboxes/custom-claim.tsx`, `custom-mailbox-list.tsx`.
- `app/mailboxes/custom/[id]/link/page.tsx`, `components/mailboxes/link-wizard.tsx`, `link-account-picker.tsx`.
- `components/profile/account-card.tsx`, `components/marketplace/account-form.tsx`, `components/profile/profile-accounts.tsx`, `components/profile/free-custom-mailbox-banner.tsx`, `lib/accounts-types.ts`.
- `components/admin/admin-mailbox-create.tsx`, `app/admin/mailboxes/actions.ts`, `lib/mailbox-admin-types.ts`.

---

### Task 1: trade-service schema, `MailboxKind`, split slot/lock accounting

**Files:**
- Create: `backend/trade-service/src/main/resources/db/migration/V31__custom_mailboxes_and_link_sessions.sql`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/domain/MailboxKind.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/plan/service/CustomSlotService.java`
- Modify: `mailbox/domain/Mailbox.java`, `mailbox/repository/MailboxRepository.java` (`countHeldBy`, `findAccessOrderOwnedBy`), `plan/service/MailboxAccessService.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/plan/CustomSlotIT.java`

**Interfaces:**
- Produces: `enum MailboxKind { RANDOM, CUSTOM }`; `Mailbox.kind` (default RANDOM), `Mailbox.linkedAccountId`; `MailboxSource.USER` (add to the enum, javadoc "claimed by the user — custom box");
  `MailboxRepository.findAccessOrderOwnedBy(UUID owner, MailboxKind kind)`;
  `MailboxRepository.countLiveByOwnerAndKind(UUID owner, MailboxKind kind)`;
  `CustomSlotService.KEY = "mailbox.custom_slots"`, `OptionalLong limitFor(UUID)` (empty = unlimited, missing row = `OptionalLong.of(0)`),
  `long used(UUID)`, `boolean canAllocate(UUID)`, `Set<UUID> lockedIds(UUID)`;
  `MailboxAccessService.lockedIds(UUID)` now returns the union of random-locked and custom-locked ids.

- [ ] **Step 1: Write the migration**

```sql
-- Custom (self-named) mailboxes and the sessions that link a Konami account to one.
-- RANDOM = the existing escrow / admin boxes; CUSTOM = claimed by the user from
-- mailbox.custom_slots, never used by a trade.
ALTER TABLE mailboxes ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'RANDOM';
ALTER TABLE mailboxes ADD CONSTRAINT chk_mailboxes_kind CHECK (kind IN ('RANDOM', 'CUSTOM'));
-- The one marketplace account this box is verified for. Cleared when marketplace
-- reports the account lost the email (sold, swapped, edited, relinked).
ALTER TABLE mailboxes ADD COLUMN linked_account_id UUID;
-- USER = claimed by the user themselves (custom box).
ALTER TABLE mailboxes DROP CONSTRAINT chk_mailboxes_source;
ALTER TABLE mailboxes ADD CONSTRAINT chk_mailboxes_source CHECK (source IN ('TRADE', 'ADMIN', 'USER'));

CREATE TABLE mailbox_link_sessions (
    id                 UUID PRIMARY KEY,
    owner_id           UUID        NOT NULL,
    mailbox_id         UUID        NOT NULL REFERENCES mailboxes (id),
    account_id         UUID        NOT NULL,
    state              VARCHAR(24) NOT NULL,
    step_deadline      TIMESTAMPTZ NOT NULL,
    email_change_code  VARCHAR(16),
    code_received_at   TIMESTAMPTZ,
    not_registered     BOOLEAN     NOT NULL DEFAULT false,
    -- Step an EXPIRED session timed out in, so "retry" resumes there.
    expired_from       VARCHAR(24),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_link_session_state CHECK (state IN
        ('WAIT_EMAIL_CHANGE', 'WAIT_RESET', 'VERIFIED', 'EXPIRED', 'CANCELLED'))
);
-- One live session per mailbox.
CREATE UNIQUE INDEX mailbox_link_sessions_live_idx
    ON mailbox_link_sessions (mailbox_id) WHERE state IN ('WAIT_EMAIL_CHANGE', 'WAIT_RESET');
CREATE INDEX mailbox_link_sessions_deadline_idx
    ON mailbox_link_sessions (step_deadline) WHERE state IN ('WAIT_EMAIL_CHANGE', 'WAIT_RESET');
```

- [ ] **Step 2: Add the enum and entity fields**

```java
package uz.efbazaar.trade.mailbox.domain;

/** Mirrors {@code chk_mailboxes_kind} in V31. */
public enum MailboxKind {
    /** Escrow or admin-registered box; counts against {@code mailbox.slots}. */
    RANDOM,
    /** Self-named box the user claimed; counts against {@code mailbox.custom_slots}, never used by a trade. */
    CUSTOM
}
```

In `Mailbox.java` add:

```java
    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 16)
    @Builder.Default
    private MailboxKind kind = MailboxKind.RANDOM;

    /** Marketplace account this box is verified for; null = free. */
    @Column(name = "linked_account_id")
    private UUID linkedAccountId;
```

- [ ] **Step 3: Write the failing IT**

`CustomSlotIT extends AbstractIntegrationIT`, `@Import(StubEscrowConfig.class)`, same `@AfterEach` cleanup as `MailboxSlotIT` (delete entitlement + user-plan rows). Helper `planGrants(plan, Map<String,String>)` via `projection.replacePlan`, helper `userOn(userId, plan)` via `userPlanRows.save(...)` mirroring `MailboxSlotIT`. Helper `box(owner, kind, priority)` saves a `Mailbox` with random email, dummy 12/16-byte iv/tag, `provisionedAt=now`.

```java
@Test
void customBoxesDoNotSpendRandomSlots() {
    planGrants("STANDARD", Map.of("mailbox.slots", "1", "mailbox.custom_slots", "0"));
    UUID u = UUID.randomUUID();
    box(u, MailboxKind.CUSTOM, 1);
    assertThat(slots.used(u)).isZero();
    assertThatCode(() -> slots.assertCanAllocate(u)).doesNotThrowAnyException();
}

@Test
void missingCustomEntitlementMeansZero() {
    planGrants("STANDARD", Map.of("mailbox.slots", "3"));
    assertThat(custom.limitFor(UUID.randomUUID())).hasValue(0);
}

@Test
void nullCustomEntitlementMeansUnlimited() {
    Map<String, String> g = new HashMap<>();
    g.put("mailbox.custom_slots", null);
    planGrants("STANDARD", g);
    assertThat(custom.limitFor(UUID.randomUUID())).isEmpty();
    assertThat(custom.canAllocate(UUID.randomUUID())).isTrue();
}

@Test
void downgradeLocksOldestCustomBoxesOnly() {
    planGrants("PRO", Map.of("mailbox.slots", "5", "mailbox.custom_slots", "1"));
    UUID u = UUID.randomUUID();
    userOn(u, "PRO");
    Mailbox older = box(u, MailboxKind.CUSTOM, 1);
    Mailbox newer = box(u, MailboxKind.CUSTOM, 2);
    Mailbox random = box(u, MailboxKind.RANDOM, 3);
    assertThat(access.lockedIds(u)).containsExactly(older.getId());
    assertThat(custom.canAllocate(u)).isFalse();
    assertThat(mailboxes.findById(older.getId())).isPresent(); // locked, never deleted
}
```

- [ ] **Step 4: Run, expect FAIL** (`CustomSlotService` missing)

Run: `cd backend/trade-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dit.test=CustomSlotIT -Dtest=none -Dsurefire.failIfNoSpecifiedTests=false -DargLine="-Dapi.version=1.44"`
Expected: compilation failure / FAIL.

- [ ] **Step 5: Implement**

Repository changes — add `AND m.kind = 'RANDOM'` right after `WHERE m.deleted_at IS NULL` in `countHeldBy` (custom boxes are never in trade_sides, so the second branch needs no change). Replace `findAccessOrderOwnedBy` with a kind-aware version and update its callers (`MailboxAccessService`, `MailboxService` unlock/swap code — pass `MailboxKind.RANDOM` where they reasoned about random slots; grep `findAccessOrderOwnedBy`):

```java
    @Query("select m from Mailbox m where m.ownerUserId = :owner and m.deletedAt is null and m.kind = :kind "
            + "order by m.accessPriority desc, m.createdAt desc, m.id desc")
    List<Mailbox> findAccessOrderOwnedBy(@Param("owner") UUID owner, @Param("kind") MailboxKind kind);

    @Query("select count(m) from Mailbox m where m.ownerUserId = :owner and m.deletedAt is null and m.kind = :kind")
    long countLiveByOwnerAndKind(@Param("owner") UUID owner, @Param("kind") MailboxKind kind);
```

`CustomSlotService`:

```java
package uz.efbazaar.trade.plan.service;

/**
 * Self-named mailboxes a plan allows. Unlike {@link MailboxSlotService} this
 * fails closed: an unknown entitlement means 0, because a custom box is a
 * permanent address handed out for good, not a trade the marketplace needs to
 * keep selling.
 */
@Service
@RequiredArgsConstructor
public class CustomSlotService {

    public static final String KEY = "mailbox.custom_slots";

    private final EntitlementService entitlements;
    private final PlanEntitlementViewRepository rows;
    private final MailboxRepository mailboxes;

    @Transactional(readOnly = true)
    public OptionalLong limitFor(UUID userId) {
        var row = rows.findByIdPlanCodeAndIdKey(entitlements.planFor(userId), KEY);
        if (row.isEmpty()) return OptionalLong.of(0);
        String v = row.get().getValue();
        if (v == null) return OptionalLong.empty();
        try {
            return OptionalLong.of(Long.parseLong(v.trim()));
        } catch (NumberFormatException e) {
            return OptionalLong.of(0);
        }
    }

    @Transactional(readOnly = true)
    public long used(UUID userId) {
        return mailboxes.countLiveByOwnerAndKind(userId, MailboxKind.CUSTOM);
    }

    @Transactional(readOnly = true)
    public boolean canAllocate(UUID userId) {
        OptionalLong limit = limitFor(userId);
        return limit.isEmpty() || used(userId) < limit.getAsLong();
    }

    /** Oldest-by-priority custom boxes past the limit. Never deleted, only locked. */
    @Transactional(readOnly = true)
    public Set<UUID> lockedIds(UUID userId) {
        OptionalLong limit = limitFor(userId);
        if (limit.isEmpty()) return Set.of();
        List<Mailbox> owned = mailboxes.findAccessOrderOwnedBy(userId, MailboxKind.CUSTOM);
        Set<UUID> locked = new LinkedHashSet<>();
        for (int i = (int) Math.min(limit.getAsLong(), owned.size()); i < owned.size(); i++) {
            locked.add(owned.get(i).getId());
        }
        return locked;
    }
}
```

`MailboxAccessService.lockedIds`: compute the existing random result using `findAccessOrderOwnedBy(userId, MailboxKind.RANDOM)` (the early `return Set.of()` for an unlimited random plan must no longer short-circuit custom), then `addAll(customSlots.lockedIds(userId))`. Inject `CustomSlotService` (no cycle: it does not depend on `MailboxAccessService`).

- [ ] **Step 6: Run `CustomSlotIT`, `MailboxSlotIT`, `MailboxAccessIT` — all PASS**

- [ ] **Step 7: Update README** — `plan` row: mention `CustomSlotService` (`mailbox.custom_slots`, fail closed) and that `MailboxAccessService` locks RANDOM and CUSTOM separately; DB row `V1`–`V31`.

- [ ] **Step 8: Commit**

```bash
git add backend/trade-service
git commit -m "feat(trade): custom mailbox turi va alohida custom slot hisobi"
```

---

### Task 2: Mailbox domains — config, admin create with domain, provision event carries domain

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/mailbox/config/MailboxDomains.java`
- Modify: `application.yml` (`trade.mailbox.domains`, `trade.mailbox.premium-domain-plans`), `AdminMailboxController.java`, `CreateMailboxRequest.java`, `TradeEvents.MailboxProvisionRequest`, `TradeEventPublisher.mailboxProvisionRequest`, `MockWorker` (domain in fake email), `docker-compose.yml` (`MAILBOX_DOMAINS` for trade-service and smart-admin-worker), `.env.example`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/mailbox/AdminMailboxDomainIT.java`, `MailboxDomainsTest.java`

**Interfaces:**
- Produces: `MailboxDomains` bean: `List<String> all()`, `String defaultDomain()`, `boolean allowed(String)`, `boolean premium(String domain)` (true for every domain except the default), `Set<String> premiumPlans()`;
  `record MailboxProvisionRequest(UUID mailboxId, String localPart, String domain)`;
  `TradeEventPublisher.mailboxProvisionRequest(UUID mailboxId, String localPart, String domain)`;
  `CreateMailboxRequest(localPart, ownerUserId, String domain /* nullable = default */)`;
  `GET /api/v1/admin/mailboxes/domains` → `["efbazaar.uz","efootball.uz"]`.

- [ ] **Step 1: Failing unit test `MailboxDomainsTest`**

```java
@Test void parsesListAndDefault() {
    var d = new MailboxDomains(" efbazaar.uz , EFOOTBALL.uz ", "MAX,STAFF");
    assertThat(d.all()).containsExactly("efbazaar.uz", "efootball.uz");
    assertThat(d.defaultDomain()).isEqualTo("efbazaar.uz");
    assertThat(d.allowed("efootball.uz")).isTrue();
    assertThat(d.allowed("gmail.com")).isFalse();
    assertThat(d.premium("efootball.uz")).isTrue();
    assertThat(d.premium("efbazaar.uz")).isFalse();
    assertThat(d.premiumPlans()).containsExactlyInAnyOrder("MAX", "STAFF");
}
@Test void blankFallsBackToEfbazaar() {
    assertThat(new MailboxDomains("", "").all()).containsExactly("efbazaar.uz");
}
```

- [ ] **Step 2: Failing IT `AdminMailboxDomainIT`** (MockMvc with admin headers as in `AdminMailboxOwnershipIT`; `@MockBean TradeEventPublisher events`):
  - POST `/api/v1/admin/mailboxes` `{localPart:"promo1", ownerUserId, domain:"efootball.uz"}` → 202, body email `promo1@efootball.uz`, `verify(events).mailboxProvisionRequest(any(), eq("promo1"), eq("efootball.uz"))`.
  - same without `domain` → `@efbazaar.uz`.
  - `domain:"gmail.com"` → 400 `{code:"domain_not_allowed"}`.
  - GET `/api/v1/admin/mailboxes/domains` → `["efbazaar.uz","efootball.uz"]` (set `trade.mailbox.domains=efbazaar.uz,efootball.uz` via `@TestPropertySource`).

- [ ] **Step 3: Run both — FAIL**

- [ ] **Step 4: Implement**

```java
package uz.efbazaar.trade.mailbox.config;

/** Mail domains this deployment hands out. The first is the default (trades, random boxes). */
@Component
public class MailboxDomains {
    private final List<String> all;
    private final Set<String> premiumPlans;

    public MailboxDomains(@Value("${trade.mailbox.domains:efbazaar.uz}") String domains,
                          @Value("${trade.mailbox.premium-domain-plans:MAX,STAFF}") String plans) {
        List<String> parsed = Arrays.stream(domains.split(","))
                .map(s -> s.trim().toLowerCase(Locale.ROOT)).filter(s -> !s.isEmpty()).distinct().toList();
        this.all = parsed.isEmpty() ? List.of("efbazaar.uz") : parsed;
        this.premiumPlans = Arrays.stream(plans.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).collect(Collectors.toUnmodifiableSet());
    }
    public List<String> all() { return all; }
    public String defaultDomain() { return all.get(0); }
    public boolean allowed(String d) { return d != null && all.contains(d.toLowerCase(Locale.ROOT)); }
    public boolean premium(String d) { return allowed(d) && !defaultDomain().equals(d.toLowerCase(Locale.ROOT)); }
    public Set<String> premiumPlans() { return premiumPlans; }
}
```

`application.yml` under `trade.mailbox`: `domains: ${MAILBOX_DOMAINS:efbazaar.uz}` and `premium-domain-plans: ${MAILBOX_PREMIUM_DOMAIN_PLANS:MAX,STAFF}`. Keep the existing `domain: ${MAILBOX_DOMAIN:efbazaar.uz}` property for trade code that builds `pending-…@` placeholders, but make `MailboxDomains.defaultDomain()` the source in new code.

`CreateMailboxRequest`: add `@Size(max = 64) String domain` (nullable). `AdminMailboxController.create`:

```java
        String domain = request.domain() == null || request.domain().isBlank()
                ? domains.defaultDomain() : request.domain().trim().toLowerCase(Locale.ROOT);
        if (!domains.allowed(domain)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "domain_not_allowed");
        }
        String email = request.localPart() + "@" + domain;
        Mailbox created = service.createPendingForAdmin(email, request.ownerUserId(), admin.userId());
        events.mailboxProvisionRequest(created.getId(), request.localPart(), domain);
```

Map `domain_not_allowed` to a JSON `{code, message}` 400 the same way the existing `@ControllerAdvice` maps other codes (grep `mailbox_locked` in `common/` to find the advice and add a `DomainNotAllowedException` there if `ResponseStatusException` does not produce `{code}`).

Add `@GetMapping("/domains") public List<String> domains() { return domains.all(); }`.

Update every `mailboxProvisionRequest(` caller and `MockWorker` to pass a domain.

- [ ] **Step 5: Run — PASS; also full `AdminMailbox*IT`**

- [ ] **Step 6: docker-compose** — add `MAILBOX_DOMAINS: ${MAILBOX_DOMAINS:-efbazaar.uz}` to trade-service and smart-admin-worker env; `.env.example` gets `MAILBOX_DOMAINS=efbazaar.uz,efootball.uz` with an Uzbek comment ("birinchisi — savdo qutilari uchun standart").

- [ ] **Step 7: Docs** — trade README Admin row: `GET /admin/mailboxes/domains`, create body `domain`; `docs/kafka-topics.md` `mailbox-provision-request` payload gets `domain` (optional; missing = `efbazaar.uz`).

- [ ] **Step 8: Commit** `feat(trade): admin quti ochishda domen tanlash (MAILBOX_DOMAINS)`

---

### Task 3: smart-admin-worker — domain from event, durable poll credentials, restart and stop

**Files:**
- Modify: `smart-admin-worker/smart_admin_worker/kafka/events.py`, `kafka/topics.py`, `handlers/mailbox_provision.py`, `handlers/imap_poll.py`, `main.py`, `README.md`
- Create: `smart-admin-worker/smart_admin_worker/handlers/imap_poll_stop.py`
- Test: `smart-admin-worker/tests/handlers/test_mailbox_provision_domain.py`, `tests/handlers/test_imap_poll_credentials.py`, `tests/handlers/test_imap_poll_stop.py` (mirror fixtures in existing `tests/handlers/` files)

**Interfaces:**
- Consumes: `MailboxProvisionRequest {mailboxId, localPart, domain?}` (Task 2).
- Produces:
  - `MailboxProvisionRequest.domain: str | None = None` — handler uses `event.domain or self._domain`; capacity check (if any) uses the same domain.
  - `ImapPollRequest` gains optional `mailbox_id: UUID | None`, `encrypted_password: bytes | None`, `iv: bytes | None`, `tag: bytes | None`, `restart: bool = False`. JSON keys `mailboxId, encryptedPassword, iv, tag, restart` (base64 bytes exactly like `MailboxProvisioned`).
  - New topic `TOPIC_IMAP_POLL_STOP_REQ = "efbazaar.trade.imap-poll-stop-request"`, event `ImapPollStopRequest(mailbox_email: str)`; added to `REQUEST_TOPICS`.

- [ ] **Step 1: Failing tests**

```python
async def test_provision_uses_event_domain(handler, mailcow):
    await handler.handle(e.MailboxProvisionRequest(mailbox_id=uuid4(), local_part="promo1", domain="efootball.uz"))
    assert mailcow.create_mailbox.await_args.kwargs["domain"] == "efootball.uz"

async def test_provision_defaults_domain_for_old_events(handler, mailcow):
    await handler.handle(e.MailboxProvisionRequest(mailbox_id=uuid4(), local_part="promo1"))
    assert mailcow.create_mailbox.await_args.kwargs["domain"] == "efbazaar.uz"

async def test_poll_decrypts_when_cache_misses(registry, producer, encryptor):
    mid = uuid4()
    field = encryptor.encrypt(f"mbox-{mid}", b"s3cret")
    h = ImapPollHandler(registry, producer, password_provider=_empty, decryptor=encryptor)
    await h.handle(e.ImapPollRequest(trade_id=uuid4(), mailbox_email="ali12@efbazaar.uz", purpose="VERIFY_LINK",
                                     mailbox_id=mid, encrypted_password=field.ciphertext, iv=field.iv, tag=field.tag))
    assert registry.start.call_args.args[1] == "s3cret"

async def test_poll_restart_cancels_existing_first(registry, producer, encryptor):
    h = ImapPollHandler(registry, producer, password_provider=_pw("x"), decryptor=encryptor)
    await h.handle(e.ImapPollRequest(trade_id=uuid4(), mailbox_email="a@b", purpose="VERIFY_LINK", restart=True))
    registry.cancel.assert_awaited_once_with("a@b", PollPurpose.VERIFY_LINK)

async def test_stop_cancels_every_poller_of_mailbox(registry):
    await ImapPollStopHandler(registry).handle(e.ImapPollStopRequest(mailbox_email="a@b"))
    registry.cancel_mailbox.assert_awaited_once_with("a@b")
```

Add decode tests for the new JSON keys next to the existing event decode tests (old payload without new keys still decodes).

- [ ] **Step 2: Run `pytest tests/handlers -q` — FAIL**

- [ ] **Step 3: Implement**
  - events: new optional fields with defaults (keep frozen dataclasses; defaults go last), camelCase map entries, `ImapPollStopRequest` registered in the topic→type map.
  - `ImapPollHandler.__init__(..., decryptor: FieldEncryptor | None = None)`; password = cache value, else if `event.encrypted_password` and decryptor: `decryptor.decrypt(f"mbox-{event.mailbox_id}", EncryptedField(ciphertext, iv, tag)).decode()` (use the real decrypt API in `crypto/`); still raise `LookupError` when neither yields a password. Never log the password.
  - `restart=True`: `await self._registry.cancel(event.mailbox_email, purpose)` before `start`.
  - `ImapPollStopHandler.handle` → `await registry.cancel_mailbox(event.mailbox_email)`.
  - `main.py`: pass the encryptor into `ImapPollHandler`, wire the stop topic/handler like the others.

- [ ] **Step 4: Run — PASS** (`pytest -q` whole suite, `ruff check .` if configured)

- [ ] **Step 5: README + `docs/kafka-topics.md`** — new topic row (producer trade-service, consumer worker), `imap-poll-request` new optional fields, `mailbox-provision-request.domain`.

- [ ] **Step 6: Commit** `feat(worker): quti domeni eventdan, IMAP poll uchun shifrlangan parol, restart/stop`

---

### Task 4: Custom name policy, availability and claim API

**Files:**
- Create: `mailbox/custom/CustomNamePolicy.java`, `mailbox/custom/CustomMailboxService.java`, `mailbox/custom/CustomMailboxController.java`, `mailbox/custom/dto/AvailabilityResponse.java`, `ClaimCustomMailboxRequest.java`, `CustomMailboxResponse.java`
- Modify: `mailbox/dto/MailboxResponse.java` (+`kind`, `linkedAccountId`), `MailboxMapper.java`, `MailboxController.listOwnedBy` (mapper picks the fields up), `README.md`
- Test: `src/test/java/uz/efbazaar/trade/mailbox/CustomNamePolicyTest.java`, `CustomMailboxIT.java`

**Interfaces:**
- Consumes: `MailboxDomains` (Task 2), `CustomSlotService` (Task 1), `EntitlementService.planFor`, `TradeEventPublisher.mailboxProvisionRequest(id, localPart, domain)`.
- Produces:
  - `CustomNamePolicy.check(String localPart) → Optional<NameProblem>` with `enum NameProblem { INVALID, RESERVED }`; `normalize(String)` lowercases and trims.
  - `GET /api/v1/mailboxes/custom/availability?localPart=&domain=` → `AvailabilityResponse(String email, boolean available, String reason /* TAKEN|RESERVED|INVALID|DOMAIN_NOT_ALLOWED|null */, boolean canClaim, String claimBlock /* PLAN_DOMAIN|NO_SLOT|null */)`.
  - `POST /api/v1/mailboxes/custom {localPart, domain}` → 202 `CustomMailboxResponse`; errors 400 `{code: invalid|reserved|domain_not_allowed}`, 403 `{code: plan_domain|no_slot}`, 409 `{code: taken}`.
  - `GET /api/v1/mailboxes/custom` → `List<CustomMailboxResponse(UUID id, String email, boolean provisioned, boolean locked, UUID linkedAccountId, UUID activeSessionId)>` (activeSessionId filled in Task 5; return null here).
  - `MailboxResponse` adds `String kind, UUID linkedAccountId`.

- [ ] **Step 1: Failing `CustomNamePolicyTest`**

```java
@ParameterizedTest @ValueSource(strings = {"ali12", "a1b2c3d4e5f6g7h8i9j0k1l2", "12345"})
void accepts(String s) { assertThat(CustomNamePolicy.check(s)).isEmpty(); }

@ParameterizedTest @ValueSource(strings = {"ali", "ali.bek", "ali_bek", "ali-bek", "a1b2c3d4e5f6g7h8i9j0k1l2m", "алибек", " "})
void rejectsFormat(String s) { assertThat(CustomNamePolicy.check(s)).contains(NameProblem.INVALID); }

@ParameterizedTest @ValueSource(strings = {"admin", "postmaster", "efbazaar", "noreply", "support"})
void rejectsReserved(String s) { assertThat(CustomNamePolicy.check(s)).contains(NameProblem.RESERVED); }

@Test void normalizesCase() { assertThat(CustomNamePolicy.normalize("  AliBek ")).isEqualTo("alibek"); }
```

- [ ] **Step 2: Failing `CustomMailboxIT`** (MockMvc with `X-User-Id`; plan rows as in Task 1; `@MockBean TradeEventPublisher`):
  - STANDARD (custom 0): availability `ali12@efbazaar.uz` → `available=true, canClaim=false, claimBlock=NO_SLOT`; POST → 403 `no_slot`.
  - PRO (custom 1): availability `efootball.uz` → `available=true, canClaim=false, claimBlock=PLAN_DOMAIN`; POST efbazaar → 202, row `kind=CUSTOM`, owner set, `provisionedAt` null, `verify(events).mailboxProvisionRequest(id, "ali12", "efbazaar.uz")`; second POST (other name) → 403 `no_slot`.
  - MAX: POST `efootball.uz` → 202.
  - Name taken by an existing (even `deleted_at` set) row → availability `TAKEN`, POST → 409 `taken`.
  - Race: two threads POST the same name for two users on a PRO plan (use `CountDownLatch` + `ExecutorService`) → statuses `{202, 409}` exactly.
  - `GET /mailboxes/custom` lists only the caller's CUSTOM boxes; `GET /mailboxes` row has `kind:"CUSTOM"`.
  - Uppercase input `AliBek1` stored as `alibek1@efbazaar.uz`.

- [ ] **Step 3: Run — FAIL**

- [ ] **Step 4: Implement**

```java
public final class CustomNamePolicy {
    public enum NameProblem { INVALID, RESERVED }
    private static final Pattern FORMAT = Pattern.compile("^[a-z0-9]{5,24}$");
    private static final Set<String> RESERVED = Set.of("admin", "administrator", "support", "postmaster",
            "abuse", "noreply", "hostmaster", "webmaster", "root", "info", "mail", "efbazaar", "efootball",
            "konami", "trade", "pending", "help", "security", "billing");
    private CustomNamePolicy() {}
    public static String normalize(String s) { return s == null ? "" : s.trim().toLowerCase(Locale.ROOT); }
    public static Optional<NameProblem> check(String localPart) {
        if (!FORMAT.matcher(localPart).matches()) return Optional.of(NameProblem.INVALID);
        if (RESERVED.contains(localPart)) return Optional.of(NameProblem.RESERVED);
        return Optional.empty();
    }
}
```

`CustomMailboxService.availability(userId, rawLocal, rawDomain)`: normalize; domain null → default; `!domains.allowed` → `reason=DOMAIN_NOT_ALLOWED`; policy problem → that reason; `mailboxes.existsByEmail(email)` → `TAKEN` (existsByEmail must ignore `deleted_at` — it does, it is a plain derived query); else available. `canClaim`/`claimBlock`: premium domain and plan not in `premiumPlans()` → `PLAN_DOMAIN`; `!customSlots.canAllocate` → `NO_SLOT`.

`claim(userId, rawLocal, rawDomain)` `@Transactional`: same checks, throw typed exceptions mapped by the existing `@ControllerAdvice` to the codes above; build the row the same way `MailboxService.createPendingForAdmin` does (copy its placeholder credential bytes approach), but `kind=CUSTOM`, `source=USER` (enum value and constraint come from Task 1). `saveAndFlush` inside try/catch `DataIntegrityViolationException` → `TakenException` (409). Publish provisioning **after commit** (`TransactionSynchronizationManager.registerSynchronization` like `TradeEventPublisher` line ~157 does, or call through a publisher method that already defers).

Controller under `@RequestMapping("/api/v1/mailboxes/custom")`, principal `@AuthenticationPrincipal AuthenticatedUser me`.

- [ ] **Step 5: Run — PASS** (plus `MailboxControllerIT`)

- [ ] **Step 6: README** — Pochta row: custom endpoints and error codes; `source` gains `USER`.

- [ ] **Step 7: Commit** `feat(trade): custom quti nomini tekshirish va olish API`

---

### Task 5: Link sessions — state machine, endpoints, worker requests, sweeper

**Files:**
- Create: `mailbox/link/LinkSessionState.java`, `MailboxLinkSession.java`, `MailboxLinkSessionRepository.java`, `LinkSessionService.java`, `LinkSessionController.java`, `LinkSessionSweeper.java`, `dto/OpenLinkSessionRequest.java`, `dto/LinkSessionResponse.java`
- Modify: `TradeEvents.java` (`ImapPollRequest` new fields, `ImapPollStopRequest`, `TOPIC_IMAP_POLL_STOP_REQ`), `TradeEventPublisher.java`, `CustomMailboxService` (fill `activeSessionId`), `README.md`
- Test: `src/test/java/uz/efbazaar/trade/mailbox/LinkSessionIT.java`, `LinkSessionServiceTest.java`

**Interfaces:**
- Consumes: `Mailbox.kind/linkedAccountId`, `MailboxAccessService.isLocked`, `TradeRepository.liveMailboxIds(ids, TradeState.nonTerminal())`.
- Produces:
  - `enum LinkSessionState { WAIT_EMAIL_CHANGE, WAIT_RESET, VERIFIED, EXPIRED, CANCELLED; boolean live() }`.
  - `LinkSessionService`: `open(UUID owner, UUID mailboxId, UUID accountId, boolean emailAlreadySet)`, `get(owner, sid)`, `emailChanged(owner, sid)`, `retry(owner, sid)`, `cancel(owner, sid)`, `onEmailChangeCode(UUID sid, String code, Instant at)`, `onResetMail(UUID sid, boolean notRegistered)`, `expireDue(Instant now)`, `republish(owner, sid)`, `Optional<UUID> liveSessionFor(String mailboxEmail)`.
  - REST (`/api/v1/mailboxes`): `POST /{id}/link-sessions {accountId, emailAlreadySet}` → 201; `GET /link-sessions/{sid}`; `POST /link-sessions/{sid}/email-changed|retry|republish`; `DELETE /link-sessions/{sid}` → 204.
  - `LinkSessionResponse(UUID id, UUID mailboxId, String email, UUID accountId, String state, Instant stepDeadline, String emailChangeCode, boolean notRegistered)`.
  - `TradeEventPublisher.imapPollRequest(UUID key, Mailbox mb, ImapPurpose purpose, boolean restart)` — fills `mailboxId, encryptedPassword, iv, tag`; `imapPollStopRequest(String mailboxEmail)`.
  - `TradeEventPublisher.accountEmailVerified(...)` is added in Task 6.

- [ ] **Step 1: Failing `LinkSessionIT`** (MockMvc, `@MockBean TradeEventPublisher events`, fixed `Clock` bean if the service uses one — inject `Clock` and provide `@TestConfiguration` with a mutable clock):
  - open on own provisioned CUSTOM box, `emailAlreadySet=false` → 201 `WAIT_EMAIL_CHANGE`, deadline now+15m, `verify(events).imapPollRequest(sid, box, WAIT_EMAIL_CHANGE_CODE, true)`.
  - open with `emailAlreadySet=true` → `WAIT_RESET`, poll `VERIFY_LINK` restart.
  - second open on same box while live → 409 `session_live`.
  - other user's box → 404; unprovisioned box → 409 `mailbox_pending`; locked box → 403 `mailbox_locked`; RANDOM box in a live trade → 409 `mailbox_in_trade`; box already linked to a *different* account → 409 `mailbox_linked`.
  - `email-changed` from `WAIT_EMAIL_CHANGE` → `WAIT_RESET`, new deadline, poll `VERIFY_LINK` restart; from `WAIT_RESET` → 409.
  - `onResetMail(sid, false)` → `VERIFIED`, `mailboxes.linked_account_id = accountId`, `verify(events).imapPollStopRequest(email)`.
  - `onResetMail(sid, true)` → back to `WAIT_EMAIL_CHANGE`, `notRegistered=true`, poll `WAIT_EMAIL_CHANGE_CODE` restart.
  - `onEmailChangeCode` stores code; a code with older `at` than stored is ignored.
  - advance clock 16m, `expireDue(now)` → `EXPIRED`, stop request sent; `retry` → back to the step it expired in (`WAIT_RESET` if it expired there) with fresh deadline.
  - `DELETE` → `CANCELLED`, stop sent, mailbox `linked_account_id` unchanged.
  - Terminal session events (`onResetMail` after CANCELLED) are no-ops.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**
  - Entity mirrors V31 columns; `@Version` not needed — mutate under `PESSIMISTIC_WRITE` via `@Lock` `findForUpdate(UUID id)` in the repository.
  - Expired session remembers which step it expired in via `expired_from` (column from Task 1's V31).
  - `open`: lock the mailbox row (`lockOwned`), run the checks in the order of the IT, insert; catch `DataIntegrityViolationException` on the partial unique index → 409 `session_live`.
  - Every transition publishes worker requests **after commit** (same deferral helper as `TradeEventPublisher` uses), keyed by the session id (the worker echoes it back in `trade_id`).
  - Step length `@Value("${trade.mailbox.link-step-minutes:15}")`.
  - `LinkSessionSweeper`: `@Scheduled(fixedDelayString = "${trade.mailbox.link-sweep-ms:30000}")` → `service.expireDue(clock.instant())`; guard with the same `@ConditionalOnProperty`/scheduling toggle other sweepers use (see `TradeEscalationSweeper`).
  - `CustomMailboxService.list` fills `activeSessionId` from `repo.findLiveByMailboxIds(ids)`.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: README** — new endpoints, table `mailbox_link_sessions`, `LinkSessionSweeper` row in Rejali job'lar; kafka-topics: `imap-poll-request` producer now also sends `mailboxId/encryptedPassword/iv/tag/restart`; `imap-poll-stop-request` producer.

- [ ] **Step 6: Commit** `feat(trade): akkountni custom qutiga ulash sessiyasi`

---

### Task 6: Route worker results to sessions, publish `account-email-verified`, consume `account-email-unlinked`

**Files:**
- Modify: `kafka/KonamiEmailReceivedConsumer.java`, `kafka/KonamiEmailChangeCodeConsumer.java`, `TradeEvents.java` (`TOPIC_ACCOUNT_EMAIL_VERIFIED`, `AccountEmailVerified`, `AccountEmailUnlinked`), `TradeEventPublisher.java`, `LinkSessionService.java`
- Create: `kafka/AccountEmailUnlinkedConsumer.java`
- Test: `src/test/java/uz/efbazaar/trade/kafka/LinkSessionRoutingIT.java`

**Interfaces:**
- Consumes: `LinkSessionService.liveSessionFor`, `onResetMail`, `onEmailChangeCode` (Task 5).
- Produces:
  - Topic `efbazaar.trade.account-email-verified`, key `accountId`, payload `AccountEmailVerified(UUID sessionId, UUID accountId, UUID ownerId, UUID mailboxId, String email, boolean custom, Instant verifiedAt)`, published after commit on `VERIFIED` and by `republish`.
  - Consumes `efbazaar.marketplace.account-email-unlinked` `AccountEmailUnlinked(UUID accountId, UUID ownerId, UUID mailboxId, String reason, Instant at)`: `UPDATE mailboxes SET linked_account_id = NULL WHERE id = :mailboxId AND linked_account_id = :accountId` (idempotent, race-safe), group `trade-service-account-email-unlinked`.

- [ ] **Step 1: Failing `LinkSessionRoutingIT`**
  - Live session on box X: `KonamiEmailReceived(tradeId=sid, resetLinkPresent=true, mailboxEmail=X)` consumed (call the consumer bean directly, as other consumer ITs do) → session `VERIFIED`, no trade transition attempted (`@MockBean TradeService` → `verifyNoInteractions`), `verify(events).accountEmailVerified(...)` with `custom=true`.
  - Same with `emailNotRegistered=true` → session `WAIT_EMAIL_CHANGE`, `notRegistered=true`.
  - `KonamiEmailChangeCodeReceived(sid, "123456", at, sender, X)` → session code `123456`; no trade action notification sent.
  - Event for a mailbox with no live session and a real trade id → old trade path still runs (existing ITs cover it; add one assertion that `TradeService.transition` is called).
  - `AccountEmailUnlinked(accountA, owner, X)` → `linked_account_id` null; replay → no error; unlink for a different account id leaves the link intact.
  - `republish` on a VERIFIED session re-sends the same payload; on a non-VERIFIED one → 409.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement** — at the top of each worker consumer:

```java
        var session = sessions.liveSessionFor(e.mailboxEmail());
        if (session.isPresent()) {
            sessions.onResetMail(session.get(), e.emailNotRegistered());   // reset consumer
            return;
        }
```

(only when `resetLinkPresent || emailNotRegistered`; ignore otherwise). Use the session id from the lookup, not `e.tradeId()`, so a stale event keyed by an old session cannot drive a new one. Change-code consumer analogous with `onEmailChangeCode`. Unlinked consumer as specified. `README` Kafka lists updated; `docs/kafka-topics.md` rows for both topics with payloads.

- [ ] **Step 4: Run — PASS; then the whole trade-service suite** `mvn -B -ntp verify -DargLine="-Dapi.version=1.44"` — all green.

- [ ] **Step 5: Commit** `feat(trade): worker natijalarini ulash sessiyasiga yo'naltirish va email tasdiq eventi`

---

### Task 7: marketplace — `email_verified`, `CUSTOM` source, verified consumer

**Files:**
- Create: `backend/marketplace-service/src/main/resources/db/migration/V78__account_email_verified.sql`, `kafka/AccountEmailVerifiedConsumer.java`, `kafka/AccountEmailVerifiedDto.java`
- Modify: `account/EmailSource.java` (+`CUSTOM`), `account/UserAccount.java` (+`emailVerified`), account response DTO + mapper (+`emailVerified`), `account/ListingAccountLink.java` (PLATFORM writes set `emailVerified=true`; every place that nulls email also sets `false`), `account/UserAccountService.setEmail` (`emailVerified=false`), `README.md`
- Test: `src/test/java/uz/efbazaar/marketplace/account/AccountEmailVerifiedIT.java`

**Interfaces:**
- Consumes: `efbazaar.trade.account-email-verified` (Task 6).
- Produces: `UserAccountResponse.emailVerified: boolean`, `emailSource` may be `CUSTOM`; `ListingAccountLink.applyVerifiedEmail(AccountEmailVerifiedDto)` returning `Optional<UUID> previousCustomMailboxId` (used in Task 8).

- [ ] **Step 1: Migration**

```sql
-- Platforma Konami ulanishini tasdiqlagan email. Savdodan kelgan (PLATFORM)
-- manzil tasdiqlangan hisoblanadi: uni platforma o'zi o'tkazgan.
ALTER TABLE user_accounts ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;
UPDATE user_accounts SET email_verified = true
 WHERE email_source = 'PLATFORM' AND email IS NOT NULL AND email <> '';
```

If `email_source` has a CHECK constraint (grep V65+ migrations), extend it with `'CUSTOM'` in this file.

- [ ] **Step 2: Failing IT**
  - consume `{sessionId, accountId, ownerId, mailboxId, email:"ali12@efbazaar.uz", custom:true}` for an ACTIVE owned account → email set, `emailSource=CUSTOM`, `mailboxId` set, `emailVerified=true`.
  - `custom=false` (verifying a RANDOM box) → `emailVerified=true`, `emailSource` unchanged if already PLATFORM, else `PLATFORM`.
  - owner mismatch or ARCHIVED account → unchanged (log only).
  - replay same payload → unchanged, no exception.
  - `PATCH /accounts/{id}/email` manual edit → `emailVerified=false`, `mailboxId=null`.
  - trade handover (existing `onMailboxHandedOver` path) → `emailVerified=true`.
  - GET `/accounts` exposes `emailVerified`.

- [ ] **Step 3: Run — FAIL** (`cd backend/marketplace-service && JAVA_HOME=~/.jdks/openjdk-21.0.2 mvn -B -ntp verify -Dit.test=AccountEmailVerifiedIT -Dtest=none -Dsurefire.failIfNoSpecifiedTests=false -DargLine="-Dapi.version=1.44"`)

- [ ] **Step 4: Implement** — consumer mirrors `MailboxHandedOverConsumer` (`spring.json.value.default.type` + `use.type.headers=false`, group `marketplace-account-email-verified`), delegating to a `@Transactional` `ListingAccountLink.applyVerifiedEmail` that locks the account row, checks owner + ACTIVE, remembers the previous `mailboxId` when previous `emailSource == CUSTOM` and it differs from the new one, then writes.

- [ ] **Step 5: Run — PASS; whole marketplace suite green**

- [ ] **Step 6: README** — Akkountlar row: `emailVerified`, `emailSource` `CUSTOM`; Kafka consumes `trade.account-email-verified`; `docs/kafka-topics.md` consumer column.

- [ ] **Step 7: Commit** `feat(marketplace): akkount emaili tasdiqlanganligi va custom manba`

---

### Task 8: marketplace — publish `account-email-unlinked` and "free mailbox" notification

**Files:**
- Modify: `event/MarketplaceEvents.java` (`TOPIC_ACCOUNT_EMAIL_UNLINKED = "efbazaar.marketplace.account-email-unlinked"`, record `AccountEmailUnlinked`), `event/MarketplaceEventPublisher.java`, `account/ListingAccountLink.java` (three archive sites + `applyVerifiedEmail` relink), `account/UserAccountService.java` (`setEmail`, `delete`), `domain/NotificationType.java` (+`CUSTOM_MAILBOX_FREED`), `service/NotificationService.java`, `push/NotificationPushEvent.java`, frontend-visible notification text if the bell maps types (grep `TRADE_MAILBOX_RETURNED` in `frontend/src`)
- Test: `src/test/java/uz/efbazaar/marketplace/account/AccountEmailUnlinkIT.java`

**Interfaces:**
- Produces: `MarketplaceEventPublisher.accountEmailUnlinked(UUID accountId, UUID ownerId, UUID mailboxId, String reason)` published **after commit**; reasons `SOLD`, `SWAPPED`, `SOLD_ELSEWHERE`, `EDITED`, `RELINKED`, `DELETED`. Notification `CUSTOM_MAILBOX_FREED` (text "Custom emailingiz bo'shadi — boshqa akkountingizga ulang", link `/mailboxes/custom`) for SOLD, SWAPPED, SOLD_ELSEWHERE only.

- [ ] **Step 1: Failing IT** — for an account with `mailboxId=M`, `emailSource=CUSTOM`:
  - trade-succeeded sale path archives it → one `account-email-unlinked {reason:SOLD, mailboxId:M}` (capture with `@MockBean MarketplaceEventPublisher` or an embedded-Kafka consumer as existing ITs do) and one `CUSTOM_MAILBOX_FREED` notification.
  - swap path → `SWAPPED`; sold-elsewhere → `SOLD_ELSEWHERE`.
  - manual email edit → `EDITED`, no notification; delete → `DELETED`.
  - verified event for a new mailbox on the same account → `RELINKED` for the old one.
  - account with `emailSource=PLATFORM` and a `mailboxId` → still publishes (RANDOM verified boxes are linked too) but **no** notification.
  - account without `mailboxId` → nothing published.
  - rollback of the surrounding transaction → nothing published.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement** — capture `(accountId, ownerId, mailboxId, emailSource)` **before** the code nulls them at each site, then call a small helper `unlinkedAfterCommit(account, reason)` in `ListingAccountLink`/`UserAccountService` that registers a `TransactionSynchronization` and, for the three sale reasons with `CUSTOM` source, creates the notification inside the same transaction.

- [ ] **Step 4: Run — PASS; whole marketplace suite green**

- [ ] **Step 5: Docs** — README Kafka "chiqaradi"; `docs/kafka-topics.md` row (producer marketplace, consumer trade-service).

- [ ] **Step 6: Commit** `feat(marketplace): bo'shagan custom quti eventi va bildirishnomasi`

---

### Task 9: Design gate — claim page and link wizard in Claude Design

Owner: the controller (not a subagent). Frontend tasks 11–12 do not start until the user approves.

- [ ] **Step 1:** Run `Artifact` quickstart with `intent: "design"`; design (light + dark) for `/mailboxes/custom` (empty input, checking, ✓ available with gold animation, taken, reserved, invalid; PRO efootball upsell card; Jaydari "Boyvachcha tarifida oling"; no slots; MAX domain segment; list of owned custom boxes with linked/free state) and `/mailboxes/custom/[id]/link` (account picker with "Boshqa", email-change step with code, reset step with "parolni o'zgartirish shart emas", success, expired, not-registered). Account card states: verified ✓ and gold animated border, plus the hint rows and the free-box banner.
- [ ] **Step 2:** Share the link with the user; iterate until they say yes. Record the approved link in this plan under this task.

---

### Task 10: Frontend libraries — name rules, availability view-model, session view-model, API clients

**Files:**
- Create: `frontend/src/lib/custom-mailbox.ts`, `custom-mailbox.test.ts`, `custom-mailbox-client.ts`, `link-session.ts`, `link-session.test.ts`
- Modify: `frontend/src/lib/accounts-types.ts` (`emailVerified: boolean`, `AccountEmailSource` adds `'CUSTOM'`), any fixtures that construct `UserAccountResponse` (tsc will list them)

**Interfaces:**
- Produces (`custom-mailbox.ts`):
  - `export const CUSTOM_LOCAL_PART = /^[a-z0-9]{5,24}$/;`
  - `export function normalizeLocalPart(s: string): string` (trim + lowercase).
  - `export function localPartProblem(s: string): 'invalid' | null` (client-side precheck; reserved is server-side).
  - `export type Availability = { email: string; available: boolean; reason: 'TAKEN'|'RESERVED'|'INVALID'|'DOMAIN_NOT_ALLOWED'|null; canClaim: boolean; claimBlock: 'PLAN_DOMAIN'|'NO_SLOT'|null };`
  - `export type ClaimView = { tone: 'idle'|'checking'|'ok'|'bad'; message: string; action: { kind: 'claim' } | { kind: 'upgrade'; plan: 'PRO'|'MAX'; label: string } | { kind: 'none' } };`
  - `export function claimView(input: { localPart: string; checking: boolean; result: Availability | null; plan: PlanCode | 'STAFF' | null }): ClaimView`.
  - `export function efootballOffer(plan, localPart): string | null` — non-MAX/STAFF with a valid name → ``✨ ${localPart}@efootball.uz ni ham olishingiz mumkin — Aristokrat``.
  - `export function isPremiumDomainPlan(plan): boolean` (MAX, STAFF).
- Produces (`custom-mailbox-client.ts`): `checkAvailability(localPart, domain)`, `claimCustomMailbox(localPart, domain)`, `listCustomMailboxes()`, `listOwnedMailboxes()` — `fetch('/api/trade/v1/mailboxes/...')` like `plans-client.ts`, throwing an `Error` carrying `{status, code}`.
- Produces (`link-session.ts`): `type LinkSession` (mirrors `LinkSessionResponse`), `stepIndex(state)`, `sessionView(session, now: Date)` → `{ step: 0|1|2|3; title; body; secondsLeft; canRetry; canCancel; codeShown: string|null; warning: string|null }`, `pollIntervalMs(state)` (3000 while live, 0 when terminal); clients `openSession(mailboxId, accountId, emailAlreadySet)`, `getSession`, `markEmailChanged`, `retrySession`, `cancelSession`, `republishSession`.

- [ ] **Step 1: Failing tests** (selection)

```ts
describe('claimView', () => {
  const ok = { email: 'ali12@efbazaar.uz', available: true, reason: null, canClaim: true, claimBlock: null } as const;
  it('offers claim when available and allowed', () => {
    expect(claimView({ localPart: 'ali12', checking: false, result: ok, plan: 'PRO' }).action).toEqual({ kind: 'claim' });
  });
  it('shows ✓ but sells Boyvachcha to Jaydari', () => {
    const v = claimView({ localPart: 'ali12', checking: false, result: { ...ok, canClaim: false, claimBlock: 'NO_SLOT' }, plan: 'STANDARD' });
    expect(v.tone).toBe('ok');
    expect(v.action).toEqual({ kind: 'upgrade', plan: 'PRO', label: 'Boyvachcha tarifida oling' });
  });
  it('sells Aristokrat for efootball.uz', () => {
    const v = claimView({ localPart: 'ali12', checking: false, result: { ...ok, email: 'ali12@efootball.uz', canClaim: false, claimBlock: 'PLAN_DOMAIN' }, plan: 'PRO' });
    expect(v.action).toMatchObject({ kind: 'upgrade', plan: 'MAX' });
  });
  it('explains the rule for short names without a request', () => {
    expect(claimView({ localPart: 'ali', checking: false, result: null, plan: 'PRO' }).message).toBe('5–24 belgi, faqat lotin harf va raqam');
  });
  it.each([['TAKEN', 'Band'], ['RESERVED', 'Bu nom zahirada']])('%s', (reason, msg) => {
    expect(claimView({ localPart: 'admin1', checking: false, result: { ...ok, available: false, reason: reason as 'TAKEN' }, plan: 'PRO' }).message).toBe(msg);
  });
  it('PRO with slots full upsells MAX', () => {
    const v = claimView({ localPart: 'ali12', checking: false, result: { ...ok, canClaim: false, claimBlock: 'NO_SLOT' }, plan: 'PRO' });
    expect(v.message).toBe('Barcha custom slotlar band');
    expect(v.action).toMatchObject({ kind: 'upgrade', plan: 'MAX' });
  });
});

describe('efootballOffer', () => {
  it('suggests efootball.uz to non-Aristokrat', () => {
    expect(efootballOffer('PRO', 'ali12')).toBe('✨ ali12@efootball.uz ni ham olishingiz mumkin — Aristokrat');
  });
  it('is silent for MAX and STAFF', () => {
    expect(efootballOffer('MAX', 'ali12')).toBeNull();
    expect(efootballOffer('STAFF', 'ali12')).toBeNull();
  });
});

describe('sessionView', () => {
  it('shows the relayed code on the email step', () => {
    const v = sessionView({ state: 'WAIT_EMAIL_CHANGE', emailChangeCode: '123456', stepDeadline: '2026-10-16T10:15:00Z', notRegistered: false } as LinkSession, new Date('2026-10-16T10:05:00Z'));
    expect(v.step).toBe(1); expect(v.codeShown).toBe('123456'); expect(v.secondsLeft).toBe(600);
  });
  it('warns when Konami said not registered', () => {
    expect(sessionView({ state: 'WAIT_EMAIL_CHANGE', notRegistered: true, stepDeadline: '2026-10-16T10:15:00Z' } as LinkSession, new Date('2026-10-16T10:00:00Z')).warning).toBe('Email hali o‘zgarmagan');
  });
  it('reset step says the password change is optional', () => {
    expect(sessionView({ state: 'WAIT_RESET', stepDeadline: '2026-10-16T10:15:00Z' } as LinkSession, new Date('2026-10-16T10:00:00Z')).body).toContain('parolni o‘zgartirish shart emas');
  });
  it('stops polling when terminal', () => { expect(pollIntervalMs('VERIFIED')).toBe(0); });
});
```

- [ ] **Step 2: `npm test -- custom-mailbox link-session` — FAIL**
- [ ] **Step 3: Implement** (Uzbek copy exactly as in tests; use the `‘` apostrophe like existing strings)
- [ ] **Step 4: `npm run lint && npm run typecheck && npm test` — PASS**
- [ ] **Step 5: Commit** `feat(frontend): custom quti va ulash sessiyasi uchun lib`

---

### Task 11: Frontend — `/mailboxes/custom` claim page (approved design)

**Files:**
- Create: `frontend/src/app/mailboxes/custom/page.tsx`, `components/mailboxes/custom-claim.tsx`, `components/mailboxes/custom-mailbox-list.tsx`, `components/mailboxes/custom-claim.test.tsx` (if the repo has component tests with Testing Library; otherwise keep logic in lib tests)
- Modify: `frontend/README.md` (route list)

**Interfaces:**
- Consumes: Task 10 libs, `fetchMyPlan` / server plan helper from `lib/plans-server.ts`, design from Task 9.

- [ ] **Step 1:** Server page: requires login (redirect `/auth/login?from=/mailboxes/custom` like `/plans`), loads plan + `listCustomMailboxes`, renders `<CustomClaim plan=… boxes=… />`.
- [ ] **Step 2:** `CustomClaim` client component: input with fixed `@domain` suffix, 300 ms debounce, abort the previous request (`AbortController`), `claimView` drives tone/message/button; MAX/STAFF get a two-option segmented control (`efbazaar.uz` default); non-premium plans show `efootballOffer` card linking `/plans`; claim → `claimCustomMailbox`, on success toast "Quti tayyorlanmoqda" and go to `/mailboxes/custom/{id}/link`; 409 → re-run availability.
- [ ] **Step 3:** `CustomMailboxList`: each box with linked/free/pending/locked state; free → "Akkount ulash" link; locked → "Qulflangan" + `/plans`.
- [ ] **Step 4:** Gold animation uses CSS keyframes in the component with `motion-reduce:animate-none`; colours via theme tokens defined in `globals.css` (`--gold`, `--gold-foreground` for light and dark).
- [ ] **Step 5:** `npm run lint && npm run typecheck && npm test`; run the app (`npm run dev`) and check both themes at 375px and desktop with the `run` skill or Chrome tools; screenshot.
- [ ] **Step 6: Commit** `feat(frontend): custom quti tanlash sahifasi`

---

### Task 12: Frontend — link wizard `/mailboxes/custom/[id]/link`

**Files:**
- Create: `frontend/src/app/mailboxes/custom/[id]/link/page.tsx`, `components/mailboxes/link-wizard.tsx`, `components/mailboxes/link-account-picker.tsx`
- Modify: `frontend/src/app/profile/accounts/new/page.tsx` + `components/marketplace/account-form.tsx` (accept `returnTo` query; after save `router.push(returnTo + '?accountId=' + id)` only when `returnTo` starts with `/mailboxes/custom/`)

**Interfaces:**
- Consumes: Task 10 `link-session.ts`, `getMyAccounts`.
- Query params: `?accountId=` preselects; `?session=` resumes; `?verify=1&accountId=` opens with `emailAlreadySet=true` (from the account card "Tasdiqlash").

- [ ] **Step 1:** Picker: accounts where `!(emailSource === 'CUSTOM' && emailVerified)`, no-email first, then the rest; "Boshqa" → `/profile/accounts/new?returnTo=/mailboxes/custom/{id}/link`.
- [ ] **Step 2:** Wizard: open session, poll with `pollIntervalMs`, render `sessionView`; step 1 shows Konami email-change instructions (reuse the copy/components from `trade-panel.tsx` email-change step where they are exportable; otherwise copy the text), the relayed code with a copy button, "Emailni o‘zgartirdim"; step 2 forgot-password instruction with the address and copy button; success screen "Muvaffaqiyatli ulandi" → `/profile?tab=accounts`; expired → "Qayta urinish"; always "Bekor qilish". If success but the account list does not show the email after 10 s, show "Qayta sinxronlash" → `republishSession`.
- [ ] **Step 3:** Lint/typecheck/test; run app, walk the flow against `MockWorker` (trade-service `mockworker` profile) if available, otherwise by stubbing the API; both themes.
- [ ] **Step 4: Commit** `feat(frontend): akkountni custom emailga ulash bosqichlari`

---

### Task 13: Frontend — account badges, hints, free-box banner

**Files:**
- Modify: `components/profile/account-card.tsx`, `components/marketplace/account-form.tsx`, `components/profile/profile-accounts.tsx`, `components/chat/swap-account-picker.tsx`, `app/profile/accounts/[id]/page.tsx`
- Create: `components/profile/free-custom-mailbox-banner.tsx`, `lib/account-email-badges.ts` + `.test.ts`

**Interfaces:**
- Produces (`account-email-badges.ts`): `emailBadges(account, ownedMailboxes) → { verified: boolean; custom: boolean; canVerify: boolean; verifyMailboxId: string | null; offerCustom: boolean }` —
  `verified = account.emailVerified`; `custom = verified && emailSource === 'CUSTOM'`;
  `canVerify = !verified && email ends with @efbazaar.uz|@efootball.uz && an owned mailbox has that exact email` (from `listOwnedMailboxes`);
  `offerCustom = !account.email`.
  `freeCustomMailboxes(boxes) → boxes.filter(b => b.provisioned && !b.locked && !b.linkedAccountId && !b.activeSessionId)`.

- [ ] **Step 1: Failing tests** for `emailBadges` (each flag, foreign mailbox → `canVerify=false`, gmail → false) and `freeCustomMailboxes`.
- [ ] **Step 2: FAIL → implement → PASS**
- [ ] **Step 3:** UI per approved design: ✓ next to the email (`aria-label="Tasdiqlangan email"`), gold animated border on `custom`, "O‘zingiz tanlagan email biriktiring" row → `/mailboxes/custom?accountId=…`, "Tasdiqlash" → `/mailboxes/custom/{verifyMailboxId}/link?verify=1&accountId=…`; form hint under email "✨ Akkountingiz uchun o‘z nomingizdagi email oling" → `/mailboxes/custom`; banner on profile and accounts tab for each free box: "`{email}` bo‘sh turibdi — boshqa akkountingizga ulaysizmi?" → link page.
- [ ] **Step 4:** lint/typecheck/test; run app, both themes, reduced motion.
- [ ] **Step 5: Commit** `feat(frontend): verified belgisi, custom hoshiya va custom email takliflari`

---

### Task 14: Frontend — admin domain dropdown

**Files:**
- Modify: `components/admin/admin-mailbox-create.tsx`, `app/admin/mailboxes/actions.ts`, `lib/mailbox-admin-types.ts`, `lib/mailbox-admin-server.ts` (fetch domains), tests next to them

**Interfaces:**
- Consumes: `GET /trade/v1/admin/mailboxes/domains` (Task 2).
- Produces: `CreateMailboxInput.domain?: string`; dropdown (shadcn `Select`) defaulting to the first domain; suffix in the preview follows the selection; action sends `domain`.

- [ ] **Step 1:** Failing test: `createMailboxAction({localPart:'promo1', ownerUserId, domain:'efootball.uz'})` sends `domain` in the body (mock `apiFetch` as existing action tests do); 400 `domain_not_allowed` → "Bu domen ruxsat etilmagan".
- [ ] **Step 2:** FAIL → implement → PASS; lint/typecheck/test; dark mode check.
- [ ] **Step 3: Commit** `feat(frontend): admin quti ochishda domen tanlash`

---

### Task 15: Whole-branch verification and PR

- [ ] **Step 1:** `git fetch && git rebase origin/main`; re-check migration numbers (`sort -V`, `origin/main`).
- [ ] **Step 2:** Full CI-equivalent per AGENTS.md: trade-service and marketplace `mvn -B -ntp clean verify`, worker `pytest -q`, frontend `npm run lint && npm run typecheck && npm test && npm run build`, mail build untouched.
- [ ] **Step 3:** Whole-branch review (fresh reviewer), fix findings.
- [ ] **Step 4:** Push, open PR in Uzbek with deploy order: **marketplace → smart-admin-worker → trade-service → frontend** (consumers and readers of new fields first), env `MAILBOX_DOMAINS=efbazaar.uz,efootball.uz` on trade-service and worker; no Claude signature.
