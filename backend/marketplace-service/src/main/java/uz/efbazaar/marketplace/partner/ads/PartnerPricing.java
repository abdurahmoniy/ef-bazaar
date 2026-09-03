package uz.efbazaar.marketplace.partner.ads;

import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.partner.PartnerChannel;

import java.math.BigDecimal;

/**
 * Kanalga e'lon joylash narxi.
 *
 * <p>BU YAGONA SEAM. Narx hech qayerda {@code channel.getPostPriceSom()}
 * dan to'g'ridan-to'g'ri o'qilmaydi — hamma joyda shu metod chaqiriladi.
 *
 * <p>Sababi kelajakda: hamkorlar narxni akkount kuchiga qarab
 * belgilashlari kerak bo'ladi (team strength 3000+ uchun 15 000,
 * 2000+ uchun 5 000). O'sha kuni shu metodning ICHI o'zgaradi va
 * chaqiruvchilarning bittasiga ham tegilmaydi.
 *
 * <p>{@code listing} bugun ishlatilmaydi va ataylab qabul qilinadi:
 * imzo o'zgarmasa, tariflar qo'shilganda chaqiruv joylari qo'zg'almaydi.
 * Qidiruv ro'yxatida e'lon hali tanlanmagan bo'lishi mumkin — o'shanda
 * {@code null} keladi va bazaviy narx qaytadi.
 */
@Component
public class PartnerPricing {

    public BigDecimal priceFor(PartnerChannel channel, Listing listing) {
        return channel.getPostPriceSom();
    }
}
