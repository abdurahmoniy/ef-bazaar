package uz.efbazaar.recommendation.projection;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/** Xom JSON → o'z record'larimiz → ProjectionWriter. O'qib bo'lmasa xato DLT'ga ketadi. */
@Slf4j
@Component
public class SnapshotConsumers {

    private final ObjectMapper mapper;
    private final ProjectionWriter writer;

    public SnapshotConsumers(ObjectMapper mapper, ProjectionWriter writer) {
        this.mapper = mapper;
        this.writer = writer;
    }

    @KafkaListener(topics = ProjectionTopics.LISTING_SNAPSHOT)
    public void onListing(String payload) throws JsonProcessingException {
        Snapshots.ListingSnapshot snapshot = mapper.readValue(payload, Snapshots.ListingSnapshot.class);
        if (versioned(ProjectionTopics.LISTING_SNAPSHOT, snapshot.idempotencyKey(), snapshot.version())) {
            writer.applyListing(snapshot);
        }
    }

    @KafkaListener(topics = ProjectionTopics.CARD_SNAPSHOT)
    public void onCard(String payload) throws JsonProcessingException {
        Snapshots.CardSnapshot snapshot = mapper.readValue(payload, Snapshots.CardSnapshot.class);
        if (versioned(ProjectionTopics.CARD_SNAPSHOT, snapshot.idempotencyKey(), snapshot.version())) {
            writer.applyCard(snapshot);
        }
    }

    @KafkaListener(topics = ProjectionTopics.LIKE_TOGGLED)
    public void onLike(String payload) throws JsonProcessingException {
        Snapshots.LikeToggled snapshot = mapper.readValue(payload, Snapshots.LikeToggled.class);
        if (versioned(ProjectionTopics.LIKE_TOGGLED, snapshot.idempotencyKey(), snapshot.version())) {
            writer.applyLike(snapshot);
        }
    }

    /**
     * Snapshot'dan oldingi format: like-toggled topic'ida A bosqichigacha marketplace kalitsiz va
     * version'siz event yozgan, ular Kafka segmentida hali turishi mumkin. Ularni projection'ga
     * qo'yib bo'lmaydi (eski holatni to'sadigan version yo'q) — o'tkaziladi; replay to'liq holatni beradi.
     */
    private static boolean versioned(String topic, String idempotencyKey, long version) {
        if (idempotencyKey == null || idempotencyKey.isBlank() || version <= 0) {
            log.warn("{}: version'siz (eski formatdagi) xabar o'tkazib yuborildi", topic);
            return false;
        }
        return true;
    }
}
