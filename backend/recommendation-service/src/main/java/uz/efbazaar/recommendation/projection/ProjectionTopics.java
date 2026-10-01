package uz.efbazaar.recommendation.projection;

/** marketplace chiqaradigan snapshot topic'lari. Katalog: docs/kafka-topics.md. */
public final class ProjectionTopics {

    public static final String LISTING_SNAPSHOT = "efbazaar.marketplace.listing-snapshot";
    public static final String CARD_SNAPSHOT = "efbazaar.marketplace.card-snapshot";
    public static final String LIKE_TOGGLED = "efbazaar.marketplace.like-toggled";

    private ProjectionTopics() {
    }
}
