package uz.efbazaar.marketplace.event;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;

import java.time.Instant;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class MarketplaceEventPublisher {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public void listingCreated(Listing l) {
        send(MarketplaceEvents.TOPIC_LISTING_CREATED, l.getId().toString(),
                new MarketplaceEvents.ListingCreated(
                        l.getId(), l.getSellerId(), l.getPrice(),
                        l.getAttributes(),
                        Instant.now()));
    }

    public void listingUpdated(Listing l) {
        send(MarketplaceEvents.TOPIC_LISTING_UPDATED, l.getId().toString(),
                new MarketplaceEvents.ListingUpdated(l.getId(), l.getSellerId(), Instant.now()));
    }

    public void listingDeleted(UUID listingId, UUID sellerId, ListingStatus newStatus) {
        send(MarketplaceEvents.TOPIC_LISTING_DELETED, listingId.toString(),
                new MarketplaceEvents.ListingDeleted(listingId, sellerId, newStatus, Instant.now()));
    }

    public void chatCreated(UUID chatId, UUID listingId, UUID buyerId, UUID sellerId) {
        send(MarketplaceEvents.TOPIC_CHAT_CREATED, chatId.toString(),
                new MarketplaceEvents.ChatCreated(chatId, listingId, buyerId, sellerId, Instant.now()));
    }

    public void userBlacklisted(UUID penaltyId, UUID userId, String penaltyType,
                                String reason, Instant expiresAt) {
        send(MarketplaceEvents.TOPIC_USER_BLACKLISTED, userId.toString(),
                new MarketplaceEvents.UserBlacklisted("bl-" + penaltyId, userId, penaltyType,
                        reason, expiresAt, Instant.now()));
    }

    public void userUnblacklisted(UUID penaltyId, UUID userId, String cause) {
        send(MarketplaceEvents.TOPIC_USER_UNBLACKLISTED, userId.toString(),
                new MarketplaceEvents.UserUnblacklisted("unbl-" + penaltyId, userId, cause,
                        Instant.now()));
    }

    /**
     * Bot /start xabari o'zgardi — bot keshini darhol yangilashi kerak.
     *
     * <p>Payload'da matnning O'ZI yo'q, faqat "o'zgardi" signali. Bot uni
     * eshitgach ichki API'dan qayta tortadi. Sabab: bitta manba qoladi.
     * Matnni event ichida yuborsak, bot uni ikki yo'ldan olardi va ular
     * bir-biriga zid bo'lishi mumkin edi — masalan event kechikib kelib
     * yangiroq keshni eski matn bilan almashtirardi.
     */
    public void botSettingsUpdated(UUID adminId) {
        send(MarketplaceEvents.TOPIC_BOT_SETTINGS_UPDATED, "bot-settings",
                new MarketplaceEvents.BotSettingsUpdated(adminId, Instant.now()));
    }

    /** Called after commit by {@code AccountEmailUnlinks}. */
    public void accountEmailUnlinked(UUID accountId, UUID ownerId, UUID mailboxId, String reason) {
        send(MarketplaceEvents.TOPIC_ACCOUNT_EMAIL_UNLINKED, accountId.toString(),
                new MarketplaceEvents.AccountEmailUnlinked(accountId, ownerId, mailboxId, reason, Instant.now()));
    }

    private void send(String topic, String key, Object event) {
        kafkaTemplate.send(topic, key, event)
                .whenComplete((r, ex) -> {
                    if (ex != null) {
                        log.error("Failed to publish to {} key={}: {}", topic, key, ex.getMessage());
                    } else {
                        log.debug("Published to {} key={}", topic, key);
                    }
                });
    }
}
