package uz.efbazaar.marketplace.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.marketplace.domain.CartItem;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CartItemRepository extends JpaRepository<CartItem, UUID> {

    Optional<CartItem> findByUserIdAndListingId(UUID userId, UUID listingId);

    List<CartItem> findByUserIdOrderByCreatedAtDesc(UUID userId);

    void deleteByUserIdAndListingId(UUID userId, UUID listingId);
}
