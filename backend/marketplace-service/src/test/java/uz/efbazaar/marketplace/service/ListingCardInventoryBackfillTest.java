package uz.efbazaar.marketplace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ListingCardInventoryBackfillTest {

    @Test
    void normalization_isIdempotentAndSkipsMalformedOrUnknownCards() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ListingCardInventory inventory = mock(ListingCardInventory.class);
        CardIdentityVerifier identities = mock(CardIdentityVerifier.class);
        UUID playerId = UUID.randomUUID();
        when(identities.resolvePlayerIds(List.of(10L, 99L))).thenReturn(Map.of(10L, playerId));
        ListingCardInventoryBackfill backfill = new ListingCardInventoryBackfill(
                jdbc, inventory, identities, new ObjectMapper(), 100);

        String legacy = """
                [{"efhubId":10,"name":"Messi"},{"name":"bad"},"legacy",{"efhub_id":99,"name":"unknown"}]
                """;
        List<Map<String, Object>> normalized = backfill.normalizeCards(legacy);

        assertThat(normalized).singleElement().satisfies(card -> assertThat(card)
                .containsEntry("efhub_id", 10L)
                .containsEntry("player_id", playerId.toString())
                .containsEntry("name", "Messi"));
        when(identities.resolvePlayerIds(List.of(10L))).thenReturn(Map.of(10L, playerId));
        assertThat(backfill.normalizeCards(new ObjectMapper().writeValueAsString(normalized)))
                .isEqualTo(normalized);
    }

    @SuppressWarnings("unchecked")
    @Test
    void run_continuesAfterOneMalformedOrFailedListingAndCanFinishTheCursor() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ListingCardInventory inventory = mock(ListingCardInventory.class);
        CardIdentityVerifier identities = mock(CardIdentityVerifier.class);
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        when(jdbc.query(anyString(), any(RowMapper.class),
                nullable(UUID.class), nullable(UUID.class), anyInt()))
                .thenReturn(List.of(
                        new ListingCardInventoryBackfill.SourceRow(first, "[{\"efhub_id\":10}]"),
                        new ListingCardInventoryBackfill.SourceRow(second, "[{\"efhub_id\":10}]")))
                .thenReturn(List.of());
        when(identities.resolvePlayerIds(List.of(10L))).thenReturn(Map.of(10L, playerId));
        doThrow(new IllegalStateException("first write failed")).when(inventory).replace(eq(first), any());
        ListingCardInventoryBackfill backfill = new ListingCardInventoryBackfill(
                jdbc, inventory, identities, new ObjectMapper(), 2);

        ListingCardInventoryBackfill.Result result = backfill.run();

        assertThat(result.scanned()).isEqualTo(2);
        assertThat(result.updated()).isEqualTo(1);
        assertThat(result.failed()).isEqualTo(1);
        verify(inventory).replace(second, List.of(Map.of(
                "efhub_id", 10L,
                "player_id", playerId.toString())));
    }
}
