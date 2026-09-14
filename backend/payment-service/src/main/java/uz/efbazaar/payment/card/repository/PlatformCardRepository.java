package uz.efbazaar.payment.card.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.card.domain.PlatformCard;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlatformCardRepository extends JpaRepository<PlatformCard, UUID> {

    List<PlatformCard> findByActiveTrueOrderByDisplayOrderAsc();

    List<PlatformCard> findAllByOrderByDisplayOrderAsc();

    Optional<PlatformCard> findByLast4AndActiveTrue(String last4);

    /**
     * The most recently added card with these digits, active or not. last4 is
     * only unique among ACTIVE cards, so a retired card can share it with a
     * newer one — the newest is the best guess at which row a bank notice means.
     */
    Optional<PlatformCard> findFirstByLast4OrderByCreatedAtDesc(String last4);

    boolean existsByLast4AndActiveTrue(String last4);
}
