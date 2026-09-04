package uz.efbazaar.bot.partner;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * {@code efbazaar.marketplace.channel-refresh-requested} ni tinglaydi
 * va yangilashni {@link ChannelRefresher} ga topshiradi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChannelRefreshConsumer {

    private final ChannelRefresher refresher;

    @KafkaListener(
            topics = "efbazaar.marketplace.channel-refresh-requested",
            groupId = "bot-channel-refresh",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.bot.partner.ChannelRefreshRequest",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onRefreshRequested(ChannelRefreshRequest e) {
        if (e == null || e.partnerChannelId() == null || e.telegramChannelId() == null) {
            // Identifikatorsiz natijani kimga yozishni bilmaymiz —
            // yubormaganimiz jimgina noto'g'ri kanalni yangilashdan yaxshi.
            log.warn("channel-refresh-requested noto'liq keldi: {}", e);
            return;
        }
        refresher.refresh(e);
    }
}
