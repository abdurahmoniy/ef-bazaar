package uz.efbazaar.trade.seller.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.seller.domain.SellerRating;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SellerRatingRepository extends JpaRepository<SellerRating, UUID> {

    Optional<SellerRating> findByTradeId(UUID tradeId);

    Optional<SellerRating> findByTradeIdAndRaterId(UUID tradeId, UUID raterId);

    List<SellerRating> findBySellerIdOrderByCreatedAtDesc(UUID sellerId);

    List<SellerRating> findBySellerIdIn(Collection<UUID> sellerIds);
}
