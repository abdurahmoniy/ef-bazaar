package uz.efbazaar.marketplace.cards;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.marketplace.exception.MarketplaceException;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.function.IntSupplier;

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
    private static final String SEARCH_ORDER_BY =
            " ORDER BY text_rank, text_similarity DESC, active_meta DESC, meta_priority DESC,"
            + " COALESCE(max_overall_rating, overall_rating) DESC NULLS LAST, name, efhub_id";
    private static final String BROWSE_ORDER_BY =
            " ORDER BY active_meta DESC, meta_priority DESC,"
            + " COALESCE(max_overall_rating, overall_rating) DESC NULLS LAST, name, efhub_id";

    private static final RowMapper<CardSearchResult> ROW_MAPPER = (rs, rn) -> {
        Array skillsArr = rs.getArray("skills");
        List<String> skills = skillsArr == null
                ? List.of()
                : Arrays.asList((String[]) skillsArr.getArray());
        String tier = rs.getString("meta_tier");
        return new CardSearchResult(
                rs.getLong("efhub_id"),
                rs.getObject("player_id", UUID.class),
                rs.getString("name"),
                rs.getString("team"),
                rs.getString("position"),
                rs.getString("playing_style"),
                (Integer) rs.getObject("overall_rating"),
                (Integer) rs.getObject("max_overall_rating"),
                CardType.valueOf(rs.getString("card_type")),
                tier == null ? MetaTier.NORMAL : MetaTier.valueOf(tier),
                rs.getInt("meta_priority"),
                rs.getString("image_url"),
                skills
        );
    };

    private static final RowMapper<AdminCardSearchResult> ADMIN_ROW_MAPPER = (rs, rn) -> {
        Array skillsArr = rs.getArray("skills");
        List<String> skills = skillsArr == null
                ? List.of()
                : Arrays.asList((String[]) skillsArr.getArray());
        return new AdminCardSearchResult(
                rs.getLong("efhub_id"),
                rs.getObject("player_id", UUID.class),
                rs.getString("name"),
                rs.getString("team"),
                rs.getString("position"),
                rs.getString("playing_style"),
                (Integer) rs.getObject("overall_rating"),
                (Integer) rs.getObject("max_overall_rating"),
                CardType.valueOf(rs.getString("card_type")),
                MetaTier.valueOf(rs.getString("meta_tier")),
                rs.getInt("meta_priority"),
                rs.getString("image_url"),
                skills,
                MetaTier.valueOf(rs.getString("configured_meta_tier")),
                rs.getInt("configured_meta_priority"),
                instant(rs, "meta_active_from"),
                instant(rs, "meta_active_until"),
                rs.getString("meta_reason"),
                rs.getObject("meta_updated_by", UUID.class),
                instant(rs, "meta_updated_at"),
                0,
                0);
    };

    private final JdbcTemplate jdbc;
    private final CardColumns columns;

    public CardSearchService(@Qualifier("efbazaarJdbcTemplate") JdbcTemplate jdbc,
                             CardColumns columns) {
        this.jdbc = jdbc;
        this.columns = columns;
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

        String sql = unionSql(activeTypes, trimmed, tier) + SEARCH_ORDER_BY + " LIMIT " + actualLimit;

        List<Object> args = new ArrayList<>();
        activeTypes.forEach(t -> appendRowArgs(args, trimmed));

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

        String countSql = activeTypes.stream()
                .map(t -> "(SELECT count(*) FROM " + t.tableName() + " card"
                        + whereClause(t.tableName(), effectiveQuery, tier) + ")")
                .collect(Collectors.joining(" + ", "SELECT ", ""));
        List<Object> countArgs = new ArrayList<>();
        activeTypes.forEach(t -> appendFilterArgs(countArgs, effectiveQuery));
        long total = jdbc.queryForObject(countSql, Long.class, countArgs.toArray());

        String pageSql = unionSql(activeTypes, effectiveQuery, tier)
                + (effectiveQuery == null ? BROWSE_ORDER_BY : SEARCH_ORDER_BY)
                + " LIMIT ? OFFSET ?";
        List<Object> pageArgs = new ArrayList<>();
        activeTypes.forEach(t -> appendRowArgs(pageArgs, effectiveQuery));
        pageArgs.add(pageSize);
        pageArgs.add(offset);

        List<CardSearchResult> items = jdbc.query(pageSql, ROW_MAPPER, pageArgs.toArray());
        return new CardPage(items, pageNum, pageSize, total);
    }

    public AdminCardPage browseAdmin(String query,
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

        String countSql = activeTypes.stream()
                .map(t -> "(SELECT count(*) FROM " + t.tableName() + " card"
                        + adminWhereClause(t.tableName(), effectiveQuery, tier) + ")")
                .collect(Collectors.joining(" + ", "SELECT ", ""));
        List<Object> countArgs = new ArrayList<>();
        activeTypes.forEach(t -> appendFilterArgs(countArgs, effectiveQuery));
        long total = jdbc.queryForObject(countSql, Long.class, countArgs.toArray());

        String pageSql = adminUnionSql(activeTypes, effectiveQuery, tier)
                + (effectiveQuery == null ? BROWSE_ORDER_BY : SEARCH_ORDER_BY)
                + " LIMIT ? OFFSET ?";
        List<Object> pageArgs = new ArrayList<>();
        activeTypes.forEach(t -> appendRowArgs(pageArgs, effectiveQuery));
        pageArgs.add(pageSize);
        pageArgs.add(offset);
        return new AdminCardPage(jdbc.query(pageSql, ADMIN_ROW_MAPPER, pageArgs.toArray()),
                pageNum, pageSize, total);
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
        return updateMetaLifecycle(new CardMetaTierUpdateRequest(
                List.copyOf(efhubIds), tier, null, null, null, null), null);
    }

    public int updateMetaLifecycle(CardMetaTierUpdateRequest request, UUID actorId) {
        MetaLifecycle lifecycle = validateLifecycle(request);
        Map<CardType, Set<Long>> byTable = groupIds(request.efhubIds());
        return atomic(() -> {
            int updated = 0;
            for (Map.Entry<CardType, Set<Long>> entry : byTable.entrySet()) {
                String table = entry.getKey().tableName();
                requireLifecycleColumns(table);
                Set<Long> ids = entry.getValue();
                String placeholders = ids.stream().map(id -> "?").collect(Collectors.joining(", "));
                String sql = "UPDATE " + table
                        + " SET meta_tier = ?, meta_priority = ?, meta_active_from = ?,"
                        + " meta_active_until = ?, meta_reason = ?, meta_updated_by = ?,"
                        + " meta_updated_at = NOW(), updated_at = NOW()"
                        + " WHERE efhub_id IN (" + placeholders + ")";
                List<Object> args = new ArrayList<>();
                args.add(lifecycle.tier().name());
                args.add(lifecycle.priority());
                args.add(lifecycle.activeFrom());
                args.add(lifecycle.activeUntil());
                args.add(lifecycle.reason());
                args.add(actorId);
                args.addAll(ids);
                updated += jdbc.update(sql, args.toArray());
            }
            return updated;
        });
    }

    public int expireMeta(Collection<Long> efhubIds, String reason, UUID actorId) {
        String normalizedReason = normalizeReason(reason);
        Map<CardType, Set<Long>> byTable = groupIds(efhubIds);
        return atomic(() -> {
            int updated = 0;
            for (Map.Entry<CardType, Set<Long>> entry : byTable.entrySet()) {
                String table = entry.getKey().tableName();
                requireLifecycleColumns(table);
                Set<Long> ids = entry.getValue();
                String placeholders = ids.stream().map(id -> "?").collect(Collectors.joining(", "));
                String sql = "UPDATE " + table
                        + " SET meta_active_until = NOW(), meta_reason = COALESCE(?, meta_reason),"
                        + " meta_updated_by = ?, meta_updated_at = NOW(), updated_at = NOW()"
                        + " WHERE efhub_id IN (" + placeholders + ")"
                        + " AND meta_tier = 'META'"
                        + " AND (meta_active_until IS NULL OR meta_active_until > NOW())";
                List<Object> args = new ArrayList<>();
                args.add(normalizedReason);
                args.add(actorId);
                args.addAll(ids);
                updated += jdbc.update(sql, args.toArray());
            }
            return updated;
        });
    }

    private Map<CardType, Set<Long>> groupIds(Collection<Long> efhubIds) {
        Map<CardType, Set<Long>> byTable = new EnumMap<>(CardType.class);
        for (Long id : efhubIds) {
            if (id == null) continue;
            CardType type = CardType.fromEfhubId(id);
            if (type == null) continue;
            byTable.computeIfAbsent(type, t -> new LinkedHashSet<>()).add(id);
        }

        return byTable;
    }

    private MetaLifecycle validateLifecycle(CardMetaTierUpdateRequest request) {
        if (request.metaTier() == MetaTier.NORMAL) {
            return new MetaLifecycle(MetaTier.NORMAL, 0, null, null,
                    normalizeReason(request.reason()));
        }
        int priority = request.priority() == null ? 50 : request.priority();
        if (priority < 0 || priority > 100) {
            throw invalidLifecycle("priority 0 dan 100 gacha bo'lishi kerak");
        }
        if (request.activeFrom() != null && request.activeUntil() != null
                && !request.activeUntil().isAfter(request.activeFrom())) {
            throw invalidLifecycle("activeUntil activeFrom'dan keyin bo'lishi kerak");
        }
        if (request.activeUntil() != null && !request.activeUntil().isAfter(Instant.now())) {
            throw invalidLifecycle("activeUntil kelajakda bo'lishi kerak; hozir tugatish uchun expire ishlating");
        }
        return new MetaLifecycle(MetaTier.META, priority, request.activeFrom(),
                request.activeUntil(), normalizeReason(request.reason()));
    }

    private static String normalizeReason(String reason) {
        if (reason == null || reason.isBlank()) return null;
        String normalized = reason.trim();
        if (normalized.length() > 240) throw invalidLifecycle("sabab 240 belgidan oshmasin");
        return normalized;
    }

    private void requireLifecycleColumns(String table) {
        for (String column : List.of(CardColumns.META_TIER, CardColumns.META_PRIORITY,
                CardColumns.META_ACTIVE_FROM, CardColumns.META_ACTIVE_UNTIL,
                CardColumns.META_REASON, CardColumns.META_UPDATED_BY, CardColumns.META_UPDATED_AT)) {
            if (!columns.has(table, column)) {
                throw new MarketplaceException(HttpStatus.SERVICE_UNAVAILABLE,
                        "meta_lifecycle_column_missing",
                        "Karta jadvalida META lifecycle ustunlari yo'q — schema hali qo'llanmagan");
            }
        }
    }

    private int atomic(IntSupplier work) {
        if (jdbc.getDataSource() == null) return work.getAsInt();
        Integer result = new TransactionTemplate(
                new DataSourceTransactionManager(jdbc.getDataSource()))
                .execute(status -> work.getAsInt());
        return result == null ? 0 : result;
    }

    private static MarketplaceException invalidLifecycle(String reason) {
        return new MarketplaceException(HttpStatus.BAD_REQUEST, "invalid_meta_lifecycle",
                "META sozlamasi noto'g'ri: " + reason);
    }

    private record MetaLifecycle(MetaTier tier, int priority, Instant activeFrom,
                                 Instant activeUntil, String reason) {}

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
     *
     * <p>When the table has no {@code meta_tier} column the tier predicate
     * compares against the literal default instead, so the placeholder count
     * stays identical and a {@code tier=META} filter correctly matches nothing.
     */
    private String whereClause(String table, String query, MetaTier tier) {
        List<String> conditions = new ArrayList<>(2);
        if (query != null) conditions.add("(name ILIKE ? OR name % ?)");
        if (tier != null) {
            String active = activeMetaExpression(table);
            conditions.add(tier == MetaTier.META ? active : "NOT (" + active + ")");
        }
        return conditions.isEmpty() ? "" : " WHERE " + String.join(" AND ", conditions);
    }

    /** Binds one table's worth of {@link #whereClause} placeholders. */
    private static void appendFilterArgs(List<Object> args, String query) {
        if (query != null) {
            args.add("%" + query + "%");  // ILIKE
            args.add(query);              // trgm similarity
        }
    }

    private static void appendRowArgs(List<Object> args, String query) {
        if (query != null) {
            args.add(query);               // exact normalized name
            args.add(query);               // prefix
            args.add(query);               // substring rank
            args.add(query);               // trigram similarity ordering
        }
        appendFilterArgs(args, query);
    }

    /**
     * One SELECT per card table, unioned and wrapped in a subselect so the
     * caller can ORDER BY an expression (a bare UNION only allows output
     * column names).
     */
    private String unionSql(EnumSet<CardType> types, String query, MetaTier tier) {
        return types.stream()
                .map(t -> rowSql(t.tableName(), t.name(), whereClause(t.tableName(), query, tier)))
                .collect(Collectors.joining(" UNION ALL ", "SELECT * FROM (", ") c"));
    }

    private String adminUnionSql(EnumSet<CardType> types, String query, MetaTier tier) {
        return types.stream()
                .map(t -> rowSql(t.tableName(), t.name(), adminWhereClause(t.tableName(), query, tier)))
                .collect(Collectors.joining(" UNION ALL ", "SELECT * FROM (", ") c"));
    }

    private String adminWhereClause(String table, String query, MetaTier tier) {
        List<String> conditions = new ArrayList<>(2);
        if (query != null) conditions.add("(name ILIKE ? OR name % ?)");
        if (tier != null) {
            conditions.add(columns.has(table, CardColumns.META_TIER)
                    ? "card.meta_tier = '" + tier.name() + "'"
                    : "'NORMAL' = '" + tier.name() + "'");
        }
        return conditions.isEmpty() ? "" : " WHERE " + String.join(" AND ", conditions);
    }

    /**
     * Optional columns are emitted as literals when the table lacks them, so
     * every branch of the UNION keeps the same shape and the reader keeps
     * working on a schema that predates them.
     */
    private String rowSql(String table, String typeLabel, String where) {
        String activeMeta = activeMetaExpression(table);
        String metaTier = "CASE WHEN " + activeMeta + " THEN 'META' ELSE 'NORMAL' END AS meta_tier";
        String metaPriority = columns.has(table, CardColumns.META_PRIORITY)
                ? "CASE WHEN " + activeMeta + " THEN card.meta_priority ELSE 0 END AS meta_priority"
                : "0::smallint AS meta_priority";
        String configuredTier = columns.has(table, CardColumns.META_TIER)
                ? "card.meta_tier AS configured_meta_tier"
                : "'NORMAL' AS configured_meta_tier";
        String configuredPriority = optional(table, CardColumns.META_PRIORITY,
                "card.meta_priority", "0::smallint") + " AS configured_meta_priority";
        String activeFrom = optional(table, CardColumns.META_ACTIVE_FROM,
                "card.meta_active_from", "NULL::timestamptz") + " AS meta_active_from";
        String activeUntil = optional(table, CardColumns.META_ACTIVE_UNTIL,
                "card.meta_active_until", "NULL::timestamptz") + " AS meta_active_until";
        String reason = optional(table, CardColumns.META_REASON,
                "card.meta_reason", "NULL::varchar") + " AS meta_reason";
        String updatedBy = optional(table, CardColumns.META_UPDATED_BY,
                "card.meta_updated_by", "NULL::uuid") + " AS meta_updated_by";
        String metaUpdatedAt = optional(table, CardColumns.META_UPDATED_AT,
                "card.meta_updated_at", "NULL::timestamptz") + " AS meta_updated_at";
        String maxOvr = columns.has(table, CardColumns.MAX_OVERALL_RATING)
                ? "max_overall_rating"
                : "NULL::smallint AS max_overall_rating";
        String textRank = where.contains("name ILIKE")
                ? "CASE WHEN lower(trim(card.name)) = lower(trim(?)) THEN 0 "
                    + "WHEN lower(card.name) LIKE lower(?) || '%' THEN 1 "
                    + "WHEN lower(card.name) LIKE '%' || lower(?) || '%' THEN 2 ELSE 3 END AS text_rank"
                : "0::smallint AS text_rank";
        String textSimilarity = where.contains("name ILIKE")
                ? "similarity(card.name, ?) AS text_similarity"
                : "0::real AS text_similarity";
        return """
                (SELECT card.efhub_id, identity.player_id,
                        card.name, card.team, card.position, card.playing_style,
                        card.overall_rating, %s,
                        '%s' AS card_type, %s, %s, (%s) AS active_meta,
                        %s, %s, card.image_url, card.skills,
                        %s, %s, %s, %s, %s, %s, %s
                 FROM %s card
                 LEFT JOIN card_player_identities identity ON identity.efhub_id = card.efhub_id%s)
                """.formatted(qualify(maxOvr), typeLabel, metaTier, metaPriority,
                        activeMeta, textRank, textSimilarity, configuredTier, configuredPriority,
                        activeFrom, activeUntil, reason, updatedBy, metaUpdatedAt, table, where);
    }

    private String activeMetaExpression(String table) {
        if (!columns.has(table, CardColumns.META_TIER)) return "FALSE";
        List<String> conditions = new ArrayList<>();
        conditions.add("card.meta_tier = 'META'");
        if (columns.has(table, CardColumns.META_ACTIVE_FROM)) {
            conditions.add("(card.meta_active_from IS NULL OR card.meta_active_from <= NOW())");
        }
        if (columns.has(table, CardColumns.META_ACTIVE_UNTIL)) {
            conditions.add("(card.meta_active_until IS NULL OR card.meta_active_until > NOW())");
        }
        return String.join(" AND ", conditions);
    }

    private String optional(String table, String column, String present, String absent) {
        return columns.has(table, column) ? present : absent;
    }

    private static Instant instant(ResultSet resultSet, String column) throws SQLException {
        java.sql.Timestamp value = resultSet.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static String qualify(String expression) {
        if (expression.startsWith("NULL") || expression.startsWith("'")) {
            return expression;
        }
        return "card." + expression;
    }
}
