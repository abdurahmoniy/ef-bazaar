package uz.efbazaar.trade.admin.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.admin.domain.TradeStepMark;
import uz.efbazaar.trade.trade.domain.TradeStep;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TradeStepMarkRepository extends JpaRepository<TradeStepMark, UUID> {

    /** Checklist in declaration order — the order the UI renders. */
    List<TradeStepMark> findByTradeIdOrderByStep(UUID tradeId);

    Optional<TradeStepMark> findByTradeIdAndStep(UUID tradeId, TradeStep step);

    long countByTradeIdAndCompletedAtIsNotNull(UUID tradeId);
}
