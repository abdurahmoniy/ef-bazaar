package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import uz.efbazaar.trade.trade.domain.Trade;

import java.time.Instant;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class TradeEventPublisher {

    private final KafkaTemplate<String, Object> kafka;

    public void proposalCreated(UUID proposalId, UUID marketplaceChatId,
                                UUID proposerUserId, long amountUzs) {
        proposalCreated(proposalId, marketplaceChatId, proposerUserId, amountUzs, null, null, null);
    }

    public void proposalCreated(UUID proposalId, UUID marketplaceChatId,
                                UUID proposerUserId, long amountUzs, String kind,
                                UUID listingId, Instant expiresAt) {
        send(TradeEvents.TOPIC_PROPOSAL_CREATED, proposalId.toString(),
                new TradeEvents.ProposalCreated(proposalId, marketplaceChatId,
                        proposerUserId, amountUzs, Instant.now(), kind, listingId, expiresAt));
    }

    public void proposalResolved(UUID proposalId,
                                 TradeEvents.ProposalOutcome outcome) {
        proposalResolved(proposalId, outcome, null);
    }

    public void proposalResolved(UUID proposalId,
                                 TradeEvents.ProposalOutcome outcome, UUID tradeId) {
        send(TradeEvents.TOPIC_PROPOSAL_RESOLVED, proposalId.toString(),
                new TradeEvents.ProposalResolved(proposalId, outcome, Instant.now(), tradeId));
    }

    public void emailProvisionRequest(UUID tradeId, UUID mailboxId) {
        send(TradeEvents.TOPIC_EMAIL_PROVISION_REQ, tradeId.toString(),
                new TradeEvents.EmailProvisionRequest(tradeId, mailboxId));
    }

    public void forgotPasswordRequest(UUID tradeId, String mailboxEmail, String konamiId) {
        send(TradeEvents.TOPIC_FORGOT_PW_REQ, tradeId.toString(),
                new TradeEvents.ForgotPasswordRequest(tradeId, mailboxEmail, konamiId));
    }

    public void imapPollRequest(UUID tradeId, String mailboxEmail,
                                TradeEvents.ImapPurpose purpose) {
        send(TradeEvents.TOPIC_IMAP_POLL_REQ, tradeId.toString(),
                new TradeEvents.ImapPollRequest(tradeId, mailboxEmail, purpose));
    }

    /** Admin-panel mailbox creation — no trade involved. */
    public void mailboxProvisionRequest(UUID mailboxId, String localPart) {
        send(TradeEvents.TOPIC_MAILBOX_PROVISION_REQ, mailboxId.toString(),
                new TradeEvents.MailboxProvisionRequest(mailboxId, localPart));
    }

    public void mailboxRotateRequest(UUID mailboxId, String mailboxEmail) {
        send(TradeEvents.TOPIC_MAILBOX_ROTATE_REQ, mailboxId.toString(),
                new TradeEvents.MailboxRotateRequest(mailboxId, mailboxEmail));
    }

    public void listingSold(UUID listingId, UUID buyerId, UUID sellerId, long priceUzs) {
        send(TradeEvents.TOPIC_LISTING_SOLD, listingId.toString(),
                new TradeEvents.ListingSold(listingId, buyerId, sellerId, priceUzs, Instant.now()));
    }

    public void adminInvited(Trade trade) {
        var event = new TradeEvents.AdminInvited(
                trade.getId(),
                trade.getAssignedAdminId(),
                trade.getSellerId(),
                trade.getBuyerId(),
                trade.getPriceUzs(),
                trade.getAdminFeeUzs(),
                Instant.now());
        send(TradeEvents.TOPIC_ADMIN_INVITED, trade.getId().toString(), event);
    }

    public void tradeOpened(Trade trade) {
        send(TradeEvents.TOPIC_TRADE_OPENED, trade.getId().toString(),
                new TradeEvents.TradeChatPin(trade.getId(), trade.getChatId(), Instant.now()));
    }

    /**
     * Keyed by user, not trade: a swap sends one per party and they are
     * independent — neither has to wait behind the other's delivery.
     */
    public void mailboxHandedOver(UUID tradeId, UUID userId, String mailboxEmail,
                                  TradeEvents.HandoverOutcome outcome) {
        send(TradeEvents.TOPIC_MAILBOX_HANDED_BACK, userId.toString(),
                new TradeEvents.MailboxHandedOver(tradeId, userId, mailboxEmail,
                        outcome, Instant.now()));
    }

    public void mailboxDeleteRequest(UUID mailboxId, String mailboxEmail) {
        send(TradeEvents.TOPIC_MAILBOX_DELETE_REQ, mailboxId.toString(),
                new TradeEvents.MailboxDeleteRequest(mailboxId, mailboxEmail));
    }

    public void tradeClosed(Trade trade) {
        send(TradeEvents.TOPIC_TRADE_CLOSED, trade.getId().toString(),
                new TradeEvents.TradeChatPin(trade.getId(), trade.getChatId(), Instant.now()));
    }

    public void tradeSucceeded(Trade trade) {
        send(TradeEvents.TOPIC_TRADE_SUCCEEDED, trade.getId().toString(),
                new TradeEvents.TradeSucceeded(
                        trade.getId(),
                        trade.getBuyerId(),
                        trade.getSellerId(),
                        trade.getListingId(),
                        trade.getMode().name(),
                        trade.getKind().name(),
                        trade.getGiveAccountId(),
                        Instant.now()));
    }

    public void tradeAction(UUID tradeId, UUID chatId, UUID recipientUserId,
                            TradeEvents.TradeActionType actionType, long amountUzs, String details,
                            uz.efbazaar.trade.trade.domain.TradeKind kind) {
        tradeAction(tradeId, chatId, recipientUserId, actionType, amountUzs, details, kind, Instant.now());
    }

    public void tradeAction(UUID tradeId, UUID chatId, UUID recipientUserId,
                            TradeEvents.TradeActionType actionType, long amountUzs, String details,
                            uz.efbazaar.trade.trade.domain.TradeKind kind, Instant occurredAt) {
        if (recipientUserId == null) return;
        send(TradeEvents.TOPIC_TRADE_ACTION, recipientUserId.toString(),
                new TradeEvents.TradeActionNotification(tradeId, chatId, recipientUserId,
                        actionType, amountUzs, details, kind, occurredAt));
    }

    /**
     * Publishes are deferred to run after the enclosing transaction commits
     * when one is active. Several of these events (e.g. email-provision-request
     * fired on trade INITIATED) are triggered from inside the same
     * {@code @Transactional} method that first inserts the row they refer to.
     * Consumers (MockWorker + our own listeners) can round-trip fast enough
     * that they'd otherwise look up a row that isn't committed yet and drop
     * the event. Sending synchronously is safe outside a transaction (e.g.
     * proposal creation, which has no DB row to race against).
     */
    private void send(String topic, String key, Object payload) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    doSend(topic, key, payload);
                }
            });
        } else {
            doSend(topic, key, payload);
        }
    }

    private void doSend(String topic, String key, Object payload) {
        kafka.send(topic, key, payload)
                .whenComplete((r, ex) -> {
                    if (ex != null) {
                        log.error("Failed to publish to {} key={}: {}",
                                topic, key, ex.getMessage());
                    } else {
                        log.debug("Published to {} key={}", topic, key);
                    }
                });
    }
}
