package uz.efbazaar.marketplace.cards;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
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

    private static final RowMapper<CardSearchResult> ROW_MAPPER = (rs, rn) -> {
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
    };

    private final JdbcTemplate jdbc;

    public CardSearchService(@Qualifier("efbazaarJdbcTemplate") JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<CardSearchResult> search(String query, Collection<CardType> types, Integer limit) {
        String trimmed = query == null ? "" : query.trim();
        if (trimmed.length() < 2) {
            return List.of();
        }
        EnumSet<CardType> activeTypes = resolveTypes(types);
        int actualLimit = clampSize(limit);

        String sql = activeTypes.stream()
                .map(t -> searchRowSql(t.tableName(), t.name()))
                .collect(Collectors.joining(" UNION ALL "))
                + " ORDER BY overall_rating DESC NULLS LAST, name LIMIT " + actualLimit;

        // Each subquery binds the search term twice (ILIKE + trgm similarity)
        Object[] args = new Object[activeTypes.size() * 2];
        for (int i = 0; i < activeTypes.size(); i++) {
            args[i * 2]     = "%" + trimmed + "%";
            args[i * 2 + 1] = trimmed;
        }

        return jdbc.query(sql, ROW_MAPPER, args);
    }

    /**
     * Paginated catalog listing by card type (no name filter).
     * Ordered by overall_rating so the strongest cards come first.
     */
    public CardPage browse(Collection<CardType> types, Integer page, Integer size) {
        EnumSet<CardType> activeTypes = resolveTypes(types);
        int pageNum = page == null || page < 0 ? 0 : page;
        int pageSize = clampSize(size);
        int offset = pageNum * pageSize;

        String countSql = activeTypes.stream()
                .map(t -> "(SELECT count(*) FROM " + t.tableName() + ")")
                .collect(Collectors.joining(" + ", "SELECT ", ""));
        long total = jdbc.queryForObject(countSql, Long.class);

        String pageSql = activeTypes.stream()
                .map(t -> browseRowSql(t.tableName(), t.name()))
                .collect(Collectors.joining(" UNION ALL "))
                + " ORDER BY overall_rating DESC NULLS LAST, name, efhub_id LIMIT ? OFFSET ?";

        List<CardSearchResult> items = jdbc.query(pageSql, ROW_MAPPER, pageSize, offset);
        return new CardPage(items, pageNum, pageSize, total);
    }

    private EnumSet<CardType> resolveTypes(Collection<CardType> types) {
        return (types == null || types.isEmpty())
                ? EnumSet.allOf(CardType.class)
                : EnumSet.copyOf(types);
    }

    private int clampSize(Integer size) {
        return Math.min(size == null || size <= 0 ? DEFAULT_LIMIT : size, MAX_LIMIT);
    }

    private static String searchRowSql(String table, String typeLabel) {
        return """
                (SELECT efhub_id, name, team, position, playing_style, overall_rating,
                        '%s' AS card_type, image_url, skills
                 FROM %s
                 WHERE name ILIKE ? OR name %% ?)
                """.formatted(typeLabel, table);
    }

    private static String browseRowSql(String table, String typeLabel) {
        return """
                (SELECT efhub_id, name, team, position, playing_style, overall_rating,
                        '%s' AS card_type, image_url, skills
                 FROM %s)
                """.formatted(typeLabel, table);
    }
}
