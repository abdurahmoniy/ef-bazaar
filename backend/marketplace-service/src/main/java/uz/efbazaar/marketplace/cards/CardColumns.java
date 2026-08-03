package uz.efbazaar.marketplace.cards;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Which optional columns the card tables currently have.
 *
 * <p>The {@code efbazaar} DB is not Flyway-managed — its schema is applied by
 * {@code setup-db.sh} or best-effort by {@link CardSchemaBootstrap}, either of
 * which can be behind the deployed code or fail outright (no shell access, DB
 * user without ALTER). When that happens a query naming {@code meta_tier} or
 * {@code max_overall_rating} fails with {@code 42703}, and since the card
 * endpoints are public, marketplace search breaks for everyone.
 *
 * <p>So the reader treats both columns as optional and substitutes a literal
 * when one is absent. The feature degrades — no META tier, base ratings only —
 * instead of 500ing.
 *
 * <p>Cached with a short TTL so the service picks the columns up on its own
 * within a minute of the DDL finally landing, without a restart.
 */
@Component
public class CardColumns {

    private static final Logger log = LoggerFactory.getLogger(CardColumns.class);

    static final String META_TIER = "meta_tier";
    static final String MAX_OVERALL_RATING = "max_overall_rating";
    static final String META_PRIORITY = "meta_priority";
    static final String META_ACTIVE_FROM = "meta_active_from";
    static final String META_ACTIVE_UNTIL = "meta_active_until";
    static final String META_REASON = "meta_reason";
    static final String META_UPDATED_BY = "meta_updated_by";
    static final String META_UPDATED_AT = "meta_updated_at";

    private static final List<String> OPTIONAL_COLUMNS = List.of(
            META_TIER, MAX_OVERALL_RATING, META_PRIORITY, META_ACTIVE_FROM,
            META_ACTIVE_UNTIL, META_REASON, META_UPDATED_BY, META_UPDATED_AT);

    private static final long TTL_MS = 60_000;

    private record Snapshot(Set<String> present, long takenAt) {}

    private final JdbcTemplate jdbc;
    private final AtomicReference<Snapshot> cache = new AtomicReference<>();

    public CardColumns(@Qualifier("efbazaarJdbcTemplate") JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean has(String table, String column) {
        return snapshot().present().contains(key(table, column));
    }

    private Snapshot snapshot() {
        Snapshot current = cache.get();
        long now = System.currentTimeMillis();
        if (current != null && now - current.takenAt() < TTL_MS) {
            return current;
        }
        Snapshot fresh = new Snapshot(load(), now);
        cache.set(fresh);
        return fresh;
    }

    private Set<String> load() {
        Set<String> present = new HashSet<>();
        List<String> tables = java.util.Arrays.stream(CardType.values())
                .map(CardType::tableName)
                .toList();
        try {
            String placeholders = String.join(", ", tables.stream().map(t -> "?").toList());
            Object[] args = new Object[tables.size() + OPTIONAL_COLUMNS.size()];
            for (int i = 0; i < tables.size(); i++) {
                args[i] = tables.get(i);
            }
            for (int i = 0; i < OPTIONAL_COLUMNS.size(); i++) {
                args[tables.size() + i] = OPTIONAL_COLUMNS.get(i);
            }

            String columnPlaceholders = String.join(", ",
                    OPTIONAL_COLUMNS.stream().map(column -> "?").toList());

            jdbc.query(
                    "SELECT table_name, column_name FROM information_schema.columns"
                            + " WHERE table_schema = current_schema()"
                            + " AND table_name IN (" + placeholders + ")"
                            + " AND column_name IN (" + columnPlaceholders + ")",
                    rs -> {
                        present.add(key(rs.getString("table_name"), rs.getString("column_name")));
                    },
                    args);
        } catch (RuntimeException e) {
            // Treat as "absent" — the degraded query still works.
            log.warn("card column probe failed, assuming optional columns absent: {}", e.toString());
        }
        if (present.size() < tables.size() * OPTIONAL_COLUMNS.size()) {
            log.warn("card tables missing optional columns (have {} of {}) —"
                            + " serving degraded results; run infra/scrapers/efhub/setup-db.sh",
                    present.size(), tables.size() * OPTIONAL_COLUMNS.size());
        }
        return present;
    }

    private static String key(String table, String column) {
        return table + "." + column;
    }
}
