# Human Trade-Admin Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `TRADE_ADMIN` role, a hireable admin catalogue, and a human-driven trade lifecycle so a seller can hire a real person to run an escrow trade instead of the automated smart admin.

**Architecture:** One state machine serves both modes — `trades.mode` (`SMART`/`HUMAN`) gates which Kafka side effects fire, so no existing smart transition changes. Human trades sit in a single `IN_PROGRESS` state carrying a six-item checklist the admin ticks in any order; at `6/6` the admin closes, both parties confirm (or 24h elapses) and the trade succeeds. The existing per-party chats are reused — the admin reads and writes both. Payment is entirely out of scope: human trades never touch escrow.

**Tech Stack:** Java 21, Spring Boot 3.3.4, PostgreSQL 16, Flyway, Redis 7, Kafka, MapStruct, Lombok, Testcontainers 1.20.3, JUnit 5, AssertJ, Maven (no wrapper — each service is a standalone build).

## Global Constraints

- **Spec is authoritative:** `docs/superpowers/specs/2026-07-30-human-trade-admin-design.md`. Every section reference below (`§4.1`, `§11.1`, …) points there.
- **payment-service is out of scope.** No escrow, no ledger, no wallet, no `payment_outbox`. Human trades never call payment-service. The existing `MockPaymentAdapter` on the smart path stays untouched.
- **Flyway `V<n>__` files are immutable.** Once merged to `main`, never edit, rename, or delete one — CI's `guard-migrations` job blocks it. Changes need a new `V<n+1>__`. Repeatable `R__` files may be edited.
- **`sellerId` / `buyerId` / `adminId` never come from a request body** — only from the nginx-injected `X-User-Id` header via `AuthenticatedUser`.
- **Each service builds independently.** There is no aggregator pom. Always `cd backend/<service>` first.
- **Docker must be running** — every `*IT` test uses Testcontainers (Postgres, Kafka, Redis with `.withReuse(true)`).
- **Test naming decides the runner:** `*Test.java` → surefire (`mvn test`), `*IT.java` → failsafe (`mvn verify`). A Testcontainers test named `*Test` silently never runs in CI.
- **Kafka topic convention:** `efbazaar.<service>.<event>`, lowercase, hyphenated.
- **Package convention:** `uz.efbazaar.<service>.<layer>`.
- **Commit format:** `feat(trade): add ...` / `fix(auth): ...` / `test(trade): ...`.
- **Never add a "Generated with Claude" or `Co-Authored-By: Claude` line** to any commit, PR, or file.
- **New role name is exactly `TRADE_ADMIN`** (DB value) → authority `ROLE_TRADE_ADMIN`.
- **Uzbek user-facing copy.** Chat status text and API error messages that reach the UI are Uzbek. Code, comments, and log messages are English.

## Run Commands

| Purpose | Command |
|---|---|
| Unit test, one class | `cd backend/trade-service && mvn -q test -Dtest=TradeStateMachineTest` |
| Unit test, one method | `cd backend/trade-service && mvn -q test -Dtest=TradeStateMachineTest#humanPathReachesSuccess` |
| Integration test, one class | `cd backend/trade-service && mvn verify -Dit.test=TradeAdminProfileControllerIT` |
| Full service build | `cd backend/trade-service && mvn verify` |

`mvn verify -Dit.test=X` also runs the whole unit suite. That is intentional — it catches regressions in the same command.

## Scope Note

The spec's build order lists 17 steps. Steps 13–17 are frontend (five screens) and are **not** in this plan — they need the API this plan produces. A separate frontend plan follows. This plan ends with a fully API-testable human-admin backend.

---

## File Structure

### auth-service

| File | Responsibility |
|---|---|
| `src/main/resources/db/migration/V7__add_trade_admin_role.sql` | Widen `chk_users_role` |
| `domain/Role.java` (modify) | Add `TRADE_ADMIN`; add `authorities()` |
| `security/JwtService.java` (modify) | Use `Role.authorities()` for the roles claim |
| `mapper/UserMapper.java` (modify) | Use `Role.authorities()` |
| `event/AuthEvents.java` (modify) | `TOPIC_USER_ROLE_CHANGED` + `UserRoleChanged` record |
| `event/AuthEventPublisher.java` (modify) | `userRoleChanged(...)` |
| `service/UserService.java` (modify) | Publish on role change |

### trade-service — migrations

| File | Responsibility |
|---|---|
| `V9__trade_human_mode.sql` | `trades` columns, state/mode/card constraints, enum CHECK widening, indexes |
| `V10__trade_admin_profiles.sql` | Admin profile table |
| `V11__trade_steps.sql` | Six-item checklist table |
| `V12__trade_admin_ratings.sql` | Ratings table |

### trade-service — domain

| File | Responsibility |
|---|---|
| `trade/domain/TradeMode.java` | `SMART \| HUMAN` |
| `trade/domain/TradeViewer.java` | `SELLER \| BUYER \| ADMIN` |
| `trade/domain/TradeStep.java` | The six checklist codes, with Uzbek labels |
| `trade/domain/Trade.java` (modify) | New columns, `viewerFor()`, nullable cards |
| `trade/domain/TradeState.java` (modify) | Three new states |
| `trade/domain/TradeEvent.java` (modify) | Five new events |
| `trade/domain/TradeSenderType.java` (modify) | `HUMAN_ADMIN` |
| `trade/domain/ActorType.java` (modify) | `TRADE_ADMIN` |
| `admin/domain/TradeAdminProfile.java` | Profile aggregate + rating/stat counters |
| `admin/domain/TradeStepMark.java` | One checklist row |
| `admin/domain/TradeAdminRating.java` | One rating row |

### trade-service — services

| File | Responsibility |
|---|---|
| `trade/service/TradeStateMachine.java` (modify) | New transitions only |
| `trade/service/TradeStateHandler.java` (modify) | Mode-gated side effects, new on-enter cases |
| `trade/service/TradeService.java` (modify) | Viewer-aware read, mode-aware open |
| `admin/service/TradeAdminProfileService.java` | Profile upsert/read, stat updates |
| `admin/service/TradeAdminCatalogService.java` | Search, sort, name resolution, capacity |
| `admin/service/TradeAdminAssignmentService.java` | Assign / accept / decline, capacity lock |
| `admin/service/TradeStepService.java` | Mark / unmark / completeness |
| `admin/service/TradeCloseService.java` | Admin close, party confirm, dual-confirm settle |
| `admin/service/TradeAdminRatingService.java` | Rate, hide, aggregate |
| `admin/service/TradeEscalationSweeper.java` | Idle detection (separate from `TradeTimeoutScheduler`) |
| `admin/presence/PresenceQuery.java` | Port consumed by the catalogue |
| `admin/presence/RedisPresenceQuery.java` | Redis TTL implementation |
| `admin/presence/PresenceTouchInterceptor.java` | Writes the Redis key per request |
| `security/AuthSummaryClient.java` | Copy of the marketplace client (names/avatars) |

### trade-service — controllers

| File | Responsibility |
|---|---|
| `admin/controller/TradeAdminProfileController.java` | `/api/v1/trade-admins/me`, `/{userId}` |
| `admin/controller/TradeAdminCatalogController.java` | `GET /api/v1/trade-admins` |
| `admin/controller/TradeAdminWorkController.java` | Accept/decline/steps/close/cancel, invitations, my trades |
| `admin/controller/TradeAdminRatingController.java` | `POST /trades/{id}/rating` |
| `admin/controller/AdminTradeEscalationController.java` | `/api/v1/admin/trades/**` (`ROLE_ADMIN`) |
| `trade/controller/TradeActionController.java` (modify) | `assign-admin`, `close-confirm` |
| `trade/controller/TradeMessageController.java` (modify) | `?target=` for admins |
| `config/WebSocketConfig.java` (modify) | Admin SUBSCRIBE authorisation |

### marketplace-service

| File | Responsibility |
|---|---|
| `V27__trade_admin_notifications.sql` | Notification type + `chats.system_important` + index rebuild |
| `kafka/TradeAdminInvitedConsumer.java` | Writes the `TRADE_ADMIN_INVITED` notification |
| `kafka/TradeChatPinConsumer.java` | Toggles `system_important` |
| `service/ChatExpirationScheduler.java` (modify) | Honour `system_important` |

### nginx

| File | Responsibility |
|---|---|
| `nginx/conf.d/api.conf` (modify) | Route `trade-admins` and `admin/trades` |

---

## Task Order and Dependencies

```
1  auth: TRADE_ADMIN role + authorities()          ──┐
2  auth: user-role-changed event                     │
                                                     ▼
3  trade: migrations V9–V12 + enums + entity ──────┬──▶ 4  TradeViewer + authorisation
                                                   │
                                                   ├──▶ 5  state machine + mode gate
                                                   │
                                                   ├──▶ 6  admin profile CRUD
                                                   │         │
                                                   │         ├──▶ 7  role-changed consumer
                                                   │         └──▶ 8  catalogue + presence
                                                   │
   5 + 8 ─────────────────────────────────────────────▶ 9  proposal mode/admin + WAITING_ADMIN
                                                            │
                                                            ▼
                                                        10  accept / decline + capacity lock
                                                            │
                                       ┌────────────────────┼────────────────────┐
                                       ▼                    ▼                    ▼
                                  11  steps           12  admin chat + WS   15  escalation
                                       │
                                       ▼
                                  13  close flow ──▶ 14  rating

16 nginx        (independent, needed before frontend)
17 marketplace  (independent)
```

---

## Task 1: auth-service — `TRADE_ADMIN` role

