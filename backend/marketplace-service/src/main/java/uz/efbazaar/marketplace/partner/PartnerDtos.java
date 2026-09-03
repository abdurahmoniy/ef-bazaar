package uz.efbazaar.marketplace.partner;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import uz.efbazaar.marketplace.partner.PartnerApplication.Status;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class PartnerDtos {

    private PartnerDtos() {}

    public record PartnerSettingsResponse(int minSubscribers, BigDecimal priceSom, Instant updatedAt) {
        public static PartnerSettingsResponse from(PartnerSettings s) {
            return new PartnerSettingsResponse(s.getMinSubscribers(), s.getPriceSom(), s.getUpdatedAt());
        }
    }

    public record UpdatePartnerSettingsRequest(
            @NotNull @Min(value = 0, message = "Obunachi soni manfiy bo'lmaydi") Integer minSubscribers,
            @NotNull @DecimalMin(value = "0.0", message = "Narx manfiy bo'lmaydi") BigDecimal priceSom
    ) {}

    /**
     * Botdan keladigan kanal tekshiruvi.
     *
     * <p>Barcha qiymatlar Telegram API'dan olinadi — foydalanuvchi kiritmaydi.
     * Aks holda obunachi sonini ham, egalikni ham soxtalashtirib bo'lardi.
     */
    public record ChannelVerifiedRequest(
            @NotNull Long addedByTelegramId,
            @NotNull Long channelId,
            String channelTitle,
            String channelUsername,
            @NotNull @Min(0) Integer subscriberCount,
            /** Qo'shgan odam kanalning EGASI (Telegram'da `creator`) mi. */
            boolean addedByIsOwner,
            /** Kanal avatari. Kanalda rasm bo'lmasligi mumkin — null normal. */
            String channelPhotoFileId
    ) {}

    public record ApplicationResponse(
            UUID id,
            UUID userId,
            Status status,
            Long channelId,
            String channelTitle,
            String channelUsername,
            Integer subscriberCount,
            Instant verifiedAt,
            String verificationError,
            UUID invoiceId,
            Instant paidAt,
            Instant reviewedAt,
            String reviewNote,
            Instant createdAt
    ) {
        public static ApplicationResponse from(PartnerApplication a) {
            return new ApplicationResponse(
                    a.getId(), a.getUserId(), a.getStatus(),
                    a.getChannelId(), a.getChannelTitle(), a.getChannelUsername(),
                    a.getSubscriberCount(), a.getVerifiedAt(), a.getVerificationError(),
                    a.getInvoiceId(), a.getPaidAt(), a.getReviewedAt(), a.getReviewNote(),
                    a.getCreatedAt());
        }
    }

    public record ReviewRequest(@Size(max = 500) String note) {}

    /** Admin panelidagi raqamli ishoralar: bo'lim → ko'rilmagan elementlar soni. */
    public record AdminBadgesResponse(long partnerApplications, long withdrawals) {}
}
