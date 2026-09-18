package uz.efbazaar.marketplace.account;

import org.springframework.data.jpa.repository.JpaRepository;

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

    Optional<UserAccount> findByCurrentListingId(UUID listingId);

    boolean existsBySourceListingId(UUID listingId);
}
