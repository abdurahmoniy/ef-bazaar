package uz.efbazaar.trade.mail;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.mail.service.MailboxPasswordResolver;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.Optional;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Verifies the crypto-context fallback chain. See {@link MailboxPasswordResolver}
 * javadoc for the ordering rationale — the resolver is the plumbing that
 * papers over a real, historical inconsistency in how mailbox passwords were
 * encrypted across the Python worker, MockWorker, and MailboxService.
 */
class MailboxPasswordResolverTest {

    private TradeCrypto crypto;
    private TradeRepository trades;
    private MailboxPasswordResolver resolver;

    @BeforeEach
    void setUp() {
        byte[] masterKey = new byte[32];
        new SecureRandom().nextBytes(masterKey);
        crypto = new TradeCrypto(() -> masterKey);
        trades = Mockito.mock(TradeRepository.class);
        // Every test in this class hands the resolver a Mailbox whose tradeId
        // is already populated — the trade-repo fallback (for post-handoff
        // rows where mailbox.tradeId=null) never fires, so returning empty is
        // the safe default.
        Mockito.when(trades.findByMailboxId(Mockito.any())).thenReturn(Optional.empty());
        resolver = new MailboxPasswordResolver(crypto, trades);
    }

    @Test
    void decryptsWithPrimaryMailboxIdContext() {
        UUID mailboxId = UUID.randomUUID();
        UUID tradeId = UUID.randomUUID();
        EncryptedField enc = crypto.encrypt("mbox-" + mailboxId, "hunter2".getBytes(StandardCharsets.UTF_8));

        Mailbox mb = mailboxWithFields(mailboxId, tradeId, enc);
        byte[] plain = resolver.decryptPassword(mb);

        assertThat(new String(plain, StandardCharsets.UTF_8)).isEqualTo("hunter2");
    }

    @Test
    void fallsBackToTradeIdContext() {
        UUID mailboxId = UUID.randomUUID();
        UUID tradeId = UUID.randomUUID();
        // Encrypted with trade-id (production email_provision.py path)
        EncryptedField enc = crypto.encrypt("mbox-" + tradeId, "legacy-pw".getBytes(StandardCharsets.UTF_8));

        Mailbox mb = mailboxWithFields(mailboxId, tradeId, enc);
        byte[] plain = resolver.decryptPassword(mb);

        assertThat(new String(plain, StandardCharsets.UTF_8)).isEqualTo("legacy-pw");
    }

    @Test
    void fallsBackToMockTradeContext() {
        UUID mailboxId = UUID.randomUUID();
        UUID tradeId = UUID.randomUUID();
        EncryptedField enc = crypto.encrypt("mbox-mock-" + tradeId, "mock-pw".getBytes(StandardCharsets.UTF_8));

        Mailbox mb = mailboxWithFields(mailboxId, tradeId, enc);
        byte[] plain = resolver.decryptPassword(mb);

        assertThat(new String(plain, StandardCharsets.UTF_8)).isEqualTo("mock-pw");
    }

    @Test
    void fallsBackToMockRotateContext() {
        UUID mailboxId = UUID.randomUUID();
        EncryptedField enc = crypto.encrypt("mbox-mock-rotate-" + mailboxId,
                "mock-rotated".getBytes(StandardCharsets.UTF_8));

        // No tradeId — simulates a post-handoff row.
        Mailbox mb = mailboxWithFields(mailboxId, null, enc);
        byte[] plain = resolver.decryptPassword(mb);

        assertThat(new String(plain, StandardCharsets.UTF_8)).isEqualTo("mock-rotated");
    }

    @Test
    void throwsWhenNoContextMatches() {
        UUID mailboxId = UUID.randomUUID();
        UUID otherId = UUID.randomUUID();
        // Encrypted with a completely unrelated context — none of the fallbacks match.
        EncryptedField enc = crypto.encrypt("mbox-" + otherId, "x".getBytes(StandardCharsets.UTF_8));

        Mailbox mb = mailboxWithFields(mailboxId, null, enc);

        assertThatThrownBy(() -> resolver.decryptPassword(mb))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Failed to decrypt mailbox");
    }

    private static Mailbox mailboxWithFields(UUID mailboxId, UUID tradeId, EncryptedField enc) {
        return Mailbox.builder()
                .id(mailboxId)
                .email(mailboxId + "@efbazaar.uz")
                .tradeId(tradeId)
                .encryptedPassword(enc.ciphertext())
                .passwordIv(enc.iv())
                .passwordTag(enc.tag())
                .build();
    }

}
