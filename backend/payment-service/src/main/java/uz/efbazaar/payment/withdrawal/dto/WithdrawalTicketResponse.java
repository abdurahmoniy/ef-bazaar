package uz.efbazaar.payment.withdrawal.dto;

import uz.efbazaar.payment.withdrawal.domain.WithdrawalStatus;
import uz.efbazaar.payment.withdrawal.domain.WithdrawalTicket;

import java.time.Instant;
import java.util.UUID;

/**
 * A ticket as anyone but the paying admin sees it.
 *
 * <p>Carries {@code last4}, never the number. The full card is a separate,
 * deliberate call ({@code /reveal}) so it cannot leak into a list response or
 * a log line by accident.
 */
public record WithdrawalTicketResponse(
        UUID id,
        UUID userId,
        long amountTiyin,
        String last4,
        String holderName,
        String phone,
        String telegramUsername,
        WithdrawalStatus status,
        Instant createdAt,
        Instant closedAt,
        String closeNote
) {
    public static WithdrawalTicketResponse of(WithdrawalTicket t) {
        return new WithdrawalTicketResponse(
                t.getId(), t.getUserId(), t.getAmountTiyin(), t.getLast4(),
                t.getHolderName(), t.getPhone(), t.getTelegramUsername(),
                t.getStatus(), t.getCreatedAt(), t.getClosedAt(), t.getCloseNote());
    }
}
