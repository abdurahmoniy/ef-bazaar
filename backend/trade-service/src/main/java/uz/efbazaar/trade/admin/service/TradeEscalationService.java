package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeAuditService;
import uz.efbazaar.trade.trade.service.TradeChatService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What a platform admin can do about a stuck human trade: hand it to somebody
 * else, or end it.
 *
 * <p>There is deliberately no "switch to smart" action — {@code IN_PROGRESS}
 * does not exist on the smart path, so there would be no state for the
 * automation to resume from, and a human trade holds no escrowed money, so
 * cancelling costs nobody anything.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeEscalationService {

    private final TradeRepository trades;
    private final TradeService tradeService;
    private final TradeAdminProfileService profiles;
    private final TradeAdminStats stats;
    private final TradeChatService chatService;
    private final TradeAuditService audit;
    private final TradeEventPublisher events;
    private final MailboxService mailboxes;

    @Transactional(readOnly = true)
    public List<Trade> listEscalated() {
        return trades.findByStateAndEscalatedAtIsNotNullOrderByEscalatedAtAsc(TradeState.IN_PROGRESS);
    }

    /**
     * Hand the trade to a different admin. The checklist and both chats are
     * kept — the new admin inherits the work.
     */
    @Transactional
    public void reassign(UUID platformAdminId, UUID tradeId, UUID newAdminId, long feeUzs) {
        Trade t = requireEscalated(tradeId);
        UUID oldAdminId = t.getAssignedAdminId();

        if (newAdminId.equals(t.getSellerId()) || newAdminId.equals(t.getBuyerId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Admin o'z savdosining tarafi bo'lolmaydi");
        }
        profiles.requireHireable(newAdminId, feeUzs);

        // The previous admin already knows the escrow mailbox password, so
        // revoking ownership is not enough — rotate it. Both halves are
        // required: MailService authorises purely on mailboxes.getOwned(...),
        // and MailboxRotatedConsumer writes the NEW password into that same
        // row, so rotating without revoking would hand the departing admin the
        // fresh password instead of locking them out. The next owner is written
        // by the IN_PROGRESS on-enter handler when the new admin accepts.
        mailboxes.revokeOwner(t.getMailboxId());
        events.mailboxRotateRequest(t.getMailboxId(), mailboxes.getRaw(t.getMailboxId()).getEmail());

        t.setAssignedAdminId(newAdminId);
        t.setAdminFeeUzs(feeUzs);
        // The new admin's work timer starts when they accept, not now.
        t.setAdminAcceptedAt(null);
        t.setEscalatedAt(null);
        t.setEscalationReason(null);
        t.setState(TradeState.WAITING_ADMIN);
        t.setStateDeadline(Instant.now().plus(Duration.ofHours(24)));
        t.setEscalationDeadlineAt(null);
        trades.save(t);

        if (oldAdminId != null) {
            stats.recordAbandoned(oldAdminId);
        }
        audit.record(tradeId, ActorType.ADMIN, platformAdminId, "TRADE_REASSIGNED", Map.of(
                "oldAdminId", String.valueOf(oldAdminId),
                "newAdminId", newAdminId.toString(),
                "feeUzs", String.valueOf(feeUzs)));
        chatService.postStatusToBoth(tradeId, "ADMIN_REASSIGNED",
                Map.of("newAdminId", newAdminId.toString()));

        events.adminInvited(t);
        log.info("Trade {} reassigned from {} to {} by platform admin {}",
                tradeId, oldAdminId, newAdminId, platformAdminId);
    }

    /** End the trade. The mailbox rotates and returns to the seller. */
    @Transactional
    public void cancel(UUID platformAdminId, UUID tradeId, String reason) {
        Trade t = requireEscalated(tradeId);

        audit.record(tradeId, ActorType.ADMIN, platformAdminId, "TRADE_CANCELLED_BY_PLATFORM",
                Map.of("reason", reason == null ? "" : reason,
                        "adminId", String.valueOf(t.getAssignedAdminId())));
        chatService.postStatusToBoth(tradeId, "PLATFORM_CANCELLED",
                Map.of("reason", reason == null ? "" : reason));

        // Abandonment, not a deliberate cancel: the platform ended it because
        // the admin went missing.
        if (t.getAssignedAdminId() != null) {
            stats.recordAbandoned(t.getAssignedAdminId());
        }
        tradeService.transition(tradeId, TradeEvent.ADMIN_CANCELLED,
                ActorType.ADMIN, platformAdminId);
    }

    private Trade requireEscalated(UUID tradeId) {
        Trade t = trades.findById(tradeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Savdo topilmadi"));
        if (t.getMode() != TradeMode.HUMAN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu savdo inson admin rejimida emas");
        }
        if (t.getEscalatedAt() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu savdo eskalatsiya qilinmagan");
        }
        // Belt-and-braces: escalation only ever means something while the
        // trade sits IN_PROGRESS. TradeStateHandler clears escalatedAt on
        // every exit from IN_PROGRESS (ADMIN_CLOSED, ADMIN_CANCELLED), so
        // this should be unreachable — but reassign() below writes state
        // with a raw setState() rather than going through TradeStateMachine,
        // so if that invariant is ever broken elsewhere this stops a stale
        // escalated flag from reviving an already-finished trade.
        if (t.getState() != TradeState.IN_PROGRESS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu savdo eskalatsiya qilinmagan");
        }
        return t;
    }
}
