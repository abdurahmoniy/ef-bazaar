package uz.efbazaar.marketplace.partner.ads;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class PartnerAdDtos {

    private PartnerAdDtos() {}

    /**
     * Qidiruvdagi kanal kartochkasi.
     *
     * <p>HAMKOR EMAS, KANAL ko'rsatiladi: sotuvchi auditoriya sotib
     * olayapti va uning egasi kimligi unga qiziq emas.
     */
    public record ChannelCard(
            UUID channelId,
            String title,
            String username,
            /**
             * Telegram {@code file_id}. Frontend uni {@code /bot/photo/...}
             * proksisiga aylantiradi — e'lon rasmlari bilan aynan bir xil
             * naqsh, ikkinchi mexanizm qurilmaydi.
             */
            String photoFileId,
            int subscriberCount,
            BigDecimal priceSom) {}

    /** Hamkorning o'z paneli — spec §7.3 dagi to'rt blok. */
    public record PartnerPanelResponse(
            ChannelSummary channel,
            PriceBounds priceBounds,
            ChannelFunnel funnel,
            Earnings earnings,
            List<PostRow> posts) {}

    public record ChannelSummary(UUID channelId, String title, String username,
                                 int subscriberCount, BigDecimal postPriceSom) {}

    /** Chegaralar KO'RSATILADI, faqat rad etilmaydi: oraliqni ko'rmagan hamkor taxmin qilishga majbur. */
    public record PriceBounds(BigDecimal minSom, BigDecimal maxSom) {}

    /** Kanalning o'z voronkasi — shaxsiy taklif havolasi emas, u /invite da. */
    public record ChannelFunnel(long clicks, long registrations) {}

    /**
     * Uch oqim ALOHIDA.
     *
     * <p>Ular boshqacha xatti-harakat qiladi, va narxini tushiraymi degan
     * qarorni qabul qilayotgan hamkor qaysi oqim javob berayotganini
     * ko'rishi kerak. Bitta umumiy raqam bu savolga javob bermaydi.
     */
    public record Earnings(BigDecimal fromPostsSom, BigDecimal fromTradesSom, BigDecimal monthlySom) {}

    public record PostRow(UUID postId, UUID listingId, String state,
                          BigDecimal priceSom, Instant createdAt, Instant postedAt) {}

    /**
     * Adminka voronkasining bitta qatori.
     *
     * <p>VORONKA — asosiy narsa. Ko'p bosilish va savdosiz kanal, umuman
     * bosilmagan kanaldan BOSHQA muammo, va bitta daromad ustuni
     * adminga ularning qaysi biri ekanini ayta olmaydi.
     */
    public record PartnerFunnelRow(
            UUID channelId,
            String title,
            int subscriberCount,
            boolean active,
            long clicks,
            long registrations,
            long postsOrdered,
            long postsDelivered,
            long postsRefunded,
            BigDecimal revenueSom) {}

    public record UpdatePostPriceRequest(
            @jakarta.validation.constraints.NotNull
            @jakarta.validation.constraints.PositiveOrZero BigDecimal priceSom) {}
}
