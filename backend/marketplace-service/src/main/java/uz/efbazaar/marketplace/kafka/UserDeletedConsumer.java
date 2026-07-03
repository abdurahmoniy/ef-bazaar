package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.LikeRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.time.Instant;

/**
 * Purges marketplace state belonging to a user removed from auth. The bulk
 * updates are idempotent (ACTIVE→DELETED/CLOSED transitions), so redelivery
 * from Kafka is a no-op.
 *
 * <p>Affects:
 * <ul>
 *   <li>All ACTIVE listings owned by the user → status = DELETED</li>
 *   <li>All ACTIVE chats where the user is buyer or seller → status = CLOSED</li>
 *   <li>All likes owned by the user → hard-deleted</li>
 * </ul>
 *
 * <p>Media messages posted to the Telegram media topic are left in place —
 * they're an audit trail and the bot never touches them after upload.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UserDeletedConsumer {

    private final ListingRepository listings;
    private final ChatRepository chats;
    private final LikeRepository likes;

    @KafkaListener(
            topics = "efbazaar.auth.user-deleted",
            groupId = "marketplace-user-deleted",
            properties = {"spring.json.value.default.type=uz.efbazaar.marketplace.kafka.UserDeletedDto"}
    )
    @Transactional
    public void onUserDeleted(UserDeletedDto e) {
        int listingsClosed = listings.softDeleteAllBySeller(e.userId());
        int chatsClosed = chats.closeAllForParticipant(e.userId(), Instant.now());
        int likesRemoved = likes.deleteAllByUserId(e.userId());

        log.info("user-deleted purged marketplace state: userId={} listings={} chats={} likes={}",
                e.userId(), listingsClosed, chatsClosed, likesRemoved);
    }
}
