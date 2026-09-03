package uz.efbazaar.bot.partner;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import uz.efbazaar.bot.telegram.TelegramApiClient.UrlButton;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Kanalga joylash sinovlari.
 *
 * <p>Ikkala sinov ham bitta narsani qo'riqlaydi: sotuvchining puli e'lon
 * joylanmaguncha ushlab turiladi, shuning uchun na noto'g'ri tugma, na
 * jimgina yo'qolgan xatolik kechirilmaydi.
 */
class ChannelPosterTest {

    private static final long CHANNEL = -1001234L;

    private TelegramApiClient telegram;
    private ChannelPostResults results;
    private ChannelPoster poster;

    private final UUID postId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        telegram = mock(TelegramApiClient.class);
        results = mock(ChannelPostResults.class);
        poster = new ChannelPoster(telegram, results);
    }

    @Test
    @DisplayName("e'lon url tugmasi bilan ketadi, web_app tugmasi bilan emas")
    void usesUrlButton() {
        // web_app tugmalari FAQAT shaxsiy chatda ishlaydi. Kanalga
        // qo'yilsa Telegram xabarni umuman qabul qilmaydi.
        poster.post(request("https://efbazaar.uz/marketplace/abc?p=K7M4XQP2"));

        verify(telegram).sendMessageWithUrlButton(eq("-1001234"), anyString(),
                argThat(b -> b.url().equals("https://efbazaar.uz/marketplace/abc?p=K7M4XQP2")));
        verify(telegram, never()).sendMessageWithKeyboard(anyString(), anyString(), any());
    }

    @Test
    @DisplayName("rasmli e'lon rasm sifatida ketadi — u ham url tugmasi bilan")
    void mediaBecomesAPhoto() {
        poster.post(requestWithMedia("photo-file-id"));

        verify(telegram).sendPhotoWithUrlButton(eq("-1001234"), eq("photo-file-id"),
                anyString(), any(UrlButton.class));
        // sendPhotoWithKeyboard web_app klaviaturasini yasaydi — kanalda
        // shunday xabar rad etiladi va rasm ham chiqmaydi.
        verify(telegram, never()).sendPhotoWithKeyboard(anyString(), anyString(), anyString(), any());
    }

    @Test
    @DisplayName("yetkazilgan e'lon o'z message_id sini qaytaradi")
    void reportsSuccess() {
        when(telegram.sendMessageWithUrlButton(any(), any(), any())).thenReturn(Optional.of(4242));

        poster.post(request("https://efbazaar.uz/x"));

        verify(results).report(argThat(r ->
                postId.equals(r.postId()) && "4242".equals(r.telegramMessageId()) && r.error() == null));
    }

    @Test
    @DisplayName("rad etilgan e'lon jim qolmay, xatolikni qaytaradi")
    void reportsFailure() {
        // Jimgina qolsa sotuvchining puli ushlangan holda abadiy turardi.
        when(telegram.sendMessageWithUrlButton(any(), any(), any())).thenReturn(Optional.empty());

        poster.post(request("https://efbazaar.uz/x"));

        verify(results).report(argThat(r ->
                postId.equals(r.postId()) && r.telegramMessageId() == null && r.error() != null));
    }

    @Test
    @DisplayName("Telegram chaqiruvi otilib ketsa ham natija qaytariladi")
    void reportsThrownFailure() {
        when(telegram.sendMessageWithUrlButton(any(), any(), any()))
                .thenThrow(new RuntimeException("connection reset"));

        poster.post(request("https://efbazaar.uz/x"));

        verify(results).report(argThat(r ->
                r.telegramMessageId() == null && "connection reset".equals(r.error())));
    }

    @Test
    @DisplayName("havolasiz so'rov yuborilmaydi — xatolik sifatida qaytariladi")
    void missingUrlIsReported() {
        poster.post(new ChannelPostRequest(postId, UUID.randomUUID(), CHANNEL, "matn", null, null));

        verify(telegram, never()).sendMessageWithUrlButton(any(), any(), any());
        verify(results).report(argThat(r -> r.telegramMessageId() == null && r.error() != null));
    }

    private ChannelPostRequest request(String buttonUrl) {
        return new ChannelPostRequest(postId, UUID.randomUUID(), CHANNEL,
                "Sotiladi: kuchli akkount", null, buttonUrl);
    }

    private ChannelPostRequest requestWithMedia(String mediaMessageId) {
        return new ChannelPostRequest(postId, UUID.randomUUID(), CHANNEL,
                "Sotiladi: kuchli akkount", mediaMessageId, "https://efbazaar.uz/x");
    }
}
