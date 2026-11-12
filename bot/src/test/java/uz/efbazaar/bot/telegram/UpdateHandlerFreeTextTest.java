package uz.efbazaar.bot.telegram;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import uz.efbazaar.bot.access.AccessCheckClient;
import uz.efbazaar.bot.access.AccessCheckClient.Requirement;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.guide.GuideMessenger;
import uz.efbazaar.bot.partner.ChannelVerifier;
import uz.efbazaar.bot.referral.PendingReferralClient;
import uz.efbazaar.bot.settings.BotSettingsClient;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Yangi foydalanuvchi botga "salom" yoki savol yozsa jim qolmasligi kerak:
 * javobsiz bot "ishlamayapti" bo'lib ko'rinadi.
 */
@ExtendWith(MockitoExtension.class)
class UpdateHandlerFreeTextTest {

    @Mock private TelegramApiClient telegram;
    @Mock private AccessCheckClient access;
    @Mock private BotSettingsClient settings;
    @Mock private ChannelVerifier channels;
    @Mock private PendingReferralClient pendingReferrals;
    @Mock private PremiumEmojiInspector premiumEmoji;
    @Mock private GuideMessenger guides;
    @Mock private KafkaTemplate<String, Object> kafka;
    @Mock private uz.efbazaar.bot.campaign.CampaignStartClient campaigns;
    @Mock private uz.efbazaar.bot.channel.ChannelMemberTracker channelMembers;

    private UpdateHandler handler;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        var props = new TelegramProperties("token", "testbot", "http://tg.api", null,
                new TelegramProperties.Topics(1, 2, 3, 4, 5), null, null);
        handler = new UpdateHandler(telegram, access, settings, channels, pendingReferrals,
                premiumEmoji, guides, props, kafka,
                org.mockito.Mockito.mock(uz.efbazaar.bot.inline.InlineQueryHandler.class), campaigns, channelMembers);
    }

    @Test
    @SuppressWarnings("unchecked")
    void privateFreeText_repliesWithHintAndMiniAppButtons() throws Exception {
        when(access.unmet(42L)).thenReturn(List.of());

        handler.handle(mapper.readTree("""
                {"message": {"message_id": 1, "chat": {"id": 42, "type": "private"}, "from": {"id": 42},
                 "text": "salom, akkount qanday sotiladi?"}}
                """));

        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<List<List<TelegramApiClient.WebAppButton>>> keyboard = ArgumentCaptor.forClass(List.class);
        verify(telegram).sendMessageWithKeyboard(eq("42"), text.capture(), keyboard.capture());
        assertThat(text.getValue()).contains("Yordam");
        assertThat(keyboard.getValue()).flatExtracting(row -> row)
                .extracting("text").contains("🛒 Bozorni ochish");
        verifyNoInteractions(guides, settings);
    }

    @Test
    void privateSticker_withoutText_alsoGetsTheHint() throws Exception {
        when(access.unmet(42L)).thenReturn(List.of());

        handler.handle(mapper.readTree("""
                {"message": {"message_id": 1, "chat": {"id": 42, "type": "private"}, "from": {"id": 42},
                 "sticker": {"file_id": "abc"}}}
                """));

        verify(telegram).sendMessageWithKeyboard(eq("42"), anyString(), any());
    }

    @Test
    void privateFreeText_showsSubscribePrompt_whenAccessUnmet() throws Exception {
        when(access.unmet(42L)).thenReturn(List.of(
                new Requirement("efBazaar", "efbazaar", "https://t.me/efbazaar")));

        handler.handle(mapper.readTree("""
                {"message": {"message_id": 1, "chat": {"id": 42, "type": "private"}, "from": {"id": 42},
                 "text": "salom"}}
                """));

        verify(telegram).sendMessageWithLinksAndAction(eq("42"), anyString(), any(), any());
        verify(telegram, never()).sendMessageWithKeyboard(anyString(), anyString(), any());
    }

    @Test
    void groupText_isIgnored() throws Exception {
        handler.handle(mapper.readTree("""
                {"message": {"message_id": 1, "chat": {"id": -100123, "type": "supergroup"}, "from": {"id": 42},
                 "text": "salom hammaga"}}
                """));

        verifyNoInteractions(telegram, access);
    }
}
