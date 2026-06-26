package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.domain.ChatStatus;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.repository.ChatRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Aktiv chatlarni 24 soatdan keyin avtomatik yopadi.
 * Ikki tarafdan biri {@code important = true} qilgan bo'lsa, yopilmaydi.
 * Yopilganda {@code efbazaar.marketplace.chat-expired} Kafka eventi e'lon qilinadi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChatExpirationScheduler {

    private final ChatRepository chats;
    private final MarketplaceEventPublisher events;

    @Value("${app.chat.expire-after-hours:24}")
    private long expireAfterHours;

    /** Har 5 daqiqada bir marta tekshiruv. */
    @Scheduled(fixedDelayString = "${app.chat.expire-check-interval-ms:300000}",
               initialDelayString = "${app.chat.expire-check-initial-delay-ms:60000}")
    @Transactional
    public void expireStaleChats() {
        Instant cutoff = Instant.now().minus(Duration.ofHours(expireAfterHours));
        List<Chat> expired = chats.findExpired(cutoff);

        if (expired.isEmpty()) {
            log.debug("No chats to expire (cutoff={})", cutoff);
            return;
        }

        Instant now = Instant.now();
        for (Chat chat : expired) {
            chat.setStatus(ChatStatus.CLOSED);
            chat.setClosedAt(now);
            events.chatExpired(chat.getId(), chat.getListingId(),
                    chat.getBuyerId(), chat.getSellerId(), "auto_expired_24h");
        }
        log.info("Auto-expired {} chats older than {}h", expired.size(), expireAfterHours);
    }
}