**Files:**
- Create: `backend/auth-service/src/main/resources/db/migration/V7__add_trade_admin_role.sql`
- Modify: `backend/auth-service/src/main/java/uz/efbazaar/auth/domain/Role.java`
- Modify: `backend/auth-service/src/main/java/uz/efbazaar/auth/security/JwtService.java:52`
- Modify: `backend/auth-service/src/main/java/uz/efbazaar/auth/mapper/UserMapper.java:26`
- Test: `backend/auth-service/src/test/java/uz/efbazaar/auth/domain/RoleAuthoritiesTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces: `Role.TRADE_ADMIN`; `List<String> Role.authorities()` returning `["ROLE_USER"]` for `USER`, `["ROLE_USER","ROLE_ADMIN"]` for `ADMIN`, `["ROLE_USER","ROLE_TRADE_ADMIN"]` for `TRADE_ADMIN`. Every later task's authorisation depends on `ROLE_TRADE_ADMIN` reaching the gateway.

**Context:** `role` is a single-valued column (`VARCHAR(16)`, `chk_users_role CHECK (role IN ('USER','ADMIN'))`). We keep it single-valued and derive a *list* of authorities — see spec §4.1 for why no join table. Two call sites currently duplicate `List.of("ROLE_" + role.name())`; both move to `authorities()`.

- [ ] **Step 1: Write the failing test**

```java
package uz.efbazaar.auth.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RoleAuthoritiesTest {

    @Test
    void plainUserGetsOnlyRoleUser() {
        assertThat(Role.USER.authorities()).containsExactly("ROLE_USER");
    }

    @Test
    void platformAdminAlsoGetsRoleUser() {
        assertThat(Role.ADMIN.authorities())
                .containsExactly("ROLE_USER", "ROLE_ADMIN");
    }

    @Test
    void tradeAdminKeepsRoleUserSoOrdinaryEndpointsStillWork() {
        assertThat(Role.TRADE_ADMIN.authorities())
                .containsExactly("ROLE_USER", "ROLE_TRADE_ADMIN");
    }

    @Test
    void everyRoleGrantsRoleUser() {
        for (Role r : Role.values()) {
            assertThat(r.authorities()).contains("ROLE_USER");
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/auth-service && mvn -q test -Dtest=RoleAuthoritiesTest`
Expected: compilation failure — `TRADE_ADMIN` and `authorities()` do not exist.

- [ ] **Step 3: Add the role and the authority mapping**

Replace the whole of `domain/Role.java`:

```java
package uz.efbazaar.auth.domain;

import java.util.List;

/**
 * Single-valued user role. The JWT roles claim is a *list* derived from it —
 * see {@link #authorities()}. Kept single-valued deliberately: no user needs
 * to be both a platform admin and a trade admin, and a join table would
 * complicate every token issue path.
 */
public enum Role {
    USER,
    ADMIN,
    /** Runs escrow trades by hand for a fee. See the human trade-admin spec. */
    TRADE_ADMIN;

    /**
     * Authorities put into the JWT {@code roles} claim and forwarded by nginx
     * as {@code X-User-Roles}. Every role grants {@code ROLE_USER} so a trade
     * admin can still buy and sell like anyone else.
     */
    public List<String> authorities() {
        return switch (this) {
            case USER        -> List.of("ROLE_USER");
            case ADMIN       -> List.of("ROLE_USER", "ROLE_ADMIN");
            case TRADE_ADMIN -> List.of("ROLE_USER", "ROLE_TRADE_ADMIN");
        };
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend/auth-service && mvn -q test -Dtest=RoleAuthoritiesTest`
Expected: PASS, 4 tests.

- [ ] **Step 5: Route both existing call sites through `authorities()`**

In `security/JwtService.java`, replace line 52:

```java
                .claim(CLAIM_ROLES, user.getRole().authorities())
```

In `mapper/UserMapper.java`, replace the mapping on line 26:

```java
    @Mapping(target = "roles", expression = "java(user.getRole().authorities())")
```

- [ ] **Step 6: Write the migration**

Create `V7__add_trade_admin_role.sql`:

```sql
-- ==============================================================
-- auth-service V7 — third role: TRADE_ADMIN.
-- Without widening this CHECK, granting the role fails with a
-- constraint violation (chk_users_role was 'USER' | 'ADMIN' only).
-- The column stays single-valued; the JWT roles claim is derived
-- from it by Role.authorities().
-- ==============================================================

ALTER TABLE users DROP CONSTRAINT chk_users_role;
ALTER TABLE users ADD  CONSTRAINT chk_users_role
    CHECK (role IN ('USER', 'ADMIN', 'TRADE_ADMIN'));
```

- [ ] **Step 7: Verify the whole service still builds and the role survives a round trip**

Run: `cd backend/auth-service && mvn -q verify`
Expected: PASS. If any test asserted on the exact roles claim of an `ADMIN` user it will now see `["ROLE_USER","ROLE_ADMIN"]` instead of `["ROLE_ADMIN"]` — update that assertion, the new shape is intended (spec §4.1).

- [ ] **Step 8: Commit**

```bash
git add backend/auth-service/src/main/java/uz/efbazaar/auth/domain/Role.java \
        backend/auth-service/src/main/java/uz/efbazaar/auth/security/JwtService.java \
        backend/auth-service/src/main/java/uz/efbazaar/auth/mapper/UserMapper.java \
        backend/auth-service/src/main/resources/db/migration/V7__add_trade_admin_role.sql \
        backend/auth-service/src/test/java/uz/efbazaar/auth/domain/RoleAuthoritiesTest.java
git commit -m "feat(auth): add TRADE_ADMIN role with derived authority list"
```

---

## Task 2: auth-service — `user-role-changed` event

**Files:**
- Modify: `backend/auth-service/src/main/java/uz/efbazaar/auth/event/AuthEvents.java`
- Modify: `backend/auth-service/src/main/java/uz/efbazaar/auth/event/AuthEventPublisher.java`
- Modify: `backend/auth-service/src/main/java/uz/efbazaar/auth/service/UserService.java`
- Test: `backend/auth-service/src/test/java/uz/efbazaar/auth/event/UserRoleChangedPublishTest.java`

**Interfaces:**
- Consumes: `Role` from Task 1.
- Produces: topic constant `AuthEvents.TOPIC_USER_ROLE_CHANGED = "efbazaar.auth.user-role-changed"`; payload `AuthEvents.UserRoleChanged(UUID userId, String oldRole, String newRole, Instant occurredAt)`; publisher method `AuthEventPublisher.userRoleChanged(UUID userId, Role oldRole, Role newRole)`. Task 7 consumes this topic in trade-service — the JSON field names above are the contract.

**Context:** Without this event a revoked trade admin stays in the catalogue forever (spec §4.3). `UserService` already owns the role-change path; find the method that writes `user.setRole(...)` (reachable from `AdminUserController` via `UpdateRoleRequest`) and publish *after* the save.

- [ ] **Step 1: Write the failing test**

```java
package uz.efbazaar.auth.event;

import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.mockito.ArgumentCaptor;
import uz.efbazaar.auth.domain.Role;

class UserRoleChangedPublishTest {

    @SuppressWarnings("unchecked")
    private final KafkaTemplate<String, Object> kafka = mock(KafkaTemplate.class);
    private final AuthEventPublisher publisher = new AuthEventPublisher(kafka);

    @Test
    void publishesOldAndNewRoleNamesKeyedByUserId() {
        when(kafka.send(any(), any(), any())).thenReturn(new CompletableFuture<>());
        UUID userId = UUID.randomUUID();

        publisher.userRoleChanged(userId, Role.USER, Role.TRADE_ADMIN);

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(kafka).send(eq(AuthEvents.TOPIC_USER_ROLE_CHANGED),
                eq(userId.toString()), payload.capture());

        assertThat(payload.getValue())
                .isInstanceOf(AuthEvents.UserRoleChanged.class);
        var e = (AuthEvents.UserRoleChanged) payload.getValue();
        assertThat(e.userId()).isEqualTo(userId);
        assertThat(e.oldRole()).isEqualTo("USER");
        assertThat(e.newRole()).isEqualTo("TRADE_ADMIN");
        assertThat(e.occurredAt()).isNotNull();
    }

    @Test
    void topicFollowsNamingConvention() {
        assertThat(AuthEvents.TOPIC_USER_ROLE_CHANGED)
                .isEqualTo("efbazaar.auth.user-role-changed");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/auth-service && mvn -q test -Dtest=UserRoleChangedPublishTest`
Expected: compilation failure — `TOPIC_USER_ROLE_CHANGED`, `UserRoleChanged`, `userRoleChanged` do not exist.

- [ ] **Step 3: Add the topic and payload**

In `event/AuthEvents.java`, add next to the other topic constants:

```java
    public static final String TOPIC_USER_ROLE_CHANGED = "efbazaar.auth.user-role-changed";
```

and next to the other records:

```java
    /**
     * A platform admin changed a user's role. trade-service consumes this to
     * deactivate the admin catalogue profile of a user who lost
     * {@code TRADE_ADMIN} — otherwise a revoked admin stays hireable.
     *
     * <p>Roles travel as plain strings, not the enum, so a consumer that does
     * not share auth-service's enum can still read the payload.
     */
    public record UserRoleChanged(
            UUID userId,
            String oldRole,
            String newRole,
            Instant occurredAt) {}
```

- [ ] **Step 4: Add the publisher method**

In `event/AuthEventPublisher.java`, add:

```java
    public void userRoleChanged(UUID userId, Role oldRole, Role newRole) {
        var event = new AuthEvents.UserRoleChanged(
                userId,
                oldRole == null ? null : oldRole.name(),
                newRole == null ? null : newRole.name(),
                Instant.now());
        send(AuthEvents.TOPIC_USER_ROLE_CHANGED, userId.toString(), event);
    }
```

Add `import uz.efbazaar.auth.domain.Role;` at the top.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend/auth-service && mvn -q test -Dtest=UserRoleChangedPublishTest`
Expected: PASS, 2 tests.

- [ ] **Step 6: Publish from the role-change path**

In `service/UserService.java`, locate the method that assigns a role (it is the one `AdminUserController` calls with `UpdateRoleRequest`). Capture the previous role before mutating and publish after the save. The shape to aim for:

```java
    @Transactional
    public UserResponse updateRole(UUID userId, Role newRole) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User " + userId));
        Role oldRole = user.getRole();
        if (oldRole == newRole) {
            return userMapper.toResponse(user);   // no event on a no-op
        }
        user.setRole(newRole);
        userRepository.save(user);
        events.userRoleChanged(userId, oldRole, newRole);
        return userMapper.toResponse(user);
    }
```

Adapt names to what the file already uses (repository field, mapper field, response type). If `AuthEventPublisher` is not yet injected into `UserService`, add it as a constructor dependency — the class uses `@RequiredArgsConstructor`, so adding a `private final AuthEventPublisher events;` field is enough.

Note the no-op guard: re-saving the same role must not emit an event, otherwise a consumer deactivates a profile for no reason.

- [ ] **Step 7: Verify the service builds**

Run: `cd backend/auth-service && mvn -q verify`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/auth-service/src/main/java/uz/efbazaar/auth/event/AuthEvents.java \
        backend/auth-service/src/main/java/uz/efbazaar/auth/event/AuthEventPublisher.java \
        backend/auth-service/src/main/java/uz/efbazaar/auth/service/UserService.java \
        backend/auth-service/src/test/java/uz/efbazaar/auth/event/UserRoleChangedPublishTest.java
git commit -m "feat(auth): publish user-role-changed so downstream can drop revoked trade admins"
```

---

## Task 3: trade-service — migrations, enums, entity columns

**Files:**
- Create: `backend/trade-service/src/main/resources/db/migration/V9__trade_human_mode.sql`
- Create: `backend/trade-service/src/main/resources/db/migration/V10__trade_admin_profiles.sql`
- Create: `backend/trade-service/src/main/resources/db/migration/V11__trade_steps.sql`
- Create: `backend/trade-service/src/main/resources/db/migration/V12__trade_admin_ratings.sql`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeMode.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeStep.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeState.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeEvent.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeSenderType.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/ActorType.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/Trade.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/domain/TradeAdminProfile.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/domain/TradeStepMark.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/domain/TradeAdminRating.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/admin/HumanModeSchemaIT.java`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `TradeMode { SMART, HUMAN }`
  - `TradeStep { SELLER_BRIEFED, ACCOUNT_TRANSFERRED, ACCOUNT_VERIFIED, PAYMENT_RECEIVED, CREDENTIALS_DELIVERED, SELLER_PAID }` with `String labelUz()`
  - `TradeState` += `WAITING_ADMIN, IN_PROGRESS, WAITING_CLOSE_CONFIRM`
  - `TradeEvent` += `ADMIN_ACCEPTED, ADMIN_DECLINED, ADMIN_CLOSED, CLOSE_CONFIRMED, ADMIN_CANCELLED`
  - `TradeSenderType` += `HUMAN_ADMIN`; `ActorType` += `TRADE_ADMIN`
  - `Trade` getters/setters: `getMode/setMode`, `getAssignedAdminId/setAssignedAdminId`, `getAdminFeeUzs/setAdminFeeUzs`, `getAdminAcceptedAt/setAdminAcceptedAt`, `getAdminClosedAt/setAdminClosedAt`, `getSellerConfirmedAt/setSellerConfirmedAt`, `getBuyerConfirmedAt/setBuyerConfirmedAt`, `getEscalationDeadlineAt/setEscalationDeadlineAt`, `getEscalatedAt/setEscalatedAt`, `getEscalationReason/setEscalationReason`
  - Entities `TradeAdminProfile`, `TradeStepMark`, `TradeAdminRating`

**Deviation from spec §11.2, deliberate:** the spec's DDL gives `trade_steps` a composite primary key `(trade_id, step)`. This plan uses a surrogate `id UUID PRIMARY KEY` plus `UNIQUE (trade_id, step)`. Same guarantee, and it avoids a JPA `@IdClass` with hand-written `equals`/`hashCode`. Record this in the migration comment so the difference is not mistaken for a mistake.

- [ ] **Step 1: Write the failing schema test**

```java
package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.trade.testsupport.AbstractPostgresIT;
import uz.efbazaar.trade.trade.domain.TradeState;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guards the V9–V12 shape. A CHECK constraint that rejects a new enum value
 * fails at runtime with a constraint violation rather than at compile time,
 * so it needs a test.
 */
@SpringBootTest
class HumanModeSchemaIT extends AbstractPostgresIT {

    @Autowired JdbcTemplate jdbc;

    @Test
    void tradesStateCheckAcceptsEveryEnumValue() {
        String def = constraintDef("chk_trades_state");
        for (TradeState s : TradeState.values()) {
            assertThat(def)
                    .as("TradeState.%s missing from chk_trades_state — every insert "
                        + "of that state will fail with a constraint violation", s.name())
                    .contains("'" + s.name() + "'");
        }
    }

    /**
     * Substring matching on the rendered constraint, not parsing it. Postgres
     * renders the CHECK as
     * {@code CHECK (((state)::text = ANY ((ARRAY['INITIATED'::character varying, ...])::text[])))},
     * so a quoted enum name appears verbatim exactly when it is permitted.
     */
    private String constraintDef(String name) {
        String def = jdbc.queryForObject("""
                SELECT pg_get_constraintdef(oid) FROM pg_constraint
                 WHERE conname = ?
                """, String.class, name);
        assertThat(def).as("constraint %s does not exist", name).isNotNull();
        return def;
    }

    @Test
    void auditActorCheckAcceptsTradeAdmin() {
        String def = jdbc.queryForObject("""
                SELECT pg_get_constraintdef(oid) FROM pg_constraint
                 WHERE conname = 'chk_audit_actor'
                """, String.class);
        assertThat(def).contains("TRADE_ADMIN");
    }

    @Test
    void messageSenderCheckAcceptsHumanAdmin() {
        String def = jdbc.queryForObject("""
                SELECT pg_get_constraintdef(oid) FROM pg_constraint
                 WHERE conname = 'chk_trade_messages_sender'
                """, String.class);
        assertThat(def).contains("HUMAN_ADMIN");
    }

    @Test
    void humanTradeMayHaveNoCards() {
        assertThat(isNullable("trades", "seller_card_id")).isTrue();
        assertThat(isNullable("trades", "buyer_card_id")).isTrue();
    }

    @Test
    void newTablesExist() {
        assertThat(tableExists("trade_admin_profiles")).isTrue();
        assertThat(tableExists("trade_steps")).isTrue();
        assertThat(tableExists("trade_admin_ratings")).isTrue();
    }

    private boolean isNullable(String table, String column) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT is_nullable = 'YES' FROM information_schema.columns
                 WHERE table_name = ? AND column_name = ?
                """, Boolean.class, table, column));
    }

    private boolean tableExists(String table) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM information_schema.tables
                                WHERE table_name = ?)
                """, Boolean.class, table));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/trade-service && mvn verify -Dit.test=HumanModeSchemaIT`
Expected: FAIL — `chk_trades_state` has no `WAITING_ADMIN`, the new tables do not exist.

- [ ] **Step 3: Write `V9__trade_human_mode.sql`**

```sql
-- ==============================================================
-- trade-service V9 — human trade-admin mode.
--
-- One state machine serves both modes; `mode` decides which side
-- effects fire (see TradeStateHandler). Smart transitions are
-- untouched, so this migration only ADDS reachable states.
--
-- V4/V5/V6 are immutable, so their CHECK constraints are dropped
-- and re-added here rather than edited in place.
-- ==============================================================

ALTER TABLE trades
    ADD COLUMN mode                   VARCHAR(8) NOT NULL DEFAULT 'SMART',
    ADD COLUMN assigned_admin_id      UUID,
    ADD COLUMN admin_fee_uzs          BIGINT,
    ADD COLUMN admin_accepted_at      TIMESTAMPTZ,
    ADD COLUMN admin_closed_at        TIMESTAMPTZ,
    ADD COLUMN seller_confirmed_at    TIMESTAMPTZ,
    ADD COLUMN buyer_confirmed_at     TIMESTAMPTZ,
    ADD COLUMN escalation_deadline_at TIMESTAMPTZ,
    ADD COLUMN escalated_at           TIMESTAMPTZ,
    ADD COLUMN escalation_reason      VARCHAR(32);

ALTER TABLE trades ADD CONSTRAINT chk_trades_mode
    CHECK (mode IN ('SMART', 'HUMAN'));

-- An admin arbitrating their own purchase or sale is not arbitration.
ALTER TABLE trades ADD CONSTRAINT chk_trades_admin_not_party
    CHECK (assigned_admin_id IS NULL
        OR (assigned_admin_id <> seller_id AND assigned_admin_id <> buyer_id));

-- Smart trades must never carry admin fields.
ALTER TABLE trades ADD CONSTRAINT chk_trades_smart_no_admin
    CHECK (mode = 'HUMAN' OR (assigned_admin_id IS NULL AND admin_fee_uzs IS NULL));

-- Three new states, all reachable only on the HUMAN path.
ALTER TABLE trades DROP CONSTRAINT chk_trades_state;
ALTER TABLE trades ADD  CONSTRAINT chk_trades_state CHECK (state IN (
    'INITIATED', 'WAITING_PAYMENT', 'WAITING_EMAIL_CHANGE',
    'VERIFYING_KONAMI_LINK', 'WAITING_PASSWORD', 'WAITING_BUYER_VERIFY',
    'WAITING_ADMIN', 'IN_PROGRESS', 'WAITING_CLOSE_CONFIRM',
    'SUCCESS', 'REJECTED', 'ORPHANED'
));

-- Human trades have no platform payment, so a card serves no purpose.
-- Smart trades still require both; enforced by the CHECK below and by
-- TradeService.openTrade.
ALTER TABLE trades ALTER COLUMN seller_card_id DROP NOT NULL;
ALTER TABLE trades ALTER COLUMN buyer_card_id  DROP NOT NULL;
ALTER TABLE trades ADD CONSTRAINT chk_trades_smart_cards
    CHECK (mode = 'HUMAN' OR (seller_card_id IS NOT NULL AND buyer_card_id IS NOT NULL));

-- Escalation sweeper lookup: "human trades whose admin has gone quiet".
-- Deliberately NOT state_deadline — TradeTimeoutScheduler fires TIMEOUT for
-- every non-terminal state with a due state_deadline, and IN_PROGRESS has no
-- TIMEOUT transition, which would throw every 10 seconds forever.
CREATE INDEX ix_trades_escalation_due ON trades (escalation_deadline_at)
    WHERE escalated_at IS NULL AND escalation_deadline_at IS NOT NULL;
CREATE INDEX ix_trades_escalated ON trades (escalated_at)
    WHERE escalated_at IS NOT NULL;
CREATE INDEX ix_trades_assigned_admin ON trades (assigned_admin_id)
    WHERE assigned_admin_id IS NOT NULL;

-- Enum widening for the audit log and chat messages.
ALTER TABLE trade_audit_log DROP CONSTRAINT chk_audit_actor;
ALTER TABLE trade_audit_log ADD  CONSTRAINT chk_audit_actor
    CHECK (actor_type IN ('USER', 'WORKER', 'SYSTEM', 'ADMIN', 'TRADE_ADMIN'));

ALTER TABLE trade_messages DROP CONSTRAINT chk_trade_messages_sender;
ALTER TABLE trade_messages ADD  CONSTRAINT chk_trade_messages_sender
    CHECK (sender_type IN ('USER', 'SMART_ADMIN', 'SYSTEM', 'HUMAN_ADMIN'));
```

- [ ] **Step 4: Write `V10__trade_admin_profiles.sql`**

```sql
-- ==============================================================
-- trade-service V10 — trade admin profiles.
--
-- Row exists  ⇔  "I work as a trade admin". Holding ROLE_TRADE_ADMIN
-- without a profile row keeps you out of the catalogue.
--
-- Owned by trade-service (not auth-service) because every number here
-- is derived from trades: ratings, close times, abandonment.
-- auth-service knows only the role bit.
-- ==============================================================

CREATE TABLE trade_admin_profiles (
    user_id               UUID PRIMARY KEY,

    -- Negotiation band. The per-trade fee is agreed inside it and paid
    -- OFF-PLATFORM; no ledger entry corresponds to it.
    min_fee_uzs           BIGINT  NOT NULL,
    max_fee_uzs           BIGINT  NOT NULL,

    bio                   VARCHAR(500),
    accepting_orders      BOOLEAN NOT NULL DEFAULT TRUE,
    max_concurrent_trades INT     NOT NULL DEFAULT 3,
    -- FALSE once auth-service reports the role was revoked. Never deleted:
    -- the rating history has to survive.
    active                BOOLEAN NOT NULL DEFAULT TRUE,

    rating_sum            INT     NOT NULL DEFAULT 0,
    rating_count          INT     NOT NULL DEFAULT 0,
    completed_count       INT     NOT NULL DEFAULT 0,
    abandoned_count       INT     NOT NULL DEFAULT 0,
    cancelled_count       INT     NOT NULL DEFAULT 0,
    -- accepted → admin pressed close. What the catalogue displays.
    total_work_seconds    BIGINT  NOT NULL DEFAULT 0,
    -- accepted → SUCCESS. Includes the parties' confirm latency; analysis only.
    total_close_seconds   BIGINT  NOT NULL DEFAULT 0,

    version               BIGINT  NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_tap_fee_range   CHECK (min_fee_uzs > 0 AND max_fee_uzs >= min_fee_uzs),
    CONSTRAINT chk_tap_concurrent  CHECK (max_concurrent_trades BETWEEN 1 AND 20),
    CONSTRAINT chk_tap_rating_sane CHECK (rating_count >= 0 AND rating_sum >= 0)
);

CREATE INDEX ix_tap_catalog ON trade_admin_profiles (active, accepting_orders);
```

- [ ] **Step 5: Write `V11__trade_steps.sql`**

```sql
-- ==============================================================
-- trade-service V11 — the six manual steps of a human trade.
--
-- Six rows are created when the admin accepts; the admin ticks them in
-- ANY order, and may untick to correct a mistake. 6/6 unlocks close.
--
-- NOTE: the design spec draws a composite primary key (trade_id, step).
-- A surrogate key plus UNIQUE gives the identical guarantee without a
-- JPA @IdClass, so that is what ships. Not an oversight.
-- ==============================================================

CREATE TABLE trade_steps (
    id           UUID PRIMARY KEY,
    trade_id     UUID        NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    step         VARCHAR(32) NOT NULL,
    completed_at TIMESTAMPTZ,
    completed_by UUID,
    note         VARCHAR(500),

    CONSTRAINT uk_trade_steps UNIQUE (trade_id, step),
    CONSTRAINT chk_trade_steps_step CHECK (step IN (
        'SELLER_BRIEFED', 'ACCOUNT_TRANSFERRED', 'ACCOUNT_VERIFIED',
        'PAYMENT_RECEIVED', 'CREDENTIALS_DELIVERED', 'SELLER_PAID')),
    -- completed_by is meaningless without a completion time and vice versa.
    CONSTRAINT chk_trade_steps_completion CHECK (
        (completed_at IS NULL AND completed_by IS NULL)
     OR (completed_at IS NOT NULL AND completed_by IS NOT NULL))
);

CREATE INDEX ix_trade_steps_trade ON trade_steps (trade_id);
```

- [ ] **Step 6: Write `V12__trade_admin_ratings.sql`**

```sql
-- ==============================================================
-- trade-service V12 — 1–5 star ratings of a human admin.
--
-- Both parties may rate, optionally, within a configured window after
-- SUCCESS. Not a chat message, so it still works after the chat closes.
--
-- Hiding a comment hides the TEXT only: rating_sum / rating_count are
-- never adjusted on hide, otherwise a platform admin could raise an
-- admin's score by moderating comments.
-- ==============================================================

CREATE TABLE trade_admin_ratings (
    id          UUID PRIMARY KEY,
    trade_id    UUID       NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    admin_id    UUID       NOT NULL,
    rater_id    UUID       NOT NULL,
    rater_role  VARCHAR(8) NOT NULL,
    stars       SMALLINT   NOT NULL,
    comment     VARCHAR(500),
    hidden_at   TIMESTAMPTZ,
    hidden_by   UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_tar_stars CHECK (stars BETWEEN 1 AND 5),
    CONSTRAINT chk_tar_role  CHECK (rater_role IN ('SELLER', 'BUYER')),
    CONSTRAINT uk_tar_rater  UNIQUE (trade_id, rater_id),
    CONSTRAINT chk_tar_hidden CHECK (
        (hidden_at IS NULL AND hidden_by IS NULL)
     OR (hidden_at IS NOT NULL AND hidden_by IS NOT NULL))
);

CREATE INDEX ix_tar_admin ON trade_admin_ratings (admin_id, created_at DESC);
```

- [ ] **Step 7: Add the new enum values**

`trade/domain/TradeMode.java` (new):

```java
package uz.efbazaar.trade.trade.domain;

/**
 * Who drives the trade. Decides which side effects {@code TradeStateHandler}
 * fires — see the human trade-admin spec §3.1.
 */
public enum TradeMode {
    /** smart-admin-worker automates Konami and IMAP. */
    SMART,
    /** A hired human runs the trade; Konami/IMAP automation is off. */
    HUMAN
}
```

`trade/domain/TradeStep.java` (new):

```java
package uz.efbazaar.trade.trade.domain;

/**
 * The six things a human admin confirms by hand. Order is not enforced —
 * payment can be collected before or after the account is verified.
 */
public enum TradeStep {
    SELLER_BRIEFED("Sotuvchi bilan gaplashdim"),
    ACCOUNT_TRANSFERRED("Akkount escrow emailga o'tkazildi"),
    ACCOUNT_VERIFIED("Akkountni tekshirdim — haqiqiy"),
    PAYMENT_RECEIVED("Xaridordan to'lovni oldim"),
    CREDENTIALS_DELIVERED("Xaridorga email va parol berildi"),
    SELLER_PAID("Sotuvchiga pulni o'tkazdim");

    private final String labelUz;

    TradeStep(String labelUz) {
        this.labelUz = labelUz;
    }

    /** Shown in both chats and in the admin workspace checklist. */
    public String labelUz() {
        return labelUz;
    }
}
```

In `trade/domain/TradeState.java`, add the three states **before** the terminal three so the declaration order still reads as a lifecycle:

```java
public enum TradeState {
    INITIATED,
    WAITING_PAYMENT,
    WAITING_EMAIL_CHANGE,
    VERIFYING_KONAMI_LINK,
    WAITING_PASSWORD,
    WAITING_BUYER_VERIFY,
    /** HUMAN only — waiting for the invited admin to accept. */
    WAITING_ADMIN,
    /** HUMAN only — admin is working the six-step checklist. */
    IN_PROGRESS,
    /** HUMAN only — admin closed; waiting for both parties to confirm. */
    WAITING_CLOSE_CONFIRM,
    SUCCESS,
    REJECTED,
    ORPHANED;
```

Leave `TERMINAL`, `isTerminal()` and `nonTerminal()` exactly as they are — `nonTerminal()` is an `EnumSet` complement and picks the new states up automatically.

In `trade/domain/TradeEvent.java`, append:

```java
    /** Invited admin accepted the job. WAITING_ADMIN → IN_PROGRESS. */
    ADMIN_ACCEPTED,
    /** Invited admin refused. WAITING_ADMIN → WAITING_ADMIN (self-loop). */
    ADMIN_DECLINED,
    /** Admin marked all six steps and pressed close. IN_PROGRESS → WAITING_CLOSE_CONFIRM. */
    ADMIN_CLOSED,
    /** Both parties confirmed, or the 24h window elapsed. → SUCCESS. */
    CLOSE_CONFIRMED,
    /** Admin (or a platform admin) aborted — e.g. the account is fake. → REJECTED. */
    ADMIN_CANCELLED
```

In `trade/domain/TradeSenderType.java`, append:

```java
    /** A hired human admin writing into one of the two party chats. */
    HUMAN_ADMIN
```

In `trade/domain/ActorType.java`:

```java
public enum ActorType {
    USER, WORKER, SYSTEM,
    /** Platform staff (ROLE_ADMIN) — moderation, escalation. */
    ADMIN,
    /** A hired trade admin (ROLE_TRADE_ADMIN) acting on their own trade. */
    TRADE_ADMIN
}
```

- [ ] **Step 8: Add the new `Trade` columns and drop the card NOT NULLs**

In `trade/domain/Trade.java`, change the two card fields to nullable:

```java
    @Column(name = "seller_card_id", updatable = false)
    private UUID sellerCardId;

    @Column(name = "buyer_card_id", updatable = false)
    private UUID buyerCardId;
```

and add, after `emailChangeVerificationCodeAt`:

```java
    // ----- human trade-admin mode -----

    @Enumerated(EnumType.STRING)
    @Column(name = "mode", nullable = false, length = 8)
    @Builder.Default
    private TradeMode mode = TradeMode.SMART;

    @Column(name = "assigned_admin_id")
    private UUID assignedAdminId;

    /**
     * Fee agreed with the admin, in UZS. Informational only — the money is
     * handed over off-platform and no ledger entry corresponds to it. Kept so
     * both chats can show what was agreed and so stats can average it.
     */
    @Column(name = "admin_fee_uzs")
    private Long adminFeeUzs;

    /** Start of the admin's work timer. */
    @Column(name = "admin_accepted_at")
    private Instant adminAcceptedAt;

    /** End of the admin's work timer — set when they press close. */
    @Column(name = "admin_closed_at")
    private Instant adminClosedAt;

    @Column(name = "seller_confirmed_at")
    private Instant sellerConfirmedAt;

    @Column(name = "buyer_confirmed_at")
    private Instant buyerConfirmedAt;

    /**
     * Idle watchdog for IN_PROGRESS. Separate from {@code stateDeadline} on
     * purpose: TradeTimeoutScheduler fires TIMEOUT for any non-terminal state
     * with a due stateDeadline, and IN_PROGRESS has no TIMEOUT transition.
     */
    @Column(name = "escalation_deadline_at")
    private Instant escalationDeadlineAt;

    @Column(name = "escalated_at")
    private Instant escalatedAt;

    @Column(name = "escalation_reason", length = 32)
    private String escalationReason;
```

- [ ] **Step 9: Add the three new entities**

`admin/domain/TradeAdminProfile.java`:

```java
package uz.efbazaar.trade.admin.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A user's willingness to run trades by hand, plus every number the catalogue
 * shows. Existence of the row is the opt-in; {@code active = false} is how a
 * revoked role is recorded without losing rating history.
 */
@Entity
@Table(name = "trade_admin_profiles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TradeAdminProfile {

    @Id
    @Column(name = "user_id", columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID userId;

    @Column(name = "min_fee_uzs", nullable = false)
    private long minFeeUzs;

    @Column(name = "max_fee_uzs", nullable = false)
    private long maxFeeUzs;

    @Column(name = "bio", length = 500)
    private String bio;

    @Column(name = "accepting_orders", nullable = false)
    @Builder.Default
    private boolean acceptingOrders = true;

    @Column(name = "max_concurrent_trades", nullable = false)
    @Builder.Default
    private int maxConcurrentTrades = 3;

    @Column(name = "active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "rating_sum", nullable = false)
    @Builder.Default
    private int ratingSum = 0;

    @Column(name = "rating_count", nullable = false)
    @Builder.Default
    private int ratingCount = 0;

    @Column(name = "completed_count", nullable = false)
    @Builder.Default
    private int completedCount = 0;

    @Column(name = "abandoned_count", nullable = false)
    @Builder.Default
    private int abandonedCount = 0;

    @Column(name = "cancelled_count", nullable = false)
    @Builder.Default
    private int cancelledCount = 0;

    @Column(name = "total_work_seconds", nullable = false)
    @Builder.Default
    private long totalWorkSeconds = 0;

    @Column(name = "total_close_seconds", nullable = false)
    @Builder.Default
    private long totalCloseSeconds = 0;

    /** Optimistic lock — the capacity check in Task 10 locks this row. */
    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** Mean stars, or {@code null} when nobody has rated yet. */
    public Double averageStars() {
        return ratingCount == 0 ? null : (double) ratingSum / ratingCount;
    }

    /** Mean seconds of the admin's own work, or {@code null} before the first close. */
    public Long averageWorkSeconds() {
        return completedCount == 0 ? null : totalWorkSeconds / completedCount;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
```

`admin/domain/TradeStepMark.java`:

```java
package uz.efbazaar.trade.admin.domain;

import jakarta.persistence.*;
import lombok.*;
import uz.efbazaar.trade.trade.domain.TradeStep;

import java.time.Instant;
import java.util.UUID;

/** One checklist row. Six exist per human trade, created when the admin accepts. */
@Entity
@Table(name = "trade_steps")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TradeStepMark {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "trade_id", nullable = false, updatable = false)
    private UUID tradeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "step", nullable = false, length = 32, updatable = false)
    private TradeStep step;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "completed_by")
    private UUID completedBy;

    @Column(name = "note", length = 500)
    private String note;

    public boolean isComplete() {
        return completedAt != null;
    }
}
```

`admin/domain/TradeAdminRating.java`:

```java
package uz.efbazaar.trade.admin.domain;

import jakarta.persistence.*;
import lombok.*;
import uz.efbazaar.trade.trade.domain.ParticipantRole;

import java.time.Instant;
import java.util.UUID;

/** One party's 1–5 star verdict on the admin who ran their trade. */
@Entity
@Table(name = "trade_admin_ratings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TradeAdminRating {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "trade_id", nullable = false, updatable = false)
    private UUID tradeId;

    @Column(name = "admin_id", nullable = false, updatable = false)
    private UUID adminId;

    @Column(name = "rater_id", nullable = false, updatable = false)
    private UUID raterId;

    @Enumerated(EnumType.STRING)
    @Column(name = "rater_role", nullable = false, length = 8, updatable = false)
    private ParticipantRole raterRole;

    @Column(name = "stars", nullable = false)
    private short stars;

    @Column(name = "comment", length = 500)
    private String comment;

    /** Set when a platform admin hides abusive text. The stars still count. */
    @Column(name = "hidden_at")
    private Instant hiddenAt;

    @Column(name = "hidden_by")
    private UUID hiddenBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }

    public boolean isHidden() {
        return hiddenAt != null;
    }
}
```

- [ ] **Step 10: Run the schema test to verify it passes**

Run: `cd backend/trade-service && mvn verify -Dit.test=HumanModeSchemaIT`
Expected: PASS, 5 tests. The whole unit suite runs too — `TradeStateMachineTest.terminalStatesAcceptNoEvents` iterates `TradeEvent.values()` and must still pass, because the new events are illegal from terminal states.

- [ ] **Step 11: Commit**

```bash
git add backend/trade-service/src/main/resources/db/migration/V9__trade_human_mode.sql \
        backend/trade-service/src/main/resources/db/migration/V10__trade_admin_profiles.sql \
        backend/trade-service/src/main/resources/db/migration/V11__trade_steps.sql \
        backend/trade-service/src/main/resources/db/migration/V12__trade_admin_ratings.sql \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/ \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/domain/ \
        backend/trade-service/src/test/java/uz/efbazaar/trade/admin/HumanModeSchemaIT.java
git commit -m "feat(trade): add human-mode schema, enums and admin entities"
```

---

## Task 4: trade-service — `TradeViewer` and admin-aware authorisation

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeViewer.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/Trade.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeRepository.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeViewerTest.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/admin/AdminTradeAccessIT.java`

**Interfaces:**
- Consumes: `Trade.getAssignedAdminId()` (Task 3).
- Produces:
  - `TradeViewer { SELLER, BUYER, ADMIN }`
  - `TradeViewer Trade.viewerFor(UUID userId)` — throws `IllegalArgumentException` when the user is none of the three
  - `boolean Trade.isViewer(UUID userId)`
  - `Optional<Trade> TradeRepository.findByIdAndViewer(UUID id, UUID userId)`
  - `Trade TradeService.getForViewer(UUID tradeId, UUID viewerUserId)` — throws `EntityNotFoundException` for a non-viewer
  - Existing `TradeService.get(...)` and `Trade.roleFor(...)` keep their current party-only semantics; do not change them.

**Context:** `roleFor()` throws for anyone who is not the seller or buyer, and `findByIdAndParticipant` filters the admin out. Every admin endpoint in Tasks 10–14 needs a read path that accepts the assigned admin. Adding a parallel path rather than widening the existing one keeps the party-only guarantee available where it is still correct (`postText` picking the caller's own chat, `close-confirm`).

A non-viewer gets `EntityNotFoundException` → `404`, never `403`: a `403` would confirm the trade exists to a stranger.

- [ ] **Step 1: Write the failing unit test**

```java
package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeViewer;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TradeViewerTest {

    private final UUID seller = UUID.randomUUID();
    private final UUID buyer  = UUID.randomUUID();
    private final UUID admin  = UUID.randomUUID();

    private Trade humanTrade() {
        return Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(seller)
                .buyerId(buyer)
                .mode(TradeMode.HUMAN)
                .assignedAdminId(admin)
                .build();
    }

    @Test
    void partiesResolveToTheirOwnSide() {
        Trade t = humanTrade();
        assertThat(t.viewerFor(seller)).isEqualTo(TradeViewer.SELLER);
        assertThat(t.viewerFor(buyer)).isEqualTo(TradeViewer.BUYER);
    }

    @Test
    void assignedAdminResolvesToAdmin() {
        assertThat(humanTrade().viewerFor(admin)).isEqualTo(TradeViewer.ADMIN);
    }

    @Test
    void strangerIsRejected() {
        UUID stranger = UUID.randomUUID();
        assertThatThrownBy(() -> humanTrade().viewerFor(stranger))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(humanTrade().isViewer(stranger)).isFalse();
    }

    @Test
    void smartTradeHasNoAdminViewer() {
        Trade smart = Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(seller)
                .buyerId(buyer)
                .mode(TradeMode.SMART)
                .build();
        assertThatThrownBy(() -> smart.viewerFor(admin))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void isViewerAcceptsAllThree() {
        Trade t = humanTrade();
        assertThat(t.isViewer(seller)).isTrue();
        assertThat(t.isViewer(buyer)).isTrue();
        assertThat(t.isViewer(admin)).isTrue();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/trade-service && mvn -q test -Dtest=TradeViewerTest`
Expected: compilation failure — `TradeViewer`, `viewerFor`, `isViewer` do not exist.

- [ ] **Step 3: Add `TradeViewer` and the two `Trade` methods**

`trade/domain/TradeViewer.java`:

```java
package uz.efbazaar.trade.trade.domain;

/**
 * Who is looking at a trade. Wider than {@link ParticipantRole}: a human
 * trade also has an assigned admin, who reads and writes both party chats
 * but is not a party and never confirms the close.
 */
public enum TradeViewer {
    SELLER, BUYER, ADMIN;

    public boolean isParty() {
        return this != ADMIN;
    }

    /** The party chat this viewer owns, or {@code null} for the admin. */
    public ParticipantRole asParticipantRole() {
        return switch (this) {
            case SELLER -> ParticipantRole.SELLER;
            case BUYER  -> ParticipantRole.BUYER;
            case ADMIN  -> null;
        };
    }
}
```

In `trade/domain/Trade.java`, add next to `roleFor`:

```java
    /**
     * Which of the three roles this user holds on this trade. Unlike
     * {@link #roleFor(UUID)} this also recognises the assigned human admin.
     */
    public TradeViewer viewerFor(UUID userId) {
        if (userId.equals(sellerId)) return TradeViewer.SELLER;
        if (userId.equals(buyerId))  return TradeViewer.BUYER;
        if (assignedAdminId != null && userId.equals(assignedAdminId)) return TradeViewer.ADMIN;
        throw new IllegalArgumentException("User " + userId + " cannot view trade " + id);
    }

    public boolean isViewer(UUID userId) {
        return isParticipant(userId)
                || (assignedAdminId != null && userId.equals(assignedAdminId));
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend/trade-service && mvn -q test -Dtest=TradeViewerTest`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the repository query and service read path**

In `trade/repository/TradeRepository.java`, add:

```java
    /**
     * Like {@link #findByIdAndParticipant} but also matches the assigned human
     * admin. Used by every admin endpoint; returning empty (→ 404) for a
     * stranger avoids confirming the trade exists.
     */
    @Query("""
            SELECT t FROM Trade t
             WHERE t.id = :id
               AND (t.sellerId = :userId
                 OR t.buyerId = :userId
                 OR t.assignedAdminId = :userId)
            """)
    Optional<Trade> findByIdAndViewer(@Param("id") UUID id,
                                      @Param("userId") UUID userId);
```

In `trade/service/TradeService.java`, add next to `get`:

```java
    /**
     * Look up a trade for anyone entitled to see it — either party or the
     * assigned human admin. Prefer {@link #get} where the caller must be a
     * party (e.g. confirming the close).
     */
    @Transactional(readOnly = true)
    public Trade getForViewer(UUID tradeId, UUID viewerUserId) {
        return trades.findByIdAndViewer(tradeId, viewerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Trade " + tradeId));
    }
```

- [ ] **Step 6: Write the integration test for the read path**

```java
package uz.efbazaar.trade.admin;

import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.domain.TradeViewer;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class AdminTradeAccessIT extends AbstractIntegrationIT {

    @Autowired TradeRepository trades;
    @Autowired TradeService tradeService;

    private Trade persistHumanTrade(UUID seller, UUID buyer, UUID admin) {
        return trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(seller)
                .buyerId(buyer)
                .priceUzs(80_000)
                .state(TradeState.IN_PROGRESS)
                .mailboxId(UUID.randomUUID())
                .mode(TradeMode.HUMAN)
                .assignedAdminId(admin)
                .adminFeeUzs(15_000L)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
    }

    @Test
    void assignedAdminCanReadTheTrade() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), admin = UUID.randomUUID();
        Trade t = persistHumanTrade(seller, buyer, admin);

        Trade loaded = tradeService.getForViewer(t.getId(), admin);

        assertThat(loaded.getId()).isEqualTo(t.getId());
        assertThat(loaded.viewerFor(admin)).isEqualTo(TradeViewer.ADMIN);
    }

    @Test
    void unassignedAdminGetsNotFoundNotForbidden() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), admin = UUID.randomUUID();
        Trade t = persistHumanTrade(seller, buyer, admin);
        UUID otherAdmin = UUID.randomUUID();

        assertThatThrownBy(() -> tradeService.getForViewer(t.getId(), otherAdmin))
                .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void partyOnlyPathStillExcludesTheAdmin() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), admin = UUID.randomUUID();
        Trade t = persistHumanTrade(seller, buyer, admin);

        // get() keeps its party-only meaning — close-confirm depends on it.
        assertThatThrownBy(() -> tradeService.get(t.getId(), admin))
                .isInstanceOf(EntityNotFoundException.class);
        assertThat(tradeService.get(t.getId(), seller).getId()).isEqualTo(t.getId());
    }

    @Test
    void humanTradeCanBePersistedWithoutCards() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), admin = UUID.randomUUID();
        Trade t = persistHumanTrade(seller, buyer, admin);

        assertThat(t.getSellerCardId()).isNull();
        assertThat(t.getBuyerCardId()).isNull();
    }
}
```

- [ ] **Step 7: Run the integration test**

Run: `cd backend/trade-service && mvn verify -Dit.test=AdminTradeAccessIT`
Expected: PASS, 4 tests.

- [ ] **Step 8: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/TradeViewer.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/domain/Trade.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeRepository.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeViewerTest.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/admin/AdminTradeAccessIT.java
git commit -m "feat(trade): add TradeViewer so an assigned admin can read their trade"
```

---

## Task 5: trade-service — two transition tables and the mode gate

**Files:**
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateMachine.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateHandler.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java:109`
- Modify: `backend/trade-service/src/main/resources/application.yml:67`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeStateMachineTest.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/admin/HumanModeSideEffectsIT.java`

**Interfaces:**
- Consumes: `TradeMode`, new `TradeState`/`TradeEvent` values (Task 3).
- Produces:
  - `TradeState TradeStateMachine.transition(TradeMode mode, TradeState current, TradeEvent event)` — the canonical form.
  - `TradeState TradeStateMachine.transition(TradeState current, TradeEvent event)` — kept, delegates with `TradeMode.SMART`. Existing callers and tests keep working.
  - `Trade TradeService.transition(UUID tradeId, TradeEvent event, ActorType actor, UUID actorId)` — unchanged signature; it now reads `trade.getMode()` and passes it down.
  - `TradeStateHandler.onEnter(Trade, TradeState, ActorType, UUID, TradeEvent)` — unchanged signature; reads `trade.getMode()` internally.

**Context:** The key structural decision. Instead of one mode-blind table plus runtime `if`s, there are **two** tables. A `HUMAN` trade has no `WAITING_PAYMENT` row at all, so it *cannot* enter the smart path; a `SMART` trade has no `IN_PROGRESS` row, so it cannot enter the human path. That makes the spec §16.1 regression guards true by construction rather than by assertion.

`INITIATED + MAILBOX_PROVISIONED` is the one row that genuinely differs: `→ WAITING_PAYMENT` for smart, `→ WAITING_ADMIN` for human. That is why `mode` has to reach the state machine.

- [ ] **Step 1: Write the failing state machine tests**

Append to `TradeStateMachineTest.java` (keep every existing test — they pin the smart path):

```java
    // ----- human path -----

    @Test
    void humanPathReachesSuccess() {
        TradeState s = INITIATED;
        s = sm.transition(TradeMode.HUMAN, s, MAILBOX_PROVISIONED);
        assertThat(s).isEqualTo(WAITING_ADMIN);
        s = sm.transition(TradeMode.HUMAN, s, ADMIN_ACCEPTED);
        assertThat(s).isEqualTo(IN_PROGRESS);
        s = sm.transition(TradeMode.HUMAN, s, ADMIN_CLOSED);
        assertThat(s).isEqualTo(WAITING_CLOSE_CONFIRM);
        s = sm.transition(TradeMode.HUMAN, s, CLOSE_CONFIRMED);
        assertThat(s).isEqualTo(SUCCESS);
    }

    @Test
    void humanMailboxProvisionedGoesToWaitingAdminNotWaitingPayment() {
        assertThat(sm.transition(TradeMode.HUMAN, INITIATED, MAILBOX_PROVISIONED))
                .isEqualTo(WAITING_ADMIN);
        assertThat(sm.transition(TradeMode.SMART, INITIATED, MAILBOX_PROVISIONED))
                .isEqualTo(WAITING_PAYMENT);
    }

    @Test
    void declineIsASelfLoopSoTheSellerCanTryAnotherAdmin() {
        assertThat(sm.transition(TradeMode.HUMAN, WAITING_ADMIN, ADMIN_DECLINED))
                .isEqualTo(WAITING_ADMIN);
    }

    @Test
    void nobodyAcceptingOrphansTheTrade() {
        assertThat(sm.transition(TradeMode.HUMAN, WAITING_ADMIN, TIMEOUT))
                .isEqualTo(ORPHANED);
    }

    @Test
    void closeConfirmTimeoutSucceedsRatherThanRejects() {
        // Spec §3.8: the admin certified all six steps, so silence is consent.
        assertThat(sm.transition(TradeMode.HUMAN, WAITING_CLOSE_CONFIRM, TIMEOUT))
                .isEqualTo(SUCCESS);
    }

    @Test
    void adminCanCancelAFakeAccount() {
        assertThat(sm.transition(TradeMode.HUMAN, IN_PROGRESS, ADMIN_CANCELLED))
                .isEqualTo(REJECTED);
    }

    @Test
    void inProgressHasNoTimeoutTransition() {
        // If it had one, and IN_PROGRESS carried a state_deadline, the sweeper
        // would fire every 10s forever. Escalation uses its own column instead.
        assertThatThrownBy(() -> sm.transition(TradeMode.HUMAN, IN_PROGRESS, TIMEOUT))
                .isInstanceOf(InvalidTradeTransitionException.class);
    }

    // ----- the two paths cannot cross -----

    @Test
    void humanTradeCannotEnterTheSmartPath() {
        for (TradeEvent e : TradeEvent.values()) {
            assertThatThrownBy(() -> sm.transition(TradeMode.HUMAN, WAITING_PAYMENT, e))
                    .isInstanceOf(InvalidTradeTransitionException.class);
        }
    }

    @Test
    void smartTradeCannotEnterTheHumanPath() {
        for (TradeState s : new TradeState[]{WAITING_ADMIN, IN_PROGRESS, WAITING_CLOSE_CONFIRM}) {
            for (TradeEvent e : TradeEvent.values()) {
                assertThatThrownBy(() -> sm.transition(TradeMode.SMART, s, e))
                        .isInstanceOf(InvalidTradeTransitionException.class);
            }
        }
    }

    @Test
    void twoArgOverloadStillMeansSmart() {
        assertThat(sm.transition(INITIATED, MAILBOX_PROVISIONED))
                .isEqualTo(WAITING_PAYMENT);
    }
```

Add `import uz.efbazaar.trade.trade.domain.TradeMode;` to the test's imports.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend/trade-service && mvn -q test -Dtest=TradeStateMachineTest`
Expected: compilation failure — no three-argument `transition`.

- [ ] **Step 3: Rewrite `TradeStateMachine` with one table per mode**

Replace the body of `trade/service/TradeStateMachine.java`:

```java
package uz.efbazaar.trade.trade.service;

import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;

import java.util.EnumMap;
import java.util.Map;

import static uz.efbazaar.trade.trade.domain.TradeEvent.*;
import static uz.efbazaar.trade.trade.domain.TradeState.*;

/**
 * Hand-rolled state machine — small and inspectable. Spring StateMachine is
 * overkill, and hiding transitions behind Spring config makes reviews harder.
 *
 * <p>There is one table per {@link TradeMode}. This is deliberate and stronger
 * than a shared table with runtime guards: a HUMAN trade has no
 * {@code WAITING_PAYMENT} row and so cannot enter the smart path, and a SMART
 * trade has no {@code IN_PROGRESS} row and so cannot enter the human path.
 * The two lifecycles are structurally incapable of crossing.
 *
 * <p>The only state whose row differs is {@code INITIATED}: the same
 * {@code MAILBOX_PROVISIONED} event leads to {@code WAITING_PAYMENT} under
 * SMART and {@code WAITING_ADMIN} under HUMAN.
 */
@Component
public class TradeStateMachine {

    private static final Map<TradeMode, Map<TradeState, Map<TradeEvent, TradeState>>> TABLES =
            buildTables();

    private static Map<TradeMode, Map<TradeState, Map<TradeEvent, TradeState>>> buildTables() {
        Map<TradeMode, Map<TradeState, Map<TradeEvent, TradeState>>> all =
                new EnumMap<>(TradeMode.class);
        all.put(TradeMode.SMART, smart());
        all.put(TradeMode.HUMAN, human());
        return all;
    }

    private static Map<TradeState, Map<TradeEvent, TradeState>> smart() {
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
        terminals(m);
        return m;
    }

    private static Map<TradeState, Map<TradeEvent, TradeState>> human() {
        Map<TradeState, Map<TradeEvent, TradeState>> m = new EnumMap<>(TradeState.class);
        m.put(INITIATED, Map.of(
                MAILBOX_PROVISIONED, WAITING_ADMIN
        ));
        m.put(WAITING_ADMIN, Map.of(
                ADMIN_ACCEPTED, IN_PROGRESS,
                // Self-loop: clears the assignment so the seller picks another.
                ADMIN_DECLINED, WAITING_ADMIN,
                TIMEOUT, ORPHANED
        ));
        m.put(IN_PROGRESS, Map.of(
                ADMIN_CLOSED, WAITING_CLOSE_CONFIRM,
                ADMIN_CANCELLED, REJECTED
                // No TIMEOUT on purpose — see the class javadoc of
                // TradeEscalationSweeper. state_deadline stays NULL here.
        ));
        m.put(WAITING_CLOSE_CONFIRM, Map.of(
                CLOSE_CONFIRMED, SUCCESS,
                // Silence is consent: the admin certified all six steps.
                TIMEOUT, SUCCESS
        ));
        terminals(m);
        return m;
    }

    private static void terminals(Map<TradeState, Map<TradeEvent, TradeState>> m) {
        m.put(SUCCESS, Map.of());
        m.put(REJECTED, Map.of());
        m.put(ORPHANED, Map.of());
    }

    public TradeState transition(TradeMode mode, TradeState current, TradeEvent event) {
        Map<TradeEvent, TradeState> row = TABLES.get(mode).get(current);
        TradeState next = row == null ? null : row.get(event);
        if (next == null) {
            throw new InvalidTradeTransitionException(current, event);
        }
        return next;
    }

    /** Backwards-compatible overload — SMART is the historical behaviour. */
    public TradeState transition(TradeState current, TradeEvent event) {
        return transition(TradeMode.SMART, current, event);
    }
}
```

Note the `row == null` guard: under HUMAN, `TABLES.get(HUMAN).get(WAITING_PAYMENT)` is `null`, and the old code would have thrown `NullPointerException` instead of the domain exception.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend/trade-service && mvn -q test -Dtest=TradeStateMachineTest`
Expected: PASS — the original 7 tests plus the 10 new ones.

- [ ] **Step 5: Pass the mode through `TradeService.transition`**

In `trade/service/TradeService.java`, in `transition(...)`, replace the single line that computes the next state:

```java
        TradeState to = sm.transition(t.getMode(), from, event);
```

Everything else in the method stays — the `MAILBOX_PROVISIONED` worker-only guard, `handler.onEnter`, the audit record, and the broadcast.

- [ ] **Step 6: Add the three human timeout properties**

In `src/main/resources/application.yml`, extend the `trade.timeouts` block (currently lines 67–72):

```yaml
  timeouts:
    waiting-payment-seconds: 1800
    waiting-email-change-seconds: 1800
    verifying-konami-link-seconds: 1800
    waiting-password-seconds: 1800
    waiting-buyer-verify-seconds: 86400
    # ----- human trade-admin mode -----
    # Nobody accepted the invitation → ORPHANED. Nothing has happened yet.
    human-waiting-admin-seconds: 86400
    # Admin closed, parties silent → SUCCESS (spec §3.8).
    human-close-confirm-seconds: 86400
    # Admin's last action was this long ago → escalate to a platform admin.
    # NOT a state_deadline: see TradeStateHandler.onEnter(IN_PROGRESS).
    human-admin-idle-seconds: 43200
```

- [ ] **Step 7: Add the mode gate and the new on-enter cases**

In `trade/service/TradeStateHandler.java`, add the three `@Value` fields next to the existing ones:

```java
    @Value("${trade.timeouts.human-waiting-admin-seconds}")     private long thwaS;
    @Value("${trade.timeouts.human-close-confirm-seconds}")     private long thccS;
    @Value("${trade.timeouts.human-admin-idle-seconds}")        private long thaiS;
```

Replace the `WAITING_EMAIL_CHANGE` and `VERIFYING_KONAMI_LINK` cases so their Kafka calls are mode-gated, and add the three new cases. The full `switch` becomes:

```java
        switch (newState) {
            case INITIATED -> {
                trade.setStateDeadline(null);
                // Both modes need an escrow mailbox — only the Konami/IMAP
                // automation is smart-only. Spec §3.2.
                events.emailProvisionRequest(trade.getId(), trade.getMailboxId());
            }
            case WAITING_PAYMENT -> trade.setStateDeadline(now(twpS));
            case WAITING_EMAIL_CHANGE -> {
                trade.setStateDeadline(now(twecS));
                if (trade.getMode() == TradeMode.SMART) {
                    var mb = mailboxes.getRaw(trade.getMailboxId());
                    events.imapPollRequest(trade.getId(), mb.getEmail(),
                            TradeEvents.ImapPurpose.WAIT_EMAIL_CHANGE_CODE);
                }
            }
            case VERIFYING_KONAMI_LINK -> {
                trade.setStateDeadline(now(tvklS));
                if (trade.getMode() == TradeMode.SMART && event != TradeEvent.RECHECK) {
                    var mb = mailboxes.getRaw(trade.getMailboxId());
                    events.forgotPasswordRequest(trade.getId(), mb.getEmail(), null);
                }
            }
            case WAITING_PASSWORD     -> trade.setStateDeadline(now(twpwS));
            case WAITING_BUYER_VERIFY -> trade.setStateDeadline(now(twbvS));

            // ----- human path -----

            case WAITING_ADMIN -> {
                trade.setStateDeadline(now(thwaS));
                // Re-entry via ADMIN_DECLINED clears the assignment so the
                // seller can invite somebody else.
                if (event == TradeEvent.ADMIN_DECLINED) {
                    trade.setAssignedAdminId(null);
                    trade.setAdminFeeUzs(null);
                }
                trade.setEscalationDeadlineAt(null);
            }
            case IN_PROGRESS -> {
                // MUST be null: TradeTimeoutScheduler fires TIMEOUT for every
                // non-terminal state with a due state_deadline, and IN_PROGRESS
                // has no TIMEOUT transition — it would throw every 10 seconds
                // forever. The idle watchdog lives in escalationDeadlineAt.
                trade.setStateDeadline(null);
                trade.setEscalationDeadlineAt(now(thaiS));
                if (trade.getAdminAcceptedAt() == null) {
                    trade.setAdminAcceptedAt(Instant.now());
                }
                // The admin needs to read the escrow inbox from mail.efbazaar.uz.
                // MailService authorises purely on ownership, so this is the
                // whole grant. Revoked by the rotate on any terminal state.
                mailboxes.assignOwner(trade.getMailboxId(), trade.getAssignedAdminId());
            }
            case WAITING_CLOSE_CONFIRM -> {
                trade.setStateDeadline(now(thccS));
                trade.setEscalationDeadlineAt(null);
                trade.setAdminClosedAt(Instant.now());
            }

            case SUCCESS -> {
                trade.setStateDeadline(null);
                trade.setEscalationDeadlineAt(null);
                trade.setTerminalReason(trade.getMode() == TradeMode.HUMAN
                        ? "ADMIN_CLOSED_CONFIRMED" : "BUYER_CONFIRMED");
                events.mailboxRotateRequest(trade.getMailboxId());
                mailboxes.assignOwner(trade.getMailboxId(), trade.getBuyerId());
                if (trade.getListingId() != null) {
                    events.listingSold(
                            trade.getListingId(),
                            trade.getBuyerId(),
                            trade.getSellerId(),
                            trade.getPriceUzs());
                }
                audit.record(trade.getId(), actor, actorId, "TRADE_SUCCESS",
                        Map.of("mailboxHandedTo", trade.getBuyerId().toString()));
            }
            case REJECTED -> {
                trade.setStateDeadline(null);
                trade.setEscalationDeadlineAt(null);
                trade.setTerminalReason(event == TradeEvent.ADMIN_CANCELLED
                        ? "ADMIN_CANCELLED" : "BUYER_REJECTED_OR_TIMEOUT");
                events.mailboxRotateRequest(trade.getMailboxId());
                mailboxes.assignOwner(trade.getMailboxId(), trade.getSellerId());
                audit.record(trade.getId(), actor, actorId, "TRADE_REJECTED",
                        Map.of("mailboxHandedTo", trade.getSellerId().toString()));
            }
            case ORPHANED -> {
                trade.setStateDeadline(null);
                trade.setEscalationDeadlineAt(null);
                trade.setTerminalReason("TIMEOUT_ORPHAN");
                mailboxes.stripFromTrade(trade.getMailboxId());
                audit.record(trade.getId(), actor, actorId, "TRADE_ORPHANED",
                        Map.of("actor", actor.name()));
            }
        }
```

Add `import uz.efbazaar.trade.trade.domain.TradeMode;`.

Both terminal cases keep firing `mailboxRotateRequest` unconditionally — that is what revokes the admin's mailbox access, so it must never be mode-gated.

Admin statistics (`completed_count`, `total_work_seconds`) are **not** updated here; Task 13 adds that through a narrow port so this class does not depend on the admin package.

- [ ] **Step 8: Write the side-effect integration test**

```java
package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Spec §16.1 regression guards. These are the tests that stop the Konami
 * automation from wandering into a human trade.
 */
@SpringBootTest
class HumanModeSideEffectsIT extends AbstractIntegrationIT {

    @Autowired TradeRepository trades;
    @Autowired TradeService tradeService;
    @Autowired MailboxService mailboxes;
    @SpyBean TradeEventPublisher events;

    private Trade humanTradeInState(TradeState state, UUID admin) {
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        return trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(state)
                .mailboxId(mailboxId)
                .mode(TradeMode.HUMAN)
                .assignedAdminId(admin)
                .adminFeeUzs(15_000L)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
    }

    @Test
    void acceptingGivesTheAdminTheMailboxAndStartsTheWorkTimer() {
        UUID admin = UUID.randomUUID();
        Trade t = humanTradeInState(TradeState.WAITING_ADMIN, admin);

        Trade after = tradeService.transition(t.getId(), TradeEvent.ADMIN_ACCEPTED,
                ActorType.TRADE_ADMIN, admin);

        assertThat(after.getState()).isEqualTo(TradeState.IN_PROGRESS);
        assertThat(after.getAdminAcceptedAt()).isNotNull();
        assertThat(mailboxes.getRaw(t.getMailboxId()).getOwnerUserId()).isEqualTo(admin);
    }

    @Test
    void inProgressCarriesNoStateDeadlineButAnEscalationDeadline() {
        UUID admin = UUID.randomUUID();
        Trade t = humanTradeInState(TradeState.WAITING_ADMIN, admin);

        Trade after = tradeService.transition(t.getId(), TradeEvent.ADMIN_ACCEPTED,
                ActorType.TRADE_ADMIN, admin);

        assertThat(after.getStateDeadline())
                .as("a state_deadline here makes the sweeper throw every 10s")
                .isNull();
        assertThat(after.getEscalationDeadlineAt()).isAfter(Instant.now());
    }

    @Test
    void humanTradeNeverTriggersKonamiOrImapAutomation() {
        UUID admin = UUID.randomUUID();
        Trade t = humanTradeInState(TradeState.WAITING_ADMIN, admin);

        tradeService.transition(t.getId(), TradeEvent.ADMIN_ACCEPTED,
                ActorType.TRADE_ADMIN, admin);
        tradeService.transition(t.getId(), TradeEvent.ADMIN_CLOSED,
                ActorType.TRADE_ADMIN, admin);
        tradeService.transition(t.getId(), TradeEvent.CLOSE_CONFIRMED,
                ActorType.SYSTEM, null);

        verify(events, never()).forgotPasswordRequest(any(), any(), any());
        verify(events, never()).imapPollRequest(any(), any(), any());
    }

    @Test
    void closingRevokesTheAdminMailboxAccess() {
        UUID admin = UUID.randomUUID();
        Trade t = humanTradeInState(TradeState.WAITING_ADMIN, admin);
        tradeService.transition(t.getId(), TradeEvent.ADMIN_ACCEPTED,
                ActorType.TRADE_ADMIN, admin);
        tradeService.transition(t.getId(), TradeEvent.ADMIN_CLOSED,
                ActorType.TRADE_ADMIN, admin);

        Trade done = tradeService.transition(t.getId(), TradeEvent.CLOSE_CONFIRMED,
                ActorType.SYSTEM, null);

        assertThat(done.getState()).isEqualTo(TradeState.SUCCESS);
        assertThat(done.getTerminalReason()).isEqualTo("ADMIN_CLOSED_CONFIRMED");
        verify(events).mailboxRotateRequest(eq(t.getMailboxId()));
        assertThat(mailboxes.getRaw(t.getMailboxId()).getOwnerUserId())
                .isEqualTo(done.getBuyerId());
    }

    @Test
    void declineClearsTheAssignmentAndStaysInWaitingAdmin() {
        UUID admin = UUID.randomUUID();
        Trade t = humanTradeInState(TradeState.WAITING_ADMIN, admin);

        Trade after = tradeService.transition(t.getId(), TradeEvent.ADMIN_DECLINED,
                ActorType.TRADE_ADMIN, admin);

        assertThat(after.getState()).isEqualTo(TradeState.WAITING_ADMIN);
        assertThat(after.getAssignedAdminId()).isNull();
        assertThat(after.getAdminFeeUzs()).isNull();
        assertThat(after.getStateDeadline()).isAfter(Instant.now());
    }

    @Test
    void adminCancelRejectsAndReturnsTheMailboxToTheSeller() {
        UUID admin = UUID.randomUUID();
        Trade t = humanTradeInState(TradeState.WAITING_ADMIN, admin);
        tradeService.transition(t.getId(), TradeEvent.ADMIN_ACCEPTED,
                ActorType.TRADE_ADMIN, admin);

        Trade after = tradeService.transition(t.getId(), TradeEvent.ADMIN_CANCELLED,
                ActorType.TRADE_ADMIN, admin);

        assertThat(after.getState()).isEqualTo(TradeState.REJECTED);
        assertThat(after.getTerminalReason()).isEqualTo("ADMIN_CANCELLED");
        assertThat(mailboxes.getRaw(t.getMailboxId()).getOwnerUserId())
                .isEqualTo(after.getSellerId());
    }
}
```

If `@SpyBean` is unavailable (it is deprecated in newer Spring Boot), use `@MockitoSpyBean` from `org.springframework.test.context.bean.override.mockito` instead — Boot 3.3.4 still ships `@SpyBean`, so start with that and only switch if the import fails.

- [ ] **Step 9: Run the integration test**

Run: `cd backend/trade-service && mvn verify -Dit.test=HumanModeSideEffectsIT`
Expected: PASS, 6 tests. The existing `TradeE2EIT` and `TradeTimeoutSchedulerIT` must also stay green — they exercise the smart path, which this task did not change.

- [ ] **Step 10: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateMachine.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateHandler.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java \
        backend/trade-service/src/main/resources/application.yml \
        backend/trade-service/src/test/java/uz/efbazaar/trade/trade/TradeStateMachineTest.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/admin/HumanModeSideEffectsIT.java
git commit -m "feat(trade): split transition tables by mode and gate smart-only side effects"
```

---

## Task 6: trade-service — admin profile CRUD and the auth summary client

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/config/AuthClientConfig.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/security/AuthSummaryClient.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/repository/TradeAdminProfileRepository.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/TradeAdminProfileUpsertRequest.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/TradeAdminProfileResponse.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeAdminStats.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeAdminProfileService.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/controller/TradeAdminProfileController.java`
- Modify: `backend/trade-service/src/main/resources/application.yml`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/admin/TradeAdminProfileControllerIT.java`

**Interfaces:**
- Consumes: `TradeAdminProfile` (Task 3).
- Produces:
  - `TradeAdminProfileRepository extends JpaRepository<TradeAdminProfile, UUID>` with `List<TradeAdminProfile> findByActiveTrueAndAcceptingOrdersTrue()`
  - `record TradeAdminProfileUpsertRequest(Long minFeeUzs, Long maxFeeUzs, String bio, Boolean acceptingOrders, Integer maxConcurrentTrades)`
  - `record TradeAdminProfileResponse(UUID userId, String displayName, long minFeeUzs, long maxFeeUzs, String bio, boolean acceptingOrders, int maxConcurrentTrades, boolean active, Double averageStars, int ratingCount, int completedCount, int abandonedCount, int cancelledCount, Long averageWorkSeconds)` plus `static TradeAdminProfileResponse of(TradeAdminProfile p, String displayName)`
  - `interface TradeAdminStats` with `void recordCompleted(UUID adminId, long workSeconds, long closeSeconds)`, `void recordAbandoned(UUID adminId)`, `void recordCancelled(UUID adminId)`, `void recordRating(UUID adminId, int stars)` — implemented by `TradeAdminProfileService`, consumed by Tasks 13/14/15
  - `TradeAdminProfileService.upsert(UUID userId, TradeAdminProfileUpsertRequest req)`, `.getOwn(UUID userId)`, `.getRaw(UUID userId)`, `.deactivate(UUID userId)`, `.requireHireable(UUID adminId, long feeUzs)`
  - `AuthSummaryClient.resolve(UUID)` → `Optional<UserSummary>`, `.resolveAll(Collection<UUID>)` → `Map<UUID, UserSummary>`
- The `TradeAdminStats` interface exists so `TradeStateHandler` can update statistics without importing the admin service — see the note at the end of Task 5.

**Context:** trade-service currently has **no** `RestClient` bean at all, so the auth client config has to be created, not just the client. The marketplace copy is the reference: 500 ms connect, 2 s read, fail-soft. Names are cosmetic — a slow auth-service must never fail a profile read.

`requireHireable` centralises the four checks that both the proposal path (Task 9) and the reassignment path (Task 15) need: profile exists, `active`, `acceptingOrders`, and the fee inside `[min, max]`.

- [ ] **Step 1: Write the failing controller test**

```java
package uz.efbazaar.trade.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.admin.dto.TradeAdminProfileUpsertRequest;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class TradeAdminProfileControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private static final String TRADE_ADMIN = "ROLE_TRADE_ADMIN";

    private String body(Long min, Long max, Integer concurrent) throws Exception {
        return json.writeValueAsString(new TradeAdminProfileUpsertRequest(
                min, max, "5 yillik tajriba", true, concurrent));
    }

    @Test
    void createsThenReadsBackOwnProfile() throws Exception {
        UUID admin = UUID.randomUUID();

        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(admin, "ROLE_USER", TRADE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(15_000L, 40_000L, 5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.minFeeUzs").value(15000))
                .andExpect(jsonPath("$.maxFeeUzs").value(40000))
                .andExpect(jsonPath("$.maxConcurrentTrades").value(5))
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.ratingCount").value(0))
                .andExpect(jsonPath("$.averageStars").doesNotExist());

        mvc.perform(get("/api/v1/trade-admins/me")
                        .with(asUser(admin, "ROLE_USER", TRADE_ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(admin.toString()))
                .andExpect(jsonPath("$.bio").value("5 yillik tajriba"));
    }

    @Test
    void secondPostUpdatesRatherThanDuplicating() throws Exception {
        UUID admin = UUID.randomUUID();

        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(admin, "ROLE_USER", TRADE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(15_000L, 40_000L, 3)))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(admin, "ROLE_USER", TRADE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(20_000L, 60_000L, 7)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.minFeeUzs").value(20000))
                .andExpect(jsonPath("$.maxConcurrentTrades").value(7));
    }

    @Test
    void missingProfileIsNotFound() throws Exception {
        mvc.perform(get("/api/v1/trade-admins/me")
                        .with(asUser(UUID.randomUUID(), "ROLE_USER", TRADE_ADMIN)))
                .andExpect(status().isNotFound());
    }

    @Test
    void plainUserCannotOwnAProfile() throws Exception {
        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(UUID.randomUUID(), "ROLE_USER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(15_000L, 40_000L, 3)))
                .andExpect(status().isForbidden());
    }

    @Test
    void invertedFeeRangeIsRejected() throws Exception {
        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(UUID.randomUUID(), "ROLE_USER", TRADE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(40_000L, 15_000L, 3)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void zeroMinimumFeeIsRejected() throws Exception {
        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(UUID.randomUUID(), "ROLE_USER", TRADE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(0L, 15_000L, 3)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void concurrencyAboveTwentyIsRejected() throws Exception {
        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(UUID.randomUUID(), "ROLE_USER", TRADE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(15_000L, 40_000L, 21)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void publicProfileIsReadableByAnyAuthenticatedUser() throws Exception {
        UUID admin = UUID.randomUUID();
        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(admin, "ROLE_USER", TRADE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(15_000L, 40_000L, 3)))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/trade-admins/" + admin)
                        .with(asUser(UUID.randomUUID(), "ROLE_USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(admin.toString()));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/trade-service && mvn verify -Dit.test=TradeAdminProfileControllerIT`
Expected: compilation failure — none of the DTOs or the controller exist.

- [ ] **Step 3: Create the auth client**

`config/AuthClientConfig.java`:

```java
package uz.efbazaar.trade.config;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * Server-to-server client for auth-service's {@code /internal/**} endpoints
 * (display names and avatars for the trade-admin catalogue). Same short-timeout
 * profile as marketplace-service's copy: callers are fail-soft, so a slow auth
 * must degrade the response rather than fail it.
 */
@Configuration
public class AuthClientConfig {

    @Bean
    @Qualifier("authClient")
    public RestClient authClient(@Value("${app.auth.internal-base-url:http://auth-service:8081}") String baseUrl,
                                 RestClient.Builder builder) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofMillis(500).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(2).toMillis());
        return builder
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
    }
}
```

`security/AuthSummaryClient.java`:

```java
package uz.efbazaar.trade.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Resolves display names and avatar availability via auth-service's
 * {@code POST /internal/auth/v1/users/summary/batch}. Mirrors
 * marketplace-service's client of the same name, including its fail-soft
 * posture: any error yields empty and the caller renders without identity.
 *
 * <p>trade-service never queries auth-service's database directly — that is a
 * hard project rule.
 */
@Slf4j
@Component
public class AuthSummaryClient {

    private static final String PATH = "/internal/auth/v1/users/summary/batch";
    private static final String HEADER = "X-Internal-Secret";
    private static final ParameterizedTypeReference<List<UserSummary>> RESPONSE_TYPE =
            new ParameterizedTypeReference<>() {};

    private final RestClient http;
    private final String secret;

    public AuthSummaryClient(@Qualifier("authClient") RestClient http,
                             @Value("${app.auth.internal-secret:}") String secret) {
        this.http = http;
        this.secret = secret;
    }

    public record UserSummary(
            UUID id,
            String displayName,
            String telegramUsername,
            Long telegramId,
            boolean verified,
            Instant createdAt,
            boolean photoAvailable) {}

    /** Empty when the id is unknown, the secret is unset, or auth is unreachable. */
    public Optional<UserSummary> resolve(UUID userId) {
        if (userId == null) return Optional.empty();
        return Optional.ofNullable(resolveAll(List.of(userId)).get(userId));
    }

    /**
     * Batch form used by the catalogue. Unknown ids are simply absent from the
     * returned map; the caller substitutes a placeholder label.
     */
    public Map<UUID, UserSummary> resolveAll(Collection<UUID> userIds) {
        if (userIds == null || userIds.isEmpty() || secret == null || secret.isBlank()) {
            return Map.of();
        }
        try {
            List<UserSummary> result = http.post()
                    .uri(PATH)
                    .header(HEADER, secret)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("ids", List.copyOf(userIds)))
                    .retrieve()
                    .body(RESPONSE_TYPE);
            if (result == null) return Map.of();
            return result.stream().collect(Collectors.toMap(UserSummary::id, Function.identity()));
        } catch (Exception e) {
            log.warn("Failed to resolve {} user summaries from auth-service: {}",
                    userIds.size(), e.toString());
            return Map.of();
        }
    }
}
```

Add to `src/main/resources/application.yml` at the top level (sibling of `trade:`):

```yaml
app:
  auth:
    internal-base-url: ${AUTH_INTERNAL_BASE_URL:http://auth-service:8081}
    internal-secret: ${AUTH_INTERNAL_SECRET:}
```

If an `app:` block already exists, add only the `auth:` subtree. The secret must match the one marketplace-service uses, and it lives in `.env`, never in git.

- [ ] **Step 4: Create the repository, DTOs and stats port**

`admin/repository/TradeAdminProfileRepository.java`:

```java
package uz.efbazaar.trade.admin.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;

import java.util.List;
import java.util.UUID;

public interface TradeAdminProfileRepository extends JpaRepository<TradeAdminProfile, UUID> {

    /** Catalogue candidates before capacity filtering. Admin count is small (tens). */
    List<TradeAdminProfile> findByActiveTrueAndAcceptingOrdersTrue();
}
```

`admin/dto/TradeAdminProfileUpsertRequest.java`:

```java
package uz.efbazaar.trade.admin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Admin's own settings. The fee range is a negotiation band, not a price:
 * the per-trade amount is agreed inside it and paid off-platform.
 */
public record TradeAdminProfileUpsertRequest(

        @NotNull @Min(1)
        Long minFeeUzs,

        @NotNull @Min(1)
        Long maxFeeUzs,

        @Size(max = 500)
        String bio,

        @NotNull
        Boolean acceptingOrders,

        @NotNull @Min(1) @Max(20)
        Integer maxConcurrentTrades
) {
    /** Cross-field rule the annotations cannot express. */
    public boolean isRangeValid() {
        return minFeeUzs != null && maxFeeUzs != null && maxFeeUzs >= minFeeUzs;
    }
}
```

`admin/dto/TradeAdminProfileResponse.java`:

```java
package uz.efbazaar.trade.admin.dto;

import uz.efbazaar.trade.admin.domain.TradeAdminProfile;

import java.util.UUID;

/**
 * Full profile view — the admin's own settings page and the public profile
 * page use the same shape. Built by a static factory rather than MapStruct
 * because two of the fields are computed and one comes from auth-service.
 */
public record TradeAdminProfileResponse(
        UUID userId,
        String displayName,
        long minFeeUzs,
        long maxFeeUzs,
        String bio,
        boolean acceptingOrders,
        int maxConcurrentTrades,
        boolean active,
        /** {@code null} until somebody rates. */
        Double averageStars,
        int ratingCount,
        int completedCount,
        int abandonedCount,
        int cancelledCount,
        /** Mean seconds from accepting to pressing close; {@code null} before the first close. */
        Long averageWorkSeconds
) {
    public static TradeAdminProfileResponse of(TradeAdminProfile p, String displayName) {
        return new TradeAdminProfileResponse(
                p.getUserId(),
                displayName,
                p.getMinFeeUzs(),
                p.getMaxFeeUzs(),
                p.getBio(),
                p.isAcceptingOrders(),
                p.getMaxConcurrentTrades(),
                p.isActive(),
                p.averageStars(),
                p.getRatingCount(),
                p.getCompletedCount(),
                p.getAbandonedCount(),
                p.getCancelledCount(),
                p.averageWorkSeconds());
    }
}
```

`admin/service/TradeAdminStats.java`:

```java
package uz.efbazaar.trade.admin.service;

import java.util.UUID;

/**
 * Narrow write port for admin statistics.
 *
 * <p>Exists so {@code TradeStateHandler} — which lives in the trade package and
 * is the single funnel for every state entry, including scheduler-driven ones —
 * can update counters without importing the admin service and creating a
 * dependency cycle.
 */
public interface TradeAdminStats {

    /**
     * @param workSeconds  accepted → admin pressed close (what the catalogue shows)
     * @param closeSeconds accepted → SUCCESS (includes the parties' confirm latency)
     */
    void recordCompleted(UUID adminId, long workSeconds, long closeSeconds);

    /** Admin went quiet and a platform admin reassigned the trade away. */
    void recordAbandoned(UUID adminId);

    /** Admin aborted the trade themselves — e.g. the account was fake. */
    void recordCancelled(UUID adminId);

    /** One party left a 1–5 star rating. Never called on hide (spec §10). */
    void recordRating(UUID adminId, int stars);
}
```

- [ ] **Step 5: Create the service**

`admin/service/TradeAdminProfileService.java`:

```java
package uz.efbazaar.trade.admin.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.dto.TradeAdminProfileResponse;
import uz.efbazaar.trade.admin.dto.TradeAdminProfileUpsertRequest;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.security.AuthSummaryClient;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class TradeAdminProfileService implements TradeAdminStats {

    private final TradeAdminProfileRepository profiles;
    private final AuthSummaryClient authSummaries;

    @Transactional
    public TradeAdminProfileResponse upsert(UUID userId, TradeAdminProfileUpsertRequest req) {
        if (!req.isRangeValid()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Maksimal haq minimaldan kichik bo'lishi mumkin emas");
        }
        TradeAdminProfile p = profiles.findById(userId)
                .orElseGet(() -> TradeAdminProfile.builder().userId(userId).build());

        p.setMinFeeUzs(req.minFeeUzs());
        p.setMaxFeeUzs(req.maxFeeUzs());
        p.setBio(req.bio());
        p.setAcceptingOrders(req.acceptingOrders());
        p.setMaxConcurrentTrades(req.maxConcurrentTrades());
        // `active` is not settable here — only auth-service's role event and a
        // platform admin change it. An admin cannot re-activate themselves
        // after losing the role.

        profiles.save(p);
        return toResponse(p);
    }

    @Transactional(readOnly = true)
    public TradeAdminProfileResponse getOwn(UUID userId) {
        return toResponse(getRaw(userId));
    }

    /** Public profile. Same shape — nothing in it is private. */
    @Transactional(readOnly = true)
    public TradeAdminProfileResponse getPublic(UUID userId) {
        return toResponse(getRaw(userId));
    }

    @Transactional(readOnly = true)
    public TradeAdminProfile getRaw(UUID userId) {
        return profiles.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Trade admin profile " + userId));
    }

    /**
     * Every check the hiring paths share: the profile exists, the admin is
     * still allowed to work, is currently taking orders, and the proposed fee
     * sits inside their advertised band.
     *
     * <p>Capacity is deliberately NOT checked here — it binds when the admin
     * accepts, not when they are invited (spec §9.5).
     */
    @Transactional(readOnly = true)
    public TradeAdminProfile requireHireable(UUID adminId, long feeUzs) {
        TradeAdminProfile p = profiles.findById(adminId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Bunday savdo admini topilmadi"));
        if (!p.isActive()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu admin endi savdo admini emas");
        }
        if (!p.isAcceptingOrders()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu admin hozir yangi savdo qabul qilmayapti");
        }
        if (feeUzs < p.getMinFeeUzs() || feeUzs > p.getMaxFeeUzs()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Haq %d–%d so'm oralig'ida bo'lishi kerak"
                            .formatted(p.getMinFeeUzs(), p.getMaxFeeUzs()));
        }
        return p;
    }

    /** Called by the auth role-changed consumer (Task 7). Idempotent. */
    @Transactional
    public void deactivate(UUID userId) {
        profiles.findById(userId).ifPresent(p -> {
            if (p.isActive()) {
                p.setActive(false);
                profiles.save(p);
                log.info("Deactivated trade admin profile {} — role revoked", userId);
            }
        });
    }

    /** Called when auth-service reports the role was granted back. Idempotent. */
    @Transactional
    public void reactivate(UUID userId) {
        profiles.findById(userId).ifPresent(p -> {
            if (!p.isActive()) {
                p.setActive(true);
                profiles.save(p);
                log.info("Reactivated trade admin profile {} — role granted", userId);
            }
        });
    }

    // ----- TradeAdminStats -----

    @Override
    @Transactional
    public void recordCompleted(UUID adminId, long workSeconds, long closeSeconds) {
        profiles.findById(adminId).ifPresent(p -> {
            p.setCompletedCount(p.getCompletedCount() + 1);
            p.setTotalWorkSeconds(p.getTotalWorkSeconds() + Math.max(0, workSeconds));
            p.setTotalCloseSeconds(p.getTotalCloseSeconds() + Math.max(0, closeSeconds));
            profiles.save(p);
        });
    }

    @Override
    @Transactional
    public void recordAbandoned(UUID adminId) {
        profiles.findById(adminId).ifPresent(p -> {
            p.setAbandonedCount(p.getAbandonedCount() + 1);
            profiles.save(p);
        });
    }

    @Override
    @Transactional
    public void recordCancelled(UUID adminId) {
        profiles.findById(adminId).ifPresent(p -> {
            p.setCancelledCount(p.getCancelledCount() + 1);
            profiles.save(p);
        });
    }

    @Override
    @Transactional
    public void recordRating(UUID adminId, int stars) {
        profiles.findById(adminId).ifPresent(p -> {
            p.setRatingSum(p.getRatingSum() + stars);
            p.setRatingCount(p.getRatingCount() + 1);
            profiles.save(p);
        });
    }

    private TradeAdminProfileResponse toResponse(TradeAdminProfile p) {
        String name = authSummaries.resolve(p.getUserId())
                .map(AuthSummaryClient.UserSummary::displayName)
                .orElse(null);
        return TradeAdminProfileResponse.of(p, name);
    }
}
```

`Math.max(0, …)` on the durations guards against a clock skew producing a negative interval, which would silently corrupt the average.

- [ ] **Step 6: Create the controller**

`admin/controller/TradeAdminProfileController.java`:

```java
package uz.efbazaar.trade.admin.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.admin.dto.TradeAdminProfileResponse;
import uz.efbazaar.trade.admin.dto.TradeAdminProfileUpsertRequest;
import uz.efbazaar.trade.admin.service.TradeAdminProfileService;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.UUID;

/**
 * The admin's own settings plus the public profile page.
 *
 * <p>Both {@code /me} and {@code /{userId}} live in this one class on purpose:
 * Spring resolves the literal segment before the template only when they are
 * mapped together, and {@code /me} would otherwise fail UUID conversion.
 *
 * <p>Update is {@code POST}, not {@code PUT}: the nginx location that routes
 * this path carries {@code limit_except GET POST DELETE OPTIONS}, so PUT and
 * PATCH are denied at the edge (spec §12.4).
 */
@RestController
@RequestMapping("/api/v1/trade-admins")
@RequiredArgsConstructor
public class TradeAdminProfileController {

    private final TradeAdminProfileService profiles;

    @GetMapping("/me")
    @PreAuthorize("hasAuthority('ROLE_TRADE_ADMIN')")
    public TradeAdminProfileResponse getMine(@AuthenticationPrincipal AuthenticatedUser me) {
        return profiles.getOwn(me.userId());
    }

    @PostMapping("/me")
    @PreAuthorize("hasAuthority('ROLE_TRADE_ADMIN')")
    public TradeAdminProfileResponse upsertMine(@AuthenticationPrincipal AuthenticatedUser me,
                                                @Valid @RequestBody TradeAdminProfileUpsertRequest req) {
        return profiles.upsert(me.userId(), req);
    }

    @GetMapping("/{userId}")
    public TradeAdminProfileResponse getPublic(@PathVariable UUID userId) {
        return profiles.getPublic(userId);
    }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend/trade-service && mvn verify -Dit.test=TradeAdminProfileControllerIT`
Expected: PASS, 8 tests.

If `missingProfileIsNotFound` returns 500 instead of 404, the central `@ControllerAdvice` does not yet map `EntityNotFoundException`. Check `common/exception/` — the existing `MailboxControllerIT` relies on the same mapping, so it is almost certainly there; if not, add the mapping there rather than catching in the controller.

- [ ] **Step 8: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/config/AuthClientConfig.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/security/AuthSummaryClient.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/ \
        backend/trade-service/src/main/resources/application.yml \
        backend/trade-service/src/test/java/uz/efbazaar/trade/admin/TradeAdminProfileControllerIT.java
git commit -m "feat(trade): add trade admin profile CRUD and auth summary client"
```

---

## Task 7: trade-service — consume `user-role-changed`

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/UserRoleChangedConsumer.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/UserRoleChangedDto.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/admin/UserRoleChangedConsumerIT.java`

**Interfaces:**
- Consumes: topic `efbazaar.auth.user-role-changed` with fields `userId`, `oldRole`, `newRole`, `occurredAt` (Task 2); `TradeAdminProfileService.deactivate/reactivate` (Task 6).
- Produces: nothing other services depend on.

**Context:** Without this, a revoked admin stays in the catalogue forever. The DTO is local to trade-service — deliberately not a shared library, matching how `TradeProposalConsumer` in marketplace declares its own DTO for a trade-service topic.

`groupId` follows the existing convention `trade-service-<topic-suffix>`.

- [ ] **Step 1: Write the failing test**

```java
package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.kafka.UserRoleChangedConsumer;
import uz.efbazaar.trade.kafka.UserRoleChangedDto;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class UserRoleChangedConsumerIT extends AbstractIntegrationIT {

    @Autowired TradeAdminProfileRepository profiles;
    @Autowired UserRoleChangedConsumer consumer;

    private UUID profileFor(boolean active) {
        UUID id = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(id)
                .minFeeUzs(15_000)
                .maxFeeUzs(40_000)
                .active(active)
                .build());
        return id;
    }

    @Test
    void losingTheRoleDeactivatesTheProfile() {
        UUID admin = profileFor(true);

        consumer.onRoleChanged(new UserRoleChangedDto(
                admin, "TRADE_ADMIN", "USER", Instant.now()));

        assertThat(profiles.findById(admin).orElseThrow().isActive()).isFalse();
    }

    @Test
    void regainingTheRoleReactivatesTheProfile() {
        UUID admin = profileFor(false);

        consumer.onRoleChanged(new UserRoleChangedDto(
                admin, "USER", "TRADE_ADMIN", Instant.now()));

        assertThat(profiles.findById(admin).orElseThrow().isActive()).isTrue();
    }

    @Test
    void ratingHistorySurvivesDeactivation() {
        UUID admin = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(admin)
                .minFeeUzs(15_000)
                .maxFeeUzs(40_000)
                .ratingSum(24)
                .ratingCount(6)
                .completedCount(6)
                .build());

        consumer.onRoleChanged(new UserRoleChangedDto(
                admin, "TRADE_ADMIN", "USER", Instant.now()));

        TradeAdminProfile after = profiles.findById(admin).orElseThrow();
        assertThat(after.isActive()).isFalse();
        assertThat(after.getRatingCount()).isEqualTo(6);
        assertThat(after.averageStars()).isEqualTo(4.0);
    }

    @Test
    void unrelatedRoleChangeIsIgnored() {
        UUID admin = profileFor(true);

        // USER → ADMIN: nothing to do with trade admins.
        consumer.onRoleChanged(new UserRoleChangedDto(
                admin, "USER", "ADMIN", Instant.now()));

        assertThat(profiles.findById(admin).orElseThrow().isActive()).isFalse();
    }

    @Test
    void eventForSomebodyWithNoProfileIsHarmless() {
        consumer.onRoleChanged(new UserRoleChangedDto(
                UUID.randomUUID(), "TRADE_ADMIN", "USER", Instant.now()));
        // No exception is the assertion.
    }
}
```

Note `unrelatedRoleChangeIsIgnored` expects `active = false`: moving to `ADMIN` also means the user is no longer a trade admin, so deactivation is correct. The rule is simply "`newRole == TRADE_ADMIN` ? reactivate : deactivate".

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/trade-service && mvn verify -Dit.test=UserRoleChangedConsumerIT`
Expected: compilation failure — consumer and DTO do not exist.

- [ ] **Step 3: Create the DTO**

`kafka/UserRoleChangedDto.java`:

```java
package uz.efbazaar.trade.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Local mirror of auth-service's {@code efbazaar.auth.user-role-changed}
 * payload. Declared here rather than shared, matching how marketplace-service
 * declares its own DTOs for trade-service topics — services stay
 * independently deployable.
 *
 * <p>Roles are plain strings so this compiles without auth-service's enum.
 */
public record UserRoleChangedDto(
        UUID userId,
        String oldRole,
        String newRole,
        Instant occurredAt) {

    public static final String TRADE_ADMIN = "TRADE_ADMIN";

    public boolean grantsTradeAdmin() {
        return TRADE_ADMIN.equals(newRole);
    }
}
```

- [ ] **Step 4: Create the consumer**

`kafka/UserRoleChangedConsumer.java`:

```java
package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.admin.service.TradeAdminProfileService;

/**
 * Keeps the admin catalogue honest about who is still allowed to work.
 *
 * <p>Profiles are deactivated, never deleted — the rating history has to
 * survive so a re-granted admin does not come back with a clean slate.
 *
 * <p>Idempotent: replays land on the same boolean.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UserRoleChangedConsumer {

    private final TradeAdminProfileService profiles;

    @KafkaListener(
            topics = "efbazaar.auth.user-role-changed",
            groupId = "trade-service-user-role-changed",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.UserRoleChangedDto"}
    )
    public void onRoleChanged(UserRoleChangedDto e) {
        if (e == null || e.userId() == null) {
            log.warn("user-role-changed with no userId, skipping");
            return;
        }
        if (e.grantsTradeAdmin()) {
            profiles.reactivate(e.userId());
        } else {
            profiles.deactivate(e.userId());
        }
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend/trade-service && mvn verify -Dit.test=UserRoleChangedConsumerIT`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/UserRoleChangedConsumer.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/UserRoleChangedDto.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/admin/UserRoleChangedConsumerIT.java
git commit -m "feat(trade): drop revoked trade admins from the catalogue on role change"
```

---

## Task 8: trade-service — catalogue, presence and capacity

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/presence/PresenceQuery.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/presence/RedisPresenceQuery.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/presence/PresenceTouchInterceptor.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/config/WebMvcConfig.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/TradeAdminCardResponse.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeAdminCatalogService.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/controller/TradeAdminCatalogController.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeRepository.java`
- Modify: `backend/trade-service/src/main/resources/application.yml`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/admin/RedisPresenceQueryIT.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/admin/TradeAdminCatalogControllerIT.java`

**Interfaces:**
- Consumes: `TradeAdminProfileRepository`, `AuthSummaryClient` (Task 6); `TradeState.nonTerminal()` (Task 3).
- Produces:
  - `interface PresenceQuery { Map<UUID, Presence> of(Collection<UUID> userIds); record Presence(boolean online, Instant lastSeenAt) {} }`
  - `record TradeAdminCardResponse(UUID userId, String displayName, boolean photoAvailable, Double averageStars, int ratingCount, Long averageWorkSeconds, long minFeeUzs, long maxFeeUzs, boolean online, Instant lastSeenAt, int activeTrades, int maxConcurrentTrades, boolean busy)`
  - `TradeAdminCatalogService.search(String q, CatalogSort sort)` → `List<TradeAdminCardResponse>`
  - `enum TradeAdminCatalogService.CatalogSort { DEFAULT, RATING, SPEED, FEE_ASC }`
  - `int TradeRepository.countActiveByAdmin(UUID adminId)` — used again by Task 10's capacity check

**Context:** Full global presence is a separate spec. Here `PresenceQuery` is the seam: a Redis key with a TTL, written by an interceptor on every authenticated trade-service request. When the global presence spec lands, only `RedisPresenceQuery` is replaced — the catalogue does not change. Redis rather than a `last_seen_at` column because a column means one row write per request on a hot path (spec §9.3).

Admin count is small (tens), so search resolves names for all candidates and filters in memory. That avoids a new auth-service endpoint. The resolved name map is cached in Redis for 60 s.

`busy` is computed, not stored: `activeTrades >= maxConcurrentTrades`. Busy admins are returned but flagged, so the UI can grey them out rather than silently hiding somebody the seller was looking for.

- [ ] **Step 1: Write the failing presence test**

```java
package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.admin.presence.PresenceQuery;
import uz.efbazaar.trade.admin.presence.RedisPresenceQuery;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class RedisPresenceQueryIT extends AbstractIntegrationIT {

    @Autowired RedisPresenceQuery presence;

    @Test
    void touchedUserIsOnline() {
        UUID user = UUID.randomUUID();
        presence.touch(user);

        PresenceQuery.Presence p = presence.of(List.of(user)).get(user);

        assertThat(p).isNotNull();
        assertThat(p.online()).isTrue();
        assertThat(p.lastSeenAt()).isNotNull();
    }

    @Test
    void untouchedUserIsOfflineWithNoLastSeen() {
        UUID user = UUID.randomUUID();

        PresenceQuery.Presence p = presence.of(List.of(user)).get(user);

        assertThat(p).isNotNull();
        assertThat(p.online()).isFalse();
        assertThat(p.lastSeenAt()).isNull();
    }

    @Test
    void batchLookupReturnsAnEntryForEveryRequestedId() {
        UUID online = UUID.randomUUID(), offline = UUID.randomUUID();
        presence.touch(online);

        var result = presence.of(List.of(online, offline));

        assertThat(result).containsOnlyKeys(online, offline);
        assertThat(result.get(online).online()).isTrue();
        assertThat(result.get(offline).online()).isFalse();
    }

    @Test
    void emptyRequestDoesNotHitRedis() {
        assertThat(presence.of(List.of())).isEmpty();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/trade-service && mvn verify -Dit.test=RedisPresenceQueryIT`
Expected: compilation failure — the presence classes do not exist.

- [ ] **Step 3: Create the presence port and implementation**

`admin/presence/PresenceQuery.java`:

```java
package uz.efbazaar.trade.admin.presence;

import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * How the admin catalogue learns who is around.
 *
 * <p>Deliberately a port. This iteration ships a stopgap backed by a Redis key
 * with a TTL, refreshed on every authenticated trade-service request — good
 * enough to sort the catalogue, and scoped to trade-service only. The separate
 * global-presence spec (WebSocket, every user, all services) replaces the
 * implementation without touching the catalogue.
 */
public interface PresenceQuery {

    /**
     * One entry per requested id — never a partial map, so callers do not have
     * to null-check. Unknown users come back offline with a {@code null}
     * {@code lastSeenAt}.
     */
    Map<UUID, Presence> of(Collection<UUID> userIds);

    record Presence(boolean online, Instant lastSeenAt) {
        public static Presence offline() {
            return new Presence(false, null);
        }
    }
}
```

`admin/presence/RedisPresenceQuery.java`:

```java
package uz.efbazaar.trade.admin.presence;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Presence as a Redis key with a TTL: {@code presence:{userId}} holding the
 * epoch-millis of the last request. Online means the key still exists.
 *
 * <p>No Postgres column, on purpose: writing {@code last_seen_at} on every
 * request would add a row update to every hot-path call.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RedisPresenceQuery implements PresenceQuery {

    private static final String PREFIX = "presence:";

    private final StringRedisTemplate redis;

    @Value("${trade.presence.online-ttl-seconds:120}")
    private long onlineTtlSeconds;

    /** Called by {@link PresenceTouchInterceptor} once per authenticated request. */
    public void touch(UUID userId) {
        if (userId == null) return;
        try {
            redis.opsForValue().set(
                    PREFIX + userId,
                    Long.toString(Instant.now().toEpochMilli()),
                    Duration.ofSeconds(onlineTtlSeconds));
        } catch (RuntimeException e) {
            // Presence is cosmetic — never fail a request over it.
            log.debug("presence touch failed for {}: {}", userId, e.toString());
        }
    }

    @Override
    public Map<UUID, Presence> of(Collection<UUID> userIds) {
        if (userIds == null || userIds.isEmpty()) return Map.of();

        List<UUID> ids = List.copyOf(userIds);
        Map<UUID, Presence> out = new HashMap<>(ids.size());
        List<String> keys = ids.stream().map(id -> PREFIX + id).toList();

        List<String> values;
        try {
            values = redis.opsForValue().multiGet(keys);
        } catch (RuntimeException e) {
            log.debug("presence lookup failed, reporting everybody offline: {}", e.toString());
            ids.forEach(id -> out.put(id, Presence.offline()));
            return out;
        }

        for (int i = 0; i < ids.size(); i++) {
            String raw = values == null ? null : values.get(i);
            if (raw == null) {
                out.put(ids.get(i), Presence.offline());
                continue;
            }
            Instant lastSeen;
            try {
                lastSeen = Instant.ofEpochMilli(Long.parseLong(raw));
            } catch (NumberFormatException e) {
                lastSeen = null;
            }
            out.put(ids.get(i), new Presence(true, lastSeen));
        }
        return out;
    }
}
```

`admin/presence/PresenceTouchInterceptor.java`:

```java
package uz.efbazaar.trade.admin.presence;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import uz.efbazaar.trade.security.AuthenticatedUser;

/**
 * Refreshes the caller's presence key after each authenticated request.
 *
 * <p>Runs in {@code afterCompletion} so it never delays the response, and reads
 * the identity from the security context rather than the raw header so it
 * agrees with {@code HeaderAuthenticationFilter} on what counts as authenticated.
 */
@Component
@RequiredArgsConstructor
public class PresenceTouchInterceptor implements HandlerInterceptor {

    private final RedisPresenceQuery presence;

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AuthenticatedUser me) {
            presence.touch(me.userId());
        }
    }
}
```

`config/WebMvcConfig.java`:

```java
package uz.efbazaar.trade.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import uz.efbazaar.trade.admin.presence.PresenceTouchInterceptor;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final PresenceTouchInterceptor presenceTouch;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Health and swagger are excluded so an uptime probe cannot make a
        // logged-out admin look online.
        registry.addInterceptor(presenceTouch)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/v1/ping");
    }
}
```

Add to `application.yml` under `trade:`:

```yaml
  presence:
    # A user is "online" if they hit trade-service within this window.
    # Replaced wholesale by the global presence spec.
    online-ttl-seconds: 120
  admin-catalog:
    name-cache-ttl-seconds: 60
```

- [ ] **Step 4: Run the presence test to verify it passes**

Run: `cd backend/trade-service && mvn verify -Dit.test=RedisPresenceQueryIT`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the active-trade count query**

In `trade/repository/TradeRepository.java`:

```java
    /**
     * How many non-terminal trades this admin is currently running. Feeds the
     * catalogue's busy flag and the capacity check when an admin accepts.
     */
    @Query("""
            SELECT COUNT(t) FROM Trade t
             WHERE t.assignedAdminId = :adminId
               AND t.state NOT IN (uz.efbazaar.trade.trade.domain.TradeState.SUCCESS,
                                   uz.efbazaar.trade.trade.domain.TradeState.REJECTED,
                                   uz.efbazaar.trade.trade.domain.TradeState.ORPHANED)
            """)
    int countActiveByAdmin(@Param("adminId") UUID adminId);
```

- [ ] **Step 6: Write the failing catalogue test**

```java
package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class TradeAdminCatalogControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired TradeRepository trades;

    private UUID admin(boolean active, boolean accepting, int concurrent,
                       int ratingSum, int ratingCount) {
        UUID id = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(id)
                .minFeeUzs(15_000)
                .maxFeeUzs(40_000)
                .active(active)
                .acceptingOrders(accepting)
                .maxConcurrentTrades(concurrent)
                .ratingSum(ratingSum)
                .ratingCount(ratingCount)
                .completedCount(ratingCount)
                .totalWorkSeconds(ratingCount * 3600L)
                .build());
        return id;
    }

    private void giveActiveTrade(UUID adminId) {
        trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(TradeState.IN_PROGRESS)
                .mailboxId(UUID.randomUUID())
                .mode(TradeMode.HUMAN)
                .assignedAdminId(adminId)
                .adminFeeUzs(20_000L)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
    }

    @Test
    void listsOnlyActiveAcceptingAdmins() throws Exception {
        UUID visible  = admin(true,  true,  3, 20, 4);
        UUID revoked  = admin(false, true,  3, 25, 5);
        UUID paused   = admin(true,  false, 3, 25, 5);

        mvc.perform(get("/api/v1/trade-admins").with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.userId=='" + visible + "')]").exists())
                .andExpect(jsonPath("$[?(@.userId=='" + revoked + "')]").doesNotExist())
                .andExpect(jsonPath("$[?(@.userId=='" + paused + "')]").doesNotExist());
    }

    @Test
    void exposesAverageStarsAndWorkSeconds() throws Exception {
        UUID a = admin(true, true, 3, 20, 4);   // 5.0 stars, 3600s per trade

        mvc.perform(get("/api/v1/trade-admins").with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.userId=='" + a + "')].averageStars").value(5.0))
                .andExpect(jsonPath("$[?(@.userId=='" + a + "')].averageWorkSeconds").value(3600));
    }

    @Test
    void unratedAdminHasNullAverages() throws Exception {
        UUID fresh = admin(true, true, 3, 0, 0);

        mvc.perform(get("/api/v1/trade-admins").with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.userId=='" + fresh + "')].averageStars")
                        .isEmpty())
                .andExpect(jsonPath("$[?(@.userId=='" + fresh + "')].averageWorkSeconds")
                        .isEmpty());
    }

    @Test
    void fullAdminIsReturnedButFlaggedBusy() throws Exception {
        UUID full = admin(true, true, 1, 20, 4);
        giveActiveTrade(full);

        mvc.perform(get("/api/v1/trade-admins").with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.userId=='" + full + "')].busy").value(true))
                .andExpect(jsonPath("$[?(@.userId=='" + full + "')].activeTrades").value(1));
    }

    @Test
    void higherRatedAdminSortsFirstByDefault() throws Exception {
        UUID low  = admin(true, true, 3, 6, 3);    // 2.0
        UUID high = admin(true, true, 3, 15, 3);   // 5.0

        mvc.perform(get("/api/v1/trade-admins").with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].userId").value(high.toString()))
                .andExpect(jsonPath("$[?(@.userId=='" + low + "')]").exists());
    }

    @Test
    void feeAscSortPutsTheCheapestFirst() throws Exception {
        UUID cheap = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(cheap).minFeeUzs(5_000).maxFeeUzs(9_000).build());
        admin(true, true, 3, 15, 3);

        mvc.perform(get("/api/v1/trade-admins?sort=FEE_ASC")
                        .with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].userId").value(cheap.toString()));
    }

    @Test
    void unknownSortValueIsRejected() throws Exception {
        mvc.perform(get("/api/v1/trade-admins?sort=CHEAPEST")
                        .with(asUser(UUID.randomUUID())))
                .andExpect(status().isBadRequest());
    }
}
```

`unratedAdminHasNullAverages` uses `.isEmpty()` because a JSONPath filter over a missing field yields an empty array rather than `null`.

- [ ] **Step 7: Create the card DTO, service and controller**

`admin/dto/TradeAdminCardResponse.java`:

```java
package uz.efbazaar.trade.admin.dto;

