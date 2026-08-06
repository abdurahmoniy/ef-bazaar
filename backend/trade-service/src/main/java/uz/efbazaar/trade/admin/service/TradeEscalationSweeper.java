package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeAuditService;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Flags human trades whose admin has stopped working, so a platform admin can
 * step in.
 *
 * <p><b>Why this is not part of {@code TradeTimeoutScheduler}:</b> that sweeper
 * fires {@code TIMEOUT} for every non-terminal state with a due
 * {@code state_deadline}. {@code IN_PROGRESS} has no {@code TIMEOUT} transition,
 * so if the idle watchdog shared {@code state_deadline} the sweeper would throw
 * {@code InvalidTradeTransitionException} on the same row every 10 seconds,
 * forever. Hence a dedicated column and a dedicated sweep.
 *
 * <p>Escalation does <b>not</b> change the state — it sets {@code escalated_at}
 * and leaves the trade where the admin left it, so a reassigned admin inherits
 * the work in progress.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeEscalationSweeper {

    private final TradeRepository trades;
    private final TradeAuditService audit;

    /**
     * Caps how many overdue trades one tick will touch — an unbounded query
     * on a large backlog would make a single sweep run indefinitely long.
     * {@link uz.efbazaar.trade.trade.repository.TradeRepository#findIdleHumanTrades}
     * orders oldest-overdue-first, so a capped sweep still drains the queue in
     * FIFO order across ticks rather than starving it.
     */
    @Value("${trade.scheduler.escalation-sweep-batch-size:200}")
    private int batchSize;

    /**
     * Deliberately NOT wrapped in a single {@code @Transactional} spanning the
     * whole batch — unlike the earlier version of this method. {@link
     * TradeRepository#save} and {@link TradeAuditService#record} are each
     * transactional on their own bean, so every row still commits durably;
     * what a shared outer transaction would add is exactly the failure mode
     * to avoid here: one row that throws (a bad row, a constraint violation,
     * anything) would roll back every other row already escalated in the same
     * tick, and — because the query is unconditional on retry — the same
     * batch would fail again next tick, forever, silently starving the queue.
     * {@link uz.efbazaar.trade.trade.service.TradeTimeoutScheduler} avoids
     * this the same way: no method-level transaction, try/catch per row.
     */
    @Scheduled(fixedRateString = "${trade.scheduler.escalation-sweep-interval-ms:60000}")
    public void sweep() {
        List<Trade> idle = trades.findIdleHumanTrades(Instant.now(), PageRequest.of(0, batchSize));
        if (idle.isEmpty()) return;

        int escalated = 0;
        for (Trade t : idle) {
            try {
                escalateOne(t);
                escalated++;
            } catch (Exception e) {
                log.warn("Escalation sweep skipped trade {}: {}", t.getId(), e.getMessage());
            }
        }
        if (escalated > 0) {
            log.info("Escalated {} idle human trades", escalated);
        }
    }

    /**
     * Not itself {@code @Transactional} — called via {@code this.} from
     * {@link #sweep()}, so a proxy-based annotation here would silently never
     * apply anyway (self-invocation bypasses the Spring AOP proxy). Durability
     * per row comes from {@link TradeRepository#save} and
     * {@link TradeAuditService#record} each being transactional on their own
     * bean, not from this method.
     */
    void escalateOne(Trade t) {
        Instant now = Instant.now();
        t.setEscalatedAt(now);
        t.setEscalationReason("ADMIN_IDLE");
        trades.save(t);
        audit.record(t.getId(), ActorType.SYSTEM, null, "TRADE_ESCALATED", Map.of(
                "reason", "ADMIN_IDLE",
                "adminId", String.valueOf(t.getAssignedAdminId())));
        log.warn("Trade {} escalated — admin {} idle past {}",
                t.getId(), t.getAssignedAdminId(), t.getEscalationDeadlineAt());
    }
}
