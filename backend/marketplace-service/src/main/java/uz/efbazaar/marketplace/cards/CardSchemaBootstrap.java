package uz.efbazaar.marketplace.cards;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Applies the additive card-table DDL at startup.
 *
 * <p>The {@code efbazaar} cards DB has no Flyway — its schema is hand-applied
 * by {@code infra/scrapers/efhub/setup-db.sh}. That makes a code deploy able to
 * outrun the schema, and when it does every {@code GET /api/v1/cards} 500s with
 * {@code 42703 undefined_column} because the query names {@code meta_tier} /
 * {@code max_overall_rating}. The card picker is public, so the whole
 * marketplace search breaks until someone gets shell on the box.
 *
 * <p>Every statement here is additive and idempotent, mirroring
 * {@code infra/postgres/efbazaar/V2__meta_tier.sql} and {@code V3__max_overall_rating.sql}
 * (kept there for fresh-DB setup, which also creates the tables). Nothing drops
 * or rewrites data. Failures are logged, never fatal: a service that boots with
 * a stale schema is no worse than today, and refusing to boot would take down
 * listings too.
 */
@Component
public class CardSchemaBootstrap {

    private static final Logger log = LoggerFactory.getLogger(CardSchemaBootstrap.class);

    private final JdbcTemplate jdbc;
    private final boolean enabled;

    public CardSchemaBootstrap(@Qualifier("efbazaarJdbcTemplate") JdbcTemplate jdbc,
                               @Value("${app.cards.schema-bootstrap.enabled:true}") boolean enabled) {
        this.jdbc = jdbc;
        this.enabled = enabled;
    }

    /**
     * Runs during bean initialisation — i.e. before the servlet container opens
     * its port — so no request can observe the half-migrated schema.
     */
    @PostConstruct
    public void apply() {
        if (!enabled) {
            log.info("card schema bootstrap disabled");
            return;
        }
        for (String ddl : identityStatements()) {
            execute(ddl);
        }
        for (CardType type : CardType.values()) {
            String table = type.tableName();
            if (!tableExists(table)) {
                // Fresh environment that never ran setup-db.sh. Creating the
                // full card tables is the scraper's job, not ours.
                log.warn("card schema bootstrap: table {} missing, skipping", table);
                continue;
            }
            for (String ddl : statementsFor(table)) {
                execute(ddl);
            }
        }
        for (String ddl : identityBackfillStatements()) {
            execute(ddl);
        }
    }

    private static List<String> identityStatements() {
        return List.of(
                "CREATE EXTENSION IF NOT EXISTS pgcrypto",
                "CREATE TABLE IF NOT EXISTS player_identities ("
                        + "id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                        + "canonical_name VARCHAR(120) NOT NULL,"
                        + "normalized_name VARCHAR(120) NOT NULL UNIQUE,"
                        + "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
                        + "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
                "CREATE TABLE IF NOT EXISTS card_player_identities ("
                        + "efhub_id BIGINT PRIMARY KEY,"
                        + "player_id UUID NOT NULL REFERENCES player_identities(id),"
                        + "assignment_source VARCHAR(10) NOT NULL DEFAULT 'AUTO' "
                        + "CHECK (assignment_source IN ('AUTO', 'ADMIN')),"
                        + "assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
                "CREATE INDEX IF NOT EXISTS idx_card_player_identities_player "
                        + "ON card_player_identities (player_id, efhub_id)");
    }

    private static List<String> identityBackfillStatements() {
        String allCards = "(SELECT efhub_id, name FROM bigtime UNION ALL "
                + "SELECT efhub_id, name FROM epic UNION ALL "
                + "SELECT efhub_id, name FROM showtime)";
        String normalized = "lower(regexp_replace(trim(name), '\\s+', ' ', 'g'))";
        return List.of(
                "INSERT INTO player_identities (canonical_name, normalized_name) "
                        + "SELECT min(name), " + normalized + " FROM " + allCards + " cards "
                        + "WHERE name IS NOT NULL AND trim(name) <> '' GROUP BY " + normalized + " "
                        + "ON CONFLICT (normalized_name) DO NOTHING",
                "INSERT INTO card_player_identities (efhub_id, player_id, assignment_source) "
                        + "SELECT cards.efhub_id, identities.id, 'AUTO' FROM " + allCards + " cards "
                        + "JOIN player_identities identities ON identities.normalized_name = " + normalized + " "
                        + "ON CONFLICT (efhub_id) DO NOTHING");
    }

    private boolean tableExists(String table) {
        try {
            return Boolean.TRUE.equals(jdbc.queryForObject(
                    "SELECT to_regclass(?) IS NOT NULL", Boolean.class, table));
        } catch (RuntimeException e) {
            log.warn("card schema bootstrap: existence check failed for {}: {}", table, e.toString());
            return false;
        }
    }

    private static List<String> statementsFor(String t) {
        return List.of(
                "ALTER TABLE " + t + " ADD COLUMN IF NOT EXISTS meta_tier TEXT NOT NULL DEFAULT 'NORMAL'",
                "ALTER TABLE " + t + " DROP CONSTRAINT IF EXISTS chk_" + t + "_meta_tier",
                "ALTER TABLE " + t + " ADD CONSTRAINT chk_" + t + "_meta_tier"
                        + " CHECK (meta_tier IN ('NORMAL', 'META'))",
                "CREATE INDEX IF NOT EXISTS idx_" + t + "_meta_tier ON " + t + " (meta_tier)"
                        + " WHERE meta_tier <> 'NORMAL'",
                "ALTER TABLE " + t + " ADD COLUMN IF NOT EXISTS max_overall_rating SMALLINT",
                "CREATE INDEX IF NOT EXISTS idx_" + t + "_max_overall_rating"
                        + " ON " + t + " (COALESCE(max_overall_rating, overall_rating) DESC)");
    }

    private void execute(String ddl) {
        try {
            jdbc.execute(ddl);
        } catch (RuntimeException e) {
            // Most likely cause is the DB user lacking ALTER on tables the
            // scraper owns. Loud, because the card endpoints stay broken.
            log.error("card schema bootstrap failed [{}]: {}", ddl, e.toString());
        }
    }
}
