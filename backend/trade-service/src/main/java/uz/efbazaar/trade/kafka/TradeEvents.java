package uz.efbazaar.trade.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * All Kafka payloads exchanged by trade-service, gathered in one file so the
 * event contract is grep-able. Field order matches spec §9.
 */
public final class TradeEvents {

    private TradeEvents() {}

    // Topics.
    public static final String TOPIC_PROPOSAL_CREATED     = "efbazaar.trade.proposal-created";
    public static final String TOPIC_PROPOSAL_RESOLVED    = "efbazaar.trade.proposal-resolved";
    public static final String TOPIC_EMAIL_PROVISION_REQ  = "efbazaar.trade.email-provision-request";
    public static final String TOPIC_EMAIL_PROVISIONED    = "efbazaar.trade.email-provisioned";
    /**
     * Worker pochta qutisini ocha olmadi va urinishlari tugadi.
     *
     * <p>Usiz savdo INITIATED da abadiy qotib qolardi: bu holatda
     * TIMEOUT ham, rad etish ham, admin bekor qilishi ham yo'q.
     */
    public static final String TOPIC_EMAIL_PROVISION_FAILED =
            "efbazaar.trade.email-provision-failed";
    public static final String TOPIC_FORGOT_PW_REQ        = "efbazaar.trade.forgot-password-request";
    public static final String TOPIC_IMAP_POLL_REQ        = "efbazaar.trade.imap-poll-request";
    public static final String TOPIC_KONAMI_EMAIL         = "efbazaar.trade.konami-email-received";
    public static final String TOPIC_IMAP_2FA             = "efbazaar.trade.imap-2fa-code";
    public static final String TOPIC_MAILBOX_PROVISION_REQ = "efbazaar.trade.mailbox-provision-request";
    public static final String TOPIC_MAILBOX_PROVISIONED   = "efbazaar.trade.mailbox-provisioned";
    public static final String TOPIC_MAILBOX_ROTATE_REQ   = "efbazaar.trade.mailbox-rotate-request";
    public static final String TOPIC_MAILBOX_DELETE_REQ   = "efbazaar.trade.mailbox-delete-request";
    public static final String TOPIC_MAILBOX_ROTATED      = "efbazaar.trade.mailbox-rotated";
    public static final String TOPIC_WORKER_QUEUED        = "efbazaar.trade.worker-queued";
    public static final String TOPIC_WORKER_STARTED       = "efbazaar.trade.worker-started";
    public static final String TOPIC_LISTING_SOLD         = "efbazaar.trade.listing-sold";
    public static final String TOPIC_KONAMI_EMAIL_CHANGE_CODE = "efbazaar.trade.konami-email-change-code-received";
    public static final String TOPIC_ADMIN_INVITED         = "efbazaar.trade.admin-invited";
    public static final String TOPIC_TRADE_OPENED          = "efbazaar.trade.trade-opened";
    public static final String TOPIC_TRADE_CLOSED          = "efbazaar.trade.trade-closed";
    public static final String TOPIC_TRADE_SUCCEEDED       = "efbazaar.trade.trade-succeeded";
    public static final String TOPIC_MAILBOX_HANDED_BACK   = "efbazaar.trade.mailbox-handed-over";
    public static final String TOPIC_TRADE_ACTION          = "efbazaar.trade.action-notification";

    public enum ProposalOutcome { ACCEPTED, REJECTED, EXPIRED }
    public enum ImapPurpose      { VERIFY_LINK, WAIT_2FA_CODE, WAIT_EMAIL_CHANGE_CODE }

    public enum TradeActionType {
        PROPOSAL_CREATED,
        TRADE_STARTED,
        EMAIL_CHANGED,
        PASSWORD_SENT,
        EMAIL_CHANGE_CODE_RECEIVED,
        LOGIN_CODE_RECEIVED,
        YOUR_TURN,
        TRADE_SUCCESS,
        TRADE_REJECTED,
        TRADE_ORPHANED
    }

    /**
     * @param kind savdo turi. Xabar matni shunga qarab yoziladi: obmen
     *             obmen deb atalishi kerak, doplatalisi ham. Summaning
     *             o'zi buni ayta olmaydi — doplatali obmenda u noldan
     *             katta va sotuvdan farq qilmaydi.
     */
    public record TradeActionNotification(
            UUID tradeId,
            UUID chatId,
            UUID recipientUserId,
            TradeActionType actionType,
            long amountUzs,
            String details,
            uz.efbazaar.trade.trade.domain.TradeKind kind,
            Instant occurredAt) {}

