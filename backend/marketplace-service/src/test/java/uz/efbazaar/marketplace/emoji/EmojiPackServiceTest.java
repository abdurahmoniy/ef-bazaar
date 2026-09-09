package uz.efbazaar.marketplace.emoji;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.ArgumentCaptor;

class EmojiPackServiceTest {

    private final EmojiPackRepository packs = mock(EmojiPackRepository.class);
    private final BotEmojiClient bot = mock(BotEmojiClient.class);
    private final EmojiPackService service = new EmojiPackService(packs, bot);

    private static final UUID ADMIN = UUID.randomUUID();

    private static TelegramEmojiSet set(String name, String... ids) {
        List<TelegramEmojiSet.Item> items = new java.util.ArrayList<>();
        for (String id : ids) {
            items.add(new TelegramEmojiSet.Item(id, "🙂", "file-" + id, "thumb-" + id, "video"));
        }
        return new TelegramEmojiSet(name, name + " title", items);
    }

    @Test
    @DisplayName("yangi to'plam Telegram tartibida saqlanadi")
    void savesANewPackInTelegramsOrder() {
        when(packs.findBySetName("MixAnimeEmoji")).thenReturn(Optional.empty());
        when(bot.fetch("MixAnimeEmoji")).thenReturn(set("MixAnimeEmoji", "a", "b", "c"));
        when(packs.save(any(EmojiPack.class))).thenAnswer(i -> i.getArgument(0));

        var saved = service.add("https://t.me/addemoji/MixAnimeEmoji", ADMIN);

        assertThat(saved.setName()).isEqualTo("MixAnimeEmoji");
        assertThat(saved.count()).isEqualTo(3);

        // Saqlangan entity'ni ushlaymiz: qaytgan DTO tartibni ko'rsatmaydi,
        // tartib esa muhim — panel Telegram'dagi ketma-ketlikda chiziladi.
        ArgumentCaptor<EmojiPack> captor = ArgumentCaptor.forClass(EmojiPack.class);
        verify(packs).save(captor.capture());
        assertThat(captor.getValue().getItems()).extracting(EmojiPackItem::getCustomEmojiId)
                .containsExactly("a", "b", "c");
        assertThat(captor.getValue().getItems()).extracting(EmojiPackItem::getSortOrder)
                .containsExactly(0, 1, 2);
    }

    @Test
    @DisplayName("mavjud to'plam qayta qo'shilsa ro'yxati yangilanadi, ikkilanmaydi")
    void reAddingRefreshesInsteadOfDuplicating() {
        EmojiPack existing = EmojiPack.builder()
                .id(UUID.randomUUID()).setName("Pack").title("eski")
                .addedAt(java.time.Instant.now())
                .items(new java.util.ArrayList<>())
                .build();
        existing.getItems().add(EmojiPackItem.builder()
                .id(UUID.randomUUID()).pack(existing).customEmojiId("old")
                .emoji("🙂").fileId("f").thumbnailFileId("t").format("video").sortOrder(0)
                .build());

        when(packs.findBySetName("Pack")).thenReturn(Optional.of(existing));
        when(bot.fetch("Pack")).thenReturn(set("Pack", "x", "y"));
        when(packs.save(any(EmojiPack.class))).thenAnswer(i -> i.getArgument(0));

        var saved = service.add("https://t.me/addemoji/Pack", ADMIN);

        // To'plamdan olib tashlangan emoji bizda ham qolmasligi kerak: uning
        // id'si Telegram'da endi yaroqsiz va matnga qo'yilsa xato beradi.
        assertThat(saved.count()).isEqualTo(2);
        assertThat(saved.refreshedAt()).isNotNull();

        ArgumentCaptor<EmojiPack> captor = ArgumentCaptor.forClass(EmojiPack.class);
        verify(packs).save(captor.capture());
        assertThat(captor.getValue().getItems()).extracting(EmojiPackItem::getCustomEmojiId)
                .containsExactly("x", "y");
    }

    @Test
    @DisplayName("noto'g'ri havolada Telegram'ga umuman borilmaydi")
    void aBadLinkNeverReachesTelegram() {
        assertThatThrownBy(() -> service.add("https://t.me/addstickers/Foo", ADMIN))
                .isInstanceOf(IllegalArgumentException.class);

        verify(bot, never()).fetch(anyString());
    }
}
