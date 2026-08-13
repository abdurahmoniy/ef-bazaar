package uz.efbazaar.payment.observation.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.observation.domain.CardCreditObservation;
import uz.efbazaar.payment.observation.domain.ObservationStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CardCreditObservationRepository
        extends JpaRepository<CardCreditObservation, UUID> {

    Optional<CardCreditObservation> findByTelegramMessageId(long telegramMessageId);

    List<CardCreditObservation> findByStatusOrderByObservedAtAsc(ObservationStatus status);
}
