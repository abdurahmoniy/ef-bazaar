package uz.efbazaar.bot.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.telegram.TelegramApiClient;

/**
 * Sends Telegram DM notifications to buyers/sellers when trade actions occur.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeActionNotificationConsumer {

    private final TelegramApiClient telegram;

    @Value("${app.web.base-url:https://efbazaar.uz}")
    private String webBaseUrl;

    @KafkaListener(
            topics = "efbazaar.notifications.trade-action",
            groupId = "bot-trade-action-notifier",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.bot.kafka.TradeActionNotificationDto",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onTradeAction(TradeActionNotificationDto e) {
        if (e == null || e.recipientTelegramId() == null) {
            log.info("Skipping trade action DM — no Telegram identity");
            return;
        }

        String message = buildMessage(e);
        String targetUrl = e.chatId() != null
                ? webBaseUrl + "/chats/" + e.chatId()
                : webBaseUrl + "/chats";
        var button = new TelegramApiClient.WebAppButton("💬 Savdoni ochish", targetUrl);

        try {
            telegram.sendMessage(String.valueOf(e.recipientTelegramId()), null, message, button);
            log.info("Trade action DM sent to telegramId={} actionType={} chatId={}",
                    e.recipientTelegramId(), e.actionType(), e.chatId());
        } catch (Exception ex) {
            log.warn("Trade action DM failed for telegramId={}: {}", e.recipientTelegramId(), ex.getMessage());
        }
    }

    private String buildMessage(TradeActionNotificationDto e) {
        String action = e.actionType() != null ? e.actionType() : "";
        boolean swap = isSwap(e);
        boolean hasAmount = hasAmount(e);
        String formattedPrice = String.format("%,d", e.amountUzs()).replace(',', ' ') + " UZS";
        return switch (action) {
            case "PROPOSAL_CREATED" -> (swap
                        ? "\uD83D\uDD01 <b>Yangi obmen taklifi!</b>\n"
                            + (hasAmount
                                ? "Sizga akkount almashish va ustiga <b>" + formattedPrice
                                    + "</b> doplata taklif qilindi.\n"
                                : "Sizga akkountga akkount almashish taklif qilindi.\n")
                        : "\uD83E\uDD1D <b>Yangi savdo taklifi!</b>\n"
                            + "Sizga <b>" + formattedPrice + "</b> miqdorida savdo taklifi yuborildi.\n")
                    + "Savdoni davom ettirish uchun chatga kiring.";
            case "TRADE_STARTED" -> (swap
                        ? "\uD83D\uDD01 <b>Obmen boshlandi!</b>\n"
                            + "Taklif qabul qilindi"
                            + (hasAmount ? " (doplata: " + formattedPrice + ")." : ".")
                        : "\uD83D\uDE80 <b>Savdo boshlandi!</b>\n"
                            + "Taklif qabul qilindi (" + formattedPrice + ").")
                    + " Akkount transferi boshlanmoqda.";
            case "EMAIL_CHANGED" -> "\uD83D\uDCE7 <b>Konami emaili o'zgartirildi</b>\n"
                    + "Sotuvchi Konami emailini almashtirdi. Tekshiruv davom etmoqda.";
            case "PASSWORD_SENT" -> "\uD83D\uDD11 <b>Konami paroli yuborildi!</b>\n"
                    + "Sotuvchi yangi parolni yubordi. Chatga kirib parolni ko'ring va tasdiqlang.";
            case "TRADE_SUCCESS" -> "\u2705 <b>Savdo muvaffaqiyatli yakunlandi!</b>\n"
                    + "Mablag' va akkount muvaffaqiyatli o'tkazildi. Tabriklaymiz!";
            case "TRADE_REJECTED" -> "\u274C <b>Savdo rad etildi</b>\n"
                    + "Savdo bekor qilindi.";
            case "TRADE_ORPHANED" -> "\u23F1 <b>Savdo muddati tugadi</b>\n"
                    + "Ajratilgan vaqt tugaganligi sababli savdo bekor qilindi.";
            default -> "\uD83D\uDD14 <b>Savdo yangilandi</b>\n"
                    + "Savdo holatida o'zgarish yuz berdi.";
        };
    }

    /**
     * Obmenmi — doplatalisi ham obmen.
     *
     * <p>Summa buni ayta olmaydi: doplatali obmenda u noldan katta va sotuvdan
     * farq qilmaydi, DM esa "Yangi savdo taklifi" deb kelardi. Shuning uchun
     * hodisa savdo turini o'zi olib yuradi. Eski hodisalarda tur yo'q — o'shanda
     * eski qoida: sotuvda narx hech qachon 0 bo'lmaydi (marketplace eng kam
     * narxni talab qiladi), demak 0 summa obmen belgisi.
     */
    private static boolean isSwap(TradeActionNotificationDto e) {
        String kind = e.kind();
        if (kind == null) return e.amountUzs() <= 0;
        return "SWAP".equals(kind) || "SWAP_SURCHARGE".equals(kind);
    }

    /**
     * Ko'rsatiladigan summa bormi.
     *
     * <p>Toza obmenda pul umuman o'tmaydi — "0 UZS" chiqsa savdo buzuq
     * ochilgandek ko'rinardi. Doplatali obmenda doplataning o'zi ko'rsatiladi;
     * sayt ham shu qoida bilan ishlaydi ({@code trade-swap.ts}).
     */
    private static boolean hasAmount(TradeActionNotificationDto e) {
        return !"SWAP".equals(e.kind()) && e.amountUzs() > 0;
    }
}
