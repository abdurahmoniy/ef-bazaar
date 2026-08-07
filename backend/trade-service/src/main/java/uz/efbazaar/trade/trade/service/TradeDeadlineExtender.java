package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Extends a trade's state deadline in response to worker backpressure. Each
 * trade may be extended {@code max-extensions-per-trade} times (Redis counter,
 * 24h TTL) — after that, further worker-queued events are rendered as a STATUS
 * message but the deadline stays put. This is spec §6.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeDeadlineExtender {

    public enum ExtensionOutcome { EXTENDED, CAPPED, TRADE_NOT_FOUND, TRADE_TERMINAL, TRADE_NOT_SMART }

    private final TradeRepository trades;
    private final StringRedisTemplate redis;

    @Value("${trade.deadline.max-extensions-per-trade:2}")
    private int maxExtensions;

    @Transactional
    public ExtensionOutcome extend(UUID tradeId, int seconds) {
        Optional<Trade> loaded = trades.findById(tradeId);
        if (loaded.isEmpty()) {
            return ExtensionOutcome.TRADE_NOT_FOUND;
        }
        Trade t = loaded.get();
        // Worker backpressure is a smart-path concept: only the Python worker
        // emits worker-queued, and it only serves SMART trades. Enforcing that
        // here rather than trusting the producer matters because the one state
        // this could land on, IN_PROGRESS, MUST keep state_deadline NULL — it
        // has no TIMEOUT transition, so TradeTimeoutScheduler would throw
        // InvalidTradeTransitionException on that row every 10 seconds forever
        // with nothing able to clear it. The invariant belongs in the code that
        // owns the column, not in a different repository.
        if (t.getMode() != TradeMode.SMART) {
            return ExtensionOutcome.TRADE_NOT_SMART;
        }
        if (t.getState().isTerminal()) {
            return ExtensionOutcome.TRADE_TERMINAL;
        }
        // Peek the counter BEFORE the DB write so we can enforce the cap without
        // committing a Redis INCR that a subsequent JPA rollback would leave behind.
        // We then INCR only after the save succeeds — the trade-off is that a
        // Redis INCR failure after a successful save (a) leaves the deadline
        // extended and (b) lets the user try one extra extension on the next
        // tick. That is a strictly milder failure mode than pre-INCR + rollback,
        // which would prematurely CAP the trade.
        String counterKey = "trade:" + tradeId + ":deadline-extensions";
        String currentRaw = redis.opsForValue().get(counterKey);
        long currentCount = currentRaw == null ? 0L : Long.parseLong(currentRaw);
        if (currentCount >= maxExtensions) {
            return ExtensionOutcome.CAPPED;
        }
        Instant candidate = Instant.now().plus(Duration.ofSeconds(seconds * 2L + 900));
        Instant current = t.getStateDeadline();
        Instant newDeadline = (current == null || candidate.isAfter(current)) ? candidate : current;
        t.setStateDeadline(newDeadline);
        trades.save(t);
        Long count = redis.opsForValue().increment(counterKey);
        if (count != null && count == 1L) {
            redis.expire(counterKey, Duration.ofHours(24));
        }
        log.info("extended trade {} deadline to {} (extension #{})", tradeId, newDeadline, count);
        return ExtensionOutcome.EXTENDED;
    }
}