import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.presence.PresenceQuery;
import uz.efbazaar.trade.security.AuthSummaryClient;

import java.time.Instant;
import java.util.UUID;

/** One card in the hire-an-admin list. */
public record TradeAdminCardResponse(
        UUID userId,
        String displayName,
        boolean photoAvailable,
        Double averageStars,
        int ratingCount,
        Long averageWorkSeconds,
        long minFeeUzs,
        long maxFeeUzs,
        boolean online,
        Instant lastSeenAt,
        int activeTrades,
        int maxConcurrentTrades,
        /** {@code activeTrades >= maxConcurrentTrades} — greyed out, not hidden. */
        boolean busy
) {
    public static TradeAdminCardResponse of(TradeAdminProfile p,
                                            AuthSummaryClient.UserSummary summary,
                                            PresenceQuery.Presence presence,
                                            int activeTrades) {
        return new TradeAdminCardResponse(
                p.getUserId(),
                summary == null ? null : summary.displayName(),
                summary != null && summary.photoAvailable(),
                p.averageStars(),
                p.getRatingCount(),
                p.averageWorkSeconds(),
                p.getMinFeeUzs(),
                p.getMaxFeeUzs(),
                presence != null && presence.online(),
                presence == null ? null : presence.lastSeenAt(),
                activeTrades,
                p.getMaxConcurrentTrades(),
                activeTrades >= p.getMaxConcurrentTrades());
    }
}
```

`admin/service/TradeAdminCatalogService.java`:

```java
package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.dto.TradeAdminCardResponse;
import uz.efbazaar.trade.admin.presence.PresenceQuery;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.security.AuthSummaryClient;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The hire-an-admin list.
 *
 * <p>Admin count is small (tens), so this resolves names for every candidate
 * and filters by name in memory rather than adding a search endpoint to
 * auth-service. If the population ever reaches thousands this is the first
 * thing to revisit.
 */
