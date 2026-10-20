package uz.efbazaar.trade.plan;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.plan.service.MailboxAccessService;
import uz.efbazaar.trade.plan.service.PlanProjection;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;
import uz.efbazaar.trade.trade.domain.TradeKind;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Import(StubEscrowConfig.class)
class MailboxAccessIT extends AbstractIntegrationIT {

    @Autowired MailboxAccessService access;
    @Autowired uz.efbazaar.trade.plan.service.CustomSlotService customSlots;
    @Autowired uz.efbazaar.trade.plan.service.MailboxSlotService randomSlots;
    @Autowired MailboxRepository mailboxes;
    @Autowired PlanProjection projection;
    @Autowired TradeService trades;
    @Autowired uz.efbazaar.trade.plan.repository.PlanEntitlementViewRepository entitlementRows;
    @Autowired uz.efbazaar.trade.plan.repository.UserPlanViewRepository userPlanRows;
    @Autowired JdbcTemplate jdbc;
    @Autowired org.springframework.transaction.PlatformTransactionManager tx;

    @AfterEach
    void forget() {
        entitlementRows.deleteAll();
        userPlanRows.deleteAll();
    }

    private void standardGrants(String value) {
        Map<String, String> m = new HashMap<>();
        m.put("mailbox.total_slots", value);
        projection.replacePlan("STANDARD", m, System.nanoTime(), "fixture-" + UUID.randomUUID(), java.time.Instant.now());
    }

    private UUID owned(UUID owner, long priority) {
        // A verified Free subscription is distinct from a missing projection.
        if (!userPlanRows.existsById(owner)) projection.userMoved(owner, "STANDARD", null,
                System.nanoTime(), "fixture-" + UUID.randomUUID(), Instant.now());
        UUID id = UUID.randomUUID();
        mailboxes.saveAndFlush(Mailbox.builder().id(id).email("acc-" + id + "@efbazaar.uz")
                .ownerUserId(owner).encryptedPassword(new byte[]{1}).passwordIv(new byte[12])
                .passwordTag(new byte[16]).createdAt(Instant.now()).provisionedAt(Instant.now())
                .accessPriority(priority).build());
        return id;
    }

    @Test
    void theHighestPriorityOnesStayOpenAndTheRestLock() {
        standardGrants("2");
        UUID u = UUID.randomUUID();
        UUID oldest = owned(u, 100), middle = owned(u, 200), newest = owned(u, 300);

        assertThat(access.lockedIds(u)).containsExactly(oldest);
        assertThat(access.isLocked(u, middle)).isFalse();
        assertThat(access.isLocked(u, newest)).isFalse();
    }

    @Test
    void anUnlimitedPlanLocksNothing() {
        standardGrants(null);
        UUID u = UUID.randomUUID();
        owned(u, 1); owned(u, 2); owned(u, 3);
        assertThat(access.lockedIds(u)).isEmpty();
    }

    @Test
    void anUnknownPlanLocksNothing() {
        UUID u = UUID.randomUUID();
        owned(u, 1); owned(u, 2); owned(u, 3); owned(u, 4);
        userPlanRows.deleteById(u);
        assertThat(access.lockedIds(u)).isEmpty();
    }

    @Test
    void detachingAnOpenOneOpensTheNextLockedOne() {
        standardGrants("1");
        UUID u = UUID.randomUUID();
        UUID older = owned(u, 100), newer = owned(u, 200);
        assertThat(access.lockedIds(u)).containsExactly(older);

        new org.springframework.transaction.support.TransactionTemplate(tx)
                .executeWithoutResult(s -> mailboxes.detachOwnedBy(newer, u));

        assertThat(access.lockedIds(u)).isEmpty();
    }

    @Test
    void aLiveTradeMailboxStaysOpenEvenPastTheLimit() {
        standardGrants("5");
        UUID seller = UUID.randomUUID();
        var trade = trades.openTrade(UUID.randomUUID(), seller, UUID.randomUUID(), 500_000L, null, null,
                UUID.randomUUID(), null, TradeMode.SMART, null, null, TradeKind.SALE, 500_000L);
        UUID tradeBox = owned(seller, 1);
        jdbc.update("UPDATE mailboxes SET trade_id = ? WHERE id = ?", trade.id(), tradeBox);
        jdbc.update("UPDATE trade_sides SET mailbox_id = ? WHERE trade_id = ? AND role = 'SELLER'", tradeBox, trade.id());
        UUID a = owned(seller, 500), b = owned(seller, 600);
        standardGrants("1");

        Set<UUID> locked = access.lockedIds(seller);
        assertThat(locked).doesNotContain(tradeBox).contains(a, b);
    }

    private UUID liveTradeBoxOwnedBy(UUID owner, UUID seller, UUID buyer) {
        var trade = trades.openTrade(buyer, seller, UUID.randomUUID(), 500_000L, null, null,
                UUID.randomUUID(), null, TradeMode.SMART, null, null, TradeKind.SALE, 500_000L);
        UUID box = owned(owner, 1);
        jdbc.update("UPDATE trades SET mailbox_id = ? WHERE id = ?", box, trade.id());
        return box;
    }

    @Test
    void anAdminsEscrowBoxesDoNotEatTheirPersonalLimit() {
        standardGrants("3");
        UUID admin = UUID.randomUUID();
        UUID p1 = owned(admin, 100), p2 = owned(admin, 200), p3 = owned(admin, 300);
        for (int i = 0; i < 3; i++) {
            liveTradeBoxOwnedBy(admin, UUID.randomUUID(), UUID.randomUUID());
        }

        assertThat(access.lockedIds(admin)).isEmpty();
        assertThat(access.isLocked(admin, p1)).isFalse();
    }

