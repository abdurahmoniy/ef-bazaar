package uz.efbazaar.marketplace.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;

import java.util.UUID;

public interface ListingRepository extends JpaRepository<Listing, UUID>,
        JpaSpecificationExecutor<Listing> {

    Page<Listing> findBySellerId(UUID sellerId, Pageable pageable);

    Page<Listing> findByStatus(ListingStatus status, Pageable pageable);

    long countByStatus(ListingStatus status);

    // Gamer Card trust counters — escrow history straight from listing rows
    // (sold_at/sold_to_user_id are written by the listing-sold consumer).
    long countBySellerIdAndStatus(UUID sellerId, ListingStatus status);

    long countBySoldToUserId(UUID buyerId);

    // Trust module: hide/restore a blacklisted seller's catalog. Both are
    // status-transition idempotent, so replays are no-ops.
    @Modifying
    @Query("UPDATE Listing l SET l.status = :to WHERE l.sellerId = :sellerId AND l.status = :from")
    int retagBySellerAndStatus(@Param("sellerId") UUID sellerId,
                               @Param("from") ListingStatus from,
                               @Param("to") ListingStatus to);

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

    /**
     * Mark every ACTIVE listing owned by the seller as DELETED. Invoked from the
     * {@code auth.user-deleted} consumer to purge orphan seller state. Returns
     * the number of rows updated.
     */
    @Modifying
    @Query("""
            UPDATE Listing l
               SET l.status = uz.efbazaar.marketplace.domain.ListingStatus.DELETED
             WHERE l.sellerId = :sellerId
               AND l.status = uz.efbazaar.marketplace.domain.ListingStatus.ACTIVE
            """)
    int softDeleteAllBySeller(@Param("sellerId") UUID sellerId);
}
