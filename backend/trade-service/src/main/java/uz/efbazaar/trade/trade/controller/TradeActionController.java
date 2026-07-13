package uz.efbazaar.trade.trade.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.payment.MockPaymentAdapter;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.RecheckRateLimiter;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/trades/{id}/actions")
@RequiredArgsConstructor
public class TradeActionController {

    private final TradeService trades;
    private final MockPaymentAdapter payment;
    private final MailboxService mailboxes;
    private final RecheckRateLimiter recheckLimiter;
    private final TradeEventPublisher events;

    @PostMapping("/payment-confirmed")
    public TradeResponse paymentConfirmed(@AuthenticationPrincipal AuthenticatedUser me,
                                          @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        requireRole(t, me.userId(), ParticipantRole.BUYER);
        if (t.getPaymentIntentId() != null) {
            payment.markPaid(t.getPaymentIntentId());
        }
        Trade after = trades.transition(id, TradeEvent.PAYMENT_CONFIRMED,
                ActorType.USER, me.userId());
        return trades.toResponse(after, ParticipantRole.BUYER);
    }

    @PostMapping("/email-changed")
    public TradeResponse emailChanged(@AuthenticationPrincipal AuthenticatedUser me,
                                      @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        requireRole(t, me.userId(), ParticipantRole.SELLER);
        Trade after = trades.transition(id, TradeEvent.EMAIL_CHANGED,
                ActorType.USER, me.userId());
        return trades.toResponse(after, ParticipantRole.SELLER);
    }

    @PostMapping("/recheck")
    public TradeResponse recheck(@AuthenticationPrincipal AuthenticatedUser me,
                                 @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        requireRole(t, me.userId(), ParticipantRole.SELLER);
        recheckLimiter.reserve(id);
        var mb = mailboxes.getRaw(t.getMailboxId());
        events.imapPollRequest(id, mb.getEmail(), TradeEvents.ImapPurpose.VERIFY_LINK);
        Trade after = trades.transition(id, TradeEvent.RECHECK,
                ActorType.USER, me.userId());
        return trades.toResponse(after, ParticipantRole.SELLER);
    }

    @PostMapping("/confirm")
    public TradeResponse buyerConfirm(@AuthenticationPrincipal AuthenticatedUser me,
                                      @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        requireRole(t, me.userId(), ParticipantRole.BUYER);
        Trade after = trades.transition(id, TradeEvent.BUYER_CONFIRM,
                ActorType.USER, me.userId());
        return trades.toResponse(after, ParticipantRole.BUYER);
    }

    @PostMapping("/reject")
    public TradeResponse buyerReject(@AuthenticationPrincipal AuthenticatedUser me,
                                     @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        requireRole(t, me.userId(), ParticipantRole.BUYER);
        Trade after = trades.transition(id, TradeEvent.BUYER_REJECT,
                ActorType.USER, me.userId());
        return trades.toResponse(after, ParticipantRole.BUYER);
    }

    private static void requireRole(Trade t, UUID userId, ParticipantRole required) {
        if (t.roleFor(userId) != required) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only " + required + " may perform this action");
        }
    }
}
