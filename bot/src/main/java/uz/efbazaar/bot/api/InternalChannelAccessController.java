package uz.efbazaar.bot.api;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.telegram.TelegramApiClient;

/**
 * access-service uchun: kanalni topish va kanal a'zoligini tekshirish.
 *
 * <p>Nega bot orqali: ikkala so'rov ham bot tokenini talab qiladi va token
 * faqat shu servisda. access-service Telegram bilan to'g'ridan gaplashmaydi.
 *
 * <p>Tashqaridan kelmaydi — nginx {@code /bot/internal/} ni 404 qiladi
 * (PaymentNoticeController izohiga qarang).
 */
@RestController
@RequestMapping("/bot/internal/channels")
@RequiredArgsConstructor
public class InternalChannelAccessController {

    private final TelegramApiClient telegram;
    private final TelegramProperties props;

    public record ChannelInfo(long chatId, String type, String title, String username,
                              String photoFileId, String botStatus) {}

    public record MemberStatus(String status, boolean member) {}

    /**
     * Username bo'yicha kanal va botning undagi maqomi.
     *
     * <p>404 — kanal topilmadi. Telegram "chat not found" va tarmoq xatosini
     * bir xil bo'sh natija bilan qaytaradi, shuning uchun bu yerda ikkalasi
     * ham 404. Admin buni "topilmadi, qayta urinib ko'ring" deb ko'radi.
     */
    @GetMapping("/resolve")
    public ChannelInfo resolve(@RequestParam String username) {
        if (!username.matches("[A-Za-z0-9_]{5,32}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "username noto'g'ri");
        }
        JsonNode chat = telegram.getChatByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Kanal topilmadi"));

        long chatId = chat.path("id").asLong();
        // Bot kanalda umuman bo'lmasa Telegram xato qaytaradi — bu "admin emas".
        String botStatus = telegram.getChatMemberStatus(chatId, botUserId()).orElse(null);

        return new ChannelInfo(
                chatId,
                chat.path("type").asText(null),
                chat.path("title").asText(null),
                chat.path("username").asText(null),
                chat.path("photo").path("big_file_id").asText(null),
                botStatus);
    }

    /**
     * Foydalanuvchining kanaldagi maqomi.
     *
     * <p>503 — Telegram javob bermadi (masalan bot adminlikdan olingan). Bu
     * "a'zo emas" EMAS: access-service uni "tekshirib bo'lmadi" deb o'qiydi va
     * login'ni to'smaydi.
     */
    @GetMapping("/{chatId}/members/{userId}")
    public MemberStatus member(@PathVariable long chatId, @PathVariable long userId) {
        JsonNode member = telegram.getChatMemberResult(chatId, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.SERVICE_UNAVAILABLE, "A'zolikni tekshirib bo'lmadi"));
        String status = member.path("status").asText("");
        boolean isMember = switch (status) {
            case "creator", "administrator", "member" -> true;
            case "restricted" -> member.path("is_member").asBoolean(false);
            default -> false;
        };
        return new MemberStatus(status, isMember);
    }

    /** Bot tokeni {@code <bot_id>:<secret>} ko'rinishida — id alohida so'rovsiz olinadi. */
    private long botUserId() {
        String token = props.botToken();
        int colon = token == null ? -1 : token.indexOf(':');
        if (colon <= 0) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Bot tokeni sozlanmagan");
        }
        return Long.parseLong(token.substring(0, colon));
    }
}
