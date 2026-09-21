package uz.efbazaar.marketplace.account;

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

/**
 * Akkount tarkibi alohida qatorlarda — {@code ListingCardInventory} bilan
 * bir xil shakl va bir xil qoidalar.
 *
 * <p>Nega JSON ichida qoldirilmadi: o'yinchi bo'yicha qidiruv va
 * statistikaning barchasi qatorlarga tayanadi, e'lon tomonida esa bu ish
 * allaqachon shunday qilingan. Ikki xil saqlash usuli bo'lsa, har so'rov
 * ikki marta yozilardi.
 */
@Component
@RequiredArgsConstructor
public class UserAccountCardInventory {

    private static final String INSERT = """
            INSERT INTO user_account_cards (account_id, efhub_id, player_id, ordinal, snapshot)
            VALUES (?, ?, ?, ?, ?::jsonb)
            """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    @Transactional
    public void replace(UUID accountId, Object rawCards) {
        jdbc.update("DELETE FROM user_account_cards WHERE account_id = ?", accountId);
        List<Object[]> rows = rows(accountId, rawCards);
        if (!rows.isEmpty()) {
            jdbc.batchUpdate(INSERT, rows);
        }
    }

    private List<Object[]> rows(UUID accountId, Object rawCards) {
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
            // Ikkalasidan biri yo'q bo'lsa karta jimgina tashlanadi: bitta
            // buzuq qator butun akkountni saqlab bo'lmaydigan qilmasligi kerak.
            if (efhubId == null || playerId == null) {
                continue;
            }
            rows.add(new Object[]{accountId, efhubId, playerId, ordinal++, json(card)});
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
