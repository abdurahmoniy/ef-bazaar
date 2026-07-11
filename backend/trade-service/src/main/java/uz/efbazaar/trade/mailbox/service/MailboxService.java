package uz.efbazaar.trade.mailbox.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;

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
}
