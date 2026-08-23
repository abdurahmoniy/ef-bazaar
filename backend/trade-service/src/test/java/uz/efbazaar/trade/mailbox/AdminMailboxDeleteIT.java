package uz.efbazaar.trade.mailbox;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asAdmin;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/**
 * Clearing out mailboxes nobody holds.
 *
 * <p>Every trade makes one, and the ones whose trade never got off the ground
 * pile up: they cost a licence slot on the mail server and clutter the panel.
 *
 * <p>The refusals matter more than the deletion. A mailbox with an owner is
 * somebody's account — if their Konami address still points at it, deleting it
 * loses them the account with no way back, because the password reset goes to
 * the address that no longer exists.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminMailboxDeleteIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired MailboxRepository mailboxes;

    /** Standalone, so MockWorker has no reason to touch it. */
    private UUID mailbox(UUID owner, UUID tradeId) {
        UUID id = UUID.randomUUID();
        mailboxes.saveAndFlush(Mailbox.builder()
                .id(id)
                .email("cleanup-" + id.toString().substring(0, 8) + "@efbazaar.uz")
                .ownerUserId(owner)
                .tradeId(tradeId)
                .encryptedPassword(new byte[]{1})
                .passwordIv(new byte[12])
                .passwordTag(new byte[16])
                .createdAt(Instant.now())
                .build());
        return id;
    }

    private String path(UUID id) {
        return "/api/v1/admin/mailboxes/" + id;
    }

    @Test
    void anUnheldMailboxIsMarkedDeleted() throws Exception {
        UUID id = mailbox(null, null);

        mvc.perform(delete(path(id)).with(asAdmin())).andExpect(status().isNoContent());

        assertThat(mailboxes.findById(id).orElseThrow().getDeletedAt())
                .as("kept as a row: audit entries and closed trades still point at it")
                .isNotNull();
    }

    @Test
    void aMailboxWithAnOwnerIsRefused() {
        UUID id = mailbox(UUID.randomUUID(), null);

        org.assertj.core.api.Assertions.assertThatCode(() ->
                mvc.perform(delete(path(id)).with(asAdmin())).andExpect(status().isConflict()))
                .doesNotThrowAnyException();
        assertThat(mailboxes.findById(id).orElseThrow().getDeletedAt()).isNull();
    }

    @Test
    void aMailboxInATradeIsRefused() {
        UUID id = mailbox(null, UUID.randomUUID());

        org.assertj.core.api.Assertions.assertThatCode(() ->
                mvc.perform(delete(path(id)).with(asAdmin())).andExpect(status().isConflict()))
                .doesNotThrowAnyException();
        assertThat(mailboxes.findById(id).orElseThrow().getDeletedAt()).isNull();
    }

    @Test
    void deletingTwiceIsNotAnError() throws Exception {
        // The button can be double-clicked, and Kafka redelivers.
        UUID id = mailbox(null, null);

        mvc.perform(delete(path(id)).with(asAdmin())).andExpect(status().isNoContent());
        mvc.perform(delete(path(id)).with(asAdmin())).andExpect(status().isNoContent());
    }

    @Test
    void anOrdinaryUserCannotDeleteAnything() throws Exception {
        UUID id = mailbox(null, null);

        mvc.perform(delete(path(id)).with(asUser(UUID.randomUUID())))
                .andExpect(status().isForbidden());
        assertThat(mailboxes.findById(id).orElseThrow().getDeletedAt()).isNull();
    }
}
