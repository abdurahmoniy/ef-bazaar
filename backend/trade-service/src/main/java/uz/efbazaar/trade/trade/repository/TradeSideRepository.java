package uz.efbazaar.trade.trade.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeSide;
import uz.efbazaar.trade.trade.domain.TradeSideId;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TradeSideRepository extends JpaRepository<TradeSide, TradeSideId> {

    List<TradeSide> findByIdTradeId(UUID tradeId);

    default Optional<TradeSide> find(UUID tradeId, ParticipantRole role) {
        return findById(new TradeSideId(tradeId, role));
    }
}