@Service
@RequiredArgsConstructor
public class TradeAdminCatalogService {

    /** Ordering options offered to the seller. */
    public enum CatalogSort {
        /** Online first, then rating, then speed. */
        DEFAULT,
        RATING,
        /** Fastest average work time first; unrated/unmeasured last. */
        SPEED,
        FEE_ASC
    }

    private final TradeAdminProfileRepository profiles;
    private final TradeRepository trades;
    private final AuthSummaryClient authSummaries;
    private final PresenceQuery presence;

    @Transactional(readOnly = true)
    public List<TradeAdminCardResponse> search(String q, CatalogSort sort) {
        List<TradeAdminProfile> candidates = profiles.findByActiveTrueAndAcceptingOrdersTrue();
        if (candidates.isEmpty()) return List.of();

        List<UUID> ids = candidates.stream().map(TradeAdminProfile::getUserId).toList();
        Map<UUID, AuthSummaryClient.UserSummary> names = authSummaries.resolveAll(ids);
        Map<UUID, PresenceQuery.Presence> online = presence.of(ids);

        List<TradeAdminCardResponse> cards = candidates.stream()
                .map(p -> TradeAdminCardResponse.of(
                        p,
                        names.get(p.getUserId()),
                        online.get(p.getUserId()),
                        trades.countActiveByAdmin(p.getUserId())))
                .filter(c -> matches(c, q))
                .sorted(comparator(sort))
                .toList();

        return cards;
    }

    /**
     * Name search. A candidate whose name auth-service could not resolve is
     * kept when the query is blank and dropped otherwise — matching on a name
     * we do not have is not possible, and silently keeping it would look like
     * a broken filter.
     */
    private boolean matches(TradeAdminCardResponse c, String q) {
        if (q == null || q.isBlank()) return true;
        String needle = q.trim().toLowerCase();
        return c.displayName() != null && c.displayName().toLowerCase().contains(needle);
    }

    private Comparator<TradeAdminCardResponse> comparator(CatalogSort sort) {
        Comparator<TradeAdminCardResponse> byRating =
                Comparator.comparing(TradeAdminCardResponse::averageStars,
                        Comparator.nullsLast(Comparator.reverseOrder()));
        Comparator<TradeAdminCardResponse> bySpeed =
                Comparator.comparing(TradeAdminCardResponse::averageWorkSeconds,
                        Comparator.nullsLast(Comparator.naturalOrder()));
        Comparator<TradeAdminCardResponse> byFee =
                Comparator.comparingLong(TradeAdminCardResponse::minFeeUzs);
        Comparator<TradeAdminCardResponse> onlineFirst =
                Comparator.comparing(TradeAdminCardResponse::online).reversed();
        Comparator<TradeAdminCardResponse> freeFirst =
                Comparator.comparing(TradeAdminCardResponse::busy);

        return switch (sort) {
            case RATING  -> byRating.thenComparing(bySpeed);
            case SPEED   -> bySpeed.thenComparing(byRating);
            case FEE_ASC -> byFee.thenComparing(byRating);
            case DEFAULT -> freeFirst.thenComparing(onlineFirst)
                                     .thenComparing(byRating)
                                     .thenComparing(bySpeed);
        };
    }
}
```

`admin/controller/TradeAdminCatalogController.java`:

```java
package uz.efbazaar.trade.admin.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.trade.admin.dto.TradeAdminCardResponse;
import uz.efbazaar.trade.admin.service.TradeAdminCatalogService;

import java.util.List;

/**
 * Hire-an-admin list, shown while the seller is composing a HUMAN proposal.
 * Any authenticated user may read it — it is a directory of people offering
 * a service, nothing private.
 *
 * <p>Not paginated: the population is tens of rows, and the sort only makes
 * sense over the whole set. Revisit together with the in-memory name filter
 * in {@link TradeAdminCatalogService} if that changes.
 */
@RestController
@RequestMapping("/api/v1/trade-admins")
@RequiredArgsConstructor
public class TradeAdminCatalogController {

    private final TradeAdminCatalogService catalog;

    @GetMapping
    public List<TradeAdminCardResponse> list(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "DEFAULT") TradeAdminCatalogService.CatalogSort sort) {
        return catalog.search(q, sort);
    }
}
```

An unparseable `sort` yields Spring's `MethodArgumentTypeMismatchException` → `400`, which is what `unknownSortValueIsRejected` expects. Confirm the existing `@ControllerAdvice` maps that to 400; if it maps only `MethodArgumentNotValidException`, add the binding-exception case there.

- [ ] **Step 8: Run the catalogue test to verify it passes**

Run: `cd backend/trade-service && mvn verify -Dit.test=TradeAdminCatalogControllerIT`
Expected: PASS, 7 tests.

- [ ] **Step 9: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/admin/presence/ \
        backend/trade-service/src/main/java/uz/efbazaar/trade/config/WebMvcConfig.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/TradeAdminCardResponse.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeAdminCatalogService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/controller/TradeAdminCatalogController.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeRepository.java \
        backend/trade-service/src/main/resources/application.yml \
        backend/trade-service/src/test/java/uz/efbazaar/trade/admin/RedisPresenceQueryIT.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/admin/TradeAdminCatalogControllerIT.java
git commit -m "feat(trade): add admin catalogue with Redis-backed presence stopgap"
```

---

## Task 9: trade-service — mode and admin on the proposal

