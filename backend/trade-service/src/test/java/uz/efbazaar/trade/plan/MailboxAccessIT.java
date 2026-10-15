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
        m.put("mailbox.slots", value);
        projection.replacePlan("STANDARD", m);
    }

    private UUID owned(UUID owner, long priority) {
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
}
