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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UpdateHandlerAccessGateTest {

    @Mock private TelegramApiClient telegram;
    @Mock private AccessCheckClient access;
    @Mock private BotSettingsClient settings;
    @Mock private ChannelVerifier channels;
    @Mock private PendingReferralClient pendingReferrals;
    @Mock private PremiumEmojiInspector premiumEmoji;
    @Mock private GuideMessenger guides;
    @Mock private KafkaTemplate<String, Object> kafka;
    @Mock private uz.efbazaar.bot.campaign.CampaignStartClient campaigns;

    private UpdateHandler handler;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        var props = new TelegramProperties("token", "testbot", "http://tg.api", null,
                new TelegramProperties.Topics(1, 2, 3, 4, 5), null, null);
        handler = new UpdateHandler(telegram, access, settings, channels, pendingReferrals,
                premiumEmoji, guides, props, kafka,
                org.mockito.Mockito.mock(uz.efbazaar.bot.inline.InlineQueryHandler.class), campaigns);
    }

    @Test
    @SuppressWarnings("unchecked")
    void start_showsSubscribePrompt_insteadOfWebAppButtons_whenUnmet() throws Exception {
        UUID guideId = UUID.randomUUID();
        when(access.unmet(42L)).thenReturn(List.of(
                new Requirement("efBazaar", "efbazaar", "https://t.me/efbazaar")));

        handler.handle(mapper.readTree("""
                {"message": {"message_id": 1, "chat": {"id": 42}, "from": {"id": 42},
                 "text": "/start guide_%s"}}
                """.formatted(guideId)));

        ArgumentCaptor<List<TelegramApiClient.UrlButton>> links = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<TelegramApiClient.CallbackButton> action =
                ArgumentCaptor.forClass(TelegramApiClient.CallbackButton.class);
        verify(telegram).sendMessageWithLinksAndAction(eq("42"), anyString(), links.capture(), action.capture());
        assertThat(links.getValue()).extracting("url").containsExactly("https://t.me/efbazaar");
        assertThat(action.getValue().data()).isEqualTo("access:check:" + guideId);
        verify(telegram, never()).sendMessageWithKeyboard(anyString(), anyString(), any());
        verifyNoInteractions(settings, guides);
    }

    @Test
    void checkButton_alertsAndKeepsPrompt_whenStillUnmet() throws Exception {
        when(access.unmet(42L)).thenReturn(List.of(new Requirement("efBazaar", "efbazaar", "https://t.me/efbazaar")));

        handler.handle(mapper.readTree("""
                {"callback_query": {"id": "cb1", "from": {"id": 42}, "data": "access:check",
                 "message": {"message_id": 7, "chat": {"id": 42}}}}
                """));

        verify(telegram).answerCallbackQuery(eq("cb1"), anyString(), eq(true));
        verify(telegram, never()).deleteMessage(anyString(), anyLong());
        verifyNoInteractions(guides);
    }

    @Test
    void checkButton_isNotRoutedToGuides() throws Exception {
        when(access.unmet(42L)).thenReturn(List.of(new Requirement(null, "efbazaar", "https://t.me/efbazaar")));

        handler.handle(mapper.readTree("""
                {"callback_query": {"id": "cb1", "from": {"id": 42}, "data": "access:check",
                 "message": {"message_id": 7, "chat": {"id": 42}}}}
                """));

        verify(guides, never()).onCallback(any());
        verify(telegram, never()).answerCallbackQuery(anyString());
        verify(telegram).answerCallbackQuery(anyString(), anyString(), anyBoolean());
    }

    @Test
    void accessCallbackGuideId_parsesOptionalGuide() {
        UUID id = UUID.randomUUID();
        assertThat(UpdateHandler.accessCallbackGuideId("access:check:" + id)).isEqualTo(id);
        assertThat(UpdateHandler.accessCallbackGuideId("access:check")).isNull();
        assertThat(UpdateHandler.accessCallbackGuideId("access:check:broken")).isNull();
    }

    @Test
    void start_remembersCampaign_beforeTheAccessGate() throws Exception {
        // Obuna talab qilinsa ham manba yo'qolmasligi kerak: guruhdagi
        // postdan kelgan odam avval kanalga obuna bo'ladi, keyin kiradi.
        when(access.unmet(42L)).thenReturn(List.of(
                new Requirement("efBazaar", "efbazaar", "https://t.me/efbazaar")));

        handler.handle(mapper.readTree("""
                {"message": {"message_id": 1, "chat": {"id": 42}, "from": {"id": 42},
                 "text": "/start c_GRP23456"}}
                """));

        verify(campaigns).remember(42L, "GRP23456");
        verifyNoInteractions(pendingReferrals);
    }
}
