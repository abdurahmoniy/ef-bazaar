package uz.efbazaar.trade.mailbox;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.testsupport.AbstractPostgresIT;
import java.time.Instant;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class MailboxMailVisibilityIT extends AbstractPostgresIT {
    @Autowired MailboxRepository repo;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @Test void handoffPersistsTradeBoundaryAndRotationCannotWidenIt() {
        Mailbox box = box();
        UUID next = UUID.randomUUID();
        Instant tradeStart = Instant.parse("2026-09-23T10:00:00Z");
        Instant handoff = tradeStart.plusSeconds(300);
        repo.assignOwner(box.getId(), next, handoff, tradeStart);
        Mailbox assigned = repo.findById(box.getId()).orElseThrow();
        assertThat(assigned.getOwnerUserId()).isEqualTo(next);
        assertThat(assigned.getOwnerMailVisibleFrom()).isEqualTo(tradeStart);
        assertThat(assigned.getHandedOffAt()).isEqualTo(handoff);
        repo.applyCredentials(box.getId(), new byte[]{2}, new byte[12], new byte[16], handoff.plusSeconds(10));
        repo.assignOwner(box.getId(), next, handoff.plusSeconds(20), null);
        assertThat(repo.findById(box.getId()).orElseThrow().getOwnerMailVisibleFrom()).isEqualTo(tradeStart);
        Instant nextHandoff = handoff.plusSeconds(30);
        repo.assignOwner(box.getId(), UUID.randomUUID(), nextHandoff, null);
        assertThat(repo.findById(box.getId()).orElseThrow().getOwnerMailVisibleFrom()).isEqualTo(nextHandoff);
    }

    @Test void administrativeReassignmentResetsVisibilityEvenAfterDetach() {
        Mailbox box = box();
        Instant old = Instant.parse("2026-09-01T00:00:00Z");
        box.setOwnerMailVisibleFrom(old);
        repo.saveAndFlush(box);
        box.setOwnerUserId(null);
        box.setOwnerUserId(UUID.randomUUID());
        repo.saveAndFlush(box);
        assertThat(repo.findById(box.getId()).orElseThrow().getOwnerMailVisibleFrom()).isAfter(old);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"SUCCESS", "REJECTED", "ORPHANED"})
    void migrationKeepsOnlyProvenCurrentTradeHistoryIncludingBothSwapSides(String state) {
        // Transaction-local copies let us exercise the actual migration against legacy data.
        for (String table : java.util.List.of("mailboxes", "trades", "trade_sides", "trade_audit_log")) {
            jdbc.execute("CREATE TEMP TABLE " + table + " ON COMMIT DROP AS SELECT * FROM public." + table + " WITH NO DATA");
        }
        jdbc.execute("ALTER TABLE mailboxes DROP COLUMN owner_mail_visible_from");
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        boolean crossed = state.equals("SUCCESS");
        String action = "TRADE_" + state;
        UUID sale = UUID.randomUUID(), swap = UUID.randomUUID();
        UUID saleBox = UUID.randomUUID(), reassigned = UUID.randomUUID();
        UUID sellerBox = UUID.randomUUID(), buyerBox = UUID.randomUUID();
        Instant started = Instant.parse("2026-09-23T10:00:00Z");
        Instant handedOff = started.plusSeconds(300);
        for (UUID id : java.util.List.of(saleBox, reassigned, sellerBox, buyerBox)) {
            jdbc.update("INSERT INTO mailboxes (id, owner_user_id, created_at, handed_off_at) VALUES (?, ?, ?, ?)",
                    id, id.equals(buyerBox) ? (crossed ? seller : buyer) : (crossed ? buyer : seller), java.sql.Timestamp.from(started.minusSeconds(3600)),
                    java.sql.Timestamp.from(id.equals(reassigned) ? handedOff.plusSeconds(60) : handedOff));
        }
        for (UUID id : java.util.List.of(sale, swap)) {
            jdbc.update("INSERT INTO trades (id, seller_id, buyer_id, mailbox_id, created_at, state) VALUES (?, ?, ?, ?, ?, ?)",
                    id, seller, buyer, id.equals(sale) ? saleBox : sellerBox, java.sql.Timestamp.from(started), state);
            jdbc.update("INSERT INTO trade_audit_log (trade_id, action, created_at, metadata) VALUES (?, ?, ?, '{\"mailboxesHandedBack\":\"true\"}')",
                    id, action, java.sql.Timestamp.from(handedOff.plusSeconds(1)));
        }
        jdbc.update("INSERT INTO trade_sides (trade_id, role, mailbox_id) VALUES (?, 'SELLER', ?), (?, 'BUYER', ?)",
                swap, sellerBox, swap, buyerBox);
        // The old trade exists for this mailbox too, but a later manual assignment wins.
        UUID oldTrade = UUID.randomUUID();
        jdbc.update("INSERT INTO trades (id, seller_id, buyer_id, mailbox_id, created_at, state) VALUES (?, ?, ?, ?, ?, ?)",
                oldTrade, seller, buyer, reassigned, java.sql.Timestamp.from(started), state);
        jdbc.update("INSERT INTO trade_audit_log (trade_id, action, created_at, metadata) VALUES (?, ?, ?, '{\"mailboxesHandedBack\":\"true\"}')",
                oldTrade, action, java.sql.Timestamp.from(handedOff.plusSeconds(1)));
        UUID admin = UUID.randomUUID(), adminBox = UUID.randomUUID(), adminReassigned = UUID.randomUUID();
        for (UUID id : java.util.List.of(adminBox, adminReassigned)) {
            UUID humanTrade = UUID.randomUUID();
            jdbc.update("INSERT INTO mailboxes (id, owner_user_id, created_at, handed_off_at) VALUES (?, ?, ?, ?)",
                    id, admin, java.sql.Timestamp.from(started.minusSeconds(3600)),
                    java.sql.Timestamp.from(id.equals(adminBox) ? handedOff : handedOff.plusSeconds(60)));
            jdbc.update("INSERT INTO trades (id, mailbox_id, created_at, mode, state, assigned_admin_id, admin_accepted_at) VALUES (?, ?, ?, 'HUMAN', 'IN_PROGRESS', ?, ?)",
                    humanTrade, id, java.sql.Timestamp.from(started), admin, java.sql.Timestamp.from(handedOff.minusSeconds(1)));
            jdbc.update("INSERT INTO trade_audit_log (trade_id, action, actor_id, created_at, metadata) VALUES (?, 'STATE_TRANSITION', ?, ?, '{\"event\":\"ADMIN_ACCEPTED\"}')",
                    humanTrade, admin, java.sql.Timestamp.from(handedOff.plusSeconds(1)));
        }
        jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
            org.springframework.jdbc.datasource.init.ScriptUtils.executeSqlScript(connection,
                    new org.springframework.core.io.ClassPathResource("db/migration/V26__owner_mail_visibility.sql"));
            return null;
        });
        for (UUID id : java.util.List.of(saleBox, sellerBox, buyerBox, adminBox)) {
            assertThat(jdbc.queryForObject("SELECT owner_mail_visible_from FROM mailboxes WHERE id = ?", java.sql.Timestamp.class, id).toInstant())
                    .isEqualTo(started);
        }
        assertThat(jdbc.queryForObject("SELECT owner_mail_visible_from FROM mailboxes WHERE id = ?", java.sql.Timestamp.class, adminReassigned).toInstant())
                .isEqualTo(handedOff.plusSeconds(60));
        assertThat(jdbc.queryForObject("SELECT owner_mail_visible_from FROM mailboxes WHERE id = ?", java.sql.Timestamp.class, reassigned).toInstant())
                .isEqualTo(handedOff.plusSeconds(60));
    }

    private Mailbox box() {
        return repo.saveAndFlush(Mailbox.builder().id(UUID.randomUUID())
                .email(UUID.randomUUID() + "@example.test").ownerUserId(UUID.randomUUID())
                .encryptedPassword(new byte[]{1}).passwordIv(new byte[12]).passwordTag(new byte[16]).build());
    }
}