    @Test
    void aPartysLiveBoxStillCountsTowardTheLimit() {
        standardGrants("2");
        UUID user = UUID.randomUUID();
        UUID tradeBox = liveTradeBoxOwnedBy(user, user, UUID.randomUUID());
        UUID older = owned(user, 100), newer = owned(user, 200);

        // live box takes one of the two places: only the newest of the rest stays open
        assertThat(access.lockedIds(user)).containsExactly(older).doesNotContain(tradeBox, newer);
    }
    private UUID customOwned(UUID owner, long priority) {
        UUID id = owned(owner, priority);
        jdbc.update("UPDATE mailboxes SET kind = 'CUSTOM', source = 'USER' WHERE id = ?", id);
        return id;
    }
    private void grant(String plan, Map<String,String> grants, Instant at) {
        projection.replacePlan(plan, grants, System.nanoTime(), "access-" + UUID.randomUUID(), at);
    }
    private void subscribe(UUID user, String plan, Instant expiresAt, Instant at) {
        projection.userMoved(user, plan, expiresAt, System.nanoTime(), "access-" + UUID.randomUUID(), at);
    }
    @Test void staleUnexpiredPaidSnapshotKeepsExistingReadsButRefusesNewAllocations() {
        UUID user = UUID.randomUUID();
        grant("STANDARD", Map.of("mailbox.total_slots","3", "mailbox.custom_slots","0"), Instant.now());
        grant("PRO", Map.of("mailbox.total_slots","10", "mailbox.custom_slots","2"), Instant.now().minusSeconds(90000));
        subscribe(user, "PRO", Instant.now().plusSeconds(3600), Instant.now().minusSeconds(90000));
        for (int i = 0; i < 4; i++) owned(user, i);
        UUID custom = customOwned(user, 10);
        assertThat(access.lockedIds(user)).isEmpty();
        assertThat(access.isLocked(user, custom)).isFalse();
        assertThat(customSlots.canAllocate(user)).isFalse();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> randomSlots.assertCanAllocate(user))
                .isInstanceOfSatisfying(uz.efbazaar.trade.common.exception.ApiCodeException.class,
                        e -> assertThat(e.getCode()).isEqualTo("plan_projection_unavailable"));
    }
    @Test void malformedReadLimitPreservesOwnedMailboxAccess() {
        UUID user = UUID.randomUUID();
        grant("PRO", Map.of("mailbox.total_slots","invalid", "mailbox.custom_slots","invalid"), Instant.now());
        subscribe(user, "PRO", Instant.now().plusSeconds(3600), Instant.now());
        owned(user, 1); customOwned(user, 2);
        assertThat(access.lockedIds(user)).isEmpty();
        assertThat(customSlots.canAllocate(user)).isFalse();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> randomSlots.assertCanAllocate(user))
                .isInstanceOfSatisfying(uz.efbazaar.trade.common.exception.ApiCodeException.class,
                        e -> assertThat(e.getCode()).isEqualTo("plan_projection_unavailable"));
    }
    @Test void paidExpiryAndDowngradePreserveGraceThenRestrictExcessToRecovery() {
        grant("STANDARD", Map.of("mailbox.total_slots","3", "mailbox.custom_slots","0"), Instant.now());
        grant("PRO", Map.of("mailbox.total_slots","10", "mailbox.custom_slots","2"), Instant.now());
        for (boolean expired : new boolean[]{true, false}) {
            for (boolean recovery : new boolean[]{false, true}) {
                UUID user = UUID.randomUUID();
                Instant now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
                Instant paidExpiry = recovery ? now.minus(java.time.Duration.ofDays(31))
                        : expired ? now.minusSeconds(1) : now.plusSeconds(3600);
                subscribe(user, "PRO", paidExpiry, Instant.now());
                if (!expired) subscribe(user, "STANDARD", null, Instant.now());
                UUID oldest = owned(user, 1);
                UUID second = owned(user, 2);
                for (int i = 3; i < 5; i++) owned(user, i);
                UUID custom = customOwned(user, 10);
                assertThat(access.excessIds(user)).containsExactlyInAnyOrder(oldest, second).doesNotContain(custom);
                assertThat(access.metadata(user, oldest).accessState()).isEqualTo(recovery
                        ? MailboxAccessService.AccessState.RECOVERY : MailboxAccessService.AccessState.GRACE);
                assertThat(access.metadata(user, oldest).paidExpiresAt()).isEqualTo(paidExpiry);
                assertThat(access.metadata(user, oldest).selectedForFree()).isFalse();
                assertThat(access.metadata(user, custom).accessState()).isEqualTo(MailboxAccessService.AccessState.ACTIVE);
                assertThat(access.metadata(user, custom).selectedForFree()).isTrue();
                if (recovery) assertThat(access.lockedIds(user)).containsExactlyInAnyOrder(oldest, second);
                else assertThat(access.lockedIds(user)).isEmpty();
                org.assertj.core.api.Assertions.assertThatThrownBy(() -> randomSlots.assertCanAllocate(user))
                        .isInstanceOf(uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException.class);
            }
        }
    }

    @Test void missingSubscriptionPreservesOwnedReadsEvenWhenFreeCatalogIsFresh() {
        UUID user = UUID.randomUUID();
        grant("STANDARD", Map.of("mailbox.total_slots","3", "mailbox.custom_slots","0"), Instant.now());
        for (int i = 0; i < 4; i++) owned(user, i);
        customOwned(user, 10);
        userPlanRows.deleteById(user); // Simulate subscription projection loss, not an explicit Free downgrade.
        assertThat(access.lockedIds(user)).isEmpty();
        assertThat(customSlots.canAllocate(user)).isFalse();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> randomSlots.assertCanAllocate(user))
                .isInstanceOf(uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException.class);
    }

}
