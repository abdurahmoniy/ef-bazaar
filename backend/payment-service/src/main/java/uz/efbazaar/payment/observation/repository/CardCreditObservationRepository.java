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

    /**
     * Whether the userbot ever saw money land on this card number.
     *
     * <p>There is no foreign key here — an observation names a card by its last
     * four digits, not by id — so nothing in the database would stop a card
     * with real credits behind it from being deleted. This is that stop.
     */
    boolean existsByCardLast4(String last4);

    List<CardCreditObservation> findByStatusOrderByObservedAtAsc(ObservationStatus status);

    /**
     * Qo'lda hal qilinganlar tarixi — eng yangisidan.
     *
     * <p>Holat bo'yicha emas, {@code resolvedAt} bo'yicha: e'tiborsiz
     * qoldirilgan (IGNORED) tushum ham admin qarori va tarixda ko'rinishi
     * kerak — u ham qaytarib bo'lmaydigan amal.
     */
    List<CardCreditObservation> findTop100ByResolvedAtIsNotNullOrderByResolvedAtDesc();

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
