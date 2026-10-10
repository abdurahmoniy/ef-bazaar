package uz.efbazaar.marketplace.account;

import org.springframework.data.jpa.repository.JpaRepository;

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

    List<UserAccount> findByCurrentListingIdIn(Collection<UUID> listingIds);

    boolean existsBySourceListingId(UUID listingId);

    Optional<UserAccount> findByOwnerIdAndSourceTradeId(UUID ownerId, UUID tradeId);
}
