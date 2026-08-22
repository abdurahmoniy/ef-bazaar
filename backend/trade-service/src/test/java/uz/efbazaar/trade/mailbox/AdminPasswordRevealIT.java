package uz.efbazaar.trade.mailbox;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asAdmin;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/**
 * Handing an admin the password of an escrow mailbox.
 *
 * <p>Needed because the password announced when a mailbox is created stops
 * working the moment a trade hands the mailbox over — that handover rotates it,
 * and until now nothing surfaced the replacement, so a mailbox came out of a
 * trade with a password nobody knew.
 *
 * <p>Its own endpoint, so the password stays out of every list response and
 * each disclosure is one line in the log.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminPasswordRevealIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired MailboxRepository mailboxes;
    @Autowired uz.efbazaar.trade.crypto.TradeCrypto crypto;

    /**
     * A mailbox row on its own, with no trade behind it.
     *
     * <p>Deliberately not one a trade reserved: that publishes a provision
     * request, MockWorker answers it over Kafka, and its generated password
     * lands on top of whatever the test wrote. The first version of this did
     * exactly that and passed or failed depending on which write got there
     * last. The endpoint does not care where the row came from.
     */
    private UUID mailboxRow(String password, boolean provisioned) {
        UUID id = UUID.randomUUID();
        var enc = crypto.encrypt("mbox-" + id, password.getBytes());
        mailboxes.saveAndFlush(uz.efbazaar.trade.mailbox.domain.Mailbox.builder()
                .id(id)
                .email("standalone-" + id.toString().substring(0, 8) + "@efbazaar.uz")
                .encryptedPassword(enc.ciphertext())
                .passwordIv(enc.iv())
                .passwordTag(enc.tag())
                .createdAt(java.time.Instant.now())
                .provisionedAt(provisioned ? java.time.Instant.now() : null)
                .build());
        return id;
    }

    @Test
    void anAdminGetsTheAddressAndTheCurrentPassword() throws Exception {
        UUID mailboxId = mailboxRow("RotatedSecret9", true);

        mvc.perform(get("/api/v1/admin/mailboxes/" + mailboxId + "/password").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").exists())
                .andExpect(jsonPath("$.password").value("RotatedSecret9"));
    }

    /**
     * A mailbox the worker has not made yet has no password to show.
     *
     * <p>The reserved row carries a dummy value that cannot be decrypted, so
     * without this the admin gets a 500 and a stack trace about encryption
     * contexts, which says nothing about what actually happened.
     */
    @Test
    void aMailboxThatDoesNotExistYetSaysSo() throws Exception {
        UUID mailboxId = mailboxRow("Irrelevant1", false);

        mvc.perform(get("/api/v1/admin/mailboxes/" + mailboxId + "/password").with(asAdmin()))
                .andExpect(status().isConflict());
    }

    @Test
    void anOrdinaryUserCannotAskForIt() {
        // The whole point of putting it behind its own endpoint is lost if any
        // signed-in user can call it.
        UUID mailboxId = mailboxRow("Whatever1", true);

        org.assertj.core.api.Assertions.assertThatCode(() ->
                mvc.perform(get("/api/v1/admin/mailboxes/" + mailboxId + "/password")
                                .with(asUser(UUID.randomUUID())))
                        .andExpect(status().isForbidden()))
                .doesNotThrowAnyException();
    }
}
