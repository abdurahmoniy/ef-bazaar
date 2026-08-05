package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;

/**
 * Pushes a human trade's escalation deadline forward whenever its admin does
 * something. A visibly working admin must never surface in the platform
 * escalation queue (spec §7.2).
 *
 * <p>Its own component rather than a method on {@code TradeStepService}: both
 * the checklist path and the chat path need it, and {@code TradeStepService}
 * already depends on {@code TradeChatService}. Depending only on
 * {@code TradeRepository} keeps the graph acyclic.
 */
@Component
@RequiredArgsConstructor
public class TradeIdleWatchdog {

    private final TradeRepository trades;

    @Value("${trade.timeouts.human-admin-idle-seconds}")
    private long idleSeconds;

    /**
     * Counts any admin action as activity — ticking a step, un-ticking one, or
     * writing into either party chat. A long conversation with the seller is
     * work even before the first step is ticked.
     */
    @Transactional
    public void touch(Trade t) {
        t.setEscalationDeadlineAt(Instant.now().plus(Duration.ofSeconds(idleSeconds)));
        trades.save(t);
    }
}
