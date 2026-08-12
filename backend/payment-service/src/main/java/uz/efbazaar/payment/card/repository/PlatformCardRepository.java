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

    boolean existsByLast4AndActiveTrue(String last4);
}
