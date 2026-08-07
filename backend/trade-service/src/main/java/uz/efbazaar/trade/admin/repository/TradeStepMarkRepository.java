package uz.efbazaar.trade.admin.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.admin.domain.TradeStepMark;
import uz.efbazaar.trade.trade.domain.TradeStep;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TradeStepMarkRepository extends JpaRepository<TradeStepMark, UUID> {

    /**
     * All six rows for a trade, in no guaranteed order. {@code step} is
     * {@code @Enumerated(STRING)}, so a naive {@code findByTradeIdOrderByStep}
     * derived query would sort alphabetically, not by declaration order — a
     * trap for anyone who needs declaration order. Callers that care about
     * order (the checklist UI) must sort themselves; see
     * {@code TradeStepService.listRaw}.
     */
    List<TradeStepMark> findByTradeId(UUID tradeId);

    Optional<TradeStepMark> findByTradeIdAndStep(UUID tradeId, TradeStep step);

    long countByTradeIdAndCompletedAtIsNotNull(UUID tradeId);
}
