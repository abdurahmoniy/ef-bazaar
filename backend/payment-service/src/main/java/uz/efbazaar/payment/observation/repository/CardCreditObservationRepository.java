package uz.efbazaar.payment.observation.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.payment.observation.domain.CardCreditObservation;
import uz.efbazaar.payment.observation.domain.ObservationStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CardCreditObservationRepository
        extends JpaRepository<CardCreditObservation, UUID> {

    Optional<CardCreditObservation> findByTelegramMessageId(long telegramMessageId);

    List<CardCreditObservation> findByStatusOrderByObservedAtAsc(ObservationStatus status);

    /**
     * The admin path's read, locked. Attributing a queued top-up to a user
     * creates money and no screen in this platform can reverse it, so two admins
     * working the same queue row must not both get past the UNMATCHED check.
     * Unlocked they did: both posted with the key {@code obs-manual-<id>}, the
     * ledger returned the winner's transaction id to the loser and wrote
     * nothing, and the loser's call still answered 200 MANUALLY_RESOLVED —
     * telling admin B they had credited user B while user A had the money.
     *
     * <p>{@code PESSIMISTIC_WRITE} makes the second caller wait and then read
     * the committed row, where the status now says the row is taken.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT o FROM CardCreditObservation o WHERE o.id = :id")
    Optional<CardCreditObservation> findByIdForUpdate(@Param("id") UUID id);
}
