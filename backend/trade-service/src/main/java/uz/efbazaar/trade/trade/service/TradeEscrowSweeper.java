package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.payment.EscrowClient;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Instant;
import java.util.List;

/**
 * Finishes escrow movements that did not land the first time.
 *
 * <p>Exists for one deliberate hole. {@code releaseEscrow} swallows its
 * failure, because a trade nobody can close is worse than a refund that is
 * late — but that is only an acceptable trade if something comes back for the
 * refund. This is that something.
 *
 * <p>Settles are not in the same position: {@code settleEscrow} propagates, so
 * a trade cannot reach SUCCESS without one. It is swept anyway, because the
 * ordering that makes that true — call, then commit — leaves the opposite
 * window open: the wallet may have settled while trade-service died before
 * committing. Retrying is free, since every escrow movement is keyed by trade
 * id and a repeat writes nothing.
 *
 * <p>Only terminal SMART trades are candidates. A live trade is supposed to be
 * holding money, and HUMAN trades never touched the wallet.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeEscrowSweeper {

    private final TradeRepository trades;
    private final EscrowClient escrow;

    /**
     * Slow on purpose. This is a safety net, not a path anything depends on —
     * every movement it retries already failed once, so hammering the wallet
     * would only turn one outage into a busier one.
     */
    @Scheduled(fixedRateString = "${trade.scheduler.escrow-sweep-interval-ms:60000}")
    public void sweep() {
        List<Trade> stranded = trades.findEscrowUnresolved(
                List.of(TradeState.SUCCESS, TradeState.REJECTED, TradeState.ORPHANED));
        if (stranded.isEmpty()) return;

        log.warn("{} trade(s) still owe an escrow movement", stranded.size());
        for (Trade t : stranded) {
            try {
                resolve(t);
            } catch (RuntimeException e) {
                // Next tick tries again. Logged at warn, not error: the first
                // failure was already reported, and a wallet that is down will
                // produce one of these a minute until it is back.
                log.warn("Escrow still unresolved for trade {}: {}", t.getId(), e.toString());
            }
        }
    }

    @Transactional
    protected void resolve(Trade t) {
        if (t.getMode() != TradeMode.SMART || t.getEscrowResolvedAt() != null) return;

        if (t.getState() == TradeState.SUCCESS) {
            escrow.settle(t.getId(), t.getBuyerId(), t.getSellerId(), t.getPriceUzs());
        } else {
            // REJECTED and ORPHANED alike: nobody completed the trade, so the
            // buyer gets everything back.
            escrow.release(t.getId(), t.getBuyerId(), t.getPriceUzs());
        }
        t.setEscrowResolvedAt(Instant.now());
        trades.save(t);
        log.info("Escrow resolved late for trade {} ({})", t.getId(), t.getState());
    }
}
