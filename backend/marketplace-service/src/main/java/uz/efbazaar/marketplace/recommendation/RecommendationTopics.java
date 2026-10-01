package uz.efbazaar.marketplace.recommendation;

import uz.efbazaar.marketplace.event.MarketplaceEvents;

/** recommendation-service uchun chiqadigan snapshot'lar. Katalog: docs/kafka-topics.md. */
public final class RecommendationTopics {

    public static final String LISTING_SNAPSHOT = "efbazaar.marketplace.listing-snapshot";
    public static final String CARD_SNAPSHOT = "efbazaar.marketplace.card-snapshot";
    public static final String LIKE_TOGGLED = MarketplaceEvents.TOPIC_LIKE_TOGGLED;

    public static final String SOURCE_LISTING = "listing";
    public static final String SOURCE_CARD = "card";
    public static final String SOURCE_LIKE = "like";

    private RecommendationTopics() {
    }

    public static String idempotencyKey(String source, String entityId, long version) {
        return source + ":" + entityId + ":" + version;
    }
}
