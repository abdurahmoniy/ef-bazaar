package uz.efbazaar.trade.plan;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException;
import uz.efbazaar.trade.plan.service.MailboxSlotService;
import uz.efbazaar.trade.plan.service.PlanProjection;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;
import uz.efbazaar.trade.trade.domain.TradeKind;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * How many escrow mailboxes a plan lets a user hold.
 *
 * <p>Every trade creates a real mailbox on the mail server, which is the cost
 * the tiers exist to bound. A slot is taken by a mailbox the user owns or one a
 * live trade has reserved for their side.
 */
@SpringBootTest
@Import(StubEscrowConfig.class)
class MailboxSlotIT extends AbstractIntegrationIT {

    @Autowired TradeService trades;
    @Autowired MailboxSlotService slots;
    @Autowired PlanProjection projection;
    @Autowired uz.efbazaar.trade.plan.repository.PlanEntitlementViewRepository entitlementRows;
    @Autowired uz.efbazaar.trade.plan.repository.UserPlanViewRepository userPlanRows;
    @Autowired uz.efbazaar.trade.mailbox.repository.MailboxRepository mailboxes;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    /** Remove test-owned grants and subscriptions so other tests use the bounded Free fallback. */
    @org.junit.jupiter.api.AfterEach
    void forgetWhatThisTestTaught() {
        entitlementRows.deleteAll();
        userPlanRows.deleteAll();
    }

    private void planGrants(String plan, String value) {
        Map<String, String> granted = new HashMap<>();
        granted.put("mailbox.total_slots", value);
        projection.replacePlan(plan, granted, System.nanoTime(), "fixture-" + UUID.randomUUID(), java.time.Instant.now());
    }

    private UUID openSaleFor(UUID seller, UUID buyer) {
        return trades.openTrade(UUID.randomUUID(), seller, buyer, 500_000L, null, null,
                UUID.randomUUID(), null, TradeMode.SMART, null, null,
                TradeKind.SALE, 500_000L).id();
    }

    @Test
    void aLiveTradeTakesASlotBeforeAnybodyOwnsAnything() {
        // Counting ownership alone would let somebody open trades and walk
        // away: each one makes a real mailbox that nobody ever owns.
        planGrants("STANDARD", "3");
        UUID seller = UUID.randomUUID();

        openSaleFor(seller, UUID.randomUUID());

        assertThat(slots.used(seller)).isEqualTo(1);
    }

    @Test
    void theThirdTradeIsRefusedOnTheFreePlan() {
        planGrants("STANDARD", "3");
        UUID seller = UUID.randomUUID();
        for (int i = 0; i < 3; i++) {
            openSaleFor(seller, UUID.randomUUID());
        }

        assertThatThrownBy(() -> openSaleFor(seller, UUID.randomUUID()))
                .isInstanceOf(MailboxSlotsExhaustedException.class)
                .hasMessageContaining("3/3");
    }

    @Test
    void theRefusalSaysWhereTheyStandSoTheScreenCanOfferBothWaysOut() {
        planGrants("STANDARD", "1");
        UUID seller = UUID.randomUUID();
        openSaleFor(seller, UUID.randomUUID());

        assertThatThrownBy(() -> openSaleFor(seller, UUID.randomUUID()))
                .isInstanceOfSatisfying(MailboxSlotsExhaustedException.class, e -> {
                    assertThat(e.getPlanCode()).isEqualTo("STANDARD");
                    assertThat(e.getUsed()).isEqualTo(1);
                    assertThat(e.getLimit()).isEqualTo(1);
                });
    }

    @Test
    void aSwapChargesEachPartyTheirOwnSlot() {
        // Both move an account out, so both get a mailbox. Charging both to
        // whoever opened it would let one user spend the other's allowance.
        planGrants("STANDARD", "3");
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();

        trades.openTrade(UUID.randomUUID(), seller, buyer, 0L, null, null,
                UUID.randomUUID(), null, TradeMode.SMART, null, null,
                TradeKind.SWAP, 500_000L);

        assertThat(slots.used(seller)).isEqualTo(1);
        assertThat(slots.used(buyer)).as("not free just because they did not open it").isEqualTo(1);
    }

