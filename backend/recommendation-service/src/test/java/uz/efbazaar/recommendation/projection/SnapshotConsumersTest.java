package uz.efbazaar.recommendation.projection;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/** Xabar shakli marketplace A bosqichidagi RecommendationSnapshots bilan bir xil. */
class SnapshotConsumersTest {

    // Spring Boot ObjectMapper'i bilan bir xil sozlama: noma'lum maydon xato emas, java.time bor.
    private final ObjectMapper mapper = Jackson2ObjectMapperBuilder.json().build();
    private final ProjectionWriter writer = mock(ProjectionWriter.class);
    private final SnapshotConsumers consumers = new SnapshotConsumers(mapper, writer);

    @Test
    void listingPayloadFromMarketplaceIsParsed() throws Exception {
        consumers.onListing("""
                {"idempotencyKey":"listing:3f0c2d8e-0d2a-4a43-9a3e-6b1b1c2d3e4f:7",
                 "listingId":"3f0c2d8e-0d2a-4a43-9a3e-6b1b1c2d3e4f",
                 "sellerId":"8b9f6d55-1c55-4f7e-9e0a-0e1d2c3b4a59",
                 "status":"ACTIVE","price":150000.00,"valueScore":0.42,
                 "cards":[{"efhubId":101,"playerId":"11111111-2222-3333-4444-555555555555"}],
                 "version":7,"occurredAt":1759312800.123456789,"addedLater":"ignored"}
                """);

        ArgumentCaptor<Snapshots.ListingSnapshot> captor = ArgumentCaptor.forClass(Snapshots.ListingSnapshot.class);
        verify(writer).applyListing(captor.capture());
        Snapshots.ListingSnapshot s = captor.getValue();
        assertThat(s.listingId()).isEqualTo(UUID.fromString("3f0c2d8e-0d2a-4a43-9a3e-6b1b1c2d3e4f"));
        assertThat(s.version()).isEqualTo(7);
        assertThat(s.valueScore()).isEqualTo(0.42);
        assertThat(s.cards()).containsExactly(new Snapshots.CardRef(101,
                UUID.fromString("11111111-2222-3333-4444-555555555555")));
        assertThat(s.occurredAt()).isEqualTo(Instant.ofEpochSecond(1759312800, 123456789));
    }

    @Test
    void cardPayloadWithIsoInstantsIsParsed() throws Exception {
        consumers.onCard("""
                {"idempotencyKey":"card:777:3","efhubId":777,"playerId":null,"type":"EPIC",
                 "overallRating":103,"metaTier":"META","metaPriority":40,
                 "activeFrom":"2026-09-01T00:00:00Z","activeUntil":null,"version":3,
                 "occurredAt":"2026-10-01T10:00:00Z"}
                """);

        ArgumentCaptor<Snapshots.CardSnapshot> captor = ArgumentCaptor.forClass(Snapshots.CardSnapshot.class);
        verify(writer).applyCard(captor.capture());
        assertThat(captor.getValue().efhubId()).isEqualTo(777);
        assertThat(captor.getValue().activeFrom()).isEqualTo(Instant.parse("2026-09-01T00:00:00Z"));
        assertThat(captor.getValue().playerId()).isNull();
    }

    @Test
    void likePayloadIsParsed() throws Exception {
        consumers.onLike("""
                {"idempotencyKey":"like:u:l:2","listingId":"3f0c2d8e-0d2a-4a43-9a3e-6b1b1c2d3e4f",
                 "userId":"8b9f6d55-1c55-4f7e-9e0a-0e1d2c3b4a59","liked":false,"version":2,
                 "occurredAt":1759312800.0}
                """);

        ArgumentCaptor<Snapshots.LikeToggled> captor = ArgumentCaptor.forClass(Snapshots.LikeToggled.class);
        verify(writer).applyLike(captor.capture());
        assertThat(captor.getValue().liked()).isFalse();
        assertThat(captor.getValue().version()).isEqualTo(2);
    }

    /** Xato tashqariga chiqadi — DefaultErrorHandler uni DLT'ga qo'yadi (Review Focus 4). */
    @Test
    void malformedPayloadThrows() {
        assertThatThrownBy(() -> consumers.onListing("{not json"))
                .isInstanceOf(JsonProcessingException.class);
        verifyNoInteractions(writer);
    }

    /** A bosqichidan oldingi like-toggled (kalit va version yo'q) — jim o'tkaziladi, DLT'ga emas. */
    @Test
    void legacyPayloadWithoutKeyOrVersionIsSkipped() throws Exception {
        consumers.onLike("""
                {"listingId":"3f0c2d8e-0d2a-4a43-9a3e-6b1b1c2d3e4f",
                 "userId":"8b9f6d55-1c55-4f7e-9e0a-0e1d2c3b4a59","liked":true}
                """);
        consumers.onListing("""
                {"idempotencyKey":"listing:x:0","listingId":"3f0c2d8e-0d2a-4a43-9a3e-6b1b1c2d3e4f",
                 "status":"ACTIVE","price":1}
                """);

        verifyNoInteractions(writer);
    }
}
