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
        ObservationStatus status,

        /*
         * Kim, kimga, qachon va nima uchun.
         *
         * Amal qaytarib bo'lmaydi — pul darhol hisobga tushadi. Bu to'rttasi
         * bo'lmasa, keyinchalik "bu pulni kim biriktirgan" degan savolga
         * javob berish uchun bazaga qo'lda kirish kerak bo'lardi.
         */
        /*
         * Faqat identifikatorlar, ismlar emas.
         *
         * payment-service auth-service bilan umuman gaplashmaydi va shu
         * ma'lumot uchun bog'liqlik ochish arzimaydi. Adminka esa UUID'larni
         * ismga aylantirishni allaqachon biladi (`users/by-ids`) va u yerda
         * bitta so'rov butun ro'yxatni qoplaydi.
         */
        UUID resolvedBy,
        UUID resolvedUserId,
        Instant resolvedAt,
        String resolutionNote
) {
    public static ObservationResponse of(CardCreditObservation o) {
        return new ObservationResponse(
                o.getId(), o.getCardLast4(), o.getAmountTiyin(), o.getCardBalanceTiyin(),
                o.getObservedAt(), o.getRawText(), o.getStatus(),
                o.getResolvedBy(), o.getResolvedUserId(),
                o.getResolvedAt(), o.getResolutionNote());
    }
}