    @Test
    void aPartyWithNoRoomBlocksTheSwapEvenIfTheOtherHasPlenty() {
        planGrants("STANDARD", "1");
        UUID roomy = UUID.randomUUID();
        UUID full = UUID.randomUUID();
        openSaleFor(full, UUID.randomUUID());   // uses their only slot

        assertThatThrownBy(() -> trades.openTrade(UUID.randomUUID(), roomy, full, 0L, null, null,
                UUID.randomUUID(), null, TradeMode.SMART, null, null,
                TradeKind.SWAP, 500_000L))
                .isInstanceOf(MailboxSlotsExhaustedException.class);
    }

    @Test
    void anUnlimitedPlanIsNeverRefused() {
        planGrants("MAX", null);
        UUID seller = UUID.randomUUID();
        projection.userMoved(seller, "MAX", null, System.nanoTime(), "fixture-" + UUID.randomUUID(), java.time.Instant.now());

        for (int i = 0; i < 6; i++) {
            openSaleFor(seller, UUID.randomUUID());
        }

        assertThatCode(() -> slots.assertCanAllocate(seller)).doesNotThrowAnyException();
        assertThat(slots.limitFor(seller)).isEmpty();
    }

    /** Unknown paid plans must not bypass allocation limits. */
    @Test
    void anUnknownPlanCannotAllocate() {
        UUID seller = UUID.randomUUID();
        projection.userMoved(seller, "PLAN_WE_HAVE_NOT_HEARD_OF", null, System.nanoTime(), "fixture-" + UUID.randomUUID(), java.time.Instant.now());

        assertThatThrownBy(() -> slots.assertCanAllocate(seller))
                .isInstanceOfSatisfying(uz.efbazaar.trade.common.exception.ApiCodeException.class,
                        e -> assertThat(e.getCode()).isEqualTo("plan_projection_unavailable"));
    }

    /** A mailbox owned by {@code owner}, wired into a live trade between two other people when {@code tradeId} is set. */
    private UUID ownedBox(UUID owner, UUID tradeId) {
        UUID id = UUID.randomUUID();
        mailboxes.saveAndFlush(uz.efbazaar.trade.mailbox.domain.Mailbox.builder().id(id)
                .email("acc-" + id + "@efbazaar.uz").ownerUserId(owner)
                .encryptedPassword(new byte[]{1}).passwordIv(new byte[12]).passwordTag(new byte[16])
                .createdAt(java.time.Instant.now()).provisionedAt(java.time.Instant.now())
                .accessPriority(System.nanoTime()).build());
        if (tradeId != null) {
            jdbc.update("UPDATE trades SET mailbox_id = ? WHERE id = ?", id, tradeId);
        }
        return id;
    }

    @Test
    void anAdminsLentEscrowBoxesDoNotEatTheirOwnAllocation() {
        // A human trade-admin is handed the escrow box of every trade they run.
        // Those are the job's tools, not the admin's own mailboxes: counting
        // them would stop the admin opening a trade of their own.
        planGrants("STANDARD", "3");
        UUID admin = UUID.randomUUID();
        for (int i = 0; i < 5; i++) {
            UUID trade = openSaleFor(UUID.randomUUID(), UUID.randomUUID());
            ownedBox(admin, trade);
        }

        assertThat(slots.used(admin)).isZero();
        assertThat(slots.statusFor(admin).resourceUsed()).isEqualTo(5);
        assertThat(slots.statusFor(admin).exemptUsed()).isEqualTo(5);
        assertThat(slots.statusFor(admin).full()).isFalse();
        assertThatCode(() -> slots.assertCanAllocate(admin)).doesNotThrowAnyException();
        assertThatCode(() -> openSaleFor(admin, UUID.randomUUID())).doesNotThrowAnyException();
    }

    @Test
    void aPartysOwnLiveBoxStillCounts() {
        planGrants("STANDARD", "3");
        UUID seller = UUID.randomUUID();
        UUID trade = openSaleFor(seller, UUID.randomUUID());
        long before = slots.used(seller);

        ownedBox(seller, trade);

        assertThat(slots.used(seller)).isEqualTo(before + 1);
    }

    @Test
    void aBoxOwnedOutsideAnyLiveTradeStillCounts() {
        planGrants("STANDARD", "3");
        UUID user = UUID.randomUUID();
        ownedBox(user, null);
        ownedBox(user, null);

        assertThat(slots.used(user)).isEqualTo(2);
    }
}
