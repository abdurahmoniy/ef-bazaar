package uz.efbazaar.payment.notify;

import java.util.UUID;

/**
 * A payout waiting for a human.
 *
 * <p>Carries {@code cardLast4}, never the number. The topic is a group chat and
 * the full card belongs behind the admin panel's reveal endpoint, where each
 * disclosure is a request somebody can point at.
 */
public record WithdrawalNotice(
        UUID ticketId,
        UUID userId,
        long amountTiyin,
        String cardLast4,
        String holderName,
        String phone,
        String telegramUsername) {}
