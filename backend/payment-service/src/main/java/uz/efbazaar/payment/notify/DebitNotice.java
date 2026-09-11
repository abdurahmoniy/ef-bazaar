package uz.efbazaar.payment.notify;

import java.time.Instant;
import java.util.UUID;

/**
 * What the admin topic is told when money leaves one of the platform's cards.
 *
 * <p>Masked card only, like every other notice: a Telegram group sits outside
 * this service's security boundary and its membership is not the card-owner
 * list.
 *
 * @param commissionTiyin null when the bank's notice carried no commission
 *                        line, which is not the same as a commission of zero
 * @param description     the bank's own words for where the money went
 */
public record DebitNotice(
        UUID observationId,
        String cardLast4,
        long amountTiyin,
        Long commissionTiyin,
        Long cardBalanceTiyin,
        String description,
        Instant observedAt) {}
