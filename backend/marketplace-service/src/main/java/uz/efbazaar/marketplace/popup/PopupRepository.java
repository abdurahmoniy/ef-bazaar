package uz.efbazaar.marketplace.popup;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import uz.efbazaar.marketplace.popup.PopupDtos.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Repository
public class PopupRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public PopupRepository(JdbcTemplate jdbc) { this.jdbc = new NamedParameterJdbcTemplate(jdbc); }

    private static final String CAMPAIGN_COLUMNS = "c.*, 0 AS shown_count, 0 AS clicked_count, 0 AS dismissed_count";
    private static final String CAMPAIGN_STATS = """
            c.*, (SELECT count(shown_at) FROM popup_deliveries d WHERE d.campaign_id = c.id) AS shown_count,
            (SELECT count(clicked_at) FROM popup_deliveries d WHERE d.campaign_id = c.id) AS clicked_count,
            (SELECT count(dismissed_at) FROM popup_deliveries d WHERE d.campaign_id = c.id) AS dismissed_count
            """;
    private static final RowMapper<Campaign> CAMPAIGN = (row, number) -> new Campaign(
            row.getObject("id", UUID.class), row.getString("title"), row.getString("message"),
            Tone.valueOf(row.getString("tone")), Audience.valueOf(row.getString("audience")),
            Arrays.asList((UUID[]) row.getArray("recipient_ids").getArray()), Trigger.valueOf(row.getString("trigger")),
            row.getString("action_label"), row.getString("action_path"), row.getTimestamp("starts_at").toInstant(),
            row.getTimestamp("ends_at").toInstant(), row.getInt("priority"), Status.valueOf(row.getString("status")),
            row.getTimestamp("created_at").toInstant(), row.getObject("created_by", UUID.class),
            row.getLong("shown_count"), row.getLong("clicked_count"), row.getLong("dismissed_count"));

    // The same predicate is used for discovery and the locked claim; browser hints cannot bypass it.
    private static final String ELIGIBLE = """
            c.status = 'ACTIVE' AND c.starts_at <= :now AND c.ends_at > :now AND c.trigger = :trigger
            AND (c.audience = 'ALL'
                OR (c.audience = 'SELECTED' AND :userId = ANY(c.recipient_ids))
                OR (c.audience = 'SELLERS' AND EXISTS (
                    SELECT 1 FROM listings l WHERE l.seller_id = :userId AND l.status <> 'DELETED')))
            AND NOT EXISTS (SELECT 1 FROM popup_deliveries d WHERE d.user_id = :userId AND d.campaign_id = c.id)
            AND NOT EXISTS (SELECT 1 FROM popup_deliveries d WHERE d.user_id = :userId
                            AND d.claimed_at > CAST(:now AS timestamptz) - interval '6 hours')
            AND (SELECT count(*) FROM popup_deliveries d WHERE d.user_id = :userId
                 AND d.claimed_at > CAST(:now AS timestamptz) - interval '24 hours') < 2
            """;

    List<Campaign> list() {
        return jdbc.query("""
                SELECT c.*, stats.* FROM (
                    SELECT * FROM popup_campaigns ORDER BY created_at DESC, id DESC LIMIT 100
                ) c CROSS JOIN LATERAL (
                    SELECT count(shown_at) AS shown_count, count(clicked_at) AS clicked_count,
                           count(dismissed_at) AS dismissed_count FROM popup_deliveries d WHERE d.campaign_id = c.id
                ) stats ORDER BY c.created_at DESC, c.id DESC
                """, CAMPAIGN);
    }

    Optional<Campaign> find(UUID id, boolean lock) {
        return jdbc.query("SELECT " + (lock ? CAMPAIGN_COLUMNS : CAMPAIGN_STATS) + " FROM popup_campaigns c WHERE c.id = :id"
                + (lock ? " FOR SHARE OF c" : ""), Map.of("id", id), CAMPAIGN).stream().findFirst();
    }

    Campaign insert(UUID createdBy, CreateCampaign input) {
        UUID id = UUID.randomUUID();
        List<UUID> recipients = input.recipientIds() == null ? List.of() : input.recipientIds();
        var params = new MapSqlParameterSource().addValue("id", id).addValue("createdBy", createdBy)
                .addValue("title", input.title().strip()).addValue("message", input.message().strip())
                .addValue("tone", input.tone().name()).addValue("audience", input.audience().name())
                .addValue("recipients", recipients.stream().distinct().map(UUID::toString).collect(Collectors.joining(",", "{", "}")))
                .addValue("trigger", input.trigger().name()).addValue("actionLabel", input.actionLabel())
                .addValue("actionPath", input.actionPath()).addValue("startsAt", Timestamp.from(input.startsAt()))
                .addValue("endsAt", Timestamp.from(input.endsAt())).addValue("priority", input.priority());
        jdbc.update("""
                INSERT INTO popup_campaigns (id, title, message, tone, audience, recipient_ids, trigger,
                    action_label, action_path, starts_at, ends_at, priority, status, created_by)
                VALUES (:id, :title, :message, :tone, :audience, CAST(:recipients AS UUID[]), :trigger,
                    :actionLabel, :actionPath, :startsAt, :endsAt, :priority, 'DRAFT', :createdBy)
                """, params);
        return find(id, false).orElseThrow();
    }

    boolean updateStatus(UUID id, Status status) {
        return jdbc.update("""
                UPDATE popup_campaigns SET status = :status WHERE id = :id
                AND (:status <> 'ACTIVE' OR ends_at > clock_timestamp())
                """, Map.of("id", id, "status", status.name())) == 1;
    }

    void lockUser(UUID userId) {
        jdbc.update("INSERT INTO popup_delivery_users(user_id) VALUES (:userId) ON CONFLICT DO NOTHING", Map.of("userId", userId));
        jdbc.queryForObject("SELECT user_id FROM popup_delivery_users WHERE user_id = :userId FOR UPDATE", Map.of("userId", userId), UUID.class);
    }

    Instant now() {
        return jdbc.queryForObject("SELECT clock_timestamp()", Map.of(), Timestamp.class).toInstant();
    }

    private MapSqlParameterSource eligibilityParams(UUID userId, Trigger trigger, Instant now) {
        return new MapSqlParameterSource().addValue("userId", userId).addValue("trigger", trigger.name()).addValue("now", Timestamp.from(now));
    }

    Optional<Campaign> next(UUID userId, Trigger trigger) {
        return jdbc.query("SELECT " + CAMPAIGN_COLUMNS + " FROM popup_campaigns c WHERE " + ELIGIBLE
                + " ORDER BY c.priority DESC, c.created_at DESC, c.id DESC LIMIT 1",
                eligibilityParams(userId, trigger, now()), CAMPAIGN).stream().findFirst();
    }

    boolean eligible(UUID id, UUID userId, Trigger trigger, UUID sessionId, Instant now) {
        var params = eligibilityParams(userId, trigger, now).addValue("id", id).addValue("sessionId", sessionId);
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM popup_campaigns c WHERE c.id = :id AND " + ELIGIBLE + """
                 AND NOT EXISTS (SELECT 1 FROM popup_deliveries d WHERE d.user_id = :userId AND d.session_id = :sessionId))
                """, params, Boolean.class));
    }

    UUID reserve(UUID campaignId, UUID userId, UUID sessionId, Instant now) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO popup_deliveries (id, campaign_id, user_id, session_id, claimed_at)
                VALUES (:id, :campaignId, :userId, :sessionId, :now)
                """, new MapSqlParameterSource().addValue("id", id).addValue("campaignId", campaignId)
                .addValue("userId", userId).addValue("sessionId", sessionId).addValue("now", Timestamp.from(now)));
        return id;
    }

    boolean recordEvent(UUID deliveryId, UUID userId, Event event) {
        String column = switch (event) {
            case SHOWN -> "shown_at";
            case CLICKED -> "clicked_at";
            case DISMISSED -> "dismissed_at";
        };
        // PostgreSQL re-evaluates the CASE after acquiring the row lock. The first terminal
        // action wins, while a delayed SHOWN may still arrive after either terminal action.
        String value = switch (event) {
            case SHOWN -> "COALESCE(shown_at, clock_timestamp())";
            case CLICKED -> "CASE WHEN dismissed_at IS NULL THEN COALESCE(clicked_at, clock_timestamp()) ELSE clicked_at END";
            case DISMISSED -> "CASE WHEN clicked_at IS NULL THEN COALESCE(dismissed_at, clock_timestamp()) ELSE dismissed_at END";
        };
        // All SQL fragments come from fixed enums, never request text. No-op duplicates still return 204.
        return jdbc.update("UPDATE popup_deliveries SET " + column + " = " + value
                + " WHERE id = :id AND user_id = :userId",
                Map.of("id", deliveryId, "userId", userId)) == 1;
    }
}
