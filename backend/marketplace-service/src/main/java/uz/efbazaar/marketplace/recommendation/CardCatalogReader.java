package uz.efbazaar.marketplace.recommendation;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.cards.CardType;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** efbazaar karta katalogidan (bigtime/epic/showtime + card_player_identities) o'qish. */
@Component
public class CardCatalogReader {

    private final JdbcTemplate jdbc;

    public CardCatalogReader(@Qualifier("efbazaarJdbcTemplate") JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<Long, CardFacts> read(Collection<Long> efhubIds) {
        Map<CardType, List<Long>> byType = new EnumMap<>(CardType.class);
        for (Long id : efhubIds) {
            CardType type = id == null ? null : CardType.fromEfhubId(id);
            if (type != null) { // null — noma'lum prefiks yoki juda qisqa ID: katalogda yo'q
                byType.computeIfAbsent(type, t -> new ArrayList<>()).add(id);
            }
        }
        Map<Long, CardFacts> out = new HashMap<>();
        byType.forEach((type, ids) -> {
            String in = ids.stream().map(i -> "?").collect(Collectors.joining(", "));
            jdbc.query("""
                    SELECT c.efhub_id, c.overall_rating, c.meta_tier, c.meta_priority,
                           c.meta_active_from, c.meta_active_until, i.player_id
                      FROM %s c LEFT JOIN card_player_identities i ON i.efhub_id = c.efhub_id
                     WHERE c.efhub_id IN (%s)
                    """.formatted(type.tableName(), in),
                    rs -> {
                        long id = rs.getLong("efhub_id");
                        out.put(id, new CardFacts(id, type.tableName(),
                                rs.getObject("player_id", java.util.UUID.class),
                                (Integer) rs.getObject("overall_rating", Integer.class),
                                rs.getString("meta_tier"), rs.getInt("meta_priority"),
                                instant(rs.getTimestamp("meta_active_from")),
                                instant(rs.getTimestamp("meta_active_until"))));
                    }, ids.toArray());
        });
        return out;
    }

    public List<Long> allIds() {
        List<Long> ids = new ArrayList<>();
        for (CardType type : CardType.values()) {
            ids.addAll(jdbc.queryForList("SELECT efhub_id FROM " + type.tableName(), Long.class));
        }
        return ids;
    }

    /** META oynasi (from/until) (from, to] oralig'ida boshlangan yoki tugagan kartalar. */
    public List<Long> metaBoundariesBetween(Instant from, Instant to) {
        List<Long> ids = new ArrayList<>();
        for (CardType type : CardType.values()) {
            ids.addAll(jdbc.queryForList("""
                    SELECT efhub_id FROM %s
                     WHERE meta_tier = 'META'
                       AND ((meta_active_from  > ? AND meta_active_from  <= ?)
                         OR (meta_active_until > ? AND meta_active_until <= ?))
                    """.formatted(type.tableName()), Long.class,
                    Timestamp.from(from), Timestamp.from(to), Timestamp.from(from), Timestamp.from(to)));
        }
        return ids;
    }

    private static Instant instant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }
}
