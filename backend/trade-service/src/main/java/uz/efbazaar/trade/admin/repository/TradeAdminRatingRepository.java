package uz.efbazaar.trade.admin.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.admin.domain.TradeAdminRating;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TradeAdminRatingRepository extends JpaRepository<TradeAdminRating, UUID> {

    List<TradeAdminRating> findByAdminIdOrderByCreatedAtDesc(UUID adminId);

    Optional<TradeAdminRating> findByTradeIdAndRaterId(UUID tradeId, UUID raterId);
}