    public record ProposalCreated(
            UUID proposalId,
            UUID marketplaceChatId,
            UUID proposerUserId,
            long amountUzs,
            Instant createdAt,
            String kind,
            UUID listingId,
            Instant expiresAt) {}

    public record ProposalResolved(
            UUID proposalId,
            ProposalOutcome outcome,
            Instant resolvedAt,
            UUID tradeId) {}

    public record EmailProvisionFailed(UUID tradeId, UUID mailboxId, String reason) {}

    public record EmailProvisionRequest(
            UUID tradeId,
            /** Placeholder mailbox id the worker should echo back in
             * {@link EmailProvisioned} so trade-service, MailboxPasswordResolver,
             * and the worker's rotate cache all agree on a single UUID (no
             * FK-hostile swap in adoptWorkerMailboxId). */
            UUID mailboxId) {}

    /**
     * {@code mailboxId} is the UUID the worker assigned to this mailbox. It is
     * the same id used to derive the encryption context (`mbox-{mailboxId}`)
     * and to key the worker's rotate cache. Trade-service adopts it as
     * {@code mailboxes.id} so a later {@code MailboxRotateRequest} — which
     * carries the persisted {@code mailboxId} — finds the right cache entry.
     *
     * <p>Legacy events emitted before this field existed will arrive with a
     * null value; the consumer keeps the placeholder id in that case so a
     * mid-upgrade Kafka replay still lands somewhere sensible.
     */
    public record EmailProvisioned(
            UUID tradeId,
            UUID mailboxId,
            String mailboxEmail,
            byte[] encryptedPassword,
            byte[] iv,
            byte[] tag) {}

    public record ForgotPasswordRequest(
            UUID tradeId,
            String mailboxEmail,
            String konamiId) {}

    public record ImapPollRequest(
            UUID tradeId,
            String mailboxEmail,
            ImapPurpose purpose) {}

    /**
     * @param mailboxEmail xat qaysi qutiga kelgani. Obmenda ikkita quti bor
     *                     va har taraf o'z akkountini o'z qutisi orqali
     *                     o'tkazadi — manzilsiz javob boshqa tarafga
     *                     yozilib qolardi. Eski hodisalarda null bo'lishi
     *                     mumkin.
     */
    public record KonamiEmailReceived(
            UUID tradeId,
            boolean resetLinkPresent,
            String sender,
            Instant receivedAt,
            String mailboxEmail) {}

    /**
     * Konami kirish kodi pochtaga keldi.
     *
     * <p>{@code mailboxEmail} — qaysi qutidan. Obmenda ikkita quti bor va
     * kod qutining EGASIGA emas, uni qabul qilayotgan tarafga kerak.
     * Eski hodisalarda bo'lmasligi mumkin: null bo'lsa xaridor deb olinadi.
     */
    public record Imap2faCode(
            UUID tradeId,
            String code,
            String mailboxEmail,
            Instant receivedAt) {}

    /**
     * Trade-less mailbox provisioning, issued by the admin panel. Distinct from
     * {@link EmailProvisionRequest} because there is no trade to key the
     * response on and the admin picks the local part instead of it being
     * derived from a trade id. The worker MUST echo {@code mailboxId} back —
     * it is both the row id and the encryption context (`mbox-{mailboxId}`).
     */
    public record MailboxProvisionRequest(
            UUID mailboxId,
            String localPart) {}

    public record MailboxProvisioned(
            UUID mailboxId,
            String mailboxEmail,
            byte[] encryptedPassword,
            byte[] iv,
            byte[] tag) {}

    /**
     * Carries the address as well as the id: the worker used to look the
     * address up in its own memory, which is empty for a box it never
     * provisioned in this process (admin-created, or any box after a restart),
     * and Mailcow then got an empty username.
     */
    public record MailboxRotateRequest(
            UUID mailboxId,
            String mailboxEmail) {}

    public record MailboxRotated(
            UUID mailboxId,
            byte[] encryptedPassword,
            byte[] iv,
            byte[] tag) {}

    public record WorkerQueued(
            UUID tradeId,
            String purpose,
            int estimatedWaitSeconds) {}

