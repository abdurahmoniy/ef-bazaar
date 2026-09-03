package uz.efbazaar.marketplace.partner.ads;

import java.math.BigDecimal;
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
}
