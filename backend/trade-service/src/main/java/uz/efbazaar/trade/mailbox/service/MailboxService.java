package uz.efbazaar.trade.mailbox.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MailboxService {

    private final MailboxRepository mailboxes;
    private final TradeCrypto crypto;

    @Transactional
    public Mailbox create(String email, UUID ownerUserId, UUID tradeId, byte[] initialPassword) {
        UUID id = UUID.randomUUID();
        EncryptedField enc = crypto.encrypt("mbox-" + id, initialPassword);

        Mailbox mbox = Mailbox.builder()
                .id(id)
                .email(email)
                .ownerUserId(ownerUserId)
                .tradeId(tradeId)
                .encryptedPassword(enc.ciphertext())
                .passwordIv(enc.iv())
                .passwordTag(enc.tag())
                .build();
        return mailboxes.save(mbox);
    }

    @Transactional(readOnly = true)
    public List<Mailbox> listOwnedBy(UUID ownerUserId) {
        return mailboxes.findByOwnerUserId(ownerUserId);
    }

    @Transactional(readOnly = true)
    public Mailbox getOwned(UUID ownerUserId, UUID mailboxId) {
        return mailboxes.findByIdAndOwnerUserId(mailboxId, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Mailbox " + mailboxId + " not found for user " + ownerUserId));
    }

    /** Returns the raw entity — needed by TradeStateHandler to read the email address. */
    @Transactional(readOnly = true)
    public Mailbox getRaw(UUID mailboxId) {
        return mailboxes.findById(mailboxId)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId));
    }

    /**
     * Creates a mailbox row with a synthetic email + zero-byte encrypted password so
     * TradeService.openTrade can reserve the FK before the worker (mock or real) has
     * actually provisioned Mailcow. The email-provisioned consumer (Task 14) overwrites
     * both fields once the worker responds.
     */
    @Transactional
    public UUID createPlaceholder(String syntheticEmail) {
        Mailbox m = Mailbox.builder()
                .id(UUID.randomUUID())
                .email(syntheticEmail)
                .encryptedPassword(new byte[]{0})
                .passwordIv(new byte[12])
                .passwordTag(new byte[16])
                .build();
        return mailboxes.save(m).getId();
    }

    /**
     * Overwrites the mailbox address + encrypted password after the (mock or real)
     * worker responds to an email-provision-request or mailbox-rotate-request. A
     * {@code null} email keeps the current address (used by the rotate response,
     * which only changes the password).
     */
    @Transactional
    public void overwriteAddressAndPassword(UUID mailboxId, String email,
                                            byte[] encPass, byte[] iv, byte[] tag) {
        Mailbox m = mailboxes.findById(mailboxId)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId));
        if (email != null) {
            m.setEmail(email);
        }
        m.setEncryptedPassword(encPass);
        m.setPasswordIv(iv);
        m.setPasswordTag(tag);
        mailboxes.save(m);
    }

    @Transactional
    public void assignOwner(UUID mailboxId, UUID newOwnerId) {
        Mailbox m = mailboxes.findById(mailboxId)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId));
        m.setOwnerUserId(newOwnerId);
        m.setTradeId(null);
        m.setHandedOffAt(Instant.now());
        mailboxes.save(m);
    }

    @Transactional
    public void stripFromTrade(UUID mailboxId) {
        Mailbox m = mailboxes.findById(mailboxId)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId));
        m.setTradeId(null);
        mailboxes.save(m);
    }
}
