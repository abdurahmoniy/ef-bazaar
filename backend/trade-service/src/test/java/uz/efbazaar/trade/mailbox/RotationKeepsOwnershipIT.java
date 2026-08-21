package uz.efbazaar.trade.mailbox;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Rotating a mailbox password must not decide who owns it.
 *
 * <p>The two are written by different actors seconds apart: ownership by
 * whatever ends the trade, credentials by the worker answering a rotation the
 * trade asked for on its way out. Writing the whole row back for the second
 * put back whatever ownership held when the handler read it — so an inbox
 * handed to its owner as the trade closed went back to belonging to nobody,
 * and the party who had already moved their account into it could not reach it.
 *
 * <p>Seen as an intermittent failure in the escalation suite, where a
 * reassignment revokes ownership and rotates, and the trade then times out and
 * hands the inbox back: whether the rotation's reply landed inside that window
 * decided whether the handover survived.
 *
 * <p>Staged rather than raced: the writer is held open on purpose, because
 * leaving the interleaving to chance reproduced this about one run in two.
 */
@SpringBootTest
class RotationKeepsOwnershipIT extends AbstractIntegrationIT {

    @Autowired MailboxService mailboxes;
    @Autowired MailboxRepository repo;
    @Autowired TransactionTemplate tx;

    @Test
    void aRotationLandingAfterAHandoverDoesNotUndoIt() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox box = repo.saveAndFlush(Mailbox.builder()
                .id(UUID.randomUUID())
                .email("trade-" + UUID.randomUUID().toString().substring(0, 8) + "@efbazaar.uz")
                .encryptedPassword("original".getBytes())
                .passwordIv(new byte[12])
                .passwordTag(new byte[16])
                .createdAt(Instant.now())
                .provisionedAt(Instant.now())
                .build());

        CountDownLatch assigned = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        CountDownLatch rotated = new CountDownLatch(1);

        // The trade ends and hands the inbox over, not yet committed.
        Thread handover = Thread.ofPlatform().start(() -> tx.executeWithoutResult(status -> {
            Mailbox held = repo.findById(box.getId()).orElseThrow();
            held.setOwnerUserId(owner);
            held.setHandedOffAt(Instant.now());
            repo.saveAndFlush(held);
            assigned.countDown();
            awaitQuietly(commit);
        }));
        assertThat(assigned.await(10, TimeUnit.SECONDS)).as("the handover started").isTrue();

        // The worker's rotation reply, which read the row before any of that.
        Thread rotation = Thread.ofPlatform().start(() -> {
            try {
                mailboxes.overwriteAddressAndPassword(box.getId(), null,
                        "rotated".getBytes(), new byte[12], new byte[16]);
            } finally {
                rotated.countDown();
            }
        });

        Thread.sleep(300);
        commit.countDown();
        assertThat(rotated.await(20, TimeUnit.SECONDS)).as("the rotation finished").isTrue();
        handover.join(10_000);
        rotation.join(10_000);

        Mailbox after = repo.findById(box.getId()).orElseThrow();
        assertThat(after.getOwnerUserId())
                .as("the rotation may change the password; it may not change the owner")
                .isEqualTo(owner);
        assertThat(after.getEncryptedPassword())
                .as("and it must still have done its own job")
                .isEqualTo("rotated".getBytes());
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(20, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
