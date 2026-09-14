package uz.efbazaar.bot.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import uz.efbazaar.bot.telegram.TelegramApiClient.WebAppButton;

import java.util.Locale;

/**
 * Hamyonga pul tushganini egasiga aytadi.
 *
 * <p>Ikkala yo'l uchun ham bitta xabar: to'lov invoice'ga o'zi mos
 * kelgani yoki uni admin qo'lda biriktirgani — pul egasi uchun bir xil
 * voqea. Ikkinchisini boshqacha atash nimadir noto'g'ri ketgandek
 * taassurot qoldirardi, holbuki hech narsa noto'g'ri emas.
 *
 * <p>Manzil hodisa ichida keladi, auth-service yechib beradi. Telegram
 * orqali kirmagan odamda u umuman chiqmaydi — platforma bildirishnomasi
 * esa baribir yozilgan va u boshqa yo'ldan boradi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WalletCreditedConsumer {

    private final TelegramApiClient telegram;

    @Value("${app.web.base-url:https://efbazaar.uz}")
    private String webBaseUrl;

    @KafkaListener(
            topics = "efbazaar.notifications.wallet-credited",
            groupId = "bot-wallet-credited",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.bot.kafka.WalletCreditedDto",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onCredited(WalletCreditedDto e) {
        if (e == null || e.recipientTelegramId() == null || e.amountTiyin() == null) return;

        StringBuilder text = new StringBuilder("💰 <b>Hamyoningiz to'ldirildi</b>\n\n")
                .append("Hisobingizga <b>")
                .append(uzs(e.amountTiyin()))
                .append(" so'm</b> tushdi.");

        // Balans ixtiyoriy: uni o'qib bo'lmagan bo'lsa xabar bittagina
        // qatorini yo'qotadi, o'zi esa baribir ketadi.
        if (e.balanceAfterTiyin() != null) {
            text.append("\nJoriy balans: <b>")
                    .append(uzs(e.balanceAfterTiyin()))
                    .append(" so'm</b>");
        }

        try {
            telegram.sendMessage(String.valueOf(e.recipientTelegramId()), null, text.toString(),
                    new WebAppButton("Hamyon", webBaseUrl + "/hamyon"));
            log.info("Wallet credited DM sent to telegramId={}", e.recipientTelegramId());
        } catch (RuntimeException ex) {
            // Botni bloklagan odamga yozib bo'lmaydi, va bu pulni qaytarmaydi.
            log.warn("Hamyon xabari yetkazilmadi telegramId={}: {}",
                    e.recipientTelegramId(), ex.getMessage());
        }
    }

    /**
     * 5_000_000 -> "50 000". Tiyin qoldig'i bo'lsa saqlanadi: qo'lda
     * biriktirilgan tushum butun so'm bo'lishiga kafolat yo'q, va odam bu
     * raqamni bank chekiga solishtiradi.
     *
     * <p>{@link Locale#ROOT} — de_DE ga sozlangan konteyner aks holda
     * "50.000" deb yozardi.
     */
    private static String uzs(long tiyin) {
        long whole = tiyin / 100;
        long frac = Math.abs(tiyin % 100);
        String grouped = String.format(Locale.ROOT, "%,d", whole).replace(',', ' ');
        return frac == 0 ? grouped : "%s,%02d".formatted(grouped, frac);
    }
}
