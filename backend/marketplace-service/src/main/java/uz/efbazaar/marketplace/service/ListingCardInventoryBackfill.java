package uz.efbazaar.marketplace.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Disabled-by-default, keyset-paginated repair for listings created before
 * {@code listing_cards}. Safe to rerun: every listing inventory is replaced
 * from its current JSON snapshot and the cursor advances even after one row fails.
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "app.listing-card-backfill", name = "enabled", havingValue = "true")
public class ListingCardInventoryBackfill implements ApplicationRunner {

    private static final String PAGE_SQL = """
            SELECT listing.id, listing.attributes -> 'valuable_players' AS cards
            FROM listings listing
            WHERE (?::uuid IS NULL OR listing.id > ?::uuid)
              AND jsonb_typeof(listing.attributes -> 'valuable_players') = 'array'
              AND jsonb_array_length(listing.attributes -> 'valuable_players') > 0
              AND NOT EXISTS (
                  SELECT 1
                  FROM listing_cards inventory
                  WHERE inventory.listing_id = listing.id
              )
            ORDER BY listing.id
            LIMIT ?
            """;
    private static final TypeReference<List<Object>> LIST = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ListingCardInventory inventory;
    private final CardIdentityVerifier identities;
    private final ObjectMapper mapper;
    private final int batchSize;

    public ListingCardInventoryBackfill(
            JdbcTemplate jdbc,
            ListingCardInventory inventory,
            CardIdentityVerifier identities,
            ObjectMapper mapper,
            @Value("${app.listing-card-backfill.batch-size:200}") int batchSize) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.identities = identities;
        this.mapper = mapper;
        this.batchSize = Math.max(1, Math.min(2_000, batchSize));
    }

    @Override
    public void run(ApplicationArguments args) {
        Result result = run();
        log.info("Listing card inventory backfill finished: scanned={} updated={} failed={} cards={}",
                result.scanned(), result.updated(), result.failed(), result.cards());
    }

    public Result run() {
        UUID cursor = null;
        int scanned = 0;
        int updated = 0;
        int failed = 0;
        int cards = 0;
        while (true) {
            List<SourceRow> page = jdbc.query(PAGE_SQL,
                    (resultSet, rowNumber) -> new SourceRow(
                            resultSet.getObject("id", UUID.class),
                            resultSet.getString("cards")),
                    cursor, cursor, batchSize);
            if (page.isEmpty()) break;
            for (SourceRow source : page) {
                scanned++;
                try {
                    List<Map<String, Object>> normalized = normalizeCards(source.cardsJson());
                    inventory.replace(source.listingId(), normalized);
                    updated++;
                    cards += normalized.size();
                } catch (RuntimeException exception) {
                    failed++;
                    log.warn("Listing card backfill skipped listing {}: {}",
                            source.listingId(), exception.toString());
                }
            }
            cursor = page.getLast().listingId();
            if (page.size() < batchSize) break;
        }
        return new Result(scanned, updated, failed, cards);
    }

    List<Map<String, Object>> normalizeCards(String rawJson) {
        if (rawJson == null || rawJson.isBlank() || "null".equals(rawJson)) return List.of();
        final List<Object> rawCards;
        try {
            rawCards = mapper.readValue(rawJson, LIST);
        } catch (Exception exception) {
            throw new IllegalArgumentException("valuable_players JSON is malformed", exception);
        }

        List<Map<String, Object>> candidates = new ArrayList<>();
        Set<Long> ids = new LinkedHashSet<>();
        for (Object raw : rawCards) {
            if (!(raw instanceof Map<?, ?> card)) continue;
            Long efhubId = positiveLong(card.get("efhub_id"), card.get("efhubId"));
            if (efhubId == null) continue;
            LinkedHashMap<String, Object> copy = new LinkedHashMap<>();
            card.forEach((key, value) -> {
                if (key instanceof String stringKey
                        && !"efhubId".equals(stringKey) && !"playerId".equals(stringKey)) {
                    copy.put(stringKey, value);
                }
            });
            copy.put("efhub_id", efhubId);
            candidates.add(copy);
            ids.add(efhubId);
        }

        Map<Long, UUID> resolved = identities.resolvePlayerIds(new ArrayList<>(ids));
        List<Map<String, Object>> normalized = new ArrayList<>();
        Set<UUID> players = new HashSet<>();
        for (Map<String, Object> card : candidates) {
            long efhubId = (Long) card.get("efhub_id");
            UUID playerId = resolved.get(efhubId);
            if (playerId == null || !players.add(playerId)) continue;
            card.put("player_id", playerId.toString());
            normalized.add(card);
        }
        return normalized;
    }

    private static Long positiveLong(Object snake, Object camel) {
        Object raw = snake == null ? camel : snake;
        if (raw instanceof Number number) {
            long value = number.longValue();
            if (value > 0 && number.doubleValue() == (double) value) return value;
        }
        if (raw instanceof String value && value.matches("[0-9]+")) {
            try {
                long parsed = Long.parseLong(value);
                return parsed > 0 ? parsed : null;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    public record SourceRow(UUID listingId, String cardsJson) {}
    public record Result(int scanned, int updated, int failed, int cards) {}
}
