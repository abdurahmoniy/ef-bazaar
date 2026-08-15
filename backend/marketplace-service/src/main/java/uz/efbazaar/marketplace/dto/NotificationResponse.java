package uz.efbazaar.marketplace.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.marketplace.domain.Notification;
import uz.efbazaar.marketplace.domain.NotificationType;

import java.time.Instant;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record NotificationResponse(
        UUID id,
        NotificationType type,
        UUID chatId,
        UUID listingId,
        UUID tradeId,
        /** Payout ticket, for WITHDRAWAL_* rows — the admin queue links by it. */
        UUID withdrawalId,
        String actorDisplayName,
        Instant readAt,
        Instant createdAt
) {
    public static NotificationResponse from(Notification n) {
        return new NotificationResponse(n.getId(), n.getType(), n.getChatId(),
                n.getListingId(), n.getTradeId(), n.getWithdrawalId(),
                n.getActorDisplayName(), n.getReadAt(), n.getCreatedAt());
    }
}
