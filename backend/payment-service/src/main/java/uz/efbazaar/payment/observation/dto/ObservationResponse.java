package uz.efbazaar.payment.observation.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.payment.observation.domain.CardCreditObservation;
import uz.efbazaar.payment.observation.domain.ObservationStatus;

import java.time.Instant;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ObservationResponse(
        UUID id,
        String cardLast4,
        long amountTiyin,
        Long cardBalanceTiyin,
        Instant observedAt,
        /** The original Telegram text — the admin decides from what actually arrived. */
        String rawText,
        ObservationStatus status
) {
    public static ObservationResponse of(CardCreditObservation o) {
        return new ObservationResponse(
                o.getId(), o.getCardLast4(), o.getAmountTiyin(), o.getCardBalanceTiyin(),
                o.getObservedAt(), o.getRawText(), o.getStatus());
    }
}
