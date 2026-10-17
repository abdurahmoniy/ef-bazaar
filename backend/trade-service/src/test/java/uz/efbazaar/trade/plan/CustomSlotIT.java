package uz.efbazaar.trade.plan;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxKind;
import uz.efbazaar.trade.mailbox.exception.InvalidUnlockSwapException;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.plan.repository.PlanEntitlementViewRepository;
import uz.efbazaar.trade.plan.repository.UserPlanViewRepository;
import uz.efbazaar.trade.plan.service.CustomSlotService;
import uz.efbazaar.trade.plan.service.MailboxAccessService;
import uz.efbazaar.trade.plan.service.MailboxSlotService;
import uz.efbazaar.trade.plan.service.PlanProjection;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Custom (self-named) boxes spend {@code mailbox.custom_slots}, never
 * {@code mailbox.slots}, and are locked — not deleted — past their own limit.
 */
@SpringBootTest
@Import(StubEscrowConfig.class)
class CustomSlotIT extends AbstractIntegrationIT {

    @Autowired MailboxSlotService slots;
    @Autowired CustomSlotService custom;
    @Autowired MailboxAccessService access;
    @Autowired MailboxService mailboxService;
    @Autowired PlanProjection projection;
    @Autowired PlanEntitlementViewRepository entitlementRows;
    @Autowired UserPlanViewRepository userPlanRows;
    @Autowired MailboxRepository mailboxes;

    @AfterEach
    void forget() {
        entitlementRows.deleteAll();
        userPlanRows.deleteAll();
    }

    private void standardGrants(Map<String, String> granted) {
        projection.replacePlan("STANDARD", new HashMap<>(granted));
    }

    private UUID box(UUID owner, MailboxKind kind, long priority) {
        UUID id = UUID.randomUUID();
        mailboxes.saveAndFlush(Mailbox.builder().id(id).email("c-" + id + "@efbazaar.uz")
                .ownerUserId(owner).encryptedPassword(new byte[]{1}).passwordIv(new byte[12])
                .passwordTag(new byte[16]).createdAt(Instant.now()).provisionedAt(Instant.now())
                .accessPriority(priority).kind(kind).build());
        return id;
    }

    private UUID adminGift(UUID owner, long priority) {
        UUID id = box(owner, MailboxKind.CUSTOM, priority);
        mailboxes.findById(id).ifPresent(m -> {
            m.setSource(uz.efbazaar.trade.mailbox.domain.MailboxSource.ADMIN);
            mailboxes.saveAndFlush(m);
        });
        return id;
    }

    @Test
    void anAdminGivenCustomBoxNeitherSpendsASlotNorLocks() {
        standardGrants(Map.of("mailbox.slots", "3", "mailbox.custom_slots", "0"));
        UUID u = UUID.randomUUID();
        UUID gift = adminGift(u, 1);

        assertThat(custom.used(u)).isZero();
        assertThat(access.lockedIds(u)).doesNotContain(gift);
    }

    @Test
    void adminGiftsDoNotPushUserClaimedBoxesIntoTheLock() {
        standardGrants(Map.of("mailbox.slots", "3", "mailbox.custom_slots", "1"));
        UUID u = UUID.randomUUID();
        adminGift(u, 9);
        UUID claimed = box(u, MailboxKind.CUSTOM, 1);

        assertThat(custom.canAllocate(u)).isFalse();
        assertThat(access.lockedIds(u)).doesNotContain(claimed);
    }

    @Test
    void customBoxesDoNotSpendRandomSlots() {
        standardGrants(Map.of("mailbox.slots", "1", "mailbox.custom_slots", "0"));
        UUID u = UUID.randomUUID();
        box(u, MailboxKind.CUSTOM, 1);

        assertThat(slots.used(u)).isZero();
        assertThatCode(() -> slots.assertCanAllocate(u)).doesNotThrowAnyException();
    }

    @Test
    void missingCustomEntitlementMeansZero() {
        standardGrants(Map.of("mailbox.slots", "3"));
        UUID u = UUID.randomUUID();

        assertThat(custom.limitFor(u)).hasValue(0);
        assertThat(custom.canAllocate(u)).isFalse();
    }

    @Test
    void nullCustomEntitlementMeansUnlimited() {
        Map<String, String> g = new HashMap<>();
        g.put("mailbox.custom_slots", null);
        standardGrants(g);
        UUID u = UUID.randomUUID();

        assertThat(custom.limitFor(u)).isEmpty();
        assertThat(custom.canAllocate(u)).isTrue();
    }

    @Test
    void customUsageCountsOnlyCustomBoxes() {
        standardGrants(Map.of("mailbox.slots", "5", "mailbox.custom_slots", "2"));
        UUID u = UUID.randomUUID();
        box(u, MailboxKind.CUSTOM, 1);
        box(u, MailboxKind.RANDOM, 2);

        assertThat(custom.used(u)).isEqualTo(1);
        assertThat(custom.canAllocate(u)).isTrue();
    }

    @Test
    void downgradeLocksOldestCustomBoxesOnly() {
        standardGrants(Map.of("mailbox.slots", "5", "mailbox.custom_slots", "1"));
        UUID u = UUID.randomUUID();
        UUID older = box(u, MailboxKind.CUSTOM, 1);
        box(u, MailboxKind.CUSTOM, 2);
        box(u, MailboxKind.RANDOM, 3);

        assertThat(access.lockedIds(u)).containsExactly(older);
        assertThat(custom.canAllocate(u)).isFalse();
        assertThat(mailboxes.findById(older)).isPresent();
    }

    @Test
    void randomLimitDoesNotLockCustomBoxes() {
        standardGrants(Map.of("mailbox.slots", "1", "mailbox.custom_slots", "1"));
        UUID u = UUID.randomUUID();
        UUID customBox = box(u, MailboxKind.CUSTOM, 5);
        UUID oldRandom = box(u, MailboxKind.RANDOM, 1);
        box(u, MailboxKind.RANDOM, 2);

        assertThat(access.lockedIds(u)).containsExactly(oldRandom).doesNotContain(customBox);
    }

    @Test
    void unlimitedRandomPlanStillLocksCustomPastLimit() {
        Map<String, String> g = new HashMap<>();
        g.put("mailbox.slots", null);
        g.put("mailbox.custom_slots", "0");
        standardGrants(g);
        UUID u = UUID.randomUUID();
        UUID customBox = box(u, MailboxKind.CUSTOM, 1);

        assertThat(access.lockedIds(u)).containsExactly(customBox);
    }

    @Test
    void unlockSwapRefusesMixingKinds() {
        standardGrants(Map.of("mailbox.slots", "1", "mailbox.custom_slots", "1"));
        UUID u = UUID.randomUUID();
        UUID lockedCustom = box(u, MailboxKind.CUSTOM, 1);
        box(u, MailboxKind.CUSTOM, 2);
        UUID openRandom = box(u, MailboxKind.RANDOM, 3);

        assertThatThrownBy(() -> mailboxService.swapAccess(u, lockedCustom, openRandom))
                .isInstanceOf(InvalidUnlockSwapException.class);
    }
}
