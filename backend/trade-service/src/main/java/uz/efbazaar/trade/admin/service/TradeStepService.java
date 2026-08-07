package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeStepMark;
import uz.efbazaar.trade.admin.dto.TradeStepResponse;
import uz.efbazaar.trade.admin.repository.TradeStepMarkRepository;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.domain.TradeStep;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeAuditService;
import uz.efbazaar.trade.trade.service.TradeChatService;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The manual progress record of a human trade.
 *
 * <p>Both parties read it; only the assigned admin writes it, and only while
 * the trade is {@code IN_PROGRESS} — once the admin has closed, the checklist
 * is the thing the parties are confirming against and must not move.
 *
 * <p>Every write re-arms {@code escalation_deadline_at}: an admin who is
 * visibly working must never surface in the escalation queue.
 */
@Service
@RequiredArgsConstructor
public class TradeStepService {

    private final TradeStepMarkRepository steps;
    private final TradeRepository trades;
    private final TradeChatService chatService;
    private final TradeIdleWatchdog idleWatchdog;
    private final TradeAuditService audit;

    @Transactional(readOnly = true)
    public List<TradeStepResponse> list(UUID tradeId, UUID viewerId) {
        // Any viewer — both parties and the admin — may read.
        trades.findByIdAndViewer(tradeId, viewerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Savdo topilmadi"));
        return listRaw(tradeId);
    }

    @Transactional
    public List<TradeStepResponse> mark(UUID tradeId, UUID adminId, TradeStep step, String note) {
        Trade t = requireWorkingAdmin(tradeId, adminId);
        TradeStepMark m = requireStep(tradeId, step);

        // Only a genuine incomplete-to-complete transition is news to the
        // parties; a repeated mark of an already-complete step must not
        // duplicate the chat message they already saw.
        boolean wasIncomplete = !m.isComplete();
        if (wasIncomplete) {
            m.setCompletedAt(Instant.now());
            m.setCompletedBy(adminId);
        }
        // A repeated mark may still refresh the note without moving the time.
        if (note != null && !note.isBlank()) {
            m.setNote(note);
        }
        steps.save(m);

        idleWatchdog.touch(t);
        audit.record(tradeId, ActorType.TRADE_ADMIN, adminId, "STEP_MARKED",
                Map.of("step", step.name()));
        if (wasIncomplete) {
            chatService.postStatusToBoth(tradeId, "STEP_MARKED", Map.of(
                    "step", step.name(),
                    "label", step.labelUz()));
        }

        return listRaw(tradeId);
    }

    @Transactional
    public List<TradeStepResponse> unmark(UUID tradeId, UUID adminId, TradeStep step) {
        Trade t = requireWorkingAdmin(tradeId, adminId);
        TradeStepMark m = requireStep(tradeId, step);

        m.setCompletedAt(null);
        m.setCompletedBy(null);
        m.setNote(null);
        steps.save(m);

        idleWatchdog.touch(t);
        audit.record(tradeId, ActorType.TRADE_ADMIN, adminId, "STEP_UNMARKED",
                Map.of("step", step.name()));
        chatService.postStatusToBoth(tradeId, "STEP_UNMARKED", Map.of(
                "step", step.name(),
                "label", step.labelUz()));

        return listRaw(tradeId);
    }

    /** Gate for {@code ADMIN_CLOSED} — see Task 13. */
    @Transactional(readOnly = true)
    public boolean allComplete(UUID tradeId) {
        return steps.countByTradeIdAndCompletedAtIsNotNull(tradeId) == TradeStep.values().length;
    }

    @Transactional(readOnly = true)
    public long completedCount(UUID tradeId) {
        return steps.countByTradeIdAndCompletedAtIsNotNull(tradeId);
    }

    /**
     * {@link TradeStepMarkRepository#findByTradeId} makes no ordering
     * promise, so the checklist's declaration order — the order the UI
     * renders — is imposed here, on the enum's natural (ordinal) order.
     */
    private List<TradeStepResponse> listRaw(UUID tradeId) {
        return steps.findByTradeId(tradeId).stream()
                .sorted(Comparator.comparing(TradeStepMark::getStep))
                .map(TradeStepResponse::of)
                .toList();
    }

    private Trade requireWorkingAdmin(UUID tradeId, UUID adminId) {
        Trade t = trades.findByIdAndViewer(tradeId, adminId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Savdo topilmadi"));
        if (!adminId.equals(t.getAssignedAdminId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Qadamlarni faqat biriktirilgan admin belgilaydi");
        }
        if (t.getState() != TradeState.IN_PROGRESS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Qadamlar faqat savdo davomida o'zgartiriladi");
        }
        return t;
    }

    private TradeStepMark requireStep(UUID tradeId, TradeStep step) {
        return steps.findByTradeIdAndStep(tradeId, step)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Bu savdoda bunday qadam yo'q"));
    }
}
