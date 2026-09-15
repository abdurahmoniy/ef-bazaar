package uz.efbazaar.access.bot;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.Optional;

/**
 * Telegram so'rovlari bot orqali o'tadi — bot tokeni faqat botda turadi.
 *
 * <p>Ikki xil "yo'q" farqlanadi: 404 — Telegram javob berdi va bunday kanal
 * yo'q; boshqa har qanday xato — {@link BotUnavailableException}, ya'ni
 * javobni bilmaymiz. Login oqimi ikkinchisini "o'tkazib yubor" deb o'qiydi.
 */
@Slf4j
@Component
public class BotClient {

    private final RestClient bot;

    public BotClient(@Qualifier("botRestClient") RestClient bot) {
        this.bot = bot;
    }

    public Optional<ChannelInfo> resolveChannel(String username) {
        try {
            return Optional.ofNullable(bot.get()
                    .uri(u -> u.path("/bot/internal/channels/resolve").queryParam("username", username).build())
                    .retrieve()
                    .body(ChannelInfo.class));
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == HttpStatus.NOT_FOUND.value()) return Optional.empty();
            throw new BotUnavailableException("resolve " + e.getStatusCode(), e);
        } catch (Exception e) {
            throw new BotUnavailableException("resolve failed: " + e.getMessage(), e);
        }
    }

    public MemberStatus memberStatus(long chatId, long userId) {
        try {
            MemberStatus status = bot.get()
                    .uri("/bot/internal/channels/{chatId}/members/{userId}", chatId, userId)
                    .retrieve()
                    .body(MemberStatus.class);
            if (status == null) throw new BotUnavailableException("empty member status", null);
            return status;
        } catch (BotUnavailableException e) {
            throw e;
        } catch (Exception e) {
            throw new BotUnavailableException("member status failed: " + e.getMessage(), e);
        }
    }

    /** Kanal haqida bot bilgan narsa. {@code botStatus} — botning shu kanaldagi maqomi. */
    public record ChannelInfo(long chatId, String type, String title, String username,
                              String photoFileId, String botStatus) {}

    /** {@code member} — Telegram'ning o'z hisobi (restricted ham a'zo bo'lishi mumkin). */
    public record MemberStatus(String status, boolean member) {}

    public static class BotUnavailableException extends RuntimeException {
        public BotUnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
