package uz.efbazaar.trade.trade.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.dto.AssignAdminRequest;
import uz.efbazaar.trade.admin.dto.CloseConfirmResponse;
import uz.efbazaar.trade.admin.service.TradeAdminAssignmentService;
import uz.efbazaar.trade.admin.service.TradeCloseService;
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
    private final TradeAdminAssignmentService assignments;
    private final TradeCloseService closeService;

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
        actingRole(t, me.userId(), ParticipantRole.SELLER);
        trades.transition(id, TradeEvent.EMAIL_CHANGED, ActorType.USER, me.userId());
        return trades.toResponseFor(id, me.userId());
    }

    @PostMapping("/recheck")
    public TradeResponse recheck(@AuthenticationPrincipal AuthenticatedUser me,
                                 @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        ParticipantRole mine = actingRole(t, me.userId(), ParticipantRole.SELLER);
        recheckLimiter.reserve(id);
        // Their own box, not the trade's: on a swap the trade's is the seller's,
        // and re-checking it would report on an inbox this caller is not using.
        var mb = mailboxes.getRaw(trades.mailboxFor(t, mine));
        events.imapPollRequest(id, mb.getEmail(), TradeEvents.ImapPurpose.VERIFY_LINK);
        trades.transition(id, TradeEvent.RECHECK, ActorType.USER, me.userId());
        return trades.toResponseFor(id, me.userId());
    }

    @PostMapping("/confirm")
    public TradeResponse buyerConfirm(@AuthenticationPrincipal AuthenticatedUser me,
                                      @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        actingRole(t, me.userId(), ParticipantRole.BUYER);
        trades.transition(id, TradeEvent.BUYER_CONFIRM, ActorType.USER, me.userId());
        return trades.toResponseFor(id, me.userId());
    }

    @PostMapping("/reject")
    public TradeResponse buyerReject(@AuthenticationPrincipal AuthenticatedUser me,
                                     @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        actingRole(t, me.userId(), ParticipantRole.BUYER);
        trades.transition(id, TradeEvent.BUYER_REJECT, ActorType.USER, me.userId());
        return trades.toResponseFor(id, me.userId());
    }

    @PostMapping("/assign-admin")
    public TradeResponse assignAdmin(@AuthenticationPrincipal AuthenticatedUser me,
                                     @PathVariable UUID id,
                                     @Valid @RequestBody AssignAdminRequest req) {
        assignments.assign(me.userId(), id, req.adminId(), req.feeUzs());
        Trade after = trades.get(id, me.userId());
        return trades.toResponse(after, ParticipantRole.SELLER);
    }

    @PostMapping("/close-confirm")
    public CloseConfirmResponse closeConfirm(@AuthenticationPrincipal AuthenticatedUser me,
                                             @PathVariable UUID id) {
        return closeService.confirm(me.userId(), id);
    }

    private static void requireRole(Trade t, UUID userId, ParticipantRole required) {
        if (t.roleFor(userId) != required) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only " + required + " may perform this action");
        }
    }

    /**
     * The role this caller is acting as for a step that a swap asks of both.
     *
     * <p>On a sale each transfer step belongs to one side and the other has
     * nothing to do, so {@code soleOwner} still guards it. A swap asks the same
     * step of both parties, and the answer there is simply whichever one you
     * are — these endpoints were written before swaps existed, and the fixed
     * role turned the other party's own half of the trade into "Only SELLER may
     * perform this action".
     */
    private static ParticipantRole actingRole(Trade t, UUID userId, ParticipantRole soleOwner) {
        ParticipantRole mine = t.roleFor(userId);
        if (mine == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Not a participant in this trade");
        }
        if (t.getKind() != null && t.getKind().isSwap()) {
            return mine;
        }
        if (mine != soleOwner) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only " + soleOwner + " may perform this action");
        }
        return mine;
    }
}
