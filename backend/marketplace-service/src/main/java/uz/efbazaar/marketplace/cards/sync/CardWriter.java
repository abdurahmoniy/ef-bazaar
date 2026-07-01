package uz.efbazaar.marketplace.cards.sync;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.cards.CardType;

import java.sql.Array;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Types;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Upserts scraped cards into bigtime/epic/showtime tables. Sibling of load.py.
 */
@Component
public class CardWriter {

    private static final Logger log = LoggerFactory.getLogger(CardWriter.class);

    private static final String[] STAT_KEYS = {
            "offensiveAwareness", "ballControl", "dribbling", "tightPossession",
            "lowPass", "loftedPass", "finishing", "heading", "setPieceTaking",
            "curl", "speed", "acceleration", "kickingPower", "jump",
            "physicalContact", "balance", "stamina", "defensiveAwareness",
            "ballWinning", "trackingBack", "aggression",
            "gkAwareness", "gkCatching", "gkClearing", "gkReflexes", "gkReach"
    };
    private static final String[] STAT_COLS = {
            "offensive_awareness", "ball_control", "dribbling", "tight_possession",
            "low_pass", "lofted_pass", "finishing", "heading", "set_piece_taking",
            "curl", "speed", "acceleration", "kicking_power", "jump",
            "physical_contact", "balance", "stamina", "defensive_awareness",
            "ball_winning", "tracking_back", "aggression",
            "gk_awareness", "gk_catching", "gk_clearing", "gk_reflexes", "gk_reach"
    };

    private static final List<String> BASE_COLS = List.of(
            "efhub_id", "name", "name_ja", "name_zh",
            "team", "league", "nationality", "nationality_code",
            "position", "playing_style", "overall_rating", "player_type",
            "age", "height", "weight",
            "preferred_foot", "weak_foot_usage", "weak_foot_accuracy", "image_url"
    );

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final Map<CardType, String> upsertSqlByType = new EnumMap<>(CardType.class);

    public CardWriter(@Qualifier("efbazaarJdbcTemplate") JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        for (CardType t : CardType.values()) {
            upsertSqlByType.put(t, buildUpsertSql(t.tableName()));
        }
    }

    public Set<Long> findAllEfhubIds() {
        Set<Long> all = new HashSet<>(2048);
        for (CardType t : CardType.values()) {
            all.addAll(jdbc.queryForList("SELECT efhub_id FROM " + t.tableName(), Long.class));
        }
        return all;
    }

    public void upsert(ScrapedCard card, CardType type) {
        String sql = upsertSqlByType.get(type);
        jdbc.update(con -> bind(con.prepareStatement(sql), card));
    }

    private PreparedStatement bind(PreparedStatement ps, ScrapedCard c) throws SQLException {
        int i = 1;
        ps.setLong(i++, c.efhubId());
        setString(ps, i++, c.name());
        setString(ps, i++, c.nameJa());
        setString(ps, i++, c.nameZh());
        setString(ps, i++, c.team());
        setString(ps, i++, c.league());
        setString(ps, i++, c.nationality());
        setString(ps, i++, c.nationalityCode());
        setString(ps, i++, c.position());
        setString(ps, i++, c.playingStyle());
        setNullableInt(ps, i++, c.overallRating());
        ps.setInt(i++, c.playerType());
        setNullableInt(ps, i++, c.age());
        setNullableInt(ps, i++, c.height());
        setNullableInt(ps, i++, c.weight());
        setString(ps, i++, c.preferredFoot());
        setNullableInt(ps, i++, c.weakFootUsage());
        setNullableInt(ps, i++, c.weakFootAccuracy());
        setString(ps, i++, c.imageUrl());

        Map<String, Integer> stats = c.baseStats() == null ? Map.of() : c.baseStats();
        for (String key : STAT_KEYS) {
            setNullableInt(ps, i++, stats.get(key));
        }

        Array skillsArr = ps.getConnection().createArrayOf("text", toArray(c.skills()));
        ps.setArray(i++, skillsArr);
        Array comSkillsArr = ps.getConnection().createArrayOf("text", toArray(c.comSkills()));
        ps.setArray(i++, comSkillsArr);

        setString(ps, i++, c.additionalPositionsJson());
        setString(ps, i++, c.rawJson() != null ? c.rawJson() : toRawJson(c));

        return ps;
    }

    private String toRawJson(ScrapedCard c) {
        try {
            return mapper.writeValueAsString(c);
        } catch (JsonProcessingException e) {
            log.warn("toRawJson failed for efhubId={}: {}", c.efhubId(), e.toString());
            return null;
        }
    }

    private static String[] toArray(List<String> in) {
        return in == null ? new String[0] : in.toArray(String[]::new);
    }

    private static void setString(PreparedStatement ps, int i, String v) throws SQLException {
        if (v == null) {
            ps.setNull(i, Types.VARCHAR);
        } else {
            ps.setString(i, v);
        }
    }

    private static void setNullableInt(PreparedStatement ps, int i, Integer v) throws SQLException {
        if (v == null) {
            ps.setNull(i, Types.INTEGER);
        } else {
            ps.setInt(i, v);
        }
    }

    private static String buildUpsertSql(String table) {
        // Build column list: base (19) + stats (25) + tail (2 arrays + 2 jsonb)
        StringBuilder cols = new StringBuilder();
        StringBuilder vals = new StringBuilder();
        appendCsv(cols, BASE_COLS);
        for (String s : STAT_COLS) {
            cols.append(", ").append(s);
        }
        cols.append(", skills, com_skills, additional_positions, raw_data");

        int n = BASE_COLS.size() + STAT_COLS.length + 2; // base + stats + 2 arrays
        for (int i = 0; i < n; i++) {
            if (i > 0) vals.append(", ");
            vals.append("?");
        }
        // additional_positions, raw_data are jsonb — cast at SQL level
        vals.append(", ?::jsonb, ?::jsonb");

        StringBuilder updates = new StringBuilder();
        appendUpdateCsv(updates, BASE_COLS, /*skipFirst*/ true); // skip efhub_id
        for (String s : STAT_COLS) {
            updates.append(", ").append(s).append("=EXCLUDED.").append(s);
        }
        updates.append(", skills=EXCLUDED.skills")
                .append(", com_skills=EXCLUDED.com_skills")
                .append(", additional_positions=EXCLUDED.additional_positions")
                .append(", raw_data=EXCLUDED.raw_data")
                .append(", updated_at=NOW()");

        return "INSERT INTO " + table + " (" + cols + ") VALUES (" + vals + ") "
                + "ON CONFLICT (efhub_id) DO UPDATE SET " + updates;
    }

    private static void appendCsv(StringBuilder sb, List<String> items) {
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append(items.get(i));
        }
    }

    private static void appendUpdateCsv(StringBuilder sb, List<String> items, boolean skipFirst) {
        boolean first = true;
        for (int i = 0; i < items.size(); i++) {
            if (skipFirst && i == 0) continue;
            if (!first) sb.append(", ");
            first = false;
            String c = items.get(i);
            sb.append(c).append("=EXCLUDED.").append(c);
        }
    }
}
