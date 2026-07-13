package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Instant;
import java.util.Set;

/**
 * Wakes up every 10 seconds, finds trades whose {@code state_deadline} has
 * passed, and fires TIMEOUT. Idempotent: if state has already moved on (a
 * concurrent user action closed the state), the state machine either accepts
 * or rejects and we log-and-skip.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeTimeoutScheduler {

    private final TradeRepository trades;
    private final TradeService tradeService;

    @Scheduled(fixedRateString = "${trade.scheduler.sweep-interval-ms:10000}")
    public void sweep() {
        Instant now = Instant.now();
        var due = trades.findByStateInAndStateDeadlineBefore(
                TradeState.nonTerminal(), now);
        for (var trade : due) {
            try {
                tradeService.transition(trade.getId(), TradeEvent.TIMEOUT,
                        ActorType.SYSTEM, null);
                log.info("Timed out trade {} from {}", trade.getId(), trade.getState());
            } catch (Exception e) {
                log.warn("Timeout sweep skipped trade {} ({}): {}",
                        trade.getId(), trade.getState(), e.getMessage());
            }
        }
    }
}
