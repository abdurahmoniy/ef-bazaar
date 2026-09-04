package uz.efbazaar.marketplace.partner;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import uz.efbazaar.marketplace.partner.PartnerApplication.Status;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class PartnerDtos {

    private PartnerDtos() {}

    public record PartnerSettingsResponse(
            int minSubscribers,
            BigDecimal priceSom,
            String defaultPayoutMode,
            int defaultTradePercentBp,
            BigDecimal defaultFixedMonthlySom,
            /** Referal mukofoti — /admin/referrals dagi bilan BITTA qiymat. */
            BigDecimal referralRewardSom,
            Instant updatedAt) {

        public static PartnerSettingsResponse from(PartnerSettings s, BigDecimal referralRewardSom) {
            return new PartnerSettingsResponse(
                    s.getMinSubscribers(), s.getPriceSom(),
                    s.getDefaultPayoutMode(), s.getDefaultTradePercentBp(),
                    s.getDefaultFixedMonthlySom(), referralRewardSom, s.getUpdatedAt());
        }
    }

    public record UpdatePartnerSettingsRequest(
            @NotNull @Min(value = 0, message = "Obunachi soni manfiy bo'lmaydi") Integer minSubscribers,
            /** Hamkor bo'lish uchun bir martalik kirish to'lovi. */
            @NotNull @DecimalMin(value = "0.0", message = "Narx manfiy bo'lmaydi") BigDecimal priceSom,

            /** PERCENT yoki FIXED — barcha hamkorlarga standart. */
            @NotNull String defaultPayoutMode,
            /**
             * Savdo komissiyasidan hamkorga ketadigan ulush, asos punktida.
             * 1000 = 10%. Foizda emas: 10.5% ni butun songa sig'dirib
             * bo'lmaydi va kasrli tur yaxlitlash bahsini ochadi.
             */
            @NotNull @Min(0) @Max(10000) Integer defaultTradePercentBp,
            @NotNull @DecimalMin("0.0") BigDecimal defaultFixedMonthlySom,

            /**
             * Referal mukofoti — HAMMA foydalanuvchi uchun, faqat
             * hamkorlar uchun emas. Bu yerda ham ko'rinadi, chunki
             * hamkor ham referal qiladi va admin uni shu ekranda
             * o'zgartira olishi kerak; qiymat esa /admin/referrals
             * bilan BITTA.
             */
            @NotNull @DecimalMin("0.0") BigDecimal referralRewardSom
    ) {}

    /** Bitta hamkorga alohida shart. null = global sozlamaga ergashadi. */
    public record UpdateChannelPayoutRequest(
            String payoutMode,
            @Min(0) @Max(10000) Integer tradePercentBp,
            @DecimalMin("0.0") BigDecimal fixedMonthlySom
    ) {}

    /** Sozlash tabidagi bitta qator. */
    public record ChannelPayoutRow(
            UUID channelId,
            String title,
            UUID partnerUserId,
            boolean active,
            /** Kanalning o'z qiymatlari — null bo'lsa globalga ergashadi. */
            String payoutMode,
            Integer tradePercentBp,
            BigDecimal fixedMonthlySom,
            /** Amalda qo'llanadigan qiymatlar — global bilan birlashtirilgan. */
            String effectivePayoutMode,
            int effectiveTradePercentBp,
            BigDecimal effectiveFixedMonthlySom,
            /** Hamkorning o'zi qo'ygan post narxi — admin o'zgartirmaydi. */
            BigDecimal postPriceSom) {}

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
