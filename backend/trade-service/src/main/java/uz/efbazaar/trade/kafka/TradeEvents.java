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
    public static final String TOPIC_FORGOT_PW_REQ        = "efbazaar.trade.forgot-password-request";
    public static final String TOPIC_IMAP_POLL_REQ        = "efbazaar.trade.imap-poll-request";
    public static final String TOPIC_KONAMI_EMAIL         = "efbazaar.trade.konami-email-received";
    public static final String TOPIC_IMAP_2FA             = "efbazaar.trade.imap-2fa-code";
    public static final String TOPIC_MAILBOX_ROTATE_REQ   = "efbazaar.trade.mailbox-rotate-request";
    public static final String TOPIC_MAILBOX_ROTATED      = "efbazaar.trade.mailbox-rotated";
    public static final String TOPIC_WORKER_QUEUED        = "efbazaar.trade.worker-queued";
    public static final String TOPIC_WORKER_STARTED       = "efbazaar.trade.worker-started";
    public static final String TOPIC_LISTING_SOLD         = "efbazaar.trade.listing-sold";
    public static final String TOPIC_KONAMI_EMAIL_CHANGE_CODE = "efbazaar.trade.konami-email-change-code-received";

    public enum ProposalOutcome { ACCEPTED, REJECTED, EXPIRED }
    public enum ImapPurpose      { VERIFY_LINK, WAIT_2FA_CODE, WAIT_EMAIL_CHANGE_CODE }

    public record ProposalCreated(
            UUID proposalId,
            UUID marketplaceChatId,
            UUID proposerUserId,
            long amountUzs,
            Instant createdAt) {}

    public record ProposalResolved(
            UUID proposalId,
            ProposalOutcome outcome,
            Instant resolvedAt) {}

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

    public record KonamiEmailReceived(
            UUID tradeId,
            boolean resetLinkPresent,
            String sender,
            Instant receivedAt) {}

    public record Imap2faCode(
            UUID tradeId,
            String code,
            Instant receivedAt) {}

    public record MailboxRotateRequest(
            UUID mailboxId) {}

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
            String sender) {}
}
