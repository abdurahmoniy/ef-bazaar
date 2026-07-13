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

    public enum ProposalOutcome { ACCEPTED, REJECTED, EXPIRED }
    public enum ImapPurpose      { VERIFY_LINK, WAIT_2FA_CODE }

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
            UUID tradeId) {}

    public record EmailProvisioned(
            UUID tradeId,
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
}
