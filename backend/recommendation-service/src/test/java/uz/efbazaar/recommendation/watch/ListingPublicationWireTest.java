package uz.efbazaar.recommendation.watch;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import uz.efbazaar.recommendation.projection.Snapshots;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ListingPublicationWireTest {
    private final ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule())
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    @Test
    void retainsAuthoritativePublicationFactsIndependentlyOfRelayTime() throws Exception {
        String published = "2026-10-01T10:00:00Z";
        var input = mapper.createObjectNode().put("idempotencyKey", "listing:wire:9")
                .put("listingId", UUID.randomUUID().toString()).put("sellerId", UUID.randomUUID().toString())
                .put("status", "ACTIVE").put("version", 9).put("publicationVersion", 2)
                .put("publishedAt", published).put("occurredAt", "2026-10-20T10:00:00Z");
        var snapshot = mapper.treeToValue(input, Snapshots.ListingSnapshot.class);
        var output = mapper.valueToTree(snapshot);
        assertThat(output.path("publicationVersion").asLong()).isEqualTo(2);
        assertThat(output.path("publishedAt").asText()).isEqualTo(published);
        assertThat(output.hasNonNull("publishedAt")).isTrue();
    }

    @Test
    void oldConstructorDoesNotInventPublicationFacts() {
        var old = new Snapshots.ListingSnapshot("old", UUID.randomUUID(), UUID.randomUUID(),
                "ACTIVE", null, null, List.of(), 1, Instant.now());
        var output = mapper.valueToTree(old);
        assertThat(output.path("publicationVersion").isNull()).isTrue();
        assertThat(output.path("publishedAt").isNull()).isTrue();
    }
}
