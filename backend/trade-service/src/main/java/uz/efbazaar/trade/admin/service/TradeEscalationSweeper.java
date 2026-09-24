package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import uz.efbazaar.trade.kafka.ChatChangePublisher;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
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
    private final ChatChangePublisher changes;
    private final TransactionTemplate tx;

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
     * whole batch — unlike the earlier version of this method. Each row gets
     * its own transaction inside {@link #escalateOne}; what a shared outer
     * transaction would add is exactly the failure mode to avoid here: one row
     * that throws (a bad row, a constraint violation, anything) would roll back
     * every other row already escalated in the same tick, and the same batch
     * would fail again next tick, forever, silently starving the queue.
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
                if (escalateOne(t)) escalated++;
            } catch (Exception e) {
                log.warn("Escalation sweep skipped trade {}: {}", t.getId(), e.getMessage());
            }
        }
        if (escalated > 0) {
            log.info("Escalated {} idle human trades", escalated);
        }
    }

    /**
     * Escalates one row and writes its audit entry atomically.
     *
     * <p>The {@code Trade} handed in is a <b>detached, possibly stale</b>
     * snapshot: {@link TradeRepository#findIdleHumanTrades} ran in its own
     * read-only transaction and the batch may be hundreds of rows, each saved
     * in its own transaction afterwards. Nothing here writes that snapshot
     * back — only its id is used. {@link TradeRepository#markEscalated} re-tests
     * every precondition in the UPDATE's WHERE clause, so a trade the admin
     * finished, cancelled, or resumed work on in the meantime affects 0 rows
     * and is left exactly as it is.
     *
     * <p>A {@link TransactionTemplate} rather than {@code @Transactional}:
     * {@link #sweep()} calls this through {@code this.}, and self-invocation
     * bypasses the Spring AOP proxy, so the annotation would silently never
     * apply. The transaction is what binds the escalation write to its audit
     * row — a failing audit now rolls the escalation back and the next tick
     * retries it, instead of leaving a trade durably escalated but unaudited
     * forever.
     *
     * <p>Public, not package-private, so a test can hand it a deliberately
     * stale snapshot — the exact input the conditional UPDATE exists to reject.
     *
     * @return {@code true} if this call is the one that escalated the trade.
     */
    public boolean escalateOne(Trade t) {
        return Boolean.TRUE.equals(tx.execute(status -> {
            Instant now = Instant.now();
            if (trades.markEscalated(t.getId(), now, "ADMIN_IDLE") == 0) {
                log.debug("Escalation skipped for trade {} — it moved since the batch was read",
                        t.getId());
                return false;
            }
            audit.record(t.getId(), ActorType.SYSTEM, null, "TRADE_ESCALATED", Map.of(
                    "reason", "ADMIN_IDLE",
                    "adminId", String.valueOf(t.getAssignedAdminId())));
            changes.publish(t.getChatId());
            log.warn("Trade {} escalated — admin {} idle past {}",
                    t.getId(), t.getAssignedAdminId(), t.getEscalationDeadlineAt());
            return true;
        }));
    }
}
