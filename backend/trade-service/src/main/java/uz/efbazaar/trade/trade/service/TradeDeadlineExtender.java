package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.trade.domain.Trade;
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

    public enum ExtensionOutcome { EXTENDED, CAPPED, TRADE_NOT_FOUND, TRADE_TERMINAL }

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
        if (t.getState().isTerminal()) {
            return ExtensionOutcome.TRADE_TERMINAL;
        }
        String counterKey = "trade:" + tradeId + ":deadline-extensions";
        Long count = redis.opsForValue().increment(counterKey);
        if (count != null && count == 1L) {
            redis.expire(counterKey, Duration.ofHours(24));
        }
        if (count != null && count > maxExtensions) {
            return ExtensionOutcome.CAPPED;
        }
        Instant candidate = Instant.now().plus(Duration.ofSeconds(seconds * 2L + 900));
        Instant current = t.getStateDeadline();
        Instant newDeadline = (current == null || candidate.isAfter(current)) ? candidate : current;
        t.setStateDeadline(newDeadline);
        trades.save(t);
        log.info("extended trade {} deadline to {} (extension #{})", tradeId, newDeadline, count);
        return ExtensionOutcome.EXTENDED;
    }
}
