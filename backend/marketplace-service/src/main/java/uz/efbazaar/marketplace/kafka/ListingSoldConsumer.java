package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.service.ListingService;

/**
 * Marks the listing SOLD when trade-service reports a completed trade.
 *
 * <p>Idempotent: replays land on a listing that is already SOLD/DELETED and
 * the service short-circuits. Missing listings are logged and dropped —
 * never a rejection, so at-least-once redelivery of old events won't stall
 * the consumer group.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ListingSoldConsumer {

    private final ListingService listings;

    @KafkaListener(
            topics = "efbazaar.trade.listing-sold",
            groupId = "marketplace-listing-sold",
            properties = {"spring.json.value.default.type=uz.efbazaar.marketplace.kafka.ListingSoldDto"}
    )
    @Transactional
    public void onSold(ListingSoldDto e) {
        listings.markSold(e.listingId(), e.buyerId(), e.soldAt());
    }
}
