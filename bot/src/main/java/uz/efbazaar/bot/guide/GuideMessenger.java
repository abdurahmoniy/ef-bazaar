package uz.efbazaar.bot.guide;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import uz.efbazaar.bot.telegram.TelegramApiClient.CallbackButton;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Video qo'llanmalar: ro'yxat xabari va tugma bosilgandagi javob.
 *
 * <p>Ro'yxat `/start` dan KEYIN alohida xabar bo'lib chiqadi va faqat
 * kamida bitta tugma sozlangan bo'lsa. Sozlanmagan bo'lsa foydalanuvchi
 * bo'sh "qo'llanmalar" xabarini ko'rmaydi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GuideMessenger {

    static final String INTRO = """
            🎥 <b>Video qo'llanmalar</b>

            Kerakli bo'lim bo'yicha video qo'llanmani oling:""";

    private final TelegramApiClient telegram;
    private final GuideClient guides;

    /** Har tugma alohida qatorda: qo'llanma nomlari uzun bo'ladi. */
    static List<List<CallbackButton>> keyboardOf(List<GuideClient.GuideButtonView> buttons) {
        return buttons.stream()
                .map(b -> List.of(new CallbackButton(b.label(), GuideCallback.of(b.guideId()))))
                .toList();
    }

    /** `/start` dan keyin — tugmalar bo'lmasa hech narsa yuborilmaydi. */
    public void sendList(long chatId) {
        List<GuideClient.GuideButtonView> buttons = guides.buttons();
        if (buttons.isEmpty()) return;
        telegram.sendMessageWithCallbacks(String.valueOf(chatId), INTRO, keyboardOf(buttons));
    }

    /**
     * Tugma bosildi.
     *
     * <p>Eski xabar O'CHIRILADI va video yangi xabar bo'lib keladi:
     * matnli xabarni videoga aylantirib bo'lmaydi.
     *
     * <p>Tugmalar video xabariga ham qo'shiladi — aks holda foydalanuvchi
     * bitta qo'llanmani ko'rgach boshqasiga o'ta olmay, `/start` ni qayta
     * bosishga majbur bo'lardi.
     */
    public void onCallback(JsonNode callbackQuery) {
        String callbackId = callbackQuery.path("id").asText("");
        // Birinchi navbatda tasdiq: usiz tugmada aylanuvchi belgi osilib
        // turadi va bot javob bermayapti deb ko'rinadi.
        if (!callbackId.isEmpty()) telegram.answerCallbackQuery(callbackId);

        Optional<UUID> guideId = GuideCallback.parse(callbackQuery.path("data").asText(null));
        if (guideId.isEmpty()) return;

        List<GuideClient.GuideButtonView> buttons = guides.buttons();
        Optional<GuideClient.GuideButtonView> guide = buttons.stream()
                .filter(b -> b.guideId().equals(guideId.get()))
                .findFirst();
        if (guide.isEmpty()) {
            log.info("Qo'llanma topilmadi (o'chirilgan bo'lishi mumkin): {}", guideId.get());
            return;
        }

        JsonNode message = callbackQuery.path("message");
        String chatId = message.path("chat").path("id").asText("");
        if (chatId.isEmpty()) return;

        // Avval YUBORAMIZ, keyin o'chiramiz. Teskarisi bo'lsa va yuborish
        // yiqilsa, foydalanuvchi qo'lida hech narsa qolmaydi: ro'yxat ham
        // yo'q, video ham yo'q, sabab ham ko'rinmaydi.
        boolean sent = "DOCUMENT".equals(guide.get().mediaKind())
                ? telegram.sendDocumentByFileId(chatId, guide.get().videoFileId(),
                        guide.get().description(), keyboardOf(buttons)).isPresent()
                : telegram.sendVideoByFileId(chatId, guide.get().videoFileId(),
                        guide.get().description(), keyboardOf(buttons)).isPresent();

        if (!sent) {
            log.warn("Qo'llanma {} yuborilmadi — ro'yxat joyida qoldirildi", guideId.get());
            return;
        }

        long messageId = message.path("message_id").asLong(0);
        if (messageId > 0) telegram.deleteMessage(chatId, messageId);
    }
}
