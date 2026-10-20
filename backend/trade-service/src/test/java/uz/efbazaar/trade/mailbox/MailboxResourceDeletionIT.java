package uz.efbazaar.trade.mailbox;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.kafka.EmailProvisionedConsumer;
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.plan.service.MailboxSlotService;
import uz.efbazaar.trade.testsupport.AbstractMailboxFeatureIT;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeKind;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.service.TradeService;
import uz.efbazaar.trade.trade.service.TradeSideService;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asAdmin;

/** Deletion must use current database responsibility, including live reservation and cached-read races. */
class MailboxResourceDeletionIT extends AbstractMailboxFeatureIT {
    @Autowired MailboxRepository mailboxes;
    @Autowired MailboxService service;
    @Autowired TradeService trades;
    @Autowired TradeSideService sides;
    @Autowired MailboxSlotService slots;
    @Autowired EmailProvisionedConsumer provisioned;
    @Autowired MockMvc mvc;
    @Autowired EntityManager entityManager;
    @Autowired PlatformTransactionManager tx;

    private UUID unheld(boolean real) {
        UUID id = UUID.randomUUID();
        mailboxes.saveAndFlush(Mailbox.builder().id(id).email("delete-" + id + "@efbazaar.uz")
                .encryptedPassword(new byte[]{1}).passwordIv(new byte[12]).passwordTag(new byte[16])
                .provisionedAt(real ? Instant.now() : null).build());
        return id;
    }

    @Test
    void activePartialSwapResourceCannotBeDeletedByAdmin() throws Exception {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        UUID trade = trades.openTrade(UUID.randomUUID(), seller, buyer, 0L, null, null, UUID.randomUUID(),
                null, TradeMode.SMART, null, null, TradeKind.SWAP, 500_000L).id();
        UUID box = sides.of(trade, ParticipantRole.SELLER).orElseThrow().getMailboxId();
        provisioned.onEmailProvisioned(new TradeEvents.EmailProvisioned(trade, box,
                "live-delete-" + UUID.randomUUID() + "@efbazaar.uz", new byte[]{1}, new byte[12], new byte[16]));
        Mailbox before = mailboxes.findById(box).orElseThrow();
        assertThat(before.getOwnerUserId()).isNull();
        assertThat(before.getRetainedUserId()).isNull();
        assertThat(before.getTradeId()).isNull();
        assertThat(before.getProvisionedAt()).isNotNull();

        mvc.perform(delete("/api/v1/admin/mailboxes/" + box).with(asAdmin()))
                .andExpect(status().isConflict());

        assertThat(mailboxes.findById(box).orElseThrow().getDeletedAt()).isNull();
        assertThat(slots.used(seller)).isEqualTo(1);
        assertThat(slots.used(buyer)).isEqualTo(1);
        verify(events, never()).mailboxDeleteRequest(eq(box), any());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void staleUnheldSnapshotCannotDeleteChangedResponsibility(boolean detachAfterTransfer) {
        UUID box = unheld(true), recipient = UUID.randomUUID();
        try (var worker = Executors.newSingleThreadExecutor()) {
            assertThatThrownBy(() -> new TransactionTemplate(tx).executeWithoutResult(status -> {
                Mailbox cached = entityManager.find(Mailbox.class, box);
                assertThat(cached.getOwnerUserId()).isNull();
                assertThat(cached.getRetainedUserId()).isNull();
                try {
                    worker.submit(() -> {
                        service.reassignOwner(UUID.randomUUID(), box, recipient);
                        if (detachAfterTransfer) service.detachOwner(UUID.randomUUID(), box);
                    }).get(10, TimeUnit.SECONDS);
                } catch (Exception e) { throw new IllegalStateException(e); }
                service.deleteUnheld(box);
            })).isInstanceOfSatisfying(ResponseStatusException.class,
                    e -> assertThat(e.getStatusCode().value()).isEqualTo(409));
        }
        Mailbox after = mailboxes.findById(box).orElseThrow();
        assertThat(after.getDeletedAt()).isNull();
        if (detachAfterTransfer) {
            assertThat(after.getOwnerUserId()).isNull();
            assertThat(after.getRetainedUserId()).isEqualTo(recipient);
        } else assertThat(after.getOwnerUserId()).isEqualTo(recipient);
        assertThat(slots.used(recipient)).isEqualTo(1);
        verify(events, never()).mailboxDeleteRequest(eq(box), any());
    }

    @Test
    void provisioningAfterTheCachedReadCannotBeDeletedAsANeverCreatedPlaceholder() {
        UUID box = unheld(false);
        try (var worker = Executors.newSingleThreadExecutor()) {
            assertThatThrownBy(() -> new TransactionTemplate(tx).executeWithoutResult(status -> {
                assertThat(entityManager.find(Mailbox.class, box).getProvisionedAt()).isNull();
                try {
                    worker.submit(() -> service.overwriteAddressAndPassword(box,
                            "created-delete-" + UUID.randomUUID() + "@efbazaar.uz",
                            new byte[]{2}, new byte[12], new byte[16])).get(10, TimeUnit.SECONDS);
                } catch (Exception e) { throw new IllegalStateException(e); }
                service.deleteUnheld(box);
            })).isInstanceOfSatisfying(ResponseStatusException.class,
                    e -> assertThat(e.getStatusCode().value()).isEqualTo(409));
        }
        Mailbox after = mailboxes.findById(box).orElseThrow();
        assertThat(after.getProvisionedAt()).isNotNull();
        assertThat(after.getDeletedAt()).isNull();
        verify(events, never()).mailboxDeleteRequest(eq(box), any());
    }
}
