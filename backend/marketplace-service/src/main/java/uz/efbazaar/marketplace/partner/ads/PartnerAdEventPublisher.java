package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import uz.efbazaar.marketplace.partner.PartnerChannel;

import java.time.Instant;
import java.util.UUID;

/** Botga "shu e'lonni shu kanalga joyla" deb aytadi. */
@Slf4j
@Component
@RequiredArgsConstructor
public class PartnerAdEventPublisher {

    public static final String TOPIC_CHANNEL_POST_REQUESTED =
            "efbazaar.marketplace.channel-post-requested";

    private final KafkaTemplate<String, Object> kafka;

    public void postRequested(ListingChannelPost post, ChannelPostPayload payload) {
        send(post.getId().toString(), payload);
    }

    /**
     * @param mediaMessageId Telegram {@code file_id}. Nomi yanglishtiradi —
     *                       {@code Listing.mediaMessageIds} aslida yuklangan
     *                       fayl identifikatorlarini saqlaydi, message_id
     *                       larni emas.
     */
    public record ChannelPostPayload(
            UUID postId,
            UUID listingId,
            Long telegramChannelId,
            String caption,
            String mediaMessageId,
            String buttonUrl,
            Instant occurredAt) {

        public static ChannelPostPayload of(ListingChannelPost post, PartnerChannel channel,
                                            String caption, String mediaMessageId, String buttonUrl) {
            return new ChannelPostPayload(post.getId(), post.getListingId(),
                    channel.getTelegramChannelId(), caption, mediaMessageId, buttonUrl, Instant.now());
        }
    }

    /**
     * Tranzaksiya ichida chaqirilsa COMMIT'dan keyin yuboriladi.
     *
     * <p>Aks holda bot postni chiqarib yuborar, tranzaksiya esa orqaga
     * qaytib, chiqqan postga mos qator qolmasdi.
     */
    private void send(String key, Object payload) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            doSend(key, payload);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { doSend(key, payload); }
        });
    }

    private void doSend(String key, Object payload) {
        kafka.send(TOPIC_CHANNEL_POST_REQUESTED, key, payload)
                .whenComplete((result, error) -> {
                    if (error != null) {
                        log.error("Kanal posti so'rovi yuborilmadi (post={})", key, error);
                    }
                });
    }
}
