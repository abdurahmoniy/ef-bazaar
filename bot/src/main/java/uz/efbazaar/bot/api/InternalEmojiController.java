package uz.efbazaar.bot.api;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.bot.emoji.EmojiSetReader;
import uz.efbazaar.bot.emoji.EmojiSetView;
import uz.efbazaar.bot.telegram.TelegramApiClient;

/**
 * Emoji to'plamini Telegram'dan o'qiydi — marketplace shu orqali import qiladi.
 *
 * <p>Nega bot: to'plamni so'rash uchun bot tokeni kerak va u faqat shu
 * servisda. Marketplace tokenni bilmaydi va bilishi ham kerak emas.
 *
 * <p>Nega sinxron HTTP, Kafka emas: admin havolani qo'yganda "topildimi yoki
 * yo'qmi" degan javobni darrov ko'rishi kerak. Kafka bilan u "yuborildi" deb
 * chiqib, xato bo'lsa hech qachon bilmasdi.
 *
 * <p>Tashqaridan kelmaydi — nginx `/bot/internal/` prefiksini 404 qiladi.
 */
@RestController
@RequestMapping("/bot/internal/emoji")
@RequiredArgsConstructor
public class InternalEmojiController {

    private final TelegramApiClient telegram;
    private final EmojiSetReader reader;

    @GetMapping("/sets/{name}")
    public EmojiSetView set(@PathVariable String name) {
        return telegram.getStickerSet(name)
                .map(reader::read)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Bunday emoji to'plami topilmadi: " + name));
    }
}
