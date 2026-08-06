package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
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

    @Scheduled(fixedRateString = "${trade.scheduler.escalation-sweep-interval-ms:60000}")
    @Transactional
    public void sweep() {
        List<Trade> idle = trades.findIdleHumanTrades(Instant.now());
        if (idle.isEmpty()) return;

        Instant now = Instant.now();
        for (Trade t : idle) {
            t.setEscalatedAt(now);
            t.setEscalationReason("ADMIN_IDLE");
            trades.save(t);
            audit.record(t.getId(), ActorType.SYSTEM, null, "TRADE_ESCALATED", Map.of(
                    "reason", "ADMIN_IDLE",
                    "adminId", String.valueOf(t.getAssignedAdminId())));
            log.warn("Trade {} escalated — admin {} idle past {}",
                    t.getId(), t.getAssignedAdminId(), t.getEscalationDeadlineAt());
        }
        log.info("Escalated {} idle human trades", idle.size());
    }
}
