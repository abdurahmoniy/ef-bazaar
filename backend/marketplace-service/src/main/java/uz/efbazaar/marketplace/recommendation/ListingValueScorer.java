package uz.efbazaar.marketplace.recommendation;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * listings.value_score ni hisoblab yozadi. Faqat o'zgargan qator yoziladi — V73 trigger'i
 * har yozuvda listing snapshot'ini belgilaydi, keraksiz snapshot'lar chiqmasin.
 * Chaqiruvchining tranzaksiyasida ishlaydi (bo'lsa).
 */
@Component
public class ListingValueScorer {

    private final JdbcTemplate jdbc;
    private final CardCatalogReader catalog;
    private final ValueScoreCalculator calculator;
    private final Clock clock;

    @Autowired
    public ListingValueScorer(@Qualifier("marketplaceJdbcTemplate") JdbcTemplate jdbc, CardCatalogReader catalog,
                              ValueScoreCalculator calculator) {
        this(jdbc, catalog, calculator, Clock.systemUTC());
    }

    ListingValueScorer(JdbcTemplate jdbc, CardCatalogReader catalog, ValueScoreCalculator calculator, Clock clock) {
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.calculator = calculator;
        this.clock = clock;
    }

    public int recompute(Collection<UUID> listingIds) {
        if (listingIds.isEmpty()) {
            return 0;
        }
        List<UUID> ids = List.copyOf(new HashSet<>(listingIds));
        String in = ids.stream().map(i -> "?").collect(Collectors.joining(", "));
        record Row(UUID id, BigDecimal price, Double current) {}
        List<Row> rows = jdbc.query("SELECT id, price, value_score FROM listings WHERE id IN (" + in + ")",
                (rs, n) -> new Row(rs.getObject("id", UUID.class), rs.getBigDecimal("price"),
                        (Double) rs.getObject("value_score")), ids.toArray());
        Map<UUID, List<Long>> cardsByListing = new HashMap<>();
        jdbc.query("SELECT listing_id, efhub_id FROM listing_cards WHERE listing_id IN (" + in + ")",
                rs -> {
                    cardsByListing.computeIfAbsent(rs.getObject("listing_id", UUID.class), k -> new ArrayList<>())
                            .add(rs.getLong("efhub_id"));
                }, ids.toArray());
        Set<Long> allCards = cardsByListing.values().stream().flatMap(List::stream).collect(Collectors.toSet());
        Map<Long, CardFacts> facts = catalog.read(allCards);
        Instant now = clock.instant();

        int written = 0;
        for (Row row : rows) {
            List<CardFacts> cards = cardsByListing.getOrDefault(row.id(), List.of()).stream()
                    .map(facts::get).filter(Objects::nonNull).toList();
            double score = calculator.score(row.price(), cards, now);
            if (row.current() == null || Math.abs(row.current() - score) > 1e-12) {
                written += jdbc.update("UPDATE listings SET value_score = ? WHERE id = ?", score, row.id());
            }
        }
        return written;
    }

    public int recomputeForCards(Collection<Long> efhubIds) {
        if (efhubIds.isEmpty()) {
            return 0;
        }
        String in = efhubIds.stream().map(i -> "?").collect(Collectors.joining(", "));
        List<UUID> listings = jdbc.queryForList(
                "SELECT DISTINCT listing_id FROM listing_cards WHERE efhub_id IN (" + in + ")",
                UUID.class, efhubIds.toArray());
        return recompute(listings);
    }

    public int backfillBatch(int limit) {
        List<UUID> ids = jdbc.queryForList(
                "SELECT id FROM listings WHERE value_score IS NULL ORDER BY id LIMIT ?", UUID.class, limit);
        return recompute(ids);
    }
}
