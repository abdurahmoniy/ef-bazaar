package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

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

    public void emailProvisionRequest(UUID tradeId) {
        send(TradeEvents.TOPIC_EMAIL_PROVISION_REQ, tradeId.toString(),
                new TradeEvents.EmailProvisionRequest(tradeId));
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

    private void send(String topic, String key, Object payload) {
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