**Files:**
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalCreateRequest.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalDetailsResponse.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeProposalService.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateHandler.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/TradeEvents.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/TradeEventPublisher.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/admin/HumanProposalIT.java`

**Interfaces:**
- Consumes: `TradeAdminProfileService.requireHireable` (Task 6); `TradeMode` (Task 3); the HUMAN transition table (Task 5).
- Produces:
  - `ProposalCreateRequest` gains `TradeMode mode`, `UUID adminId`, `Long adminFeeUzs`; `cardId` becomes nullable.
  - `ProposalDetailsResponse` gains `TradeMode mode`, `UUID adminId`, `Long adminFeeUzs` so a refresh shows the buyer what they are accepting.
  - `TradeService.openTrade(UUID sellerId, UUID buyerId, long priceUzs, UUID sellerCardId, UUID buyerCardId, UUID listingId, UUID chatId, TradeMode mode, UUID adminId, Long adminFeeUzs)` — the existing shorter overloads stay and delegate with `SMART, null, null`.
  - `TradeEvents.TOPIC_ADMIN_INVITED = "efbazaar.trade.admin-invited"` and `record AdminInvited(UUID tradeId, UUID adminId, UUID sellerId, UUID buyerId, long priceUzs, Long feeUzs, Instant occurredAt)`.
  - `TradeEventPublisher.adminInvited(Trade trade)`.

**Context:** Only the seller may choose HUMAN mode (spec §3.11) — the fee effectively comes out of their share, so it is their money at stake. A buyer-created proposal is always SMART.

Cards: a HUMAN trade has no platform payment, so no card is required (spec §3.14). SMART still needs both, enforced in `openTrade` rather than only by the DB CHECK so the error is a clean 400.

The Redis hash moves from `Map.of` to `LinkedHashMap`. `Map.of` accepts at most ten pairs and the existing seven plus three new ones is exactly ten — the next field added would stop compiling.

- [ ] **Step 1: Write the failing test**

```java
package uz.efbazaar.trade.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeProposalService;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class HumanProposalIT extends AbstractIntegrationIT {

    @Autowired TradeProposalService proposals;
    @Autowired TradeRepository trades;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired ObjectMapper json;

    private UUID hireableAdmin() {
        UUID id = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(id).minFeeUzs(15_000).maxFeeUzs(40_000).build());
        return id;
    }

    private ProposalCreateRequest human(UUID seller, UUID buyer, UUID admin, Long fee) {
        return new ProposalCreateRequest(UUID.randomUUID(), buyer, seller, buyer,
                80_000L, null, null, TradeMode.HUMAN, admin, fee);
    }

    @Test
    void sellerCanOpenAHumanTradeWithoutCards() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        UUID admin = hireableAdmin();

        var created = proposals.create(seller, human(seller, buyer, admin, 20_000L));
        var trade = proposals.accept(buyer, created.proposalId(), null);

        var row = trades.findById(trade.id()).orElseThrow();
        assertThat(row.getMode()).isEqualTo(TradeMode.HUMAN);
        assertThat(row.getAssignedAdminId()).isEqualTo(admin);
        assertThat(row.getAdminFeeUzs()).isEqualTo(20_000L);
        assertThat(row.getSellerCardId()).isNull();
        assertThat(row.getBuyerCardId()).isNull();
        assertThat(row.getState()).isEqualTo(TradeState.INITIATED);
    }

    @Test
    void buyerCannotChooseHumanMode() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        UUID admin = hireableAdmin();

        // proposerUserId == buyer → HUMAN is refused (spec §3.11).
        assertThatThrownBy(() -> proposals.create(buyer, human(seller, buyer, admin, 20_000L)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void feeOutsideTheAdminsBandIsRefused() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        UUID admin = hireableAdmin();   // band is 15 000–40 000

        assertThatThrownBy(() -> proposals.create(seller, human(seller, buyer, admin, 100_000L)))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> proposals.create(seller, human(seller, buyer, admin, 1_000L)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void humanProposalWithoutAnAdminIsRefused() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();

        assertThatThrownBy(() -> proposals.create(seller, human(seller, buyer, null, 20_000L)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void adminCannotBeAPartyToTheirOwnTrade() {
        UUID seller = hireableAdmin();
        UUID buyer = UUID.randomUUID();

        assertThatThrownBy(() -> proposals.create(seller, human(seller, buyer, seller, 20_000L)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void pausedAdminCannotBeHired() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        UUID admin = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(admin).minFeeUzs(15_000).maxFeeUzs(40_000)
                .acceptingOrders(false).build());

        assertThatThrownBy(() -> proposals.create(seller, human(seller, buyer, admin, 20_000L)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void smartProposalStillRequiresBothCards() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        var req = new ProposalCreateRequest(UUID.randomUUID(), buyer, seller, buyer,
                80_000L, UUID.randomUUID(), null, TradeMode.SMART, null, null);

        var created = proposals.create(seller, req);

        // Accepting without the accepter's card must fail for a smart trade.
        assertThatThrownBy(() -> proposals.accept(buyer, created.proposalId(), null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void pendingHumanProposalTellsTheBuyerWhichAdminAndFee() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        UUID admin = hireableAdmin();
        UUID chatId = UUID.randomUUID();
        var req = new ProposalCreateRequest(chatId, buyer, seller, buyer,
                80_000L, null, null, TradeMode.HUMAN, admin, 20_000L);
        proposals.create(seller, req);

        var found = proposals.findActiveProposalByChatId(chatId, buyer).orElseThrow();

        assertThat(found.mode()).isEqualTo(TradeMode.HUMAN);
        assertThat(found.adminId()).isEqualTo(admin);
        assertThat(found.adminFeeUzs()).isEqualTo(20_000L);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/trade-service && mvn verify -Dit.test=HumanProposalIT`
Expected: compilation failure — `ProposalCreateRequest` has seven components, not ten.

- [ ] **Step 3: Widen the two proposal DTOs**

Replace `trade/dto/ProposalCreateRequest.java`:

```java
package uz.efbazaar.trade.trade.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import uz.efbazaar.trade.trade.domain.TradeMode;

import java.util.UUID;

/**
 * Sent by the proposer (either seller or buyer). Roles are decided at accept
 * time based on who owns the listing referenced by marketplaceChatId.
 *
 * <p>{@code cardId} is nullable: a HUMAN trade has no platform payment, so no
 * card is involved. SMART still requires both parties' cards, enforced in
 * {@code TradeService.openTrade}.
 *
 * <p>{@code mode}, {@code adminId} and {@code adminFeeUzs} may only be set by
 * the SELLER — see {@code TradeProposalService.create}.
 */
public record ProposalCreateRequest(
        @NotNull UUID marketplaceChatId,
        @NotNull UUID otherPartyUserId,
        @NotNull UUID sellerId,
        @NotNull UUID buyerId,
        @NotNull @Min(1) Long amountUzs,
        UUID cardId,
        UUID listingId,
        /** {@code null} is treated as {@link TradeMode#SMART}. */
        TradeMode mode,
        /** Required when {@code mode == HUMAN}. */
        UUID adminId,
        /** Required when {@code mode == HUMAN}; must sit inside the admin's band. */
        @Min(1) Long adminFeeUzs
) {
    public TradeMode modeOrDefault() {
        return mode == null ? TradeMode.SMART : mode;
    }
}
```

In `trade/dto/ProposalDetailsResponse.java`, append three components to the record and keep the existing ones in order:

```java
        Instant expiresAt,
        /** SMART unless the seller hired a human admin. */
        TradeMode mode,
        UUID adminId,
        Long adminFeeUzs
```

Add `import uz.efbazaar.trade.trade.domain.TradeMode;`.

- [ ] **Step 4: Add the Kafka event**

In `kafka/TradeEvents.java`, add the topic constant:

```java
    public static final String TOPIC_ADMIN_INVITED = "efbazaar.trade.admin-invited";
```

and the payload:

```java
    /**
     * A seller invited this admin to run a trade. marketplace-service turns it
     * into a TRADE_ADMIN_INVITED notification so the invitation reaches the
     * admin's existing bell rather than a second one.
     *
     * <p>Delivery is best-effort: the admin also sees pending invitations at
     * {@code GET /api/v1/trade-admins/me/invitations}.
     */
    public record AdminInvited(
            UUID tradeId,
            UUID adminId,
            UUID sellerId,
            UUID buyerId,
            long priceUzs,
            Long feeUzs,
            Instant occurredAt) {}
```

In `kafka/TradeEventPublisher.java`:

```java
    public void adminInvited(Trade trade) {
        var event = new TradeEvents.AdminInvited(
                trade.getId(),
                trade.getAssignedAdminId(),
                trade.getSellerId(),
                trade.getBuyerId(),
                trade.getPriceUzs(),
                trade.getAdminFeeUzs(),
                Instant.now());
        send(TradeEvents.TOPIC_ADMIN_INVITED, trade.getId().toString(), event);
    }
```

Add `import uz.efbazaar.trade.trade.domain.Trade;` and `import java.time.Instant;` if absent.

- [ ] **Step 5: Publish the invitation when the trade enters `WAITING_ADMIN`**

In `TradeStateHandler`, replace the `WAITING_ADMIN` case written in Task 5 with:

```java
            case WAITING_ADMIN -> {
                trade.setStateDeadline(now(thwaS));
                trade.setEscalationDeadlineAt(null);
                if (event == TradeEvent.ADMIN_DECLINED) {
                    // Clear the assignment so the seller can invite somebody
                    // else. No invitation event — there is nobody to invite yet.
                    trade.setAssignedAdminId(null);
                    trade.setAdminFeeUzs(null);
                } else if (trade.getAssignedAdminId() != null) {
                    events.adminInvited(trade);
                }
            }
```

- [ ] **Step 6: Make `openTrade` mode-aware**

In `trade/service/TradeService.java`, keep both existing `openTrade` overloads but have them delegate, and add the full one:

```java
    @Transactional
    public TradeResponse openTrade(UUID sellerId, UUID buyerId, long priceUzs,
                                   UUID sellerCardId, UUID buyerCardId, UUID listingId) {
        return openTrade(sellerId, buyerId, priceUzs, sellerCardId, buyerCardId,
                listingId, null, TradeMode.SMART, null, null);
    }

    @Transactional
    public TradeResponse openTrade(UUID sellerId, UUID buyerId, long priceUzs,
                                   UUID sellerCardId, UUID buyerCardId, UUID listingId,
                                   UUID chatId) {
        return openTrade(sellerId, buyerId, priceUzs, sellerCardId, buyerCardId,
                listingId, chatId, TradeMode.SMART, null, null);
    }

    @Transactional
    public TradeResponse openTrade(UUID sellerId, UUID buyerId, long priceUzs,
                                   UUID sellerCardId, UUID buyerCardId, UUID listingId,
                                   UUID chatId, TradeMode mode,
                                   UUID assignedAdminId, Long adminFeeUzs) {
        if (mode == TradeMode.SMART && (sellerCardId == null || buyerCardId == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Smart savdo uchun ikki tarafning kartasi ham kerak");
        }
        if (mode == TradeMode.HUMAN && assignedAdminId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Inson admin savdosi uchun admin tanlanishi kerak");
        }

        UUID mailboxId = allocatePlaceholderMailbox();

        Trade t = Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(sellerId)
                .buyerId(buyerId)
                .listingId(listingId)
                .chatId(chatId)
                .priceUzs(priceUzs)
                .state(TradeState.INITIATED)
                .mailboxId(mailboxId)
                .sellerCardId(sellerCardId)
                .buyerCardId(buyerCardId)
                .mode(mode)
                .assignedAdminId(assignedAdminId)
                .adminFeeUzs(adminFeeUzs)
                .expiresAt(Instant.now().plus(Duration.ofHours(
                        mode == TradeMode.HUMAN ? humanExpiresAfterHours : 24)))
                .build();

        handler.onEnter(t, TradeState.INITIATED, ActorType.SYSTEM, null, null);
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
                "priceUzs", String.valueOf(priceUzs),
                "mode", mode.name()
        ));
        broadcaster.publishStateChange(t.getId(), toResponse(t, null));
        return toResponse(t, null);
    }
```

Add the field and imports:

```java
    @Value("${trade.human.expires-after-hours:168}")
    private long humanExpiresAfterHours;
```

`import org.springframework.beans.factory.annotation.Value;`, `import org.springframework.http.HttpStatus;`, `import org.springframework.web.server.ResponseStatusException;`, `import uz.efbazaar.trade.trade.domain.TradeMode;`.

Add to `application.yml` under `trade:`:

```yaml
  human:
    # A hand-run trade legitimately takes days; the smart path stays at 24h.
    expires-after-hours: 168
    rating-window-days: 7
```

- [ ] **Step 7: Validate and persist mode in the proposal service**

In `trade/service/TradeProposalService.java`, inject the profile service:

```java
    private final TradeAdminProfileService adminProfiles;
```

Replace `create`:

```java
    public ProposalResponse create(UUID proposerUserId, ProposalCreateRequest req) {
        TradeMode mode = req.modeOrDefault();

        if (mode == TradeMode.HUMAN) {
            // Only the seller may hire — the fee comes out of their share.
            if (!proposerUserId.equals(req.sellerId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Inson adminni faqat sotuvchi tanlashi mumkin");
            }
            if (req.adminId() == null || req.adminFeeUzs() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Inson admin savdosida admin va haq ko'rsatilishi shart");
            }
            if (req.adminId().equals(req.sellerId()) || req.adminId().equals(req.buyerId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Admin o'z savdosining tarafi bo'lolmaydi");
            }
            // Throws 400 when the admin is unknown, inactive, paused, or the
            // fee sits outside their advertised band.
            adminProfiles.requireHireable(req.adminId(), req.adminFeeUzs());
        } else if (req.cardId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Smart savdo uchun karta tanlanishi kerak");
        }

        UUID proposalId = UUID.randomUUID();
        String key = redisKey(proposalId);

        // LinkedHashMap, not Map.of: ten pairs is Map.of's ceiling and this
        // hash is already there.
        Map<String, String> hash = new LinkedHashMap<>();
        hash.put("marketplaceChatId", req.marketplaceChatId().toString());
        hash.put("proposerUserId",    proposerUserId.toString());
        hash.put("sellerId",          req.sellerId().toString());
        hash.put("buyerId",           req.buyerId().toString());
        hash.put("amountUzs",         req.amountUzs().toString());
        hash.put("listingId",         req.listingId() != null ? req.listingId().toString() : "");
        hash.put("proposerCardId",    req.cardId() != null ? req.cardId().toString() : "");
        hash.put("mode",              mode.name());
        hash.put("adminId",           req.adminId() != null ? req.adminId().toString() : "");
        hash.put("adminFeeUzs",       req.adminFeeUzs() != null ? req.adminFeeUzs().toString() : "");

        redis.opsForHash().putAll(key, hash);
        redis.expire(key, Duration.ofSeconds(ttlSeconds));

        String indexKey = chatIndexKey(req.marketplaceChatId());
        redis.opsForValue().set(indexKey, proposalId.toString(), Duration.ofSeconds(ttlSeconds));

        events.proposalCreated(proposalId, req.marketplaceChatId(),
                proposerUserId, req.amountUzs());

        return new ProposalResponse(proposalId, Instant.now().plusSeconds(ttlSeconds));
    }
```

In `accept`, read the three new fields and pass them through:

```java
        TradeMode mode = TradeMode.valueOf(
                orDefault((String) raw.get("mode"), TradeMode.SMART.name()));
        UUID adminId  = optionalUuid(raw.get("adminId"));
        Long adminFee = optionalLong(raw.get("adminFeeUzs"));

        UUID sellerCardId;
        UUID buyerCardId;
        if (mode == TradeMode.HUMAN) {
            // No platform payment, so no cards at all.
            sellerCardId = null;
            buyerCardId  = null;
        } else {
            if (accepterCardId == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Smart savdo uchun kartangizni tanlang");
            }
            sellerCardId = sellerId.equals(proposerUserId) ? proposerCard : accepterCardId;
            buyerCardId  = buyerId.equals(proposerUserId)  ? proposerCard : accepterCardId;
        }

        var trade = trades.openTrade(sellerId, buyerId, amountUzs,
                sellerCardId, buyerCardId, listingId, chatId, mode, adminId, adminFee);
```

Note `proposerCard` must now tolerate a blank value — change its extraction to `UUID proposerCard = optionalUuid(raw.get("proposerCardId"));`.

Add the two small helpers next to `optionalUuid`:

```java
    private static Long optionalLong(Object v) {
        if (v == null) return null;
        String s = v.toString();
        return s.isBlank() ? null : Long.valueOf(s);
    }

    private static String orDefault(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }
```

In `findActiveProposalByChatId`, read the same three fields and pass them to the widened `ProposalDetailsResponse` constructor.

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd backend/trade-service && mvn verify -Dit.test=HumanProposalIT`
Expected: PASS, 8 tests.

`TradeProposalControllerIT` and `TradeProposalServiceIT` construct `ProposalCreateRequest` positionally and will not compile until three `null`s (or `TradeMode.SMART, null, null`) are appended. Update them — passing `SMART, null, null` preserves their meaning exactly.

- [ ] **Step 9: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalCreateRequest.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/dto/ProposalDetailsResponse.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeProposalService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateHandler.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/TradeEvents.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/TradeEventPublisher.java \
        backend/trade-service/src/main/resources/application.yml \
        backend/trade-service/src/test/java/uz/efbazaar/trade/
git commit -m "feat(trade): let the seller hire a human admin when creating a proposal"
```

---

## Task 10: trade-service — accept, decline and the capacity lock

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/repository/TradeStepMarkRepository.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeAdminAssignmentService.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/controller/TradeAdminWorkController.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/AssignAdminRequest.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/repository/TradeAdminProfileRepository.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeChatService.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeActionController.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/admin/TradeAdminAssignmentIT.java`

**Interfaces:**
- Consumes: `TradeAdminProfileService.requireHireable`, `TradeRepository.countActiveByAdmin` (Tasks 6, 8); `TradeEvent.ADMIN_ACCEPTED/ADMIN_DECLINED` (Task 5).
- Produces:
  - `TradeStepMarkRepository` with `List<TradeStepMark> findByTradeIdOrderByStep(UUID tradeId)` and `Optional<TradeStepMark> findByTradeIdAndStep(UUID tradeId, TradeStep step)`
  - `Optional<TradeAdminProfile> TradeAdminProfileRepository.findByIdForUpdate(UUID userId)` — `PESSIMISTIC_WRITE`
  - `TradeAdminAssignmentService.accept(UUID adminId, UUID tradeId)`, `.decline(UUID adminId, UUID tradeId)`, `.assign(UUID sellerId, UUID tradeId, UUID adminId, long feeUzs)`, `.listInvitations(UUID adminId)`, `.listMyTrades(UUID adminId)`
  - `TradeChatService.postStatus(UUID tradeId, ParticipantRole target, String code, Map<String, Object> metadata)` and `.postStatusToBoth(UUID tradeId, String code, Map<String, Object> metadata)`
  - `record AssignAdminRequest(@NotNull UUID adminId, @NotNull @Min(1) Long feeUzs)`
- Task 11 consumes `TradeStepMarkRepository` and `postStatusToBoth`.

**Context:** Capacity binds on **accept**, not on invitation (spec §9.5): an invitation is not a reservation, and two sellers may invite the same admin. The check runs inside the accept transaction against a `PESSIMISTIC_WRITE` lock on the profile row, so two simultaneous accepts cannot both pass.

Six `trade_steps` rows are created here, when the admin accepts, so the checklist exists before the first tick.

`postStatusToBoth` writes a `STATUS` message into both party chats. `STATUS` rows have no encrypted body (V5's `chk_trade_messages_body_shape` allows all-null), so the code and metadata carry the meaning.

- [ ] **Step 1: Write the failing test**

```java
package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.repository.TradeStepMarkRepository;
import uz.efbazaar.trade.admin.service.TradeAdminAssignmentService;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeChatService;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class TradeAdminAssignmentIT extends AbstractIntegrationIT {

    @Autowired TradeAdminAssignmentService assignments;
    @Autowired TradeRepository trades;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired TradeStepMarkRepository steps;
    @Autowired TradeChatService chatService;
    @Autowired MailboxService mailboxes;
    @Autowired uz.efbazaar.trade.trade.repository.TradeChatRepository chats;

    private UUID admin(int concurrent) {
        UUID id = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(id).minFeeUzs(15_000).maxFeeUzs(40_000)
                .maxConcurrentTrades(concurrent).build());
        return id;
    }

    private Trade waitingAdminTrade(UUID adminId) {
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        Trade t = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(TradeState.WAITING_ADMIN)
                .mailboxId(mailboxId)
                .mode(TradeMode.HUMAN)
                .assignedAdminId(adminId)
                .adminFeeUzs(20_000L)
                .stateDeadline(Instant.now().plus(Duration.ofHours(24)))
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(t.getId()).participant(ParticipantRole.SELLER).build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(t.getId()).participant(ParticipantRole.BUYER).build());
        return t;
    }

    @Test
    void acceptingCreatesSixStepsAndMovesToInProgress() {
        UUID adminId = admin(3);
        Trade t = waitingAdminTrade(adminId);

        assignments.accept(adminId, t.getId());

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getState()).isEqualTo(TradeState.IN_PROGRESS);
        assertThat(steps.findByTradeIdOrderByStep(t.getId()))
                .hasSize(6)
                .allSatisfy(s -> assertThat(s.isComplete()).isFalse());
    }

    @Test
    void acceptingPostsAStatusMessageIntoBothChats() {
        UUID adminId = admin(3);
        Trade t = waitingAdminTrade(adminId);

        assignments.accept(adminId, t.getId());

        assertThat(chatService.list(t.getId(), t.getSellerId()))
                .anySatisfy(m -> assertThat(m.messageType()).isEqualTo(TradeMessageType.STATUS));
        assertThat(chatService.list(t.getId(), t.getBuyerId()))
                .anySatisfy(m -> assertThat(m.messageType()).isEqualTo(TradeMessageType.STATUS));
    }

    @Test
    void anAdminWhoWasNotInvitedCannotAccept() {
        UUID invited = admin(3);
        UUID other = admin(3);
        Trade t = waitingAdminTrade(invited);

        assertThatThrownBy(() -> assignments.accept(other, t.getId()))
                .isInstanceOf(RuntimeException.class);
        assertThat(trades.findById(t.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_ADMIN);
    }

    @Test
    void acceptingWhenFullIsRejectedAndLeavesTheTradeWaiting() {
        UUID adminId = admin(1);
        Trade busyWith = waitingAdminTrade(adminId);
        assignments.accept(adminId, busyWith.getId());     // now at 1/1

        Trade second = waitingAdminTrade(adminId);

        assertThatThrownBy(() -> assignments.accept(adminId, second.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
        assertThat(trades.findById(second.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_ADMIN);
    }

    @Test
    void twoSimultaneousAcceptsCannotBothWin() throws Exception {
        UUID adminId = admin(1);
        Trade a = waitingAdminTrade(adminId);
        Trade b = waitingAdminTrade(adminId);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch go = new CountDownLatch(1);

        Future<Boolean> f1 = pool.submit(() -> {
            go.await();
            try { assignments.accept(adminId, a.getId()); return true; }
            catch (Exception e) { return false; }
        });
        Future<Boolean> f2 = pool.submit(() -> {
            go.await();
            try { assignments.accept(adminId, b.getId()); return true; }
            catch (Exception e) { return false; }
        });
        go.countDown();

        int winners = (f1.get() ? 1 : 0) + (f2.get() ? 1 : 0);
        pool.shutdown();

        assertThat(winners)
                .as("maxConcurrentTrades=1 must admit exactly one")
                .isEqualTo(1);
    }

    @Test
    void decliningClearsTheAssignmentAndKeepsTheTradeHireable() {
        UUID adminId = admin(3);
        Trade t = waitingAdminTrade(adminId);

        assignments.decline(adminId, t.getId());

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getState()).isEqualTo(TradeState.WAITING_ADMIN);
        assertThat(after.getAssignedAdminId()).isNull();
        assertThat(steps.findByTradeIdOrderByStep(t.getId())).isEmpty();
    }

    @Test
    void sellerCanInviteAnotherAdminAfterADecline() {
        UUID first = admin(3);
        Trade t = waitingAdminTrade(first);
        assignments.decline(first, t.getId());
        UUID second = admin(3);

        assignments.assign(t.getSellerId(), t.getId(), second, 25_000L);

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getAssignedAdminId()).isEqualTo(second);
        assertThat(after.getAdminFeeUzs()).isEqualTo(25_000L);
        assertThat(after.getState()).isEqualTo(TradeState.WAITING_ADMIN);
    }

    @Test
    void buyerCannotInviteAnAdmin() {
        UUID first = admin(3);
        Trade t = waitingAdminTrade(first);
        assignments.decline(first, t.getId());
        UUID second = admin(3);

        assertThatThrownBy(() -> assignments.assign(t.getBuyerId(), t.getId(), second, 25_000L))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void cannotInviteWhileAnAdminIsAlreadyAssigned() {
        UUID first = admin(3);
        Trade t = waitingAdminTrade(first);
        UUID second = admin(3);

        assertThatThrownBy(() -> assignments.assign(t.getSellerId(), t.getId(), second, 25_000L))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void invitationsListShowsOnlyTradesWaitingOnThisAdmin() {
        UUID adminId = admin(3);
        Trade mine = waitingAdminTrade(adminId);
        waitingAdminTrade(admin(3));           // somebody else's invitation

        var invitations = assignments.listInvitations(adminId);

        assertThat(invitations).extracting("id").containsExactly(mine.getId());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/trade-service && mvn verify -Dit.test=TradeAdminAssignmentIT`
Expected: compilation failure — the assignment service does not exist.

- [ ] **Step 3: Add the step repository and the locking finder**

`admin/repository/TradeStepMarkRepository.java`:

```java
package uz.efbazaar.trade.admin.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.admin.domain.TradeStepMark;
import uz.efbazaar.trade.trade.domain.TradeStep;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TradeStepMarkRepository extends JpaRepository<TradeStepMark, UUID> {

    /** Checklist in declaration order — the order the UI renders. */
    List<TradeStepMark> findByTradeIdOrderByStep(UUID tradeId);

    Optional<TradeStepMark> findByTradeIdAndStep(UUID tradeId, TradeStep step);

    long countByTradeIdAndCompletedAtIsNotNull(UUID tradeId);
}
```

In `admin/repository/TradeAdminProfileRepository.java`, add:

```java
    /**
     * Row-level lock used by the capacity check when an admin accepts. Two
     * concurrent accepts serialise here, so {@code maxConcurrentTrades} cannot
     * be exceeded by a race.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM TradeAdminProfile p WHERE p.userId = :userId")
    Optional<TradeAdminProfile> findByIdForUpdate(@Param("userId") UUID userId);
```

with imports `jakarta.persistence.LockModeType`, `org.springframework.data.jpa.repository.Lock`, `org.springframework.data.jpa.repository.Query`, `org.springframework.data.repository.query.Param`, `java.util.Optional`.

- [ ] **Step 4: Add the status-message helpers**

In `trade/service/TradeChatService.java`, add:

```java
    /**
     * System status note in one party's chat. STATUS rows carry no encrypted
     * body — V5's body-shape CHECK permits all-null — so the code and metadata
     * carry the meaning and the client renders the label.
     */
    @Transactional
    public TradeMessage postStatus(UUID tradeId, ParticipantRole target,
                                   String code, Map<String, Object> metadata) {
        var chat = chats.findByTradeIdAndParticipant(tradeId, target)
                .orElseThrow(() -> new EntityNotFoundException("chat for " + target));

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("code", code);
        if (metadata != null) meta.putAll(metadata);

        TradeMessage msg = TradeMessage.builder()
                .id(UUID.randomUUID())
                .tradeChatId(chat.getId())
                .senderType(TradeSenderType.SYSTEM)
                .messageType(TradeMessageType.STATUS)
                .metadata(meta)
                .build();
        messages.save(msg);

        broadcaster.publishMessage(tradeId, target, new TradeMessageResponse(
                msg.getId(), msg.getSenderType(), msg.getMessageType(),
                null, msg.getMetadata(), msg.getCreatedAt()));
        return msg;
    }

    /** Same note in both party chats — the usual case for admin progress. */
    @Transactional
    public void postStatusToBoth(UUID tradeId, String code, Map<String, Object> metadata) {
        postStatus(tradeId, ParticipantRole.SELLER, code, metadata);
        postStatus(tradeId, ParticipantRole.BUYER, code, metadata);
    }
```

Add `import java.util.LinkedHashMap;` and `import java.util.Map;`.

- [ ] **Step 5: Create the assignment service**

`admin/service/TradeAdminAssignmentService.java`:

```java
package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.domain.TradeStepMark;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.repository.TradeStepMarkRepository;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeChatService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Hiring lifecycle: invite → accept or decline → (on decline) invite again.
 *
 * <p>Capacity binds on ACCEPT, not on invitation. An invitation is not a
 * reservation, so two sellers may invite the same admin at once; the loser
 * finds out when they try to accept and their trade stays hireable.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeAdminAssignmentService {

    private final TradeRepository trades;
    private final TradeService tradeService;
    private final TradeAdminProfileRepository profiles;
    private final TradeAdminProfileService profileService;
    private final TradeStepMarkRepository steps;
    private final TradeChatService chatService;
    private final TradeEventPublisher events;

    @Transactional
    public void accept(UUID adminId, UUID tradeId) {
        Trade t = requireInvited(adminId, tradeId);

        // Lock the profile so two concurrent accepts serialise on this row.
        TradeAdminProfile p = profiles.findByIdForUpdate(adminId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Savdo admini profili topilmadi"));
        if (!p.isActive()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Siz endi savdo admini emassiz");
        }
        int active = trades.countActiveByAdmin(adminId);
        if (active >= p.getMaxConcurrentTrades()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bir vaqtda %d savdodan ko'p olib borolmaysiz".formatted(
                            p.getMaxConcurrentTrades()));
        }

        // Moves to IN_PROGRESS, sets adminAcceptedAt, nulls stateDeadline,
        // arms the escalation watchdog and hands the mailbox to the admin.
        tradeService.transition(tradeId, TradeEvent.ADMIN_ACCEPTED,
                ActorType.TRADE_ADMIN, adminId);

        createChecklist(tradeId);

        chatService.postStatusToBoth(tradeId, "ADMIN_ACCEPTED", Map.of(
                "adminId", adminId.toString(),
                "feeUzs", String.valueOf(t.getAdminFeeUzs())));

        log.info("Trade {} accepted by admin {} ({}/{} slots used)",
                tradeId, adminId, active + 1, p.getMaxConcurrentTrades());
    }

    @Transactional
    public void decline(UUID adminId, UUID tradeId) {
        requireInvited(adminId, tradeId);

        tradeService.transition(tradeId, TradeEvent.ADMIN_DECLINED,
                ActorType.TRADE_ADMIN, adminId);

        chatService.postStatus(tradeId, ParticipantRole.SELLER, "ADMIN_DECLINED",
                Map.of("adminId", adminId.toString()));
    }

    /**
     * Seller invites (or re-invites) an admin while the trade sits in
     * {@code WAITING_ADMIN}. Not a state transition — the state does not
     * change, so this writes the assignment and re-arms the deadline itself.
     */
    @Transactional
    public void assign(UUID sellerId, UUID tradeId, UUID adminId, long feeUzs) {
        Trade t = trades.findById(tradeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Savdo topilmadi"));
        if (!sellerId.equals(t.getSellerId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Adminni faqat sotuvchi tanlashi mumkin");
        }
        if (t.getMode() != TradeMode.HUMAN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu savdo inson admin rejimida emas");
        }
        if (t.getState() != TradeState.WAITING_ADMIN) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Admin faqat kutish holatida tanlanadi");
        }
        if (t.getAssignedAdminId() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu savdoda allaqachon admin bor");
        }
        if (adminId.equals(t.getSellerId()) || adminId.equals(t.getBuyerId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Admin o'z savdosining tarafi bo'lolmaydi");
        }
        profileService.requireHireable(adminId, feeUzs);

        t.setAssignedAdminId(adminId);
        t.setAdminFeeUzs(feeUzs);
        trades.save(t);

        events.adminInvited(t);
    }

    @Transactional(readOnly = true)
    public List<Trade> listInvitations(UUID adminId) {
        return trades.findByAssignedAdminIdAndState(adminId, TradeState.WAITING_ADMIN);
    }

    @Transactional(readOnly = true)
    public List<Trade> listMyTrades(UUID adminId) {
        return trades.findByAssignedAdminIdOrderByCreatedAtDesc(adminId);
    }

    /**
     * The trade must exist, be human-mode, be waiting, and be waiting on
     * <em>this</em> admin. 404 rather than 403 for a stranger so the endpoint
     * does not confirm the trade exists.
     */
    private Trade requireInvited(UUID adminId, UUID tradeId) {
        Trade t = trades.findByIdAndViewer(tradeId, adminId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Savdo topilmadi"));
        if (t.getState() != TradeState.WAITING_ADMIN) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu savdo admin javobini kutmayapti");
        }
        if (!adminId.equals(t.getAssignedAdminId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Savdo topilmadi");
        }
        return t;
    }

    private void createChecklist(UUID tradeId) {
        if (!steps.findByTradeIdOrderByStep(tradeId).isEmpty()) {
            return;   // idempotent: a reassignment keeps the existing ticks
        }
        for (TradeStep step : TradeStep.values()) {
            steps.save(TradeStepMark.builder()
                    .id(UUID.randomUUID())
                    .tradeId(tradeId)
                    .step(step)
                    .build());
        }
    }
}
```

Add the two finders to `TradeRepository`:

```java
    List<Trade> findByAssignedAdminIdAndState(UUID assignedAdminId, TradeState state);

    List<Trade> findByAssignedAdminIdOrderByCreatedAtDesc(UUID assignedAdminId);
```

- [ ] **Step 6: Add the controller and the seller-side action**

`admin/dto/AssignAdminRequest.java`:

```java
package uz.efbazaar.trade.admin.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/** Seller re-invites an admin after a decline. Fee must sit in their band. */
public record AssignAdminRequest(
        @NotNull UUID adminId,
        @NotNull @Min(1) Long feeUzs
) {}
```

`admin/controller/TradeAdminWorkController.java`:

```java
package uz.efbazaar.trade.admin.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.admin.service.TradeAdminAssignmentService;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.List;
import java.util.UUID;

/** The admin's own workspace: invitations, active trades, accept and decline. */
@RestController
@RequiredArgsConstructor
@PreAuthorize("hasAuthority('ROLE_TRADE_ADMIN')")
public class TradeAdminWorkController {

    private final TradeAdminAssignmentService assignments;
    private final TradeService trades;

    @GetMapping("/api/v1/trade-admins/me/invitations")
    public List<TradeResponse> invitations(@AuthenticationPrincipal AuthenticatedUser me) {
        return assignments.listInvitations(me.userId()).stream()
                .map(t -> trades.toResponse(t, null))
                .toList();
    }

    @GetMapping("/api/v1/trade-admins/me/trades")
    public List<TradeResponse> myTrades(@AuthenticationPrincipal AuthenticatedUser me) {
        return assignments.listMyTrades(me.userId()).stream()
                .map(t -> trades.toResponse(t, null))
                .toList();
    }

    @PostMapping("/api/v1/trades/{id}/actions/admin-accept")
    public TradeResponse accept(@AuthenticationPrincipal AuthenticatedUser me,
                                @PathVariable UUID id) {
        assignments.accept(me.userId(), id);
        return trades.toResponse(trades.getForViewer(id, me.userId()), null);
    }

    @PostMapping("/api/v1/trades/{id}/actions/admin-decline")
    public void decline(@AuthenticationPrincipal AuthenticatedUser me,
                        @PathVariable UUID id) {
        assignments.decline(me.userId(), id);
        // No body: after declining the caller is no longer a viewer of this trade.
    }
}
```

In `trade/controller/TradeActionController.java`, add the seller-side invite (this controller is already mapped at `/api/v1/trades/{id}/actions`):

```java
    @PostMapping("/assign-admin")
    public TradeResponse assignAdmin(@AuthenticationPrincipal AuthenticatedUser me,
                                     @PathVariable UUID id,
                                     @Valid @RequestBody AssignAdminRequest req) {
        assignments.assign(me.userId(), id, req.adminId(), req.feeUzs());
        Trade after = trades.get(id, me.userId());
        return trades.toResponse(after, ParticipantRole.SELLER);
    }
```

Inject `private final TradeAdminAssignmentService assignments;` and add imports for `jakarta.validation.Valid` and `AssignAdminRequest`.

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend/trade-service && mvn verify -Dit.test=TradeAdminAssignmentIT`
Expected: PASS, 10 tests.

`twoSimultaneousAcceptsCannotBothWin` needs the two accepts in separate transactions — they are, because each `accept` call opens its own. If the test proves flaky, confirm the pessimistic lock is actually issued by running with `spring.jpa.properties.hibernate.show_sql=true` and looking for `for update`.

- [ ] **Step 8: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/admin/ \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeChatService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeActionController.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeRepository.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/admin/TradeAdminAssignmentIT.java
git commit -m "feat(trade): add admin accept/decline with a capacity lock and checklist seeding"
```

---

## Task 11: trade-service — the six-step checklist

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/TradeStepResponse.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/MarkStepRequest.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeIdleWatchdog.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeStepService.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/controller/TradeAdminWorkController.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/admin/TradeStepServiceIT.java`

**Interfaces:**
- Consumes: `TradeStepMarkRepository`, `TradeChatService.postStatusToBoth` (Task 10).
- Produces:
  - `TradeIdleWatchdog.touch(Trade t)` — re-arms `escalation_deadline_at`. A standalone component depending only on `TradeRepository`, so both `TradeStepService` and `TradeChatService` (Task 12) can hold it without a dependency cycle.
  - `record TradeStepResponse(TradeStep step, String labelUz, boolean completed, Instant completedAt, String note)` with `static of(TradeStepMark)`
  - `record MarkStepRequest(String note)` — note optional, max 500
  - `TradeStepService.list(UUID tradeId, UUID viewerId)`, `.mark(UUID tradeId, UUID adminId, TradeStep step, String note)`, `.unmark(UUID tradeId, UUID adminId, TradeStep step)`, `.allComplete(UUID tradeId)`, `.completedCount(UUID tradeId)`
- Task 12 consumes `TradeIdleWatchdog`; Task 13 consumes `allComplete` and `completedCount` to gate the close.

**Context:** Every admin action re-arms `escalation_deadline_at` (spec §7.2) — that is what keeps a working admin out of the escalation queue. Marking is done here; the chat-message path in Task 12 re-arms it too.

Marks are only allowed while the trade is `IN_PROGRESS`. After the admin closes, the checklist is frozen: it is the record the parties are confirming against.

Both parties may **read** the checklist — that is how they follow progress — but only the assigned admin may change it.

- [ ] **Step 1: Write the failing test**

```java
package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.service.TradeAdminAssignmentService;
import uz.efbazaar.trade.admin.service.TradeStepService;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeChatService;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class TradeStepServiceIT extends AbstractIntegrationIT {

    @Autowired TradeStepService stepService;
    @Autowired TradeAdminAssignmentService assignments;
    @Autowired TradeRepository trades;
    @Autowired TradeChatRepository chats;
    @Autowired TradeChatService chatService;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired MailboxService mailboxes;

    private UUID adminId;
    private Trade trade;

    private void givenAcceptedTrade() {
        adminId = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(adminId).minFeeUzs(15_000).maxFeeUzs(40_000).build());
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        trade = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(TradeState.WAITING_ADMIN)
                .mailboxId(mailboxId)
                .mode(TradeMode.HUMAN)
                .assignedAdminId(adminId)
                .adminFeeUzs(20_000L)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(trade.getId()).participant(ParticipantRole.SELLER).build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(trade.getId()).participant(ParticipantRole.BUYER).build());
        assignments.accept(adminId, trade.getId());
    }

    @Test
    void checklistStartsAsSixUnmarkedStepsInDeclarationOrder() {
        givenAcceptedTrade();

        var list = stepService.list(trade.getId(), adminId);

        assertThat(list).hasSize(6);
        assertThat(list).extracting("step").containsExactly(
                TradeStep.SELLER_BRIEFED, TradeStep.ACCOUNT_TRANSFERRED,
                TradeStep.ACCOUNT_VERIFIED, TradeStep.PAYMENT_RECEIVED,
                TradeStep.CREDENTIALS_DELIVERED, TradeStep.SELLER_PAID);
        assertThat(list).allSatisfy(s -> assertThat(s.completed()).isFalse());
        assertThat(list.get(0).labelUz()).isEqualTo("Sotuvchi bilan gaplashdim");
    }

    @Test
    void marksMayBeAppliedInAnyOrder() {
        givenAcceptedTrade();

        // Payment first, briefing later — the whole point of the checklist.
        stepService.mark(trade.getId(), adminId, TradeStep.PAYMENT_RECEIVED, null);
        stepService.mark(trade.getId(), adminId, TradeStep.SELLER_BRIEFED, "telegramda");

        var list = stepService.list(trade.getId(), adminId);
        assertThat(list).filteredOn("completed", true)
                .extracting("step")
                .containsExactlyInAnyOrder(TradeStep.PAYMENT_RECEIVED, TradeStep.SELLER_BRIEFED);
        assertThat(list).filteredOn("step", TradeStep.SELLER_BRIEFED)
                .singleElement()
                .extracting("note").isEqualTo("telegramda");
    }

    @Test
    void markingPostsAStatusIntoBothChats() {
        givenAcceptedTrade();
        int before = chatService.list(trade.getId(), trade.getBuyerId()).size();

        stepService.mark(trade.getId(), adminId, TradeStep.ACCOUNT_VERIFIED, null);

        assertThat(chatService.list(trade.getId(), trade.getBuyerId()))
                .hasSizeGreaterThan(before);
        assertThat(chatService.list(trade.getId(), trade.getSellerId()))
                .anySatisfy(m -> assertThat(m.metadata())
                        .containsEntry("step", TradeStep.ACCOUNT_VERIFIED.name()));
    }

    @Test
    void markingReArmsTheEscalationWatchdog() {
        givenAcceptedTrade();
        Trade accepted = trades.findById(trade.getId()).orElseThrow();
        accepted.setEscalationDeadlineAt(Instant.now().minusSeconds(60));
        trades.save(accepted);

        stepService.mark(trade.getId(), adminId, TradeStep.SELLER_BRIEFED, null);

        assertThat(trades.findById(trade.getId()).orElseThrow().getEscalationDeadlineAt())
                .as("a working admin must never reach the escalation queue")
                .isAfter(Instant.now());
    }

    @Test
    void unmarkingCorrectsAMistake() {
        givenAcceptedTrade();
        stepService.mark(trade.getId(), adminId, TradeStep.SELLER_PAID, null);

        stepService.unmark(trade.getId(), adminId, TradeStep.SELLER_PAID);

        assertThat(stepService.list(trade.getId(), adminId))
                .filteredOn("step", TradeStep.SELLER_PAID)
                .singleElement()
                .satisfies(s -> {
                    assertThat(s.completed()).isFalse();
                    assertThat(s.completedAt()).isNull();
                });
        assertThat(stepService.allComplete(trade.getId())).isFalse();
    }

    @Test
    void markingTwiceIsIdempotent() {
        givenAcceptedTrade();
        stepService.mark(trade.getId(), adminId, TradeStep.SELLER_BRIEFED, null);
        Instant first = stepService.list(trade.getId(), adminId).stream()
                .filter(s -> s.step() == TradeStep.SELLER_BRIEFED)
                .findFirst().orElseThrow().completedAt();

        stepService.mark(trade.getId(), adminId, TradeStep.SELLER_BRIEFED, null);

        assertThat(stepService.list(trade.getId(), adminId).stream()
                .filter(s -> s.step() == TradeStep.SELLER_BRIEFED)
                .findFirst().orElseThrow().completedAt())
                .isEqualTo(first);
    }

    @Test
    void allCompleteOnlyWhenAllSixAreMarked() {
        givenAcceptedTrade();
        for (TradeStep s : TradeStep.values()) {
            if (s == TradeStep.SELLER_PAID) continue;
            stepService.mark(trade.getId(), adminId, s, null);
        }
        assertThat(stepService.allComplete(trade.getId())).isFalse();

        stepService.mark(trade.getId(), adminId, TradeStep.SELLER_PAID, null);

        assertThat(stepService.allComplete(trade.getId())).isTrue();
    }

    @Test
    void partiesCanReadButNotChangeTheChecklist() {
        givenAcceptedTrade();

        assertThat(stepService.list(trade.getId(), trade.getSellerId())).hasSize(6);
        assertThat(stepService.list(trade.getId(), trade.getBuyerId())).hasSize(6);

        assertThatThrownBy(() -> stepService.mark(
                trade.getId(), trade.getSellerId(), TradeStep.SELLER_BRIEFED, null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void anotherAdminCannotTouchTheChecklist() {
        givenAcceptedTrade();
        UUID intruder = UUID.randomUUID();

        assertThatThrownBy(() -> stepService.mark(
                trade.getId(), intruder, TradeStep.SELLER_BRIEFED, null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void checklistIsFrozenOnceTheTradeLeavesInProgress() {
        givenAcceptedTrade();
        Trade t = trades.findById(trade.getId()).orElseThrow();
        t.setState(TradeState.WAITING_CLOSE_CONFIRM);
        trades.save(t);

        assertThatThrownBy(() -> stepService.mark(
                trade.getId(), adminId, TradeStep.SELLER_BRIEFED, null))
                .isInstanceOf(ResponseStatusException.class);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/trade-service && mvn verify -Dit.test=TradeStepServiceIT`
Expected: compilation failure — `TradeStepService` does not exist.

- [ ] **Step 3: Create the DTOs**

`admin/dto/TradeStepResponse.java`:

```java
package uz.efbazaar.trade.admin.dto;

import uz.efbazaar.trade.admin.domain.TradeStepMark;
import uz.efbazaar.trade.trade.domain.TradeStep;

import java.time.Instant;

/** One checklist row as the admin workspace and both party panels see it. */
public record TradeStepResponse(
        TradeStep step,
        String labelUz,
        boolean completed,
        Instant completedAt,
        String note
) {
    public static TradeStepResponse of(TradeStepMark m) {
        return new TradeStepResponse(
                m.getStep(),
                m.getStep().labelUz(),
                m.isComplete(),
                m.getCompletedAt(),
                m.getNote());
    }
}
```

`admin/dto/MarkStepRequest.java`:

```java
package uz.efbazaar.trade.admin.dto;

import jakarta.validation.constraints.Size;

/** Optional free-text note the admin attaches when ticking a step. */
public record MarkStepRequest(
        @Size(max = 500) String note
) {}
```

- [ ] **Step 4: Create the idle watchdog and the step service**

`admin/service/TradeIdleWatchdog.java`:

```java
package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;

/**
 * Pushes a human trade's escalation deadline forward whenever its admin does
 * something. A visibly working admin must never surface in the platform
 * escalation queue (spec §7.2).
 *
 * <p>Its own component rather than a method on {@code TradeStepService}: both
 * the checklist path and the chat path need it, and {@code TradeStepService}
 * already depends on {@code TradeChatService}. Depending only on
 * {@code TradeRepository} keeps the graph acyclic.
 */
@Component
@RequiredArgsConstructor
public class TradeIdleWatchdog {

    private final TradeRepository trades;

    @Value("${trade.timeouts.human-admin-idle-seconds}")
    private long idleSeconds;

    /**
     * Counts any admin action as activity — ticking a step, un-ticking one, or
     * writing into either party chat. A long conversation with the seller is
     * work even before the first step is ticked.
     */
    @Transactional
    public void touch(Trade t) {
        t.setEscalationDeadlineAt(Instant.now().plus(Duration.ofSeconds(idleSeconds)));
        trades.save(t);
    }
}
```

`admin/service/TradeStepService.java`:

```java
package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeStepMark;
import uz.efbazaar.trade.admin.dto.TradeStepResponse;
import uz.efbazaar.trade.admin.repository.TradeStepMarkRepository;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.domain.TradeStep;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeAuditService;
import uz.efbazaar.trade.trade.service.TradeChatService;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The manual progress record of a human trade.
 *
 * <p>Both parties read it; only the assigned admin writes it, and only while
 * the trade is {@code IN_PROGRESS} — once the admin has closed, the checklist
 * is the thing the parties are confirming against and must not move.
 *
 * <p>Every write re-arms {@code escalation_deadline_at}: an admin who is
 * visibly working must never surface in the escalation queue.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeStepService {

    private final TradeStepMarkRepository steps;
    private final TradeRepository trades;
    private final TradeChatService chatService;
    private final TradeIdleWatchdog idleWatchdog;
    private final TradeAuditService audit;

    @Transactional(readOnly = true)
    public List<TradeStepResponse> list(UUID tradeId, UUID viewerId) {
        // Any viewer — both parties and the admin — may read.
        trades.findByIdAndViewer(tradeId, viewerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Savdo topilmadi"));
        return steps.findByTradeIdOrderByStep(tradeId).stream()
                .map(TradeStepResponse::of)
                .toList();
    }

    @Transactional
    public List<TradeStepResponse> mark(UUID tradeId, UUID adminId, TradeStep step, String note) {
        Trade t = requireWorkingAdmin(tradeId, adminId);
        TradeStepMark m = requireStep(tradeId, step);

        if (!m.isComplete()) {
            m.setCompletedAt(Instant.now());
            m.setCompletedBy(adminId);
        }
        // A repeated mark may still refresh the note without moving the time.
        if (note != null && !note.isBlank()) {
            m.setNote(note);
        }
        steps.save(m);

        idleWatchdog.touch(t);
        audit.record(tradeId, ActorType.TRADE_ADMIN, adminId, "STEP_MARKED",
                Map.of("step", step.name()));
        chatService.postStatusToBoth(tradeId, "STEP_MARKED", Map.of(
                "step", step.name(),
                "label", step.labelUz()));

        return listRaw(tradeId);
    }

    @Transactional
    public List<TradeStepResponse> unmark(UUID tradeId, UUID adminId, TradeStep step) {
        Trade t = requireWorkingAdmin(tradeId, adminId);
        TradeStepMark m = requireStep(tradeId, step);

        m.setCompletedAt(null);
        m.setCompletedBy(null);
        steps.save(m);

        idleWatchdog.touch(t);
        audit.record(tradeId, ActorType.TRADE_ADMIN, adminId, "STEP_UNMARKED",
                Map.of("step", step.name()));
        chatService.postStatusToBoth(tradeId, "STEP_UNMARKED", Map.of(
                "step", step.name(),
                "label", step.labelUz()));

        return listRaw(tradeId);
    }

    /** Gate for {@code ADMIN_CLOSED} — see Task 13. */
    @Transactional(readOnly = true)
    public boolean allComplete(UUID tradeId) {
        return steps.countByTradeIdAndCompletedAtIsNotNull(tradeId) == TradeStep.values().length;
    }

    @Transactional(readOnly = true)
    public long completedCount(UUID tradeId) {
        return steps.countByTradeIdAndCompletedAtIsNotNull(tradeId);
    }

    private List<TradeStepResponse> listRaw(UUID tradeId) {
        return steps.findByTradeIdOrderByStep(tradeId).stream()
                .map(TradeStepResponse::of)
                .toList();
    }

    private Trade requireWorkingAdmin(UUID tradeId, UUID adminId) {
        Trade t = trades.findByIdAndViewer(tradeId, adminId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Savdo topilmadi"));
        if (!adminId.equals(t.getAssignedAdminId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Qadamlarni faqat biriktirilgan admin belgilaydi");
        }
        if (t.getState() != TradeState.IN_PROGRESS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Qadamlar faqat savdo davomida o'zgartiriladi");
        }
        return t;
    }

    private TradeStepMark requireStep(UUID tradeId, TradeStep step) {
        return steps.findByTradeIdAndStep(tradeId, step)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Bu savdoda bunday qadam yo'q"));
    }
}
```

- [ ] **Step 5: Expose the endpoints**

Add to `admin/controller/TradeAdminWorkController.java`:

```java
    @GetMapping("/api/v1/trades/{id}/steps")
    @PreAuthorize("isAuthenticated()")
    public List<TradeStepResponse> steps(@AuthenticationPrincipal AuthenticatedUser me,
                                         @PathVariable UUID id) {
        return stepService.list(id, me.userId());
    }

    @PostMapping("/api/v1/trades/{id}/steps/{step}")
    public List<TradeStepResponse> markStep(@AuthenticationPrincipal AuthenticatedUser me,
                                            @PathVariable UUID id,
                                            @PathVariable TradeStep step,
                                            @Valid @RequestBody(required = false) MarkStepRequest req) {
        return stepService.mark(id, me.userId(), step, req == null ? null : req.note());
    }

    @DeleteMapping("/api/v1/trades/{id}/steps/{step}")
    public List<TradeStepResponse> unmarkStep(@AuthenticationPrincipal AuthenticatedUser me,
                                              @PathVariable UUID id,
                                              @PathVariable TradeStep step) {
        return stepService.unmark(id, me.userId(), step);
    }
```

Inject `private final TradeStepService stepService;` and import `MarkStepRequest`, `TradeStepResponse`, `TradeStep`, `jakarta.validation.Valid`.

The `GET` needs `@PreAuthorize("isAuthenticated()")` to override the class-level `ROLE_TRADE_ADMIN` — the parties must be able to read their own checklist.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend/trade-service && mvn verify -Dit.test=TradeStepServiceIT`
Expected: PASS, 10 tests.

- [ ] **Step 7: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/TradeStepResponse.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/MarkStepRequest.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeStepService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/controller/TradeAdminWorkController.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/admin/TradeStepServiceIT.java
git commit -m "feat(trade): add the six-step human trade checklist"
```

---

## Task 12: trade-service — admin chat access over REST and WebSocket

**Files:**
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeChatService.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeMessageController.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/config/WebSocketConfig.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/admin/AdminChatAccessIT.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/ws/TradeWebSocketAuthzIT.java`

**Interfaces:**
- Consumes: `TradeViewer`, `Trade.viewerFor` (Task 4); `TradeIdleWatchdog.touch` (Task 11).
- Produces:
  - `TradeChatService.postTextAs(UUID tradeId, UUID senderUserId, ParticipantRole target, String text)` — the admin form; `target` chooses which chat
  - `TradeChatService.listFor(UUID tradeId, UUID viewerId, ParticipantRole target)` — the admin reads either chat
  - Existing `postText` and `list` keep their party-only behaviour and delegate to the new methods.

**Context:** The admin writes into whichever party chat they name; `senderType` is `HUMAN_ADMIN` so the client can style it distinctly from `SMART_ADMIN`. The party form is unchanged: `target` is ignored for a party, who always writes to their own chat.

WebSocket needs no new topic. The admin subscribes to the two existing `/topic/trades/{id}/seller` and `/topic/trades/{id}/buyer` destinations; `handleSubscribe` is widened to admit the assigned admin on either. That is not a leak — the admin is entitled to both.

An admin chat message also re-arms the idle watchdog: talking to the seller for an hour without ticking a step is work.

- [ ] **Step 1: Write the failing REST test**

```java
package uz.efbazaar.trade.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.service.TradeAdminAssignmentService;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class AdminChatAccessIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired TradeRepository trades;
    @Autowired TradeChatRepository chats;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired TradeAdminAssignmentService assignments;
    @Autowired MailboxService mailboxes;

    private static final String TA = "ROLE_TRADE_ADMIN";

    private UUID adminId;
    private Trade trade;

    private void givenAcceptedTrade() {
        adminId = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(adminId).minFeeUzs(15_000).maxFeeUzs(40_000).build());
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        trade = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(TradeState.WAITING_ADMIN)
                .mailboxId(mailboxId)
                .mode(TradeMode.HUMAN)
                .assignedAdminId(adminId)
                .adminFeeUzs(20_000L)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(trade.getId()).participant(ParticipantRole.SELLER).build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(trade.getId()).participant(ParticipantRole.BUYER).build());
        assignments.accept(adminId, trade.getId());
    }

    private String text(String s) throws Exception {
        return json.writeValueAsString(Map.of("text", s));
    }

    @Test
    void adminWritesIntoTheSellerChatAndTheSellerSeesIt() throws Exception {
        givenAcceptedTrade();

        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("Akkountni shu emailga o'tkazing")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.senderType").value("HUMAN_ADMIN"));

        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages")
                        .with(asUser(trade.getSellerId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.body=='Akkountni shu emailga o''tkazing')]").exists());
    }

    @Test
    void theOtherPartyDoesNotSeeIt() throws Exception {
        givenAcceptedTrade();
        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("faqat sotuvchiga")))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages")
                        .with(asUser(trade.getBuyerId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.body=='faqat sotuvchiga')]").doesNotExist());
    }

    @Test
    void adminCanReadEitherChat() throws Exception {
        givenAcceptedTrade();

        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA)))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages?target=BUYER")
                        .with(asUser(adminId, "ROLE_USER", TA)))
                .andExpect(status().isOk());
    }

    @Test
    void adminMustNameATargetChat() throws Exception {
        givenAcceptedTrade();

        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages")
                        .with(asUser(adminId, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("qaysi chatga?")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void partyTargetParameterIsIgnored() throws Exception {
        givenAcceptedTrade();

        // The seller aiming at BUYER still lands in their own chat.
        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages?target=BUYER")
                        .with(asUser(trade.getSellerId()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("men sotuvchiman")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.senderType").value("USER"));

        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages")
                        .with(asUser(trade.getBuyerId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.body=='men sotuvchiman')]").doesNotExist());
    }

    @Test
    void unassignedAdminCannotWrite() throws Exception {
        givenAcceptedTrade();
        UUID intruder = UUID.randomUUID();

        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(intruder, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("men ham adminman")))
                .andExpect(status().isNotFound());
    }

    @Test
    void adminMessageReArmsTheIdleWatchdog() throws Exception {
        givenAcceptedTrade();
        Trade t = trades.findById(trade.getId()).orElseThrow();
        t.setEscalationDeadlineAt(Instant.now().minusSeconds(60));
        trades.save(t);

        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("uzoq suhbat")))
                .andExpect(status().isOk());

        org.assertj.core.api.Assertions
                .assertThat(trades.findById(trade.getId()).orElseThrow().getEscalationDeadlineAt())
                .isAfter(Instant.now());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/trade-service && mvn verify -Dit.test=AdminChatAccessIT`
Expected: FAIL — `target` is unknown, the admin gets 404 from `postText`.

- [ ] **Step 3: Widen `TradeChatService`**

Replace `postText` and `list` with viewer-aware versions, keeping the old signatures as delegates:

```java
    /** Party form — writes into the caller's own chat. */
    @Transactional
    public TradeMessage postText(UUID tradeId, UUID viewerUserId, String text) {
        return postTextAs(tradeId, viewerUserId, null, text);
    }

    /**
     * Viewer-aware post. A party always writes to their own chat and
     * {@code target} is ignored; the assigned admin must name a target.
     */
    @Transactional
    public TradeMessage postTextAs(UUID tradeId, UUID senderUserId,
                                   ParticipantRole target, String text) {
        Trade t = trades.getForViewer(tradeId, senderUserId);
        if (t.getState().isTerminal()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Savdo yopilgan — yangi xabar yozilmaydi");
        }
        TradeViewer viewer = t.viewerFor(senderUserId);

        ParticipantRole chatRole;
        TradeSenderType senderType;
        if (viewer == TradeViewer.ADMIN) {
            if (target == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Qaysi chatga yozilayotganini ko'rsating: SELLER yoki BUYER");
            }
            chatRole = target;
            senderType = TradeSenderType.HUMAN_ADMIN;
        } else {
            chatRole = viewer.asParticipantRole();
            senderType = TradeSenderType.USER;
        }

        var chat = chats.findByTradeIdAndParticipant(tradeId, chatRole)
                .orElseThrow(() -> new EntityNotFoundException("chat for " + chatRole));

        UUID messageId = UUID.randomUUID();
        EncryptedField enc = crypto.encrypt(
                context(tradeId, messageId),
                text.getBytes(StandardCharsets.UTF_8));

        TradeMessage msg = TradeMessage.builder()
                .id(messageId)
                .tradeChatId(chat.getId())
                .senderType(senderType)
                .messageType(TradeMessageType.TEXT)
                .encryptedBody(enc.ciphertext())
                .iv(enc.iv())
                .tag(enc.tag())
                .build();
        messages.save(msg);

        TradeMessageResponse resp = new TradeMessageResponse(msg.getId(), msg.getSenderType(),
                msg.getMessageType(), text, msg.getMetadata(), msg.getCreatedAt());
        broadcaster.publishMessage(tradeId, chatRole, resp);
        return msg;
    }

    /** Party form — reads the caller's own chat. */
    @Transactional(readOnly = true)
    public List<TradeMessageResponse> list(UUID tradeId, UUID viewerUserId) {
        return listFor(tradeId, viewerUserId, null);
    }

    /** Viewer-aware read. The admin may name either chat; a party may not. */
    @Transactional(readOnly = true)
    public List<TradeMessageResponse> listFor(UUID tradeId, UUID viewerUserId,
                                             ParticipantRole target) {
        Trade t = trades.getForViewer(tradeId, viewerUserId);
        TradeViewer viewer = t.viewerFor(viewerUserId);

        ParticipantRole chatRole;
        if (viewer == TradeViewer.ADMIN) {
            if (target == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Qaysi chat o'qilayotganini ko'rsating: SELLER yoki BUYER");
            }
            chatRole = target;
        } else {
            chatRole = viewer.asParticipantRole();
        }

        var chat = chats.findByTradeIdAndParticipant(tradeId, chatRole)
                .orElseThrow(() -> new EntityNotFoundException("chat for " + chatRole));

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
```

`trades` here is the injected `TradeService`; swap the existing `trades.get(...)` calls for `trades.getForViewer(...)` as shown. Add imports for `TradeViewer` and `TradeSenderType` if absent.

Then re-arm the watchdog for admin messages by adding, just before the `return msg;` in `postTextAs`:

```java
        if (viewer == TradeViewer.ADMIN) {
            // Talking to a party is work even before any step is ticked (§7.2).
            idleWatchdog.touch(t);
        }
```

and inject `private final TradeIdleWatchdog idleWatchdog;` (the component created in Task 11), calling `idleWatchdog.touch(t)`.

Note it is `TradeIdleWatchdog`, **not** `TradeStepService`. Injecting `TradeStepService` here would create a cycle — it already depends on `TradeChatService` — and `@Lazy` would only defer the problem. The watchdog depends on nothing but `TradeRepository`, so both services can hold it.

- [ ] **Step 4: Pass `target` through the controller**

In `trade/controller/TradeMessageController.java`:

```java
    @GetMapping
    public List<TradeMessageResponse> list(@AuthenticationPrincipal AuthenticatedUser me,
                                           @PathVariable UUID id,
                                           @RequestParam(required = false) ParticipantRole target) {
        return chat.listFor(id, me.userId(), target);
    }

    @PostMapping
    public TradeMessageResponse postText(@AuthenticationPrincipal AuthenticatedUser me,
                                         @PathVariable UUID id,
                                         @RequestParam(required = false) ParticipantRole target,
                                         @Valid @RequestBody PostTextRequest req) {
        var m = chat.postTextAs(id, me.userId(), target, req.text());
        return new TradeMessageResponse(m.getId(), m.getSenderType(), m.getMessageType(),
                req.text(), m.getMetadata(), m.getCreatedAt());
    }
```

Add `import uz.efbazaar.trade.trade.domain.ParticipantRole;`.

- [ ] **Step 5: Widen the STOMP subscribe check**

In `config/WebSocketConfig.java`, inside `handleSubscribe`, replace the participant lookup and role match with:

```java
            var trade = trades.findByIdAndViewer(tradeId, principal.userId())
                    .orElseThrow(() -> {
                        log.warn("SUBSCRIBE to {} rejected — user {} may not view this trade",
                                destination, principal.userId());
                        return new MessagingException("Not a viewer of this trade");
                    });

            TradeViewer viewer = trade.viewerFor(principal.userId());
            // The assigned admin legitimately follows BOTH party chats — that is
            // the whole shape of a human trade, not a leak.
            if (viewer == TradeViewer.ADMIN) {
                return message;
            }

            boolean roleMatches =
                    (viewer == TradeViewer.SELLER && "seller".equals(subscribedRole))
                 || (viewer == TradeViewer.BUYER  && "buyer".equals(subscribedRole));
            if (!roleMatches) {
                log.warn("SUBSCRIBE to {} rejected — user {} is {} but asked for {}",
                        destination, principal.userId(), viewer, subscribedRole);
                throw new MessagingException("Subscribed role does not match caller's role in trade");
            }

            return message;
```

Add `import uz.efbazaar.trade.trade.domain.TradeViewer;` and drop the now-unused `ParticipantRole` import if nothing else uses it.

- [ ] **Step 6: Add the WebSocket authorisation cases**

Append to `src/test/java/uz/efbazaar/trade/ws/TradeWebSocketAuthzIT.java`. The file already has a private `connect(UUID userId, BlockingQueue<StompHeaders> errors)` helper that opens a SockJS/STOMP session with the identity headers set and routes server ERROR frames into the queue — reuse it exactly as the two existing tests do.

```java
    @Test
    void assignedAdminMaySubscribeToBothPartyTopics() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        UUID admin  = UUID.randomUUID();

        // HUMAN trade, no cards, this admin assigned.
        TradeResponse t = trades.openTrade(seller, buyer, 80_000L,
                null, null, null, null, TradeMode.HUMAN, admin, 20_000L);

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        StompSession session = connect(admin, errors);

        session.subscribe("/topic/trades/" + t.id() + "/seller", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { }
        });
        session.subscribe("/topic/trades/" + t.id() + "/buyer", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { }
        });

        // Following both party chats is the whole shape of a human trade.
        assertThat(errors.poll(2, TimeUnit.SECONDS))
                .as("assigned admin must be allowed on both party topics")
                .isNull();
    }

    @Test
    void unassignedTradeAdminSubscribeIsRejected() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        UUID assigned = UUID.randomUUID();
        UUID otherAdmin = UUID.randomUUID();

        TradeResponse t = trades.openTrade(seller, buyer, 80_000L,
                null, null, null, null, TradeMode.HUMAN, assigned, 20_000L);

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        StompSession session = connect(otherAdmin, errors);

        session.subscribe("/topic/trades/" + t.id() + "/seller", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { }
        });

        assertThat(errors.poll(5, TimeUnit.SECONDS))
                .as("a trade admin not assigned to this trade is just a stranger")
                .isNotNull();
    }

    @Test
    void smartTradeStillRejectsAWrongRoleSubscribe() throws Exception {
        // Guards that widening the check for admins did not loosen it for parties.
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();

        TradeResponse t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        StompSession session = connect(buyer, errors);

        session.subscribe("/topic/trades/" + t.id() + "/seller", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { }
        });

        assertThat(errors.poll(5, TimeUnit.SECONDS)).isNotNull();
    }
```

Add `import uz.efbazaar.trade.trade.domain.TradeMode;` to the file's imports. The existing `connect` helper sends `X-User-Roles: ROLE_USER`, which is fine — the SUBSCRIBE check authorises on trade membership, not on authorities.

- [ ] **Step 7: Run both tests**

Run: `cd backend/trade-service && mvn verify -Dit.test='AdminChatAccessIT,TradeWebSocketAuthzIT'`
Expected: PASS. `TradeMessageControllerIT` must also stay green — the party path is unchanged.

- [ ] **Step 8: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeChatService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeMessageController.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/config/WebSocketConfig.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/admin/AdminChatAccessIT.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/ws/TradeWebSocketAuthzIT.java
git commit -m "feat(trade): let the assigned admin read and write both party chats"
```

---

## Task 13: trade-service — close, dual confirmation and statistics

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeCloseService.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/CloseConfirmResponse.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/controller/TradeAdminWorkController.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeActionController.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateHandler.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/admin/TradeCloseFlowIT.java`

**Interfaces:**
- Consumes: `TradeStepService.allComplete` (Task 11); `TradeAdminStats` (Task 6); `TradeEvent.ADMIN_CLOSED/CLOSE_CONFIRMED/ADMIN_CANCELLED` (Task 5).
- Produces:
  - `TradeCloseService.adminClose(UUID adminId, UUID tradeId)`, `.adminCancel(UUID adminId, UUID tradeId, String reason)`, `.confirm(UUID partyUserId, UUID tradeId)`
  - `record CloseConfirmResponse(boolean sellerConfirmed, boolean buyerConfirmed, TradeState state)`

**Context:** `close-confirm` is not itself a transition. It writes one timestamp; only when **both** are present does it fire `CLOSE_CONFIRMED`. That keeps the state machine honest — there is no "half-confirmed" state — and makes the 24 h timeout the single other route to `SUCCESS`.

Two parties confirming simultaneously must produce exactly one `SUCCESS`. The confirm reads the trade row with a pessimistic lock so the second caller sees the first one's timestamp.

Statistics are updated in `TradeStateHandler`, not here, because `SUCCESS` is also reachable from `TradeTimeoutScheduler` — the handler is the only place every route passes through.

- [ ] **Step 1: Write the failing test**

```java
package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.service.TradeAdminAssignmentService;
import uz.efbazaar.trade.admin.service.TradeCloseService;
import uz.efbazaar.trade.admin.service.TradeStepService;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;
import uz.efbazaar.trade.trade.service.TradeTimeoutScheduler;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class TradeCloseFlowIT extends AbstractIntegrationIT {

    @Autowired TradeCloseService closeService;
    @Autowired TradeStepService stepService;
    @Autowired TradeAdminAssignmentService assignments;
    @Autowired TradeRepository trades;
    @Autowired TradeService tradeService;
    @Autowired TradeChatRepository chats;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired MailboxService mailboxes;
    @Autowired TradeTimeoutScheduler timeouts;

    private UUID adminId;
    private Trade trade;

    private void givenTradeInProgress() {
        adminId = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(adminId).minFeeUzs(15_000).maxFeeUzs(40_000).build());
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        trade = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(TradeState.WAITING_ADMIN)
                .mailboxId(mailboxId)
                .mode(TradeMode.HUMAN)
                .assignedAdminId(adminId)
                .adminFeeUzs(20_000L)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(trade.getId()).participant(ParticipantRole.SELLER).build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(trade.getId()).participant(ParticipantRole.BUYER).build());
        assignments.accept(adminId, trade.getId());
    }

    private void markAllSteps() {
        for (TradeStep s : TradeStep.values()) {
            stepService.mark(trade.getId(), adminId, s, null);
        }
    }

    @Test
    void closeIsRefusedUntilAllSixStepsAreMarked() {
        givenTradeInProgress();
        stepService.mark(trade.getId(), adminId, TradeStep.SELLER_BRIEFED, null);

        assertThatThrownBy(() -> closeService.adminClose(adminId, trade.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
        assertThat(trades.findById(trade.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.IN_PROGRESS);
    }

    @Test
    void closeWithSixOfSixMovesToWaitingCloseConfirm() {
        givenTradeInProgress();
        markAllSteps();

        closeService.adminClose(adminId, trade.getId());

        Trade after = trades.findById(trade.getId()).orElseThrow();
        assertThat(after.getState()).isEqualTo(TradeState.WAITING_CLOSE_CONFIRM);
        assertThat(after.getAdminClosedAt()).isNotNull();
        assertThat(after.getStateDeadline()).isAfter(Instant.now());
    }

    @Test
    void oneConfirmationIsNotEnough() {
        givenTradeInProgress();
        markAllSteps();
        closeService.adminClose(adminId, trade.getId());

        var result = closeService.confirm(trade.getSellerId(), trade.getId());

        assertThat(result.sellerConfirmed()).isTrue();
        assertThat(result.buyerConfirmed()).isFalse();
        assertThat(result.state()).isEqualTo(TradeState.WAITING_CLOSE_CONFIRM);
    }

    @Test
    void bothConfirmationsSucceedTheTrade() {
        givenTradeInProgress();
        markAllSteps();
        closeService.adminClose(adminId, trade.getId());

        closeService.confirm(trade.getSellerId(), trade.getId());
        var result = closeService.confirm(trade.getBuyerId(), trade.getId());

        assertThat(result.state()).isEqualTo(TradeState.SUCCESS);
        assertThat(trades.findById(trade.getId()).orElseThrow().getTerminalReason())
                .isEqualTo("ADMIN_CLOSED_CONFIRMED");
    }

    @Test
    void confirmingTwiceIsIdempotent() {
        givenTradeInProgress();
        markAllSteps();
        closeService.adminClose(adminId, trade.getId());

        closeService.confirm(trade.getSellerId(), trade.getId());
        var again = closeService.confirm(trade.getSellerId(), trade.getId());

        assertThat(again.sellerConfirmed()).isTrue();
        assertThat(again.state()).isEqualTo(TradeState.WAITING_CLOSE_CONFIRM);
    }

    @Test
    void theAdminCannotConfirmOnAPartysBehalf() {
        givenTradeInProgress();
        markAllSteps();
        closeService.adminClose(adminId, trade.getId());

        assertThatThrownBy(() -> closeService.confirm(adminId, trade.getId()))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void silenceForTwentyFourHoursStillSucceeds() {
        givenTradeInProgress();
        markAllSteps();
        closeService.adminClose(adminId, trade.getId());

        Trade t = trades.findById(trade.getId()).orElseThrow();
        t.setStateDeadline(Instant.now().minusSeconds(1));
        trades.save(t);

        timeouts.sweep();

        assertThat(trades.findById(trade.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.SUCCESS);
    }

    @Test
    void completingCreditsTheAdminsWorkTimeNotThePartiesLatency() {
        givenTradeInProgress();
        markAllSteps();

        // Pretend the admin worked for an hour, then the parties dawdled a day.
        Trade t = trades.findById(trade.getId()).orElseThrow();
        t.setAdminAcceptedAt(Instant.now().minus(Duration.ofDays(1).plusHours(1)));
        trades.save(t);
        closeService.adminClose(adminId, trade.getId());
        t = trades.findById(trade.getId()).orElseThrow();
        t.setAdminClosedAt(t.getAdminAcceptedAt().plus(Duration.ofHours(1)));
        trades.save(t);

        closeService.confirm(trade.getSellerId(), trade.getId());
        closeService.confirm(trade.getBuyerId(), trade.getId());

        TradeAdminProfile p = profiles.findById(adminId).orElseThrow();
        assertThat(p.getCompletedCount()).isEqualTo(1);
        assertThat(p.getTotalWorkSeconds()).isEqualTo(3600);
        assertThat(p.getTotalCloseSeconds())
                .as("close time includes the parties' latency, work time does not")
                .isGreaterThan(p.getTotalWorkSeconds());
        assertThat(p.averageWorkSeconds()).isEqualTo(3600);
    }

    @Test
    void cancellingCountsAgainstTheAdmin() {
        givenTradeInProgress();

        closeService.adminCancel(adminId, trade.getId(), "akkount qalbaki");

        assertThat(trades.findById(trade.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.REJECTED);
        assertThat(profiles.findById(adminId).orElseThrow().getCancelledCount())
                .isEqualTo(1);
    }

    @Test
    void smartTradeReachingSuccessDoesNotTouchAdminStatistics() {
        // A smart trade has no admin. The handler's SUCCESS case must skip the
        // stats write entirely rather than call it with a null id.
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        Trade smart = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(50_000)
                .state(TradeState.WAITING_BUYER_VERIFY)
                .mailboxId(mailboxId)
                .sellerCardId(UUID.randomUUID())
                .buyerCardId(UUID.randomUUID())
                .mode(TradeMode.SMART)
                .expiresAt(Instant.now().plus(Duration.ofHours(24)))
                .build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(smart.getId()).participant(ParticipantRole.SELLER).build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(smart.getId()).participant(ParticipantRole.BUYER).build());
        long profilesBefore = profiles.count();

        // Drive the real smart-path transition through the handler.
        Trade after = tradeService.transition(smart.getId(), TradeEvent.BUYER_CONFIRM,
                ActorType.USER, smart.getBuyerId());

        assertThat(after.getState()).isEqualTo(TradeState.SUCCESS);
        assertThat(after.getTerminalReason())
                .as("smart trades keep their original terminal reason")
                .isEqualTo("BUYER_CONFIRMED");
        assertThat(profiles.count())
                .as("no phantom profile row was created for a null admin")
                .isEqualTo(profilesBefore);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/trade-service && mvn verify -Dit.test=TradeCloseFlowIT`
Expected: compilation failure — `TradeCloseService` does not exist.

- [ ] **Step 3: Add the locking finder and the response DTO**

In `trade/repository/TradeRepository.java`:

```java
    /**
     * Row lock for the dual-confirmation write: two parties confirming at once
     * must serialise so the second sees the first one's timestamp and fires
     * CLOSE_CONFIRMED exactly once.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM Trade t WHERE t.id = :id")
    Optional<Trade> findByIdForUpdate(@Param("id") UUID id);
```

with imports `jakarta.persistence.LockModeType` and `org.springframework.data.jpa.repository.Lock`.

`admin/dto/CloseConfirmResponse.java`:

```java
package uz.efbazaar.trade.admin.dto;

import uz.efbazaar.trade.trade.domain.TradeState;

/**
 * After a party confirms: who has confirmed so far, and where the trade ended
 * up. {@code state} is still WAITING_CLOSE_CONFIRM until both are in.
 */
public record CloseConfirmResponse(
        boolean sellerConfirmed,
        boolean buyerConfirmed,
        TradeState state
) {}
```

- [ ] **Step 4: Create the close service**

`admin/service/TradeCloseService.java`:

```java
package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.dto.CloseConfirmResponse;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeAuditService;
import uz.efbazaar.trade.trade.service.TradeChatService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Closing a human trade.
 *
 * <p>The admin may only close at 6/6 — the checklist is the record the parties
 * are asked to confirm. Confirmation is two independent timestamps rather than
 * a state, so there is no "half-confirmed" state to reason about; the
 * transition fires when the second one lands.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeCloseService {

    private final TradeRepository trades;
    private final TradeService tradeService;
    private final TradeStepService steps;
    private final TradeChatService chatService;
    private final TradeAuditService audit;

    @Transactional
    public void adminClose(UUID adminId, UUID tradeId) {
        Trade t = requireAssignedAdmin(tradeId, adminId);
        if (t.getState() != TradeState.IN_PROGRESS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu savdo yopishga tayyor emas");
        }
        if (!steps.allComplete(tradeId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Barcha %d qadam belgilanmaguncha savdo yopilmaydi (%d/%d)".formatted(
                            TradeStep.values().length,
                            steps.completedCount(tradeId),
                            TradeStep.values().length));
        }

        tradeService.transition(tradeId, TradeEvent.ADMIN_CLOSED,
                ActorType.TRADE_ADMIN, adminId);

        chatService.postStatusToBoth(tradeId, "ADMIN_CLOSED", Map.of(
                "adminId", adminId.toString()));
    }

    @Transactional
    public void adminCancel(UUID adminId, UUID tradeId, String reason) {
        Trade t = requireAssignedAdmin(tradeId, adminId);
        if (t.getState() != TradeState.IN_PROGRESS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu savdoni hozir bekor qilolmaysiz");
        }

        audit.record(tradeId, ActorType.TRADE_ADMIN, adminId, "ADMIN_CANCELLED",
                Map.of("reason", reason == null ? "" : reason));
        chatService.postStatusToBoth(tradeId, "ADMIN_CANCELLED", Map.of(
                "reason", reason == null ? "" : reason));

        // Handler rotates the mailbox, returns it to the seller and records the
        // cancellation against the admin.
        tradeService.transition(tradeId, TradeEvent.ADMIN_CANCELLED,
                ActorType.TRADE_ADMIN, adminId);
    }

    /**
     * One party confirms the trade finished. Fires {@code CLOSE_CONFIRMED} only
     * once both have. Idempotent per party.
     */
    @Transactional
    public CloseConfirmResponse confirm(UUID partyUserId, UUID tradeId) {
        // Party-only path: get() excludes the admin, which is exactly right —
        // the admin must not be able to confirm on anybody's behalf.
        tradeService.get(tradeId, partyUserId);

        Trade t = trades.findByIdForUpdate(tradeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Savdo topilmadi"));
        if (t.getState() != TradeState.WAITING_CLOSE_CONFIRM) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu savdo tasdiqlash holatida emas");
        }

        ParticipantRole role = t.roleFor(partyUserId);
        boolean changed = false;
        if (role == ParticipantRole.SELLER && t.getSellerConfirmedAt() == null) {
            t.setSellerConfirmedAt(Instant.now());
            changed = true;
        } else if (role == ParticipantRole.BUYER && t.getBuyerConfirmedAt() == null) {
            t.setBuyerConfirmedAt(Instant.now());
            changed = true;
        }
        if (changed) {
            trades.save(t);
            audit.record(tradeId, ActorType.USER, partyUserId, "CLOSE_CONFIRMED_BY",
                    Map.of("role", role.name()));
            chatService.postStatusToBoth(tradeId, "PARTY_CONFIRMED",
                    Map.of("role", role.name()));
        }

        boolean sellerOk = t.getSellerConfirmedAt() != null;
        boolean buyerOk  = t.getBuyerConfirmedAt() != null;

        if (sellerOk && buyerOk) {
            Trade done = tradeService.transition(tradeId, TradeEvent.CLOSE_CONFIRMED,
                    ActorType.SYSTEM, null);
            return new CloseConfirmResponse(true, true, done.getState());
        }
        return new CloseConfirmResponse(sellerOk, buyerOk, t.getState());
    }

    private Trade requireAssignedAdmin(UUID tradeId, UUID adminId) {
        Trade t = trades.findByIdAndViewer(tradeId, adminId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Savdo topilmadi"));
        if (!adminId.equals(t.getAssignedAdminId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Bu savdo sizga biriktirilmagan");
        }
        return t;
    }
}
```

- [ ] **Step 5: Wire statistics into the handler**

In `TradeStateHandler`, inject the port:

```java
    private final TradeAdminStats adminStats;
```

Add to the `SUCCESS` case, after the audit record:

```java
                if (trade.getMode() == TradeMode.HUMAN && trade.getAssignedAdminId() != null) {
                    Instant accepted = trade.getAdminAcceptedAt();
                    Instant closed = trade.getAdminClosedAt();
                    long work = (accepted != null && closed != null)
                            ? Duration.between(accepted, closed).getSeconds() : 0;
                    long total = accepted != null
                            ? Duration.between(accepted, Instant.now()).getSeconds() : 0;
                    adminStats.recordCompleted(trade.getAssignedAdminId(), work, total);
                }
```

Add to the `REJECTED` case, after the audit record:

```java
                // Only a cancellation the admin chose counts as "cancelled".
                // A platform admin cancelling an escalated trade is recorded as
                // abandonment instead, by TradeEscalationService (Task 15) —
                // hence the actor check, so it is not counted twice.
                if (trade.getMode() == TradeMode.HUMAN
                        && trade.getAssignedAdminId() != null
                        && event == TradeEvent.ADMIN_CANCELLED
                        && actor == ActorType.TRADE_ADMIN) {
                    adminStats.recordCancelled(trade.getAssignedAdminId());
                }
```

`TradeAdminProfileService` is the only implementation, and it depends on the repository and `AuthSummaryClient` — never on `TradeService` — so there is no cycle.

- [ ] **Step 6: Expose the endpoints**

Add to `TradeAdminWorkController`:

```java
    @PostMapping("/api/v1/trades/{id}/actions/admin-close")
    public TradeResponse close(@AuthenticationPrincipal AuthenticatedUser me,
                               @PathVariable UUID id) {
        closeService.adminClose(me.userId(), id);
        return trades.toResponse(trades.getForViewer(id, me.userId()), null);
    }

    @PostMapping("/api/v1/trades/{id}/actions/admin-cancel")
    public TradeResponse cancel(@AuthenticationPrincipal AuthenticatedUser me,
                                @PathVariable UUID id,
                                @RequestParam(required = false) String reason) {
        closeService.adminCancel(me.userId(), id, reason);
        return trades.toResponse(trades.getForViewer(id, me.userId()), null);
    }
```

Inject `private final TradeCloseService closeService;`.

Add to `TradeActionController` (the party side):

```java
    @PostMapping("/close-confirm")
    public CloseConfirmResponse closeConfirm(@AuthenticationPrincipal AuthenticatedUser me,
                                             @PathVariable UUID id) {
        return closeService.confirm(me.userId(), id);
    }
```

Inject `private final TradeCloseService closeService;` there too.

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend/trade-service && mvn verify -Dit.test=TradeCloseFlowIT`
Expected: PASS, 10 tests.

- [ ] **Step 8: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeCloseService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/CloseConfirmResponse.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/controller/TradeAdminWorkController.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/controller/TradeActionController.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateHandler.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeRepository.java \
        backend/trade-service/src/test/java/uz/efbazaar/trade/admin/TradeCloseFlowIT.java
git commit -m "feat(trade): add admin close with dual party confirmation and work stats"
```

---

## Task 14: trade-service — ratings

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/repository/TradeAdminRatingRepository.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/RateAdminRequest.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/TradeAdminRatingResponse.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeAdminRatingService.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/controller/TradeAdminRatingController.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/controller/TradeAdminProfileController.java`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/admin/TradeAdminRatingIT.java`

**Interfaces:**
- Consumes: `TradeAdminStats.recordRating` (Task 6); `TradeAdminRating` (Task 3).
- Produces:
  - `record RateAdminRequest(@NotNull @Min(1) @Max(5) Integer stars, @Size(max=500) String comment)`
  - `record TradeAdminRatingResponse(UUID id, short stars, String comment, ParticipantRole raterRole, Instant createdAt)` — `comment` is `null` when hidden
  - `TradeAdminRatingService.rate(UUID raterId, UUID tradeId, RateAdminRequest req)`, `.listPublic(UUID adminId)`, `.hide(UUID ratingId, UUID platformAdminId)`

**Context:** A rating is not a chat message, so it still works after the chat is closed. The window is `trade.human.rating-window-days` (7) after the trade reached `SUCCESS`.

Hiding a comment blanks the **text only**. `rating_sum` and `rating_count` are never adjusted on hide — otherwise a platform admin could lift an admin's score by moderating (spec §10).

- [ ] **Step 1: Write the failing test**

```java
package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.dto.RateAdminRequest;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.service.TradeAdminRatingService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class TradeAdminRatingIT extends AbstractIntegrationIT {

    @Autowired TradeAdminRatingService ratings;
    @Autowired TradeRepository trades;
    @Autowired TradeAdminProfileRepository profiles;

    private UUID adminId;
    private Trade trade;

    private void givenSuccessfulTrade(Instant updatedAt) {
        adminId = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(adminId).minFeeUzs(15_000).maxFeeUzs(40_000).build());
        trade = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(TradeState.SUCCESS)
                .mailboxId(UUID.randomUUID())
                .mode(TradeMode.HUMAN)
                .assignedAdminId(adminId)
                .adminFeeUzs(20_000L)
                .adminAcceptedAt(updatedAt.minus(Duration.ofHours(2)))
                .adminClosedAt(updatedAt.minus(Duration.ofHours(1)))
                .updatedAt(updatedAt)
                .expiresAt(updatedAt.plus(Duration.ofDays(7)))
                .build());
    }

    @Test
    void bothPartiesMayRateAndTheAverageFollows() {
        givenSuccessfulTrade(Instant.now());

        ratings.rate(trade.getSellerId(), trade.getId(), new RateAdminRequest(5, "zo'r ishladi"));
        ratings.rate(trade.getBuyerId(), trade.getId(), new RateAdminRequest(3, null));

        TradeAdminProfile p = profiles.findById(adminId).orElseThrow();
        assertThat(p.getRatingCount()).isEqualTo(2);
        assertThat(p.getRatingSum()).isEqualTo(8);
        assertThat(p.averageStars()).isEqualTo(4.0);
    }

    @Test
    void aPartyMayRateOnlyOnce() {
        givenSuccessfulTrade(Instant.now());
        ratings.rate(trade.getSellerId(), trade.getId(), new RateAdminRequest(5, null));

        assertThatThrownBy(() -> ratings.rate(trade.getSellerId(), trade.getId(),
                new RateAdminRequest(1, "fikrimni o'zgartirdim")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");

        assertThat(profiles.findById(adminId).orElseThrow().getRatingCount()).isEqualTo(1);
    }

    @Test
    void theAdminCannotRateThemselves() {
        givenSuccessfulTrade(Instant.now());

        assertThatThrownBy(() -> ratings.rate(adminId, trade.getId(),
                new RateAdminRequest(5, "o'zimni maqtayman")))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void ratingBeforeSuccessIsRefused() {
        givenSuccessfulTrade(Instant.now());
        Trade t = trades.findById(trade.getId()).orElseThrow();
        t.setState(TradeState.IN_PROGRESS);
        trades.save(t);

        assertThatThrownBy(() -> ratings.rate(trade.getSellerId(), trade.getId(),
                new RateAdminRequest(5, null)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void theWindowClosesAfterSevenDays() {
        givenSuccessfulTrade(Instant.now().minus(Duration.ofDays(8)));

        assertThatThrownBy(() -> ratings.rate(trade.getSellerId(), trade.getId(),
                new RateAdminRequest(5, null)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    void smartTradeHasNobodyToRate() {
        Trade smart = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(50_000)
                .state(TradeState.SUCCESS)
                .mailboxId(UUID.randomUUID())
                .sellerCardId(UUID.randomUUID())
                .buyerCardId(UUID.randomUUID())
                .mode(TradeMode.SMART)
                .expiresAt(Instant.now().plus(Duration.ofHours(24)))
                .build());

        assertThatThrownBy(() -> ratings.rate(smart.getSellerId(), smart.getId(),
                new RateAdminRequest(5, null)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void hidingBlanksTheCommentButKeepsTheStar() {
        givenSuccessfulTrade(Instant.now());
        ratings.rate(trade.getSellerId(), trade.getId(), new RateAdminRequest(1, "haqoratli matn"));
        UUID ratingId = ratings.listPublic(adminId).get(0).id();
        UUID platformAdmin = UUID.randomUUID();

        ratings.hide(ratingId, platformAdmin);

        var visible = ratings.listPublic(adminId);
        assertThat(visible).hasSize(1);
        assertThat(visible.get(0).comment()).isNull();
        assertThat(visible.get(0).stars()).isEqualTo((short) 1);

        TradeAdminProfile p = profiles.findById(adminId).orElseThrow();
        assertThat(p.getRatingCount())
                .as("moderation must not be a way to raise a score")
                .isEqualTo(1);
        assertThat(p.getRatingSum()).isEqualTo(1);
    }

    @Test
    void publicListIsNewestFirst() {
        givenSuccessfulTrade(Instant.now());
        ratings.rate(trade.getSellerId(), trade.getId(), new RateAdminRequest(5, "birinchi"));
        ratings.rate(trade.getBuyerId(), trade.getId(), new RateAdminRequest(4, "ikkinchi"));

        var list = ratings.listPublic(adminId);

        assertThat(list).hasSize(2);
        assertThat(list.get(0).createdAt()).isAfterOrEqualTo(list.get(1).createdAt());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/trade-service && mvn verify -Dit.test=TradeAdminRatingIT`
Expected: compilation failure — the rating service does not exist.

- [ ] **Step 3: Create the repository and DTOs**

`admin/repository/TradeAdminRatingRepository.java`:

```java
package uz.efbazaar.trade.admin.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.admin.domain.TradeAdminRating;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TradeAdminRatingRepository extends JpaRepository<TradeAdminRating, UUID> {

    List<TradeAdminRating> findByAdminIdOrderByCreatedAtDesc(UUID adminId);

    Optional<TradeAdminRating> findByTradeIdAndRaterId(UUID tradeId, UUID raterId);
}
```

`admin/dto/RateAdminRequest.java`:

```java
package uz.efbazaar.trade.admin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** One party's verdict. Comment optional; shown publicly unless moderated. */
public record RateAdminRequest(
        @NotNull @Min(1) @Max(5) Integer stars,
        @Size(max = 500) String comment
) {}
```

`admin/dto/TradeAdminRatingResponse.java`:

```java
package uz.efbazaar.trade.admin.dto;

import uz.efbazaar.trade.admin.domain.TradeAdminRating;
import uz.efbazaar.trade.trade.domain.ParticipantRole;

import java.time.Instant;
import java.util.UUID;

/**
 * A rating as shown on the public profile. The rater's identity is not
 * exposed — only which side of the trade they were on.
 */
public record TradeAdminRatingResponse(
        UUID id,
        short stars,
        /** {@code null} when a platform admin has hidden the text. */
        String comment,
        ParticipantRole raterRole,
        Instant createdAt
) {
    public static TradeAdminRatingResponse of(TradeAdminRating r) {
        return new TradeAdminRatingResponse(
                r.getId(),
                r.getStars(),
                r.isHidden() ? null : r.getComment(),
                r.getRaterRole(),
                r.getCreatedAt());
    }
}
```

- [ ] **Step 4: Create the service**

`admin/service/TradeAdminRatingService.java`:

```java
package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminRating;
import uz.efbazaar.trade.admin.dto.RateAdminRequest;
import uz.efbazaar.trade.admin.dto.TradeAdminRatingResponse;
import uz.efbazaar.trade.admin.repository.TradeAdminRatingRepository;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.service.TradeAuditService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 1–5 stars from each party after a human trade succeeds.
 *
 * <p>Not a chat message, so it works after the chat has closed. Optional — a
 * party who never rates blocks nothing.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeAdminRatingService {

    private final TradeAdminRatingRepository ratings;
    private final TradeService tradeService;
    private final TradeAdminStats stats;
    private final TradeAuditService audit;

    @Value("${trade.human.rating-window-days:7}")
    private long windowDays;

    @Transactional
    public TradeAdminRatingResponse rate(UUID raterId, UUID tradeId, RateAdminRequest req) {
        // Party-only: get() excludes the admin, so they cannot rate themselves.
        Trade t = tradeService.get(tradeId, raterId);

        if (t.getMode() != TradeMode.HUMAN || t.getAssignedAdminId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu savdoda baholanadigan admin yo'q");
        }
        if (t.getState() != TradeState.SUCCESS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Baholash savdo muvaffaqiyatli yakunlangach ochiladi");
        }
        Instant closedAt = t.getUpdatedAt() == null ? Instant.now() : t.getUpdatedAt();
        if (closedAt.plus(Duration.ofDays(windowDays)).isBefore(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Baholash muddati tugagan (%d kun)".formatted(windowDays));
        }
        if (ratings.findByTradeIdAndRaterId(tradeId, raterId).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Siz bu savdoni allaqachon baholadingiz");
        }

        ParticipantRole role = t.roleFor(raterId);
        TradeAdminRating r = ratings.save(TradeAdminRating.builder()
                .id(UUID.randomUUID())
                .tradeId(tradeId)
                .adminId(t.getAssignedAdminId())
                .raterId(raterId)
                .raterRole(role)
                .stars(req.stars().shortValue())
                .comment(req.comment())
                .build());

        stats.recordRating(t.getAssignedAdminId(), req.stars());
        audit.record(tradeId, ActorType.USER, raterId, "ADMIN_RATED",
                Map.of("stars", String.valueOf(req.stars()), "role", role.name()));

        return TradeAdminRatingResponse.of(r);
    }

    @Transactional(readOnly = true)
    public List<TradeAdminRatingResponse> listPublic(UUID adminId) {
        return ratings.findByAdminIdOrderByCreatedAtDesc(adminId).stream()
                .map(TradeAdminRatingResponse::of)
                .toList();
    }

    /**
     * Platform moderation. Blanks the comment text and nothing else — the star
     * stays in the average, so hiding cannot be used to raise a score.
     */
    @Transactional
    public void hide(UUID ratingId, UUID platformAdminId) {
        TradeAdminRating r = ratings.findById(ratingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Baho topilmadi"));
        if (r.isHidden()) return;
        r.setHiddenAt(Instant.now());
        r.setHiddenBy(platformAdminId);
        ratings.save(r);
        audit.record(r.getTradeId(), ActorType.ADMIN, platformAdminId, "RATING_HIDDEN",
                Map.of("ratingId", ratingId.toString()));
    }
}
```

`updatedAt` stands in for "when the trade reached SUCCESS" — `@PreUpdate` stamps it on the transition and nothing writes the row afterwards. If a later change starts touching completed trades, add an explicit `closed_at` column instead of widening this assumption.

- [ ] **Step 5: Add the controllers**

`admin/controller/TradeAdminRatingController.java`:

```java
package uz.efbazaar.trade.admin.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.admin.dto.RateAdminRequest;
import uz.efbazaar.trade.admin.dto.TradeAdminRatingResponse;
import uz.efbazaar.trade.admin.service.TradeAdminRatingService;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class TradeAdminRatingController {

    private final TradeAdminRatingService ratings;

    @PostMapping("/api/v1/trades/{id}/rating")
    public TradeAdminRatingResponse rate(@AuthenticationPrincipal AuthenticatedUser me,
                                         @PathVariable UUID id,
                                         @Valid @RequestBody RateAdminRequest req) {
        return ratings.rate(me.userId(), id, req);
    }
}
```

Add the public list to `TradeAdminProfileController`:

```java
    @GetMapping("/{userId}/ratings")
    public List<TradeAdminRatingResponse> ratings(@PathVariable UUID userId) {
        return ratings.listPublic(userId);
    }
```

Inject `private final TradeAdminRatingService ratings;` and import `List`, `TradeAdminRatingResponse`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend/trade-service && mvn verify -Dit.test=TradeAdminRatingIT`
Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/admin/repository/TradeAdminRatingRepository.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/RateAdminRequest.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/dto/TradeAdminRatingResponse.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeAdminRatingService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/controller/ \
        backend/trade-service/src/test/java/uz/efbazaar/trade/admin/TradeAdminRatingIT.java
git commit -m "feat(trade): add 1-5 star admin ratings with moderation that cannot inflate scores"
```

---

## Task 15: trade-service — escalation and the platform-admin queue

**Files:**
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeEscalationSweeper.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeEscalationService.java`
- Create: `backend/trade-service/src/main/java/uz/efbazaar/trade/admin/controller/AdminTradeEscalationController.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeRepository.java`
- Modify: `backend/trade-service/src/main/resources/application.yml`
- Test: `backend/trade-service/src/test/java/uz/efbazaar/trade/admin/TradeEscalationIT.java`

**Interfaces:**
- Consumes: `TradeAdminStats.recordAbandoned`, `TradeAdminProfileService.requireHireable` (Task 6); `TradeEvent.ADMIN_CANCELLED` (Task 5).
- Produces:
  - `TradeEscalationSweeper.sweep()` — `@Scheduled`, separate from `TradeTimeoutScheduler`
  - `TradeEscalationService.listEscalated()`, `.reassign(UUID platformAdminId, UUID tradeId, UUID newAdminId, long feeUzs)`, `.cancel(UUID platformAdminId, UUID tradeId, String reason)`

**Context:** This is the second scheduler and it must stay separate from `TradeTimeoutScheduler`. That one fires `TIMEOUT` for any non-terminal state with a due `state_deadline`; `IN_PROGRESS` has no `TIMEOUT` transition, so sharing the column would raise `InvalidTradeTransitionException` on the same row every 10 seconds, forever. Escalation therefore has its own column and its own sweep, and **does not change the state** — it only sets `escalated_at`, so a reassigned admin inherits the work in progress.

Reassignment rotates the mailbox: the previous admin already knows the escrow password (spec §6.3), so revoking ownership alone is not enough.

There is deliberately **no** "switch to SMART" action. `IN_PROGRESS` does not exist on the smart path, so there is no state for the automation to resume from, and a human trade holds no escrowed money — cancelling costs nobody anything (spec §7.2).

- [ ] **Step 1: Write the failing test**

```java
package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.service.TradeAdminAssignmentService;
import uz.efbazaar.trade.admin.service.TradeEscalationService;
import uz.efbazaar.trade.admin.service.TradeEscalationSweeper;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

@SpringBootTest
class TradeEscalationIT extends AbstractIntegrationIT {

    @Autowired TradeEscalationSweeper sweeper;
    @Autowired TradeEscalationService escalations;
    @Autowired TradeAdminAssignmentService assignments;
    @Autowired TradeRepository trades;
    @Autowired TradeChatRepository chats;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired MailboxService mailboxes;
    @SpyBean TradeEventPublisher events;

    private UUID adminWithProfile() {
        UUID id = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(id).minFeeUzs(15_000).maxFeeUzs(40_000).build());
        return id;
    }

    private Trade acceptedTrade(UUID adminId) {
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        Trade t = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(TradeState.WAITING_ADMIN)
                .mailboxId(mailboxId)
                .mode(TradeMode.HUMAN)
                .assignedAdminId(adminId)
                .adminFeeUzs(20_000L)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(t.getId()).participant(ParticipantRole.SELLER).build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(t.getId()).participant(ParticipantRole.BUYER).build());
        assignments.accept(adminId, t.getId());
        return trades.findById(t.getId()).orElseThrow();
    }

    private void makeIdle(UUID tradeId) {
        Trade t = trades.findById(tradeId).orElseThrow();
        t.setEscalationDeadlineAt(Instant.now().minusSeconds(1));
        trades.save(t);
    }

    @Test
    void idleAdminIsEscalatedWithoutChangingTheState() {
        Trade t = acceptedTrade(adminWithProfile());
        makeIdle(t.getId());

        sweeper.sweep();

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getEscalatedAt()).isNotNull();
        assertThat(after.getEscalationReason()).isEqualTo("ADMIN_IDLE");
        assertThat(after.getState())
                .as("escalation is a flag, not a transition")
                .isEqualTo(TradeState.IN_PROGRESS);
    }

    @Test
    void aWorkingAdminIsNeverEscalated() {
        Trade t = acceptedTrade(adminWithProfile());
        // accept() armed the deadline in the future.

        sweeper.sweep();

        assertThat(trades.findById(t.getId()).orElseThrow().getEscalatedAt()).isNull();
    }

    @Test
    void escalationHappensOnlyOnce() {
        Trade t = acceptedTrade(adminWithProfile());
        makeIdle(t.getId());
        sweeper.sweep();
        Instant first = trades.findById(t.getId()).orElseThrow().getEscalatedAt();

        sweeper.sweep();

        assertThat(trades.findById(t.getId()).orElseThrow().getEscalatedAt()).isEqualTo(first);
    }

    @Test
    void escalatedTradesShowUpInThePlatformQueue() {
        Trade t = acceptedTrade(adminWithProfile());
        makeIdle(t.getId());
        sweeper.sweep();

        assertThat(escalations.listEscalated()).extracting("id").contains(t.getId());
    }

    @Test
    void reassigningRotatesTheMailboxAndBlamesTheOldAdmin() {
        UUID oldAdmin = adminWithProfile();
        Trade t = acceptedTrade(oldAdmin);
        makeIdle(t.getId());
        sweeper.sweep();
        UUID newAdmin = adminWithProfile();
        UUID platformAdmin = UUID.randomUUID();

        escalations.reassign(platformAdmin, t.getId(), newAdmin, 25_000L);

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getState()).isEqualTo(TradeState.WAITING_ADMIN);
        assertThat(after.getAssignedAdminId()).isEqualTo(newAdmin);
        assertThat(after.getAdminFeeUzs()).isEqualTo(25_000L);
        assertThat(after.getEscalatedAt()).isNull();
        assertThat(after.getAdminAcceptedAt())
                .as("the new admin's timer starts when they accept")
                .isNull();
        verify(events).mailboxRotateRequest(eq(t.getMailboxId()));
        assertThat(profiles.findById(oldAdmin).orElseThrow().getAbandonedCount()).isEqualTo(1);
    }

    @Test
    void reassignedTradeIsHireableAgain() {
        UUID oldAdmin = adminWithProfile();
        Trade t = acceptedTrade(oldAdmin);
        makeIdle(t.getId());
        sweeper.sweep();
        UUID newAdmin = adminWithProfile();

        escalations.reassign(UUID.randomUUID(), t.getId(), newAdmin, 25_000L);
        assignments.accept(newAdmin, t.getId());

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getState()).isEqualTo(TradeState.IN_PROGRESS);
        assertThat(after.getAdminAcceptedAt()).isNotNull();
    }

    @Test
    void platformAdminCanCancelInstead() {
        UUID oldAdmin = adminWithProfile();
        Trade t = acceptedTrade(oldAdmin);
        makeIdle(t.getId());
        sweeper.sweep();

        escalations.cancel(UUID.randomUUID(), t.getId(), "admin javob bermadi");

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getState()).isEqualTo(TradeState.REJECTED);
        assertThat(mailboxes.getRaw(t.getMailboxId()).getOwnerUserId())
                .isEqualTo(after.getSellerId());
    }

    @Test
    void reassigningToAPausedAdminIsRefused() {
        Trade t = acceptedTrade(adminWithProfile());
        makeIdle(t.getId());
        sweeper.sweep();
        UUID paused = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(paused).minFeeUzs(15_000).maxFeeUzs(40_000)
                .acceptingOrders(false).build());

        assertThatThrownBy(() -> escalations.reassign(UUID.randomUUID(), t.getId(), paused, 20_000L))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void smartTradesAreNeverEscalated() {
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        Trade smart = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(50_000)
                .state(TradeState.WAITING_PAYMENT)
                .mailboxId(mailboxId)
                .sellerCardId(UUID.randomUUID())
                .buyerCardId(UUID.randomUUID())
                .mode(TradeMode.SMART)
                .escalationDeadlineAt(Instant.now().minusSeconds(1))
                .expiresAt(Instant.now().plus(Duration.ofHours(24)))
                .build());

        sweeper.sweep();

        assertThat(trades.findById(smart.getId()).orElseThrow().getEscalatedAt()).isNull();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/trade-service && mvn verify -Dit.test=TradeEscalationIT`
Expected: compilation failure — the escalation classes do not exist.

- [ ] **Step 3: Add the queries**

In `trade/repository/TradeRepository.java`:

```java
    /**
     * Human trades whose admin has gone quiet and which have not been escalated
     * yet. Backed by ix_trades_escalation_due.
     */
    @Query("""
            SELECT t FROM Trade t
             WHERE t.mode = uz.efbazaar.trade.trade.domain.TradeMode.HUMAN
               AND t.state = uz.efbazaar.trade.trade.domain.TradeState.IN_PROGRESS
               AND t.escalatedAt IS NULL
               AND t.escalationDeadlineAt IS NOT NULL
               AND t.escalationDeadlineAt < :now
            """)
    List<Trade> findIdleHumanTrades(@Param("now") Instant now);

    List<Trade> findByEscalatedAtIsNotNullOrderByEscalatedAtAsc();
```

- [ ] **Step 4: Create the sweeper**

`admin/service/TradeEscalationSweeper.java`:

```java
package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeAuditService;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Flags human trades whose admin has stopped working, so a platform admin can
 * step in.
 *
 * <p><b>Why this is not part of {@code TradeTimeoutScheduler}:</b> that sweeper
 * fires {@code TIMEOUT} for every non-terminal state with a due
 * {@code state_deadline}. {@code IN_PROGRESS} has no {@code TIMEOUT} transition,
 * so if the idle watchdog shared {@code state_deadline} the sweeper would throw
 * {@code InvalidTradeTransitionException} on the same row every 10 seconds,
 * forever. Hence a dedicated column and a dedicated sweep.
 *
 * <p>Escalation does <b>not</b> change the state — it sets {@code escalated_at}
 * and leaves the trade where the admin left it, so a reassigned admin inherits
 * the work in progress.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeEscalationSweeper {

    private final TradeRepository trades;
    private final TradeAuditService audit;

    @Scheduled(fixedRateString = "${trade.scheduler.escalation-sweep-interval-ms:60000}")
    @Transactional
    public void sweep() {
        List<Trade> idle = trades.findIdleHumanTrades(Instant.now());
        if (idle.isEmpty()) return;

        Instant now = Instant.now();
        for (Trade t : idle) {
            t.setEscalatedAt(now);
            t.setEscalationReason("ADMIN_IDLE");
            trades.save(t);
            audit.record(t.getId(), ActorType.SYSTEM, null, "TRADE_ESCALATED", Map.of(
                    "reason", "ADMIN_IDLE",
                    "adminId", String.valueOf(t.getAssignedAdminId())));
            log.warn("Trade {} escalated — admin {} idle past {}",
                    t.getId(), t.getAssignedAdminId(), t.getEscalationDeadlineAt());
        }
        log.info("Escalated {} idle human trades", idle.size());
    }
}
```

- [ ] **Step 5: Create the escalation service**

`admin/service/TradeEscalationService.java`:

```java
package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeAuditService;
import uz.efbazaar.trade.trade.service.TradeChatService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What a platform admin can do about a stuck human trade: hand it to somebody
 * else, or end it.
 *
 * <p>There is deliberately no "switch to smart" action — {@code IN_PROGRESS}
 * does not exist on the smart path, so there would be no state for the
 * automation to resume from, and a human trade holds no escrowed money, so
 * cancelling costs nobody anything.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeEscalationService {

    private final TradeRepository trades;
    private final TradeService tradeService;
    private final TradeAdminProfileService profiles;
    private final TradeAdminStats stats;
    private final TradeChatService chatService;
    private final TradeAuditService audit;
    private final TradeEventPublisher events;

    @Transactional(readOnly = true)
    public List<Trade> listEscalated() {
        return trades.findByEscalatedAtIsNotNullOrderByEscalatedAtAsc();
    }

    /**
     * Hand the trade to a different admin. The checklist and both chats are
     * kept — the new admin inherits the work.
     */
    @Transactional
    public void reassign(UUID platformAdminId, UUID tradeId, UUID newAdminId, long feeUzs) {
        Trade t = requireEscalated(tradeId);
        UUID oldAdminId = t.getAssignedAdminId();

        if (newAdminId.equals(t.getSellerId()) || newAdminId.equals(t.getBuyerId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Admin o'z savdosining tarafi bo'lolmaydi");
        }
        profiles.requireHireable(newAdminId, feeUzs);

        // The previous admin already knows the escrow mailbox password, so
        // revoking ownership is not enough — rotate it.
        events.mailboxRotateRequest(t.getMailboxId());

        t.setAssignedAdminId(newAdminId);
        t.setAdminFeeUzs(feeUzs);
        // The new admin's work timer starts when they accept, not now.
        t.setAdminAcceptedAt(null);
        t.setEscalatedAt(null);
        t.setEscalationReason(null);
        t.setState(TradeState.WAITING_ADMIN);
        t.setStateDeadline(Instant.now().plus(Duration.ofHours(24)));
        t.setEscalationDeadlineAt(null);
        trades.save(t);

        if (oldAdminId != null) {
            stats.recordAbandoned(oldAdminId);
        }
        audit.record(tradeId, ActorType.ADMIN, platformAdminId, "TRADE_REASSIGNED", Map.of(
                "oldAdminId", String.valueOf(oldAdminId),
                "newAdminId", newAdminId.toString(),
                "feeUzs", String.valueOf(feeUzs)));
        chatService.postStatusToBoth(tradeId, "ADMIN_REASSIGNED",
                Map.of("newAdminId", newAdminId.toString()));

        events.adminInvited(t);
        log.info("Trade {} reassigned from {} to {} by platform admin {}",
                tradeId, oldAdminId, newAdminId, platformAdminId);
    }

    /** End the trade. The mailbox rotates and returns to the seller. */
    @Transactional
    public void cancel(UUID platformAdminId, UUID tradeId, String reason) {
        Trade t = requireEscalated(tradeId);

        audit.record(tradeId, ActorType.ADMIN, platformAdminId, "TRADE_CANCELLED_BY_PLATFORM",
                Map.of("reason", reason == null ? "" : reason,
                        "adminId", String.valueOf(t.getAssignedAdminId())));
        chatService.postStatusToBoth(tradeId, "PLATFORM_CANCELLED",
                Map.of("reason", reason == null ? "" : reason));

        // Abandonment, not a deliberate cancel: the platform ended it because
        // the admin went missing.
        if (t.getAssignedAdminId() != null) {
            stats.recordAbandoned(t.getAssignedAdminId());
        }
        tradeService.transition(tradeId, TradeEvent.ADMIN_CANCELLED,
                ActorType.ADMIN, platformAdminId);
    }

    private Trade requireEscalated(UUID tradeId) {
        Trade t = trades.findById(tradeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Savdo topilmadi"));
        if (t.getMode() != TradeMode.HUMAN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu savdo inson admin rejimida emas");
        }
        if (t.getEscalatedAt() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu savdo eskalatsiya qilinmagan");
        }
        return t;
    }
}
```

`cancel` records `recordAbandoned`, not `recordCancelled` — the admin disappeared, they did not make a judgement call. Task 13's `REJECTED` case already guards `recordCancelled` with `actor == ActorType.TRADE_ADMIN`, so this platform-initiated cancel is not counted twice. Verify that guard is present before running the test; `platformAdminCanCancelInstead` passes either way, but `cancelledCount` would be wrong.

- [ ] **Step 6: Create the platform-admin controller**

`admin/controller/AdminTradeEscalationController.java`:

```java
package uz.efbazaar.trade.admin.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.admin.dto.AssignAdminRequest;
import uz.efbazaar.trade.admin.service.TradeAdminRatingService;
import uz.efbazaar.trade.admin.service.TradeEscalationService;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.List;
import java.util.UUID;

/**
 * Platform staff surface. {@code /api/v1/admin/**} is already gated to
 * {@code ROLE_ADMIN} in SecurityConfig; the annotation is belt-and-braces so
 * the class stays safe if the path ever moves.
 */
@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
public class AdminTradeEscalationController {

    private final TradeEscalationService escalations;
    private final TradeAdminRatingService ratings;
    private final TradeService trades;

    @GetMapping("/trades/escalated")
    public List<TradeResponse> escalated() {
        return escalations.listEscalated().stream()
                .map(t -> trades.toResponse(t, null))
                .toList();
    }

    @PostMapping("/trades/{id}/reassign")
    public void reassign(@AuthenticationPrincipal AuthenticatedUser me,
                         @PathVariable UUID id,
                         @Valid @RequestBody AssignAdminRequest req) {
        escalations.reassign(me.userId(), id, req.adminId(), req.feeUzs());
    }

    @PostMapping("/trades/{id}/cancel")
    public void cancel(@AuthenticationPrincipal AuthenticatedUser me,
                       @PathVariable UUID id,
                       @RequestParam(required = false) String reason) {
        escalations.cancel(me.userId(), id, reason);
    }

    @PostMapping("/trade-admins/{userId}/ratings/{ratingId}/hide")
    public void hideRating(@AuthenticationPrincipal AuthenticatedUser me,
                           @PathVariable UUID userId,
                           @PathVariable UUID ratingId) {
        ratings.hide(ratingId, me.userId());
    }
}
```

In `application.yml`, extend the scheduler block:

```yaml
  scheduler:
    sweep-interval-ms: 10000
    # Separate from the timeout sweep — see TradeEscalationSweeper's javadoc.
    escalation-sweep-interval-ms: 60000
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend/trade-service && mvn verify -Dit.test=TradeEscalationIT`
Expected: PASS, 9 tests.

- [ ] **Step 8: Run the whole trade-service suite**

Run: `cd backend/trade-service && mvn verify`
Expected: PASS. First point where everything runs together; watch `TradeE2EIT` and `TradeTimeoutSchedulerIT`, which pin the smart path.

- [ ] **Step 9: Commit**

```bash
git add backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeEscalationSweeper.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/service/TradeEscalationService.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/admin/controller/AdminTradeEscalationController.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/repository/TradeRepository.java \
        backend/trade-service/src/main/resources/application.yml \
        backend/trade-service/src/test/java/uz/efbazaar/trade/admin/TradeEscalationIT.java
git commit -m "feat(trade): escalate idle human trades to a platform admin queue"
```

---

## Task 16: nginx routing

**Files:**
- Modify: `nginx/conf.d/api.conf:139`

**Interfaces:**
- Consumes: every endpoint added in Tasks 6–15.
- Produces: nothing in code — but without it the frontend plan cannot reach any new endpoint.

**Context:** Two defects in one line. The trade-service location regex lists `(trades|mailboxes|cards|admin/mailboxes)` and never mentions `trade-admins` or `admin/trades`, so both fall through to whichever location matches next — in practice marketplace-service or a 404. And `limit_except GET POST DELETE OPTIONS` denies `PUT`/`PATCH`, which is why the profile update is a `POST` (spec §12.4).

No WSS change: the admin subscribes to the two existing per-trade topics.

- [ ] **Step 1: Confirm the current state**

Run: `grep -n 'location ~ \^/api/v1/(trades' nginx/conf.d/api.conf`
Expected: one match near line 139 with the four-alternative regex.

- [ ] **Step 2: Widen the regex**

In `nginx/conf.d/api.conf`, replace that location line with:

```nginx
    # ----- trade-service (Plan B lifecycle + human trade-admin) --------
    location ~ ^/api/v1/(trades|mailboxes|cards|trade-admins|admin/mailboxes|admin/trades)(/|$) {
```

Leave the rest of the block untouched — `limit_except`, the `auth_request` subrequest, the four identity `proxy_set_header` lines and `proxy_pass` are all still correct.

Do **not** add `PUT`/`PATCH` to `limit_except`. The API is shaped around `GET/POST/DELETE` precisely so this line does not have to move; widening it would loosen the edge for every trade-service path at once.

- [ ] **Step 3: Validate the config**

Run: `docker compose exec nginx nginx -t`
Expected: `syntax is ok` / `test is successful`.

If the stack is down, use `docker run --rm -v "$PWD/nginx:/etc/nginx:ro" nginx:alpine nginx -t`. Upstream names resolve at request time via the resolver, so a syntax-only pass is sufficient here — the regex is the only change.

- [ ] **Step 4: Verify routing actually reaches trade-service**

With the stack up:

Run: `curl -s -o /dev/null -w '%{http_code}\n' https://api.efbazaar.uz/api/v1/trade-admins`
Expected: `401`. That proves the request hit the `auth_request` subrequest on the trade-service location rather than 404ing elsewhere. A `404` means the regex did not match.

- [ ] **Step 5: Commit**

```bash
git add nginx/conf.d/api.conf
git commit -m "fix(nginx): route trade-admins and admin/trades to trade-service"
```

---

## Task 17: marketplace-service — invitation notifications and chat pinning

**Files:**
- Create: `backend/marketplace-service/src/main/resources/db/migration/V27__trade_admin_notifications.sql`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/domain/NotificationType.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/domain/Notification.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/domain/Chat.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/repository/ChatRepository.java`
- Modify: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/NotificationService.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeAdminInvitedDto.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeAdminInvitedConsumer.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeChatPinDto.java`
- Create: `backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/TradeChatPinConsumer.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/TradeEvents.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/TradeEventPublisher.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeService.java`
- Modify: `backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/TradeStateHandler.java`
- Test: `backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/kafka/TradeAdminInvitedConsumerTest.java`

**Interfaces:**
- Consumes: `efbazaar.trade.admin-invited` (Task 9).
- Produces:
  - `NotificationType` += `TRADE_ADMIN_INVITED`
  - `Chat.systemImportant` ↔ `chats.system_important`
  - `NotificationService.tradeAdminInvited(UUID adminId, UUID tradeId, long priceUzs)`
  - `ChatRepository.setSystemImportant(UUID id, boolean pinned)`
  - trade-service topics `efbazaar.trade.trade-opened` / `efbazaar.trade.trade-closed` with `record TradeChatPin(UUID tradeId, UUID chatId, Instant occurredAt)`; publisher methods `tradeOpened(Trade)` / `tradeClosed(Trade)`

**Pre-existing bug this task fixes.** `chk_notifications_type` has permitted only `CHAT_CREATED` and `CHAT_MESSAGE` since `V11__notifications.sql`, and no later migration widens it. But `NotificationType` also declares `TRUST_WARNING`, `TRUST_BLOCKED` and `TRUST_UNBLOCKED`, and `TrustService` writes all three (lines 108, 147, 168, 205). **Every trust notification insert currently fails on that CHECK.** V27 enumerates all six values. This is outside the human-admin feature, but the migration touches exactly this constraint — leaving a known-broken check in place while rewriting it would be worse. Call it out in the commit message so it is not read as scope creep.

**Context on chat pinning.** `ChatExpirationScheduler` closes an `ACTIVE` chat 24 h after its last message unless `important`. A human trade legitimately runs for days and the trade panel lives inside that chat. `chats.is_important` is recomputed as the OR of both participants' stars (`V10__chat_participants.sql`), so the system flag needs its own column — reusing `is_important` would wipe a user's own star when the trade closed. This also closes the same gap for long-running smart trades.

- [ ] **Step 1: Write the failing consumer test**

```java
package uz.efbazaar.marketplace.kafka;

import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.domain.NotificationType;
import uz.efbazaar.marketplace.service.NotificationService;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class TradeAdminInvitedConsumerTest {

    private final NotificationService notifications = mock(NotificationService.class);
    private final TradeAdminInvitedConsumer consumer =
            new TradeAdminInvitedConsumer(notifications);

    @Test
    void writesANotificationForTheInvitedAdmin() {
        UUID tradeId = UUID.randomUUID(), adminId = UUID.randomUUID();

        consumer.onInvited(new TradeAdminInvitedDto(tradeId, adminId,
                UUID.randomUUID(), UUID.randomUUID(), 80_000L, 20_000L, Instant.now()));

        verify(notifications).tradeAdminInvited(eq(adminId), eq(tradeId), anyLong());
    }

    @Test
    void ignoresAnEventWithNoAdmin() {
        consumer.onInvited(new TradeAdminInvitedDto(UUID.randomUUID(), null,
                UUID.randomUUID(), UUID.randomUUID(), 80_000L, 20_000L, Instant.now()));

        verifyNoInteractions(notifications);
    }

    @Test
    void ignoresANullEvent() {
        consumer.onInvited(null);
        verifyNoInteractions(notifications);
    }

    @Test
    void theNotificationTypeExists() {
        assertThat(NotificationType.TRADE_ADMIN_INVITED.name())
                .isEqualTo("TRADE_ADMIN_INVITED");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/marketplace-service && mvn -q test -Dtest=TradeAdminInvitedConsumerTest`
Expected: compilation failure — the enum value, DTO and consumer do not exist.

- [ ] **Step 3: Write the migration**

First read `V2__chat.sql` lines 36–37 and confirm the index name and predicate match what the `DROP INDEX` below assumes. The name observed at planning time was `idx_chats_expiry_candidates ON chats (last_message_at) WHERE status = 'ACTIVE' AND is_important = FALSE`. If it differs, copy the real one — `DROP INDEX` must name an index that exists.

`V27__trade_admin_notifications.sql`:

```sql
-- ==============================================================
-- marketplace-service V27 — human trade-admin support.
--
-- 1) TRADE_ADMIN_INVITED notification type, so an invitation lands in
--    the bell the admin already has instead of a second one.
--
-- 2) BUG FIX, pre-existing: chk_notifications_type has permitted only
--    CHAT_CREATED and CHAT_MESSAGE since V11, but NotificationType has
--    carried TRUST_WARNING / TRUST_BLOCKED / TRUST_UNBLOCKED since the
--    trust module shipped and TrustService writes all three. Every trust
--    notification insert has been failing on this CHECK. All six values
--    are enumerated below.
--
-- 3) chats.system_important — a live trade holds its chat open past the
--    24h sweep. Separate from chats.is_important because that column is
--    recomputed as the OR of both participants' stars (V10), so reusing
--    it would wipe a user's own star when the trade closed.
-- ==============================================================

ALTER TABLE notifications DROP CONSTRAINT chk_notifications_type;
ALTER TABLE notifications ADD  CONSTRAINT chk_notifications_type
    CHECK (type IN ('CHAT_CREATED', 'CHAT_MESSAGE',
                    'TRUST_WARNING', 'TRUST_BLOCKED', 'TRUST_UNBLOCKED',
                    'TRADE_ADMIN_INVITED'));

ALTER TABLE notifications ADD COLUMN trade_id UUID;

ALTER TABLE chats ADD COLUMN system_important BOOLEAN NOT NULL DEFAULT FALSE;

-- The V2 partial index predicate must include the new column, or findExpired
-- stops using it and falls back to a sequential scan.
DROP INDEX idx_chats_expiry_candidates;
CREATE INDEX idx_chats_expiry_candidates ON chats (last_message_at)
    WHERE status = 'ACTIVE' AND is_important = FALSE AND system_important = FALSE;
```

- [ ] **Step 4: Add the enum value, entity columns and notification method**

In `domain/NotificationType.java`:

```java
    /** A seller invited me to run their trade as a human trade admin. */
    TRADE_ADMIN_INVITED
```

In `domain/Notification.java`:

```java
    /** Set for TRADE_ADMIN_INVITED so the bell can deep-link to the trade. */
    @Column(name = "trade_id")
    private UUID tradeId;
```

In `domain/Chat.java`:

```java
    /**
     * Held open by a live trade. Distinct from {@code important}, which is the
     * OR of both participants' own stars — clearing this must never clear that.
     */
    @Column(name = "system_important", nullable = false)
    private boolean systemImportant;
```

In `repository/ChatRepository.java`, extend `findExpired` and add the setter:

```java
    /**
     * Aktiv, important emas, tizim ushlab turmagan va 24 soat oldingi xabarli
     * chatlarni qaytaradi.
     */
    @Query("""
            SELECT c FROM Chat c
            WHERE c.status = uz.efbazaar.marketplace.domain.ChatStatus.ACTIVE
              AND c.important = false
              AND c.systemImportant = false
              AND c.lastMessageAt < :cutoff
            """)
    List<Chat> findExpired(@Param("cutoff") Instant cutoff);

    @Modifying
    @Query("UPDATE Chat c SET c.systemImportant = :pinned WHERE c.id = :id")
    int setSystemImportant(@Param("id") UUID id, @Param("pinned") boolean pinned);
```

In `service/NotificationService.java`, next to `trustNotice`:

```java
    /**
     * A seller invited this admin to run a trade. Best-effort delivery — the
     * admin also sees pending invitations in their workspace — so a failure
     * here must not be treated as fatal.
     */
    @Transactional
    public void tradeAdminInvited(UUID adminId, UUID tradeId, long priceUzs) {
        notifications.save(Notification.builder()
                .userId(adminId)
                .type(NotificationType.TRADE_ADMIN_INVITED)
                .tradeId(tradeId)
                .build());
    }
```

Copy `chatCreated`'s handling of `createdAt` and the repository field name — match the file, do not assume.

- [ ] **Step 5: Add the two consumers**

`kafka/TradeAdminInvitedDto.java`:

```java
package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

/** Mirror of trade-service's {@code efbazaar.trade.admin-invited} payload. */
public record TradeAdminInvitedDto(
        UUID tradeId,
        UUID adminId,
        UUID sellerId,
        UUID buyerId,
        long priceUzs,
        Long feeUzs,
        Instant occurredAt) {}
```

`kafka/TradeAdminInvitedConsumer.java`:

```java
package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.service.NotificationService;

/**
 * Turns a trade-admin invitation into a notification-centre row, so the admin
 * sees it in the bell they already use rather than a second one.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeAdminInvitedConsumer {

    private final NotificationService notifications;

    @KafkaListener(
            topics = "efbazaar.trade.admin-invited",
            groupId = "marketplace-trade-admin-invited",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.TradeAdminInvitedDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onInvited(TradeAdminInvitedDto e) {
        if (e == null || e.adminId() == null) {
            log.warn("admin-invited with no adminId, skipping");
            return;
        }
        notifications.tradeAdminInvited(e.adminId(), e.tradeId(), e.priceUzs());
    }
}
```

`kafka/TradeChatPinDto.java`:

```java
package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

/** Mirror of trade-service's trade-opened / trade-closed payload. */
public record TradeChatPinDto(UUID tradeId, UUID chatId, Instant occurredAt) {}
```

`kafka/TradeChatPinConsumer.java`:

```java
package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.repository.ChatRepository;

/**
 * Holds a chat open while a trade is running inside it.
 *
 * <p>ChatExpirationScheduler closes an ACTIVE chat 24h after its last message.
 * A hand-run trade legitimately takes days and the trade panel lives in that
 * chat, so the system pins it for the duration. Applies to smart trades too —
 * they can also outlive 24h of chat silence.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeChatPinConsumer {

    private final ChatRepository chats;

    @KafkaListener(
            topics = "efbazaar.trade.trade-opened",
            groupId = "marketplace-trade-chat-pin",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.TradeChatPinDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onOpened(TradeChatPinDto e) {
        pin(e, true);
    }

    @KafkaListener(
            topics = "efbazaar.trade.trade-closed",
            groupId = "marketplace-trade-chat-pin",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.TradeChatPinDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onClosed(TradeChatPinDto e) {
        pin(e, false);
    }

    private void pin(TradeChatPinDto e, boolean pinned) {
        if (e == null || e.chatId() == null) {
            // Trades opened without a marketplace chat context are legitimate.
            return;
        }
        int updated = chats.setSystemImportant(e.chatId(), pinned);
        if (updated == 0) {
            log.warn("trade chat pin={} for unknown chat {}", pinned, e.chatId());
        }
    }
}
```

- [ ] **Step 6: Publish the two events from trade-service**

In trade-service's `kafka/TradeEvents.java`:

```java
    public static final String TOPIC_TRADE_OPENED = "efbazaar.trade.trade-opened";
    public static final String TOPIC_TRADE_CLOSED = "efbazaar.trade.trade-closed";

    /**
     * Asks marketplace-service to hold this trade's chat open (opened) or
     * release it (closed). {@code chatId} may be null for trades opened without
     * a chat context, in which case the consumer no-ops.
     */
    public record TradeChatPin(UUID tradeId, UUID chatId, Instant occurredAt) {}
```

In `kafka/TradeEventPublisher.java`:

```java
    public void tradeOpened(Trade trade) {
        send(TradeEvents.TOPIC_TRADE_OPENED, trade.getId().toString(),
                new TradeEvents.TradeChatPin(trade.getId(), trade.getChatId(), Instant.now()));
    }

    public void tradeClosed(Trade trade) {
        send(TradeEvents.TOPIC_TRADE_CLOSED, trade.getId().toString(),
                new TradeEvents.TradeChatPin(trade.getId(), trade.getChatId(), Instant.now()));
    }
```

In `TradeService.openTrade`, after `broadcaster.publishStateChange(...)`:

```java
        // Hold the marketplace chat open for as long as the trade lives.
        if (chatId != null) {
            events.tradeOpened(t);
        }
```

`TradeService` does not currently inject the publisher — add `private final TradeEventPublisher events;`.

In `TradeStateHandler`, add as the last statement of each of the three terminal cases (`SUCCESS`, `REJECTED`, `ORPHANED`):

```java
                if (trade.getChatId() != null) {
                    events.tradeClosed(trade);
                }
```

- [ ] **Step 7: Run the tests**

Run: `cd backend/marketplace-service && mvn -q test -Dtest=TradeAdminInvitedConsumerTest`
Expected: PASS, 4 tests.

Run: `cd backend/marketplace-service && mvn verify`
Expected: PASS. Any trust test that previously passed only because the insert never reached the CHECK now exercises the real path — if one fails, the CHECK fix has surfaced a second latent problem, so read the failure rather than reverting the migration.

Run: `cd backend/trade-service && mvn verify`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/marketplace-service/src/main/resources/db/migration/V27__trade_admin_notifications.sql \
        backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/domain/ \
        backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/repository/ChatRepository.java \
        backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/service/NotificationService.java \
        backend/marketplace-service/src/main/java/uz/efbazaar/marketplace/kafka/ \
        backend/marketplace-service/src/test/java/uz/efbazaar/marketplace/kafka/TradeAdminInvitedConsumerTest.java \
        backend/trade-service/src/main/java/uz/efbazaar/trade/kafka/ \
        backend/trade-service/src/main/java/uz/efbazaar/trade/trade/service/
git commit -m "feat(marketplace): notify invited trade admins and pin chats with a live trade

Also fixes a pre-existing bug: chk_notifications_type has permitted only
CHAT_CREATED and CHAT_MESSAGE since V11, while TrustService has been writing
TRUST_WARNING / TRUST_BLOCKED / TRUST_UNBLOCKED. Every trust notification
insert was failing on that CHECK. V27 enumerates all six values."
```

---

## What this plan delivers

A human-admin backend drivable end to end over the API:

1. A platform admin grants `TRADE_ADMIN`; the user creates a profile with a fee band.
2. A seller browses the catalogue, picks an admin and a fee, and sends a proposal.
3. The buyer accepts; the trade opens, the mailbox is provisioned, the admin is invited.
4. The admin accepts (capacity permitting), receives the escrow mailbox, and works the six-step checklist while talking to each party in their own chat.
5. The admin closes at 6/6; both parties confirm, or 24 h elapses; the trade succeeds, the mailbox rotates to the buyer, and the admin's work time is recorded.
6. Both parties rate the admin; the catalogue reflects it.
7. An admin who goes quiet is escalated to a platform admin, who reassigns or cancels.

**Deliberately not included:** the five frontend screens (spec §15) and global presence (its own spec). The frontend plan is next and depends only on the endpoints above.

## Spec coverage notes

Two spec items intentionally have no task here:

- **§16.1's `payment_outbox` regression guard.** The spec lists "a HUMAN trade writes no `payment_outbox` row" as a guard, but that table belongs to payment-service, which is paused (spec §8). There is nothing to guard yet. When payment-service is built, its own plan must add both the `mode == SMART` check in `TradeStateHandler` and that test.
- **§12.3's trust-module wiring.** Filing a complaint against an admin needs no backend work: `POST /api/v1/complaints` already exists (`TrustController:39`) and accepts `contextType = 'TRADE'`. The only change is a "complain about this admin" button, which belongs to the frontend plan.

Everything else in the spec maps to a task above: §4.1→1, §4.2→6, §4.3→2+7, §5→3+5, §6.1→9–13, §6.2→3+11, §6.3→5+15, §6.4→5, §7.1→4+10+12, §7.2→15, §9.1→3+6, §9.2→13, §9.3→8, §9.4→8, §9.5→10, §10→3+14, §11→3+9+17, §12.1→17, §12.2→9+17, §12.4→16, §13→6–15, §14→5+6+8+9+15. §15 (frontend) is the next plan.

## Migration inventory

| Service | File | Purpose |
|---|---|---|
| auth | `V7__add_trade_admin_role.sql` | Widen `chk_users_role` |
| trade | `V9__trade_human_mode.sql` | `trades` columns, state/mode/card constraints, enum widening, indexes |
| trade | `V10__trade_admin_profiles.sql` | Admin profiles |
| trade | `V11__trade_steps.sql` | Six-step checklist |
| trade | `V12__trade_admin_ratings.sql` | Ratings |
| marketplace | `V27__trade_admin_notifications.sql` | Notification type, `system_important`, trust CHECK fix |

Check the highest existing version in each service before writing — if another branch landed a migration first, renumber rather than reusing a version.

## New Kafka topics

| Topic | Producer | Consumer |
|---|---|---|
| `efbazaar.auth.user-role-changed` | auth-service | trade-service (deactivate profile) |
| `efbazaar.trade.admin-invited` | trade-service | marketplace-service (notification) |
| `efbazaar.trade.trade-opened` | trade-service | marketplace-service (pin chat) |
| `efbazaar.trade.trade-closed` | trade-service | marketplace-service (unpin chat) |

Add all four to the Kafka topic table in the root `CLAUDE.md` as part of Task 17's commit.
