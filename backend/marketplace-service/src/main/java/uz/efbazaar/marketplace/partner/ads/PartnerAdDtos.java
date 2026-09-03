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
            /** Proksi manzili; Telegram {@code file_id} brauzerga chiqmaydi. */
            String photoUrl,
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

    public record UpdatePostPriceRequest(
            @jakarta.validation.constraints.NotNull
            @jakarta.validation.constraints.PositiveOrZero BigDecimal priceSom) {}
}
