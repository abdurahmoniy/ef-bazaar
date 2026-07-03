package uz.efbazaar.marketplace.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;

import java.util.UUID;

public interface ListingRepository extends JpaRepository<Listing, UUID>,
        JpaSpecificationExecutor<Listing> {

    Page<Listing> findBySellerId(UUID sellerId, Pageable pageable);

    Page<Listing> findByStatus(ListingStatus status, Pageable pageable);

    /**
     * Listings currently liked by {@code userId}. Filters out non-ACTIVE listings
     * so the favourites view doesn't show SOLD/DELETED entries the user liked earlier.
     */
    @Query("""
            SELECT l FROM Listing l
             WHERE l.status = uz.efbazaar.marketplace.domain.ListingStatus.ACTIVE
               AND l.id IN (SELECT lk.listingId FROM Like lk WHERE lk.userId = :userId)
            """)
    Page<Listing> findLikedByUser(@Param("userId") UUID userId, Pageable pageable);
}
