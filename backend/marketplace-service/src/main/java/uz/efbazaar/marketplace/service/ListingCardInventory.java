package uz.efbazaar.marketplace.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Transactional mirror of the seller-declared valuable card snapshots. */
@Component
@RequiredArgsConstructor
public class ListingCardInventory {

    private static final String INSERT = """
            INSERT INTO listing_cards (listing_id, efhub_id, player_id, ordinal, snapshot)
            VALUES (?, ?, ?, ?, ?::jsonb)
            """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    @Transactional
    public void replace(UUID listingId, Object rawCards) {
        jdbc.update("DELETE FROM listing_cards WHERE listing_id = ?", listingId);
        List<Object[]> rows = rows(listingId, rawCards);
        if (!rows.isEmpty()) {
            jdbc.batchUpdate(INSERT, rows);
        }
    }

    private List<Object[]> rows(UUID listingId, Object rawCards) {
        if (!(rawCards instanceof List<?> cards)) {
            return List.of();
        }
        List<Object[]> rows = new ArrayList<>(cards.size());
        int ordinal = 0;
        for (Object raw : cards) {
            if (!(raw instanceof Map<?, ?> card)) {
                continue;
            }
            Long efhubId = longValue(card.get("efhub_id"));
            UUID playerId = uuidValue(card.get("player_id"));
            if (efhubId == null || playerId == null) {
                continue;
            }
            rows.add(new Object[]{listingId, efhubId, playerId, ordinal++, json(card)});
        }
        return rows;
    }

    private String json(Map<?, ?> card) {
        try {
            return mapper.writeValueAsString(card);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("card snapshot is not serializable", e);
        }
    }

    private static Long longValue(Object raw) {
        if (raw instanceof Number number) {
            return number.longValue();
        }
        return null;
    }

    private static UUID uuidValue(Object raw) {
        if (raw instanceof UUID uuid) {
            return uuid;
        }
        if (raw instanceof String value) {
            try {
                return UUID.fromString(value);
            } catch (IllegalArgumentException ignored) {
                return null;
            }
        }
        return null;
    }
}
