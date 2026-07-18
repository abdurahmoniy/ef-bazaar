package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class TradeEventPublisher {

    private final KafkaTemplate<String, Object> kafka;

    public void proposalCreated(UUID proposalId, UUID marketplaceChatId,
                                UUID proposerUserId, long amountUzs) {
        send(TradeEvents.TOPIC_PROPOSAL_CREATED, proposalId.toString(),
                new TradeEvents.ProposalCreated(proposalId, marketplaceChatId,
                        proposerUserId, amountUzs, Instant.now()));
    }

    public void proposalResolved(UUID proposalId,
                                 TradeEvents.ProposalOutcome outcome) {
        send(TradeEvents.TOPIC_PROPOSAL_RESOLVED, proposalId.toString(),
                new TradeEvents.ProposalResolved(proposalId, outcome, Instant.now()));
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

    public void mailboxRotateRequest(UUID mailboxId) {
        send(TradeEvents.TOPIC_MAILBOX_ROTATE_REQ, mailboxId.toString(),
                new TradeEvents.MailboxRotateRequest(mailboxId));
    }

    public void listingSold(UUID listingId, UUID buyerId, UUID sellerId, long priceUzs) {
        send(TradeEvents.TOPIC_LISTING_SOLD, listingId.toString(),
                new TradeEvents.ListingSold(listingId, buyerId, sellerId, priceUzs, Instant.now()));
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
