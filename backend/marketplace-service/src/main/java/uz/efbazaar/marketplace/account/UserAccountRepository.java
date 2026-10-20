package uz.efbazaar.marketplace.account;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {

    List<UserAccount> findByOwnerIdAndStatusOrderByCreatedAtDesc(UUID ownerId, UserAccountStatus status);

    /**
     * Egalik tekshiruvi shu yerda: id va egasi birga so'raladi, shuning uchun
     * begona akkount "topilmadi" bo'lib qaytadi va javobning o'zi uning
     * mavjudligini tasdiqlamaydi.
     */
    Optional<UserAccount> findByIdAndOwnerId(UUID id, UUID ownerId);

    List<UserAccount> findByOwnerIdAndStatusAndArchivedReasonInOrderByArchivedAtDescCreatedAtDesc(
            UUID ownerId, UserAccountStatus status, Collection<ArchivedReason> reasons);

    Optional<UserAccount> findByCurrentListingId(UUID listingId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM UserAccount a WHERE a.currentListingId = :listingId OR a.sourceListingId = :listingId")
    List<UserAccount> findLinkedToListing(@Param("listingId") UUID listingId);

    List<UserAccount> findByCurrentListingIdIn(Collection<UUID> listingIds);

    boolean existsBySourceListingId(UUID listingId);

    boolean existsByCurrentListingIdOrSourceListingId(UUID currentListingId, UUID sourceListingId);

    Optional<UserAccount> findByOwnerIdAndSourceTradeId(UUID ownerId, UUID tradeId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from UserAccount a where a.id = :id")
    Optional<UserAccount> findByIdForUpdate(@Param("id") UUID id);
}
