package uz.efbazaar.marketplace.cards;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.sql.Array;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class CardSearchService {

    private static final int DEFAULT_LIMIT = 30;
    private static final int MAX_LIMIT = 100;

    /**
     * META cards float to the top of every result set — the whole point of the
     * tier is that these are the players buyers actually search for. Rating is
     * the tie-break inside each tier.
     *
     * <p>Postgres only accepts output column names in the ORDER BY of a
     * UNION, so the CASE expression forces the branches into a subselect
     * (see {@link #unionSql}).
     */
    private static final String ORDER_BY =
            " ORDER BY CASE WHEN meta_tier = 'META' THEN 0 ELSE 1 END,"
            + " COALESCE(max_overall_rating, overall_rating) DESC NULLS LAST, name";

    private static final RowMapper<CardSearchResult> ROW_MAPPER = (rs, rn) -> {
        Array skillsArr = rs.getArray("skills");
        List<String> skills = skillsArr == null
                ? List.of()
                : Arrays.asList((String[]) skillsArr.getArray());
        String tier = rs.getString("meta_tier");
        return new CardSearchResult(
                rs.getLong("efhub_id"),
                rs.getString("name"),
                rs.getString("team"),
                rs.getString("position"),
                rs.getString("playing_style"),
                (Integer) rs.getObject("overall_rating"),
                (Integer) rs.getObject("max_overall_rating"),
                CardType.valueOf(rs.getString("card_type")),
                tier == null ? MetaTier.NORMAL : MetaTier.valueOf(tier),
                rs.getString("image_url"),
                skills
        );
    };

    private final JdbcTemplate jdbc;

    public CardSearchService(@Qualifier("efbazaarJdbcTemplate") JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<CardSearchResult> search(String query, Collection<CardType> types, Integer limit) {
        return search(query, types, null, limit);
    }

    /**
     * Name search across the selected card tables, optionally narrowed to one
     * meta tier. Short queries return nothing rather than the whole catalogue —
     * use {@link #browse} for that.
     */
    public List<CardSearchResult> search(String query,
                                         Collection<CardType> types,
                                         MetaTier tier,
                                         Integer limit) {
        String trimmed = query == null ? "" : query.trim();
        if (trimmed.length() < 2) {
            return List.of();
        }
        EnumSet<CardType> activeTypes = resolveTypes(types);
        int actualLimit = clampSize(limit);

        String where = whereClause(trimmed, tier);
        String sql = unionSql(activeTypes, where) + ORDER_BY + " LIMIT " + actualLimit;

        List<Object> args = new ArrayList<>();
        activeTypes.forEach(t -> appendArgs(args, trimmed, tier));

        return jdbc.query(sql, ROW_MAPPER, args.toArray());
    }

    /**
     * Paginated catalog listing. All three arguments are optional filters:
     * {@code types} narrows the tables, {@code query} does the same name match
     * as {@link #search} (ignored when shorter than 2 chars), {@code tier}
     * narrows to META / NORMAL. Used by the marketplace META picker and by the
     * admin players page.
     */
    public CardPage browse(String query,
                           Collection<CardType> types,
                           MetaTier tier,
                           Integer page,
                           Integer size) {
        EnumSet<CardType> activeTypes = resolveTypes(types);
        int pageNum = page == null || page < 0 ? 0 : page;
        int pageSize = clampSize(size);
        int offset = pageNum * pageSize;

        String trimmed = query == null ? "" : query.trim();
        String effectiveQuery = trimmed.length() < 2 ? null : trimmed;
        String where = whereClause(effectiveQuery, tier);

        String countSql = activeTypes.stream()
                .map(t -> "(SELECT count(*) FROM " + t.tableName() + where + ")")
                .collect(Collectors.joining(" + ", "SELECT ", ""));
        List<Object> countArgs = new ArrayList<>();
        activeTypes.forEach(t -> appendArgs(countArgs, effectiveQuery, tier));
        long total = jdbc.queryForObject(countSql, Long.class, countArgs.toArray());

        String pageSql = unionSql(activeTypes, where) + ORDER_BY + ", efhub_id LIMIT ? OFFSET ?";
        List<Object> pageArgs = new ArrayList<>();
        activeTypes.forEach(t -> appendArgs(pageArgs, effectiveQuery, tier));
        pageArgs.add(pageSize);
        pageArgs.add(offset);

        List<CardSearchResult> items = jdbc.query(pageSql, ROW_MAPPER, pageArgs.toArray());
        return new CardPage(items, pageNum, pageSize, total);
    }

    /**
     * Admin bulk tier assignment. Ids are grouped by the table their prefix
     * implies ({@link CardType#fromEfhubId}) so each table takes one UPDATE.
     * Ids with an unrecognised prefix are silently skipped — they are not cards
     * we hold, and failing the whole batch over one stale id would be worse.
     *
     * @return how many rows actually changed
     */
    public int updateMetaTier(Collection<Long> efhubIds, MetaTier tier) {
        Map<CardType, Set<Long>> byTable = new EnumMap<>(CardType.class);
        for (Long id : efhubIds) {
            if (id == null) continue;
            CardType type = CardType.fromEfhubId(id);
            if (type == null) continue;
            byTable.computeIfAbsent(type, t -> new LinkedHashSet<>()).add(id);
        }

        int updated = 0;
        for (Map.Entry<CardType, Set<Long>> entry : byTable.entrySet()) {
            Set<Long> ids = entry.getValue();
            String placeholders = ids.stream().map(id -> "?").collect(Collectors.joining(", "));
            // Table name comes from the enum, ids are bound — nothing from the
            // request is concatenated into the statement.
            String sql = "UPDATE " + entry.getKey().tableName()
                    + " SET meta_tier = ?, updated_at = NOW()"
                    + " WHERE efhub_id IN (" + placeholders + ") AND meta_tier <> ?";
            List<Object> args = new ArrayList<>();
            args.add(tier.name());
            args.addAll(ids);
            args.add(tier.name());
            updated += jdbc.update(sql, args.toArray());
        }
        return updated;
    }

    private EnumSet<CardType> resolveTypes(Collection<CardType> types) {
        return (types == null || types.isEmpty())
                ? EnumSet.allOf(CardType.class)
                : EnumSet.copyOf(types);
    }

    private int clampSize(Integer size) {
        return Math.min(size == null || size <= 0 ? DEFAULT_LIMIT : size, MAX_LIMIT);
    }

    /**
     * WHERE fragment shared by the row and count queries. Every predicate is
     * parameterised; {@link #appendArgs} must stay in the same order.
     */
    private static String whereClause(String query, MetaTier tier) {
        List<String> conditions = new ArrayList<>(2);
        if (query != null) conditions.add("(name ILIKE ? OR name % ?)");
        if (tier != null) conditions.add("meta_tier = ?");
        return conditions.isEmpty() ? "" : " WHERE " + String.join(" AND ", conditions);
    }

    /** Binds one table's worth of {@link #whereClause} placeholders. */
    private static void appendArgs(List<Object> args, String query, MetaTier tier) {
        if (query != null) {
            args.add("%" + query + "%");  // ILIKE
            args.add(query);              // trgm similarity
        }
        if (tier != null) args.add(tier.name());
    }

    /**
     * One SELECT per card table, unioned and wrapped in a subselect so the
     * caller can ORDER BY an expression (a bare UNION only allows output
     * column names).
     */
    private static String unionSql(EnumSet<CardType> types, String where) {
        return types.stream()
                .map(t -> rowSql(t.tableName(), t.name(), where))
                .collect(Collectors.joining(" UNION ALL ", "SELECT * FROM (", ") c"));
    }

    private static String rowSql(String table, String typeLabel, String where) {
        return """
                (SELECT efhub_id, name, team, position, playing_style,
                        overall_rating, max_overall_rating,
                        '%s' AS card_type, meta_tier, image_url, skills
                 FROM %s%s)
                """.formatted(typeLabel, table, where);
    }
}
