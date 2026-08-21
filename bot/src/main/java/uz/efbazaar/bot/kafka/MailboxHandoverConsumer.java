package uz.efbazaar.bot.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.telegram.TelegramApiClient;

/**
 * DMs a party when an escrow mailbox becomes theirs.
 *
 * <p>The message a failed trade needs most: a party who had already moved
 * their account into the escrow address would otherwise have no way of knowing
 * the address is now theirs, and would take the trade's collapse to mean the
 * account was gone.
 *
 * <p>Best-effort like every other DM here — delivery needs the user to have
 * started the bot, and the notification centre carries the same message.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MailboxHandoverConsumer {

    private final TelegramApiClient telegram;

    @Value("${app.mail.base-url:https://mail.efbazaar.uz}")
    private String mailBaseUrl;

    @KafkaListener(
            topics = "efbazaar.notifications.mailbox-handed-over",
            groupId = "bot-mailbox-handover-notifier",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.bot.kafka.MailboxHandoverDto",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onHandedOver(MailboxHandoverDto e) {
        if (e == null || e.telegramId() == null) {
            log.info("Skipping mailbox handover DM — no Telegram identity");
            return;
        }
        var button = new TelegramApiClient.WebAppButton("📬 Pochtani ochish", mailBaseUrl);
        try {
            telegram.sendMessage(String.valueOf(e.telegramId()), null, buildMessage(e), button);
        } catch (Exception ex) {
            log.warn("Mailbox handover DM failed for trade {}: {}", e.tradeId(), ex.getMessage());
        }
    }

    private String buildMessage(MailboxHandoverDto e) {
        String address = "<code>" + escape(e.mailboxEmail()) + "</code>";
        if ("RECEIVED".equals(e.outcome())) {
            return "✅ <b>Savdo yakunlandi</b>\n"
                    + "Qo'lga kiritgan akkountingiz emaili " + address
                    + " profilingizga qo'shildi.\n\n"
                    + "Undan shundayligicha foydalanishingiz mumkin, yoki akkountni "
                    + "o'z emailingizga o'tkazib olish uchun tasdiqlash kodlarini "
                    + "shu pochtada qabul qilasiz.";
        }
        return "⚠️ <b>Savdo yakunlanmadi</b>\n"
                + "Akkountni o'tkazishingiz uchun berilgan " + address
                + " emaili profilingizga biriktirildi.\n\n"
                + "Agar akkountingizni allaqachon shu emailga o'tkazgan bo'lsangiz, "
                + "uni qaytarib olish uchun tasdiqlash kodlarini shu pochtada "
                + "qabul qilishingiz mumkin.";
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
