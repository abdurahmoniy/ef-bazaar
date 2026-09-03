package uz.efbazaar.bot.partner;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * {@code efbazaar.marketplace.channel-post-requested} ni tinglaydi va
 * joylashni {@link ChannelPoster} ga topshiradi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChannelPostConsumer {

    private final ChannelPoster poster;

    @KafkaListener(
            topics = "efbazaar.marketplace.channel-post-requested",
            groupId = "bot-channel-post",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.bot.partner.ChannelPostRequest",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onPostRequested(ChannelPostRequest e) {
        if (e == null || e.postId() == null || e.telegramChannelId() == null) {
            // Manzilsiz yoki identifikatorsiz hodisani qaytarib bo'lmaydi —
            // natijani kimga yozishni ham bilmaymiz. Log qoldirib o'tamiz.
            log.warn("channel-post-requested noto'liq keldi: {}", e);
            return;
        }
        poster.post(e);
    }
}
