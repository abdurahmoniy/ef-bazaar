package uz.efbazaar.marketplace.cards;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Array;
import java.util.Arrays;
import java.util.Collection;
import java.util.EnumSet;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class CardSearchService {

    private static final int DEFAULT_LIMIT = 30;
    private static final int MAX_LIMIT = 100;

    private final JdbcTemplate jdbc;

    public CardSearchService(@Qualifier("efbazaarJdbcTemplate") JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<CardSearchResult> search(String query, Collection<CardType> types, Integer limit) {
        String trimmed = query == null ? "" : query.trim();
        if (trimmed.length() < 2) {
            return List.of();
        }
        EnumSet<CardType> activeTypes = (types == null || types.isEmpty())
                ? EnumSet.allOf(CardType.class)
                : EnumSet.copyOf(types);
        int actualLimit = Math.min(limit == null || limit <= 0 ? DEFAULT_LIMIT : limit, MAX_LIMIT);

        String sql = activeTypes.stream()
                .map(t -> rowSql(t.tableName(), t.name()))
                .collect(Collectors.joining(" UNION ALL "))
                + " ORDER BY overall_rating DESC NULLS LAST, name LIMIT " + actualLimit;

        // Each subquery binds the search term twice (ILIKE + trgm similarity)
        Object[] args = new Object[activeTypes.size() * 2];
        for (int i = 0; i < activeTypes.size(); i++) {
            args[i * 2]     = "%" + trimmed + "%";
            args[i * 2 + 1] = trimmed;
        }

        return jdbc.query(sql, (rs, rn) -> {
            Array skillsArr = rs.getArray("skills");
            List<String> skills = skillsArr == null
                    ? List.of()
                    : Arrays.asList((String[]) skillsArr.getArray());
            return new CardSearchResult(
                    rs.getLong("efhub_id"),
                    rs.getString("name"),
                    rs.getString("team"),
                    rs.getString("position"),
                    rs.getString("playing_style"),
                    (Integer) rs.getObject("overall_rating"),
                    CardType.valueOf(rs.getString("card_type")),
                    rs.getString("image_url"),
                    skills
            );
        }, args);
    }

    private static String rowSql(String table, String typeLabel) {
        return """
                (SELECT efhub_id, name, team, position, playing_style, overall_rating,
                        '%s' AS card_type, image_url, skills
                 FROM %s
                 WHERE name ILIKE ? OR name %% ?)
                """.formatted(typeLabel, table);
    }
}
