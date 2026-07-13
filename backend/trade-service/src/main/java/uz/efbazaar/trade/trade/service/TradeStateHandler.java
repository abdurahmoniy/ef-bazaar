package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeState;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * On-enter side effects for each state. Kept separate from TradeService so
 * the state machine mechanics (transition validation + save) and the
 * business side effects (kafka, deadlines, mailbox handoff) stay small
 * and testable.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeStateHandler {

    private final TradeEventPublisher events;
    private final MailboxService mailboxes;
    private final TradeAuditService audit;

    @Value("${trade.timeouts.waiting-payment-seconds}")        private long twpS;
    @Value("${trade.timeouts.waiting-email-change-seconds}")   private long twecS;
    @Value("${trade.timeouts.verifying-konami-link-seconds}")  private long tvklS;
    @Value("${trade.timeouts.waiting-password-seconds}")       private long twpwS;
    @Value("${trade.timeouts.waiting-buyer-verify-seconds}")   private long twbvS;

    /**
     * Called AFTER the trade's state field is set to {@code newState} and
     * BEFORE the trade is saved. Mutates the trade's {@code stateDeadline}
     * and {@code terminalReason}, publishes Kafka events, and touches
     * ancillary services.
     */
    public void onEnter(Trade trade, TradeState newState, ActorType actor, UUID actorId) {
        switch (newState) {
            case INITIATED -> {
                trade.setStateDeadline(null);
                events.emailProvisionRequest(trade.getId());
            }
            case WAITING_PAYMENT           -> trade.setStateDeadline(now(twpS));
            case WAITING_EMAIL_CHANGE      -> trade.setStateDeadline(now(twecS));
            case VERIFYING_KONAMI_LINK -> {
                trade.setStateDeadline(now(tvklS));
                // fire-and-forget forgot-password. The mailbox email is stored on the mailbox row.
                var mb = mailboxes.getRaw(trade.getMailboxId());
                events.forgotPasswordRequest(trade.getId(), mb.getEmail(), null);
            }
            case WAITING_PASSWORD          -> trade.setStateDeadline(now(twpwS));
            case WAITING_BUYER_VERIFY      -> trade.setStateDeadline(now(twbvS));
            case SUCCESS -> {
                trade.setStateDeadline(null);
                trade.setTerminalReason("BUYER_CONFIRMED");
                events.mailboxRotateRequest(trade.getMailboxId());
                mailboxes.assignOwner(trade.getMailboxId(), trade.getBuyerId());
                audit.record(trade.getId(), actor, actorId, "TRADE_SUCCESS",
                        Map.of("mailboxHandedTo", trade.getBuyerId().toString()));
            }
            case REJECTED -> {
                trade.setStateDeadline(null);
                trade.setTerminalReason("BUYER_REJECTED_OR_TIMEOUT");
                events.mailboxRotateRequest(trade.getMailboxId());
                mailboxes.assignOwner(trade.getMailboxId(), trade.getSellerId());
                audit.record(trade.getId(), actor, actorId, "TRADE_REJECTED",
                        Map.of("mailboxHandedTo", trade.getSellerId().toString()));
            }
            case ORPHANED -> {
                trade.setStateDeadline(null);
                trade.setTerminalReason("TIMEOUT_ORPHAN");
                mailboxes.stripFromTrade(trade.getMailboxId());
                audit.record(trade.getId(), actor, actorId, "TRADE_ORPHANED",
                        Map.of("actor", actor.name()));
            }
        }
    }

    private static Instant now(long seconds) {
        return Instant.now().plus(Duration.ofSeconds(seconds));
    }
}
