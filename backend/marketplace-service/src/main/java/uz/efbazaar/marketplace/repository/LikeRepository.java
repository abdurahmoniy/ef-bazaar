package uz.efbazaar.marketplace.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.marketplace.domain.Like;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LikeRepository extends JpaRepository<Like, UUID> {

    Optional<Like> findByListingIdAndUserId(UUID listingId, UUID userId);

    long countByListingId(UUID listingId);

    void deleteByListingIdAndUserId(UUID listingId, UUID userId);

    @Query("SELECT l.listingId, COUNT(l) FROM Like l WHERE l.listingId IN :ids GROUP BY l.listingId")
    List<Object[]> countByListingIds(@Param("ids") Collection<UUID> ids);

    List<Like> findByUserIdAndListingIdIn(UUID userId, Collection<UUID> listingIds);

    @Modifying
    @Query("DELETE FROM Like l WHERE l.userId = :userId")
    int deleteAllByUserId(@Param("userId") UUID userId);
}
