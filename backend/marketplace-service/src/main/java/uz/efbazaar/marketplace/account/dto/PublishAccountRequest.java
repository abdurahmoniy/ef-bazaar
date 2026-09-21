package uz.efbazaar.marketplace.account.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Bozorga chiqarishda so'raladigan yagona narsa — sotuv shartlari.
 *
 * <p>Qolgan hamma narsa akkountdan keladi. Shartlar akkountda saqlanmaydi:
 * bitta akkount bugun sotuvga, ertaga obmenga chiqarilishi mumkin.
 */
public record PublishAccountRequest(
        @NotNull
        @DecimalMin(value = "5000.00", inclusive = true, message = "Narx kamida 5 000 so'm bo'lishi kerak.")
        BigDecimal price,

        boolean priceNegotiable,

        /** null — obmen taklif qilinmaydi. Aks holda ExchangeMode qiymati. */
        String exchangeMode,

        List<UUID> channelIds) {}