    public record WorkerStarted(
            UUID tradeId,
            String purpose) {}

    /**
     * Emitted after a trade reaches SUCCESS so marketplace-service can mark
     * the underlying listing SOLD and demote it in browse results. Only
     * published when the trade was opened from a listing (spec proposals
     * without a listing context leave this event out).
     */
    public record ListingSold(
            UUID listingId,
            UUID buyerId,
            UUID sellerId,
            long priceUzs,
            Instant soldAt) {}

    /**
     * Konami's server sends a 6-digit code to the escrow mailbox when the
     * seller updates their KONAMI ID email. Smart-admin's IMAP detector picks
     * it up and publishes this event so trade-service can surface the code to
     * the seller (they enter it back on Konami to complete the email change).
     * TTL is 5 minutes on Konami's side; we don't enforce that here — the UI
     * just shows what we've got.
     */
    public record KonamiEmailChangeCodeReceived(
            UUID tradeId,
            String verificationCode,
            Instant receivedAt,
            String sender,
            /** Which escrow mailbox it landed in — a swap has two. */
            String mailboxEmail) {}

    /**
     * An admin cleared out a mailbox nobody holds.
     *
     * <p>Carries the address as well as the id: our own row is marked deleted
     * before this goes out, so the worker has nothing left here to look the
     * address up from.
     */
    public record MailboxDeleteRequest(UUID mailboxId, String mailboxEmail) {}

    /** Why a party ended up with an escrow mailbox. */
    public enum HandoverOutcome {
        /** The trade completed: this is the account they were given. */
        RECEIVED,
        /** The trade did not complete: this is their own account, back. */
        RETURNED
    }

    /**
     * An escrow mailbox now belongs to a party, and they need telling.
     *
     * <p>Sent for every ending. On a completed trade it is the account they
     * bought or swapped into; on any other it is the box they were told to move
     * their own account through, which they may already have done — without a
     * word from us, an account they still own sits behind an address they have
     * no reason to think is theirs.
     */
    public record MailboxHandedOver(
            UUID tradeId,
            UUID userId,
            String mailboxEmail,
            HandoverOutcome outcome,
            Instant occurredAt) {}

    /**
     * A seller invited this admin to run a trade. marketplace-service turns it
     * into a TRADE_ADMIN_INVITED notification so the invitation reaches the
     * admin's existing bell rather than a second one.
     *
     * <p>Delivery is best-effort: the admin also sees pending invitations at
     * {@code GET /api/v1/trade-admins/me/invitations}.
     */
    public record AdminInvited(
            UUID tradeId,
            UUID adminId,
            UUID sellerId,
            UUID buyerId,
            long priceUzs,
            Long feeUzs,
            Instant occurredAt) {}

    /**
     * Asks marketplace-service to hold this trade's chat open (opened) or
     * release it (closed). {@code chatId} may be null for trades opened without
     * a chat context, in which case the consumer no-ops.
     */
    public record TradeChatPin(UUID tradeId, UUID chatId, Instant occurredAt) {}

    /**
     * A trade completed successfully. marketplace-service uses it to pay the
     * referral reward for whichever party was on their first trade.
     *
     * <p>Both modes are published. A HUMAN trade never touches the wallet, but
     * the referred user completed a trade either way, and the reward buys an
     * active user rather than a commission. {@code mode} travels so a later
     * policy can tell them apart without a new event.
     *
     * <p>Deliberately carries no commission figure: nothing downstream divides
     * the reward, and {@code EscrowClient.settle} discards its response body
     * today, so carrying one would mean changing it to serve a field nobody
     * reads.
     */
    public record TradeSucceeded(
            UUID tradeId,
            UUID buyerId,
            UUID sellerId,
            /**
             * Sotilgan e'lon. marketplace shu orqali akkountni sotuvchidan
             * xaridorga ko'chiradi: e'lon vaqtinchalik, akkount esa doimiy.
             * Eski hodisalarda bo'lmasligi mumkin — null kelsa ko'chirish
             * o'tkazib yuboriladi.
             */
            UUID listingId,
            String mode,
            String kind,
            /** Obmenda xaridor bergan akkount; null — "Boshqa" yoki sotuv. marketplace uni sotuvchiga ko'chiradi. */
            UUID giveAccountId,
            Instant occurredAt) {}
}
