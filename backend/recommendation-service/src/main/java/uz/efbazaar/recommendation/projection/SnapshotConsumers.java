package uz.efbazaar.recommendation.projection;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/** Xom JSON → o'z record'larimiz → ProjectionWriter. O'qib bo'lmasa xato DLT'ga ketadi. */
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
        writer.applyListing(mapper.readValue(payload, Snapshots.ListingSnapshot.class));
    }

    @KafkaListener(topics = ProjectionTopics.CARD_SNAPSHOT)
    public void onCard(String payload) throws JsonProcessingException {
        writer.applyCard(mapper.readValue(payload, Snapshots.CardSnapshot.class));
    }

    @KafkaListener(topics = ProjectionTopics.LIKE_TOGGLED)
    public void onLike(String payload) throws JsonProcessingException {
        writer.applyLike(mapper.readValue(payload, Snapshots.LikeToggled.class));
    }
}
