package uz.efbazaar.trade.card.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.card.domain.Card;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CardRepository extends JpaRepository<Card, UUID> {

    List<Card> findByOwnerUserIdAndSavedToProfileIsTrue(UUID ownerUserId);

    Optional<Card> findByIdAndOwnerUserId(UUID id, UUID ownerUserId);
}
