package uz.efbazaar.marketplace.emoji;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.net.URLEncoder;

/**
 * To'plamni bot servisidan so'raydi — bot tokeni faqat unda.
 *
 * <p>Xatoni o'z holicha o'tkazib yubormaymiz: admin havolani qo'yganda
 * "topilmadi" ni darrov ko'rishi kerak, "ichki xato" emas.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BotEmojiClient {

    @Qualifier("botClient")
    private final RestClient botClient;

    public TelegramEmojiSet fetch(String setName) {
        try {
            return botClient.get()
                    .uri("/bot/internal/emoji/sets/{name}",
                            URLEncoder.encode(setName, StandardCharsets.UTF_8))
                    .retrieve()
                    .body(TelegramEmojiSet.class);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Emoji to'plamini olishda xato: {} — {}", setName, e.getMessage());
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Telegram'da bunday emoji to'plami topilmadi: " + setName);
        }
    }
}
