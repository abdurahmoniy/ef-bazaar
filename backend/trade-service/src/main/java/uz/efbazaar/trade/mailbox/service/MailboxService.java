package uz.efbazaar.trade.mailbox.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class MailboxService {

    private final MailboxRepository mailboxes;
    private final TradeRepository trades;
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

    /**
     * Replaces a placeholder mailbox row (id = {@code placeholderId}) with a new
     * row keyed by the worker-supplied UUID. Called from
     * {@link uz.efbazaar.trade.kafka.EmailProvisionedConsumer} when the worker
     * assigns its own mailbox id — the encryption context, rotate-cache lookup,
     * and persisted id all have to be the same UUID for
     * {@link uz.efbazaar.trade.kafka.MailboxRotatedConsumer} and
     * {@link uz.efbazaar.trade.mail.service.MailboxPasswordResolver} to keep
     * working end-to-end.
     *
     * <p>{@code mailboxes.id} is {@code updatable = false} (JPA PK) so we can't
     * mutate it in place — instead we delete the placeholder row and insert a
     * fresh row carrying the placeholder's {@code trade_id} FK.
     *
     * <p>Returns the id that ended up in the DB. If the placeholder id already
     * matches {@code workerMailboxId} we take the simpler path and just
     * overwrite address/password; the return value is stable in either case so
     * callers can update {@code trade.mailboxId} unconditionally.
     */
    @Transactional
    public UUID adoptWorkerMailboxId(UUID placeholderId, UUID workerMailboxId,
                                     String email, byte[] encPass, byte[] iv, byte[] tag) {
        // If the placeholder row is already gone we're either on a Kafka replay
        // (the swap happened on an earlier delivery) or in a test path that
        // never created a placeholder. Either way, the worker-owned id is what
        // trade-service should end up with — check if it already exists, and
        // upsert.
        Mailbox existingWorker = mailboxes.findById(workerMailboxId).orElse(null);
        Mailbox placeholder = mailboxes.findById(placeholderId).orElse(null);
        if (placeholder == null && existingWorker == null) {
            log.warn("adoptWorkerMailboxId: neither placeholder {} nor worker {} exists — "
                    + "creating fresh row for worker id", placeholderId, workerMailboxId);
            Mailbox fresh = Mailbox.builder()
                    .id(workerMailboxId)
                    .email(email)
                    .encryptedPassword(encPass)
                    .passwordIv(iv)
                    .passwordTag(tag)
                    .createdAt(Instant.now())
                    .build();
            mailboxes.save(fresh);
            return workerMailboxId;
        }
        if (placeholder == null) {
            // Worker row already exists (Kafka replay after a successful swap).
            // Refresh the password fields defensively; email should already match.
            existingWorker.setEmail(email);
            existingWorker.setEncryptedPassword(encPass);
            existingWorker.setPasswordIv(iv);
            existingWorker.setPasswordTag(tag);
            mailboxes.save(existingWorker);
            return workerMailboxId;
        }
        if (workerMailboxId.equals(placeholderId)) {
            // Happens when a caller (e.g. MockWorker) chose to echo the
            // placeholder id back — no swap needed, just overwrite the fields.
            placeholder.setEmail(email);
            placeholder.setEncryptedPassword(encPass);
            placeholder.setPasswordIv(iv);
            placeholder.setPasswordTag(tag);
            mailboxes.save(placeholder);
            return placeholderId;
        }

        // Workers echo back the placeholder id trade-service supplied in
        // EmailProvisionRequest, so the else-branch of this method should be
        // unreachable in production. Kept as a defensive log: swapping ids at
        // this point would need a full FK dance (trades.mailbox_id → mailboxes.id)
        // which races with in-flight state transitions. If we ever hit this
        // branch it means the worker regressed to generating its own UUID —
        // fix the worker, don't try to swap here.
        log.error("adoptWorkerMailboxId: worker id {} != placeholder id {} — "
                + "worker MUST echo back the placeholder id. Row NOT swapped; "
                + "overwriting placeholder fields to keep the trade usable.",
                workerMailboxId, placeholderId);
        placeholder.setEmail(email);
        placeholder.setEncryptedPassword(encPass);
        placeholder.setPasswordIv(iv);
        placeholder.setPasswordTag(tag);
        mailboxes.save(placeholder);
        return placeholderId;
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

    /**
     * Takes the escrow mailbox away from whoever holds it while the trade
     * itself lives on. Used when a human trade is reassigned: the departing
     * admin must lose mail.efbazaar.uz access immediately, and the next owner
     * is written by the {@code IN_PROGRESS} on-enter handler when the new admin
     * accepts.
     *
     * <p>Deliberately NOT {@code assignOwner(id, null)}: that method also nulls
     * {@code trade_id} and stamps {@code handed_off_at}, which are the marks of
     * a finished trade handing the inbox to a party. A reassignment is not a
     * handoff — the FK must stay so {@link
     * uz.efbazaar.trade.mail.service.MailboxPasswordResolver} keeps resolving
     * the provisioning context, and {@code MailboxRepository.findOrphaned}
     * must not sweep up a live trade's mailbox.
     */
    @Transactional
    public void revokeOwner(UUID mailboxId) {
        Mailbox m = mailboxes.findById(mailboxId)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId));
        m.setOwnerUserId(null);
        mailboxes.save(m);
    }

    /**
     * The orphan path: nobody gets the inbox. Both the owner and the trade FK
     * are cleared — leaving {@code owner_user_id} on the last admin would hand
     * them permanent read access to an escrow inbox full of Konami
     * password-reset mail, since {@link uz.efbazaar.trade.mail.service.MailService}
     * authorises on ownership alone.
     */
    @Transactional
    public void stripFromTrade(UUID mailboxId) {
        Mailbox m = mailboxes.findById(mailboxId)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId));
        m.setTradeId(null);
        m.setOwnerUserId(null);
        mailboxes.save(m);
    }
}
