package uz.efbazaar.bot.telegram;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;
import uz.efbazaar.bot.access.AccessCheckClient;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.guide.GuideMessenger;
import uz.efbazaar.bot.inline.InlineQueryHandler;
import uz.efbazaar.bot.partner.ChannelVerifier;
import uz.efbazaar.bot.referral.PendingReferralClient;
import uz.efbazaar.bot.settings.BotSettingsClient;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class UpdateHandlerInlineTest {

    @Test
    @SuppressWarnings("unchecked")
    void anInlineQueryGoesToTheInlineHandlerOnly() {
        TelegramApiClient telegram = mock(TelegramApiClient.class);
        InlineQueryHandler inline = mock(InlineQueryHandler.class);
        var props = new TelegramProperties("token", "testbot", "http://tg.api", null,
                new TelegramProperties.Topics(1, 2, 3, 4, 5), null, null);
        UpdateHandler handler = new UpdateHandler(telegram, mock(AccessCheckClient.class),
                mock(BotSettingsClient.class), mock(ChannelVerifier.class), mock(PendingReferralClient.class),
                mock(PremiumEmojiInspector.class), mock(GuideMessenger.class), props,
                mock(KafkaTemplate.class), inline, mock(uz.efbazaar.bot.campaign.CampaignStartClient.class));

        ObjectNode update = new ObjectMapper().createObjectNode();
        update.putObject("inline_query").put("id", "Q1");
        handler.handle(update);

        verify(inline).handle(update.path("inline_query"));
        verifyNoInteractions(telegram);
    }
}
