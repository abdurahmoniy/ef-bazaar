package uz.efbazaar.marketplace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ListingCardInventoryTest {

    @SuppressWarnings("unchecked")
    @Test
    void replacement_deletes_stale_rows_and_inserts_ordered_snapshots() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ListingCardInventory inventory = new ListingCardInventory(jdbc, new ObjectMapper());
        UUID listingId = UUID.randomUUID();
        UUID messiId = UUID.randomUUID();
        UUID ronaldoId = UUID.randomUUID();

        inventory.replace(listingId, List.of(
                Map.of("efhub_id", 101L, "player_id", messiId.toString(), "name", "Messi"),
                Map.of("efhub_id", 202L, "player_id", ronaldoId.toString(), "name", "Ronaldo")));

        verify(jdbc).update("DELETE FROM listing_cards WHERE listing_id = ?", listingId);
        ArgumentCaptor<List<Object[]>> rows = ArgumentCaptor.forClass(List.class);
        verify(jdbc).batchUpdate(anyString(), rows.capture());
        assertThat(rows.getValue()).hasSize(2);
        assertThat(rows.getValue().get(0)).startsWith(listingId, 101L, messiId, 0);
        assertThat(new ObjectMapper().readTree((String) rows.getValue().get(0)[4]))
                .isEqualTo(new ObjectMapper().readTree(
                        "{\"efhub_id\":101,\"player_id\":\"" + messiId + "\",\"name\":\"Messi\"}"));
        assertThat(rows.getValue().get(1)[3]).isEqualTo(1);
    }

    @Test
    void missing_or_legacy_inventory_only_removes_stale_rows() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ListingCardInventory inventory = new ListingCardInventory(jdbc, new ObjectMapper());
        UUID listingId = UUID.randomUUID();

        inventory.replace(listingId, List.of("Messi", Map.of("name", "Ronaldo")));

        verify(jdbc).update("DELETE FROM listing_cards WHERE listing_id = ?", listingId);
        verify(jdbc, org.mockito.Mockito.never()).batchUpdate(anyString(), eq(List.of()));
    }
}
