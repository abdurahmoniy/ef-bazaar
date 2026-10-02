package uz.efbazaar.payment.debit.repository;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.debit.domain.CardDebitObservation;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CardDebitObservationRepository
        extends JpaRepository<CardDebitObservation, UUID> {

    /** Spring Data turns a null userbotTelegramId into IS NULL, which is what legacy rows need. */
    Optional<CardDebitObservation> findByUserbotTelegramIdAndTelegramMessageId(
            Long userbotTelegramId, long telegramMessageId);

    /**
     * Whether any money has ever been seen leaving this card.
     *
     * <p>{@code card_id} is a real foreign key here, so PostgreSQL would refuse
     * a delete anyway — but with a constraint name rather than a sentence an
     * admin can act on. See {@code PlatformCardService.delete}.
     */
    boolean existsByCardId(UUID cardId);

    List<CardDebitObservation> findAllByOrderByObservedAtDesc(Pageable pageable);

    List<CardDebitObservation> findByCardLast4OrderByObservedAtDesc(String last4, Pageable pageable);
}
