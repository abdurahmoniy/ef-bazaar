package uz.efbazaar.marketplace.botsettings;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.botsettings.BotSettingsDtos.UpdateBotSettingsRequest;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.service.MediaService;

import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Bu tekshiruvlar buzilsa oqibat bitta: Telegram xabarni rad etadi va /start
 * HECH KIMGA ishlamay qoladi. Nosozlik jimgina bo'ladi — shuning uchun
 * chegaralar aynan shu yerda qadab qo'yiladi.
 */
class BotSettingsServiceTest {

    private BotSettingsRepository repository;
    private BotSettingsService service;
    private BotSettings existing;
    private MarketplaceEventPublisher events;

    @BeforeEach
    void setUp() {
        repository = mock(BotSettingsRepository.class);
        events = mock(MarketplaceEventPublisher.class);
        service = new BotSettingsService(repository, mock(MediaService.class), events);

        existing = new BotSettings();
        existing.setWelcomeText("eski matn");
        when(repository.findById(BotSettings.SINGLETON_ID)).thenReturn(Optional.of(existing));
    }

    /** Banner qo'yilgan holat — chegara 1024 ga tushadi. */
    private void withBanner() {
        existing.setBannerFileId("AgACAgIAAxk-fake-file-id");
    }

    private BotSettings save(String text) {
        return service.updateWelcomeText(new UpdateBotSettingsRequest(text), UUID.randomUUID());
    }

    @Test
    @DisplayName("Bot signali tranzaksiya YAKUNLANGANDAN keyin chiqadi")
    void publishesAfterCommitNotDuringTransaction() {
        // Tranzaksiya ochiq holatini taqlid qilamiz.
        TransactionSynchronizationManager.initSynchronization();
        try {
            save("<b>yangi</b> matn");

            // Commit hali bo'lmagan. Agar signal shu paytda ketsa, bot
            // sozlamani so'rab ESKI matnni o'qiydi va uni 6 soatga keshlaydi —
            // admin saqlagan matn olti soat ko'rinmay qoladi.
            verify(events, never()).botSettingsUpdated(any());

            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(TransactionSynchronization::afterCommit);

            verify(events).botSettingsUpdated(any());
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    @DisplayName("Tranzaksiyasiz chaqiruvda signal darhol chiqadi")
    void publishesImmediatelyWithoutTransaction() {
        save("matn");
        verify(events).botSettingsUpdated(any());
    }

    @Test
    @DisplayName("Ruxsat etilgan teglar saqlanadi")
    void acceptsSupportedHtml() {
        BotSettings saved = save("<b>efBazaar</b> — <i>bozor</i>\n<a href=\"https://efbazaar.uz\">sayt</a>");
        assertThat(saved.getWelcomeText()).contains("<b>efBazaar</b>");
    }

    @Test
    @DisplayName("Telegram bilmaydigan teg rad etiladi")
    void rejectsUnsupportedTag() {
        assertThatThrownBy(() -> save("<div>salom</div>"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("<div>");
    }

    @Test
    @DisplayName("Yopilmagan teg rad etiladi")
    void rejectsUnclosedTag() {
        assertThatThrownBy(() -> save("<b>salom"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("yopilmagan");
    }

    @Test
    @DisplayName("Chalkash yopuvchi teg rad etiladi")
    void rejectsMismatchedTag() {
        assertThatThrownBy(() -> save("<b><i>salom</b></i>"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("mos kelmadi");
    }

    @Test
    @DisplayName("Uzunlik teglarsiz o'lchanadi — teglar chegarani yemaydi")
    void tagsDoNotCountTowardTheLimit() {
        withBanner();
        // 1024 ta ko'rinadigan belgi, ustiga 700 baytlik teg. Agar uzunlik
        // xom matndan olinsa bu rad etiladi — Telegram esa qabul qiladi.
        String visible = "a".repeat(BotSettingsService.CAPTION_MAX_LENGTH);
        String withTags = "<b></b>".repeat(100) + visible;

        assertThatCode(() -> save(withTags)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Banner bor: 1024 dan uzun matn rad etiladi")
    void rejectsOverlongCaptionWhenBannerPresent() {
        withBanner();
        assertThatThrownBy(() -> save("a".repeat(BotSettingsService.CAPTION_MAX_LENGTH + 1)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("1024");
    }

    @Test
    @DisplayName("Banner yo'q: o'sha matn bemalol saqlanadi")
    void allowsLongTextWithoutBanner() {
        // Aynan yuqoridagi matn. Chegara bannerdan kelib chiqadi, matndan emas —
        // bitta qiymat ikki holatda ikki xil natija berishi shuni isbotlaydi.
        assertThatCode(() -> save("a".repeat(BotSettingsService.CAPTION_MAX_LENGTH + 1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Banner yo'q: 4096 dan uzun matn baribir rad etiladi")
    void rejectsOverlongPlainMessage() {
        assertThatThrownBy(() -> save("a".repeat(BotSettingsService.TEXT_MAX_LENGTH + 1)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("4096");
    }

    @Test
    @DisplayName("Uzun matn ustiga banner yuklab bo'lmaydi — teskari yo'nalish")
    void rejectsBannerWhenExistingTextIsTooLong() {
        // Chegarani faqat matn saqlanayotganda tekshirish YETARLI EMAS:
        // 2000 belgilik matn bannersiz qonuniy saqlanadi, keyin banner
        // yoqilsa xabar Telegram uchun yaroqsiz bo'lib qoladi.
        existing.setWelcomeText("a".repeat(2000));

        MockMultipartFile image = new MockMultipartFile(
                "file", "banner.jpg", "image/jpeg", new byte[]{1, 2, 3});

        assertThatThrownBy(() -> service.updateBanner(image, UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("1024");
    }

    @Test
    @DisplayName("Surrogat juftlikli emoji ikki birlik egallaydi")
    void astralEmojiCountsAsTwoUnits() {
        withBanner();
        // 📋 = U+1F4CB, BMP dan tashqarida, ya'ni UTF-16 da ikkita birlik.
        // 513 ta = 1026 birlik. Agar kod belgilarni (code point) sanaganda
        // edi, 513 ni ko'rib "sig'adi" derdi — Telegram esa rad etardi.
        assertThat("📋".length()).isEqualTo(2);
        assertThatThrownBy(() -> save("📋".repeat(513)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    @DisplayName("BMP ichidagi emoji bitta birlik — chegarani ikki barobar yemaydi")
    void bmpEmojiCountsAsOneUnit() {
        withBanner();
        // ⚽ = U+26BD, BMP ichida. "Emoji har doim ikkita" degan taxmin
        // noto'g'ri: 1024 tasi bemalol sig'adi.
        assertThat("⚽".length()).isEqualTo(1);
        assertThatCode(() -> save("⚽".repeat(BotSettingsService.CAPTION_MAX_LENGTH)))
                .doesNotThrowAnyException();
    }
}
