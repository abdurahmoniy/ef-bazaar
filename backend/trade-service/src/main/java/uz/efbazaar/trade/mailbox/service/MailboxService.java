package uz.efbazaar.trade.mailbox.service;

import jakarta.persistence.EntityNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxSource;
import uz.efbazaar.trade.mailbox.dto.MailboxStats;
import uz.efbazaar.trade.mailbox.exception.MailboxAlreadyExistsException;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.repository.MailboxSpecs;
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
    private final uz.efbazaar.trade.kafka.TradeEventPublisher events;

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
     * Clears out a mailbox nobody holds.
     *
     * <p>Only an unheld one. A mailbox with an owner is somebody's account:
     * if their Konami address still points at it, deleting it takes the
     * account with it, and no password reset can bring either back. A mailbox
     * in a live trade is worse still — it is the trade's instrument.
     *
     * <p>Soft-deleted here and removed from Mailcow by the worker. The row
     * stays because audit rows and closed trades point at it, and a deleted
     * mailbox that leaves dangling references behind is not tidier.
     *
     * <p>Idempotent: deleting one that is already gone does nothing rather
     * than failing, so a double-click is not an error.
     */
    /**
     * Foydalanuvchi O'Z pochta qutisini o'chiradi.
     *
     * <p>Slot to'lganda savdoga kira olmaydi va yagona chiqish yo'li —
     * eskisini bo'shatish. Ilgari o'chirish faqat adminda edi va u ham
     * egasi bor qutini o'chira olmasdi, ya'ni to'lgan slot boshi berk
     * ko'cha bo'lardi.
     *
     * <p>TIRIK SAVDODAGI quti o'chirilmaydi: u hozir ishlatilmoqda va
     * uni olib qo'yish savdoni to'xtatib qo'yardi.
     */
    @Transactional
    public void deleteOwnedBy(UUID userId, UUID mailboxId) {
        Mailbox m = mailboxes.findById(mailboxId)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId));
        if (!userId.equals(m.getOwnerUserId())) {
            // Boshqa odamning qutisi borligini ham bildirmaymiz: u
            // Konami parol tiklash xatlarini saqlaydi.
            throw new EntityNotFoundException("Mailbox " + mailboxId);
        }
        if (m.getTradeId() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu pochta qutisi savdoda ishlatilmoqda — o'chirib bo'lmaydi");
        }
        // Egalik OLIB TASHLANADI, keyin o'chiriladi: deleteUnheld egasi
        // bor qutini rad etadi va bu ataylab — tasodifiy o'chirishdan
        // himoya. Bu yerda esa egasining o'zi ataylab so'rayapti.
        m.setOwnerUserId(null);
        mailboxes.save(m);
        deleteUnheld(mailboxId);
    }

    @Transactional
    public void deleteUnheld(UUID mailboxId) {
        Mailbox m = mailboxes.findById(mailboxId)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId));
        if (m.getDeletedAt() != null) {
            return;
        }
        if (m.getOwnerUserId() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu pochta qutisi foydalanuvchiga biriktirilgan — o'chirib bo'lmaydi");
        }
        if (m.getTradeId() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu pochta qutisi savdoda ishlatilmoqda — o'chirib bo'lmaydi");
        }
        String email = m.getEmail();
        boolean everMade = m.getProvisionedAt() != null;
        m.setDeletedAt(Instant.now());
        mailboxes.save(m);
        if (everMade) {
            // Published after the row is marked, so a worker that acts
            // instantly cannot delete a box we then fail to mark.
            events.mailboxDeleteRequest(mailboxId, email);
            log.info("Mailbox {} marked deleted and queued for removal from Mailcow", mailboxId);
        } else {
            // Reserved but never created — there is nothing on the mail server
            // to remove. Asking anyway got Mailcow's access_denied (which is
            // what it answers for a mailbox that does not exist), and that is
            // not a failure the worker can ever retry its way out of.
            log.info("Mailbox {} was never provisioned; nothing to remove from Mailcow", mailboxId);
        }
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
     *
     * <p>Also stamps {@code provisioned_at}: real credentials just landed, so
     * the row is usable from here on. The admin panel keys "pending" off that
     * column and would otherwise show every live trade mailbox as pending.
     */
    @Transactional
    public void overwriteAddressAndPassword(UUID mailboxId, String email,
                                            byte[] encPass, byte[] iv, byte[] tag) {
        Instant now = Instant.now();
        int updated = email != null
                ? mailboxes.applyAddressAndCredentials(mailboxId, email, encPass, iv, tag, now)
                : mailboxes.applyCredentials(mailboxId, encPass, iv, tag, now);
        if (updated == 0) {
            throw new EntityNotFoundException("Mailbox " + mailboxId);
        }
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
                    .provisionedAt(Instant.now())
                    .build();
            mailboxes.save(fresh);
            return workerMailboxId;
        }
        if (placeholder == null) {
            // Worker row already exists (Kafka replay after a successful swap).
            // Refresh the password fields defensively; email should already match.
            applyCredentials(existingWorker, email, encPass, iv, tag);
            return workerMailboxId;
        }
        if (workerMailboxId.equals(placeholderId)) {
            // Happens when a caller (e.g. MockWorker) chose to echo the
            // placeholder id back — no swap needed, just overwrite the fields.
            applyCredentials(placeholder, email, encPass, iv, tag);
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
        applyCredentials(placeholder, email, encPass, iv, tag);
        return placeholderId;
    }

    /**
     * Writes worker-supplied credentials onto a row and marks it provisioned.
     * {@code provisioned_at} is only stamped once — a later rotate refreshes
     * the password but must not rewrite when the box first came to life.
     */
    private void applyCredentials(Mailbox m, String email,
                                  byte[] encPass, byte[] iv, byte[] tag) {
        m.setEmail(email);
        m.setEncryptedPassword(encPass);
        m.setPasswordIv(iv);
        m.setPasswordTag(tag);
        if (m.getProvisionedAt() == null) {
            m.setProvisionedAt(Instant.now());
        }
        mailboxes.save(m);
    }

    // ---------- admin panel ----------

    /** Every filter is optional; unset ones drop out of the WHERE clause. */
    @Transactional(readOnly = true)
    public Page<Mailbox> searchForAdmin(String search, UUID ownerUserId, MailboxSource source,
                                        boolean pendingOnly, boolean unassignedOnly,
                                        Pageable pageable) {
        Specification<Mailbox> spec = Specification.allOf(
                MailboxSpecs.emailContains(search),
                MailboxSpecs.ownedBy(ownerUserId),
                MailboxSpecs.hasSource(source),
                MailboxSpecs.pendingOnly(pendingOnly),
                MailboxSpecs.unassignedOnly(unassignedOnly));
        return mailboxes.findAll(spec, pageable);
    }

    /** Counters for the admin panel's filter chips. */
    @Transactional(readOnly = true)
    public MailboxStats statsForAdmin() {
        return new MailboxStats(
                mailboxes.count(),
                mailboxes.countBySource(MailboxSource.TRADE),
                mailboxes.countBySource(MailboxSource.ADMIN),
                mailboxes.countByProvisionedAtIsNull(),
                mailboxes.countByOwnerUserIdIsNull());
    }

    /**
     * Reserves a row for an admin-registered mailbox and links it to a user
     * immediately. The address is claimed here (unique index) rather than after
     * the worker replies, so two admins racing on the same local part get a
     * clean 409 instead of a duplicate Mailcow box.
     *
     * <p>The row is "pending" until
     * {@link #markProvisioned} lands: the password bytes are placeholders and
     * {@code provisionedAt} is null, so nothing can log into IMAP with it yet.
     */
    @Transactional
    public Mailbox createPendingForAdmin(String email, UUID ownerUserId, UUID adminId) {
        if (mailboxes.existsByEmail(email)) {
            throw new MailboxAlreadyExistsException(email);
        }
        Instant now = Instant.now();
        Mailbox m = Mailbox.builder()
                .id(UUID.randomUUID())
                .email(email)
                .ownerUserId(ownerUserId)
                .source(MailboxSource.ADMIN)
                .createdByAdminId(adminId)
                .encryptedPassword(new byte[]{0})
                .passwordIv(new byte[12])
                .passwordTag(new byte[16])
                .createdAt(now)
                // The owner is attached at creation time, so "owned since" is now —
                // MailboxSummary.ownedSince falls back to createdAt anyway, but being
                // explicit keeps admin rows and handed-off trade rows shaped alike.
                .handedOffAt(now)
                .build();
        return mailboxes.save(m);
    }

    /**
     * Confirms an admin-registered mailbox after the worker created it in
     * Mailcow: stores the real encrypted password and stamps
     * {@code provisioned_at}. Idempotent — a Kafka redelivery just rewrites the
     * same fields.
     */
    @Transactional
    public void markProvisioned(UUID mailboxId, String email,
                                byte[] encPass, byte[] iv, byte[] tag) {
        Mailbox m = mailboxes.findById(mailboxId)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId));
        if (email != null && !email.isBlank()) {
            m.setEmail(email);
        }
        m.setEncryptedPassword(encPass);
        m.setPasswordIv(iv);
        m.setPasswordTag(tag);
        m.setProvisionedAt(Instant.now());
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

    /**
     * Takes the escrow mailbox away from whoever holds it while the trade
     * itself lives on. Used when a human trade is reassigned: the departing
     * admin must lose mail.efbazaar.uz access immediately, and the next owner
     * is written by the {@code IN_PROGRESS} on-enter handler when the new admin
     * accepts.
     *
     * <p>Deliberately NOT {@code assignOwner(id, null)}: that method also stamps
     * {@code handed_off_at}, which is the mark of a finished trade handing the
     * inbox to a party. A reassignment is not a handoff, and re-stamping it
     * would misdate the eventual real one.
     *
     * <p>Note {@code trade_id} is already null by the time this runs — the
     * {@code IN_PROGRESS} on-enter handler clears it when the first admin
     * accepts — so after this call the mailbox matches
     * {@code MailboxRepository.findOrphaned} and shows up in the platform
     * admin's orphan list until the replacement accepts. That is cosmetic:
     * the list is read-only and {@code ROLE_ADMIN}-gated, and
     * {@link uz.efbazaar.trade.mail.service.MailboxPasswordResolver} recovers
     * the provisioning context through its {@code findByMailboxId} fallback.
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
