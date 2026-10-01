package uz.efbazaar.recommendation.feed;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Profil so'rov paytida yig'iladi, alohida saqlanmaydi. Dream team slotlari JSONB — marketplace'dan
 * ko'chirilgan eski qatorlarda shakl buzilgan bo'lishi mumkin, shuning uchun ID'lar regex bilan
 * tekshirilib, keyin cast qilinadi: bitta yomon slot butun lentani yiqitmasin.
 */
@Repository
public class ProfileRepository {

    private static final String SQL = """
            WITH raw(efhub_id, player_id, weight) AS (
                SELECT (slot -> 'card' ->> 'efhubId')::bigint,
                       (slot -> 'card' ->> 'playerId')::uuid,
                       (CASE WHEN slot ->> 'w' = '3' THEN 3 ELSE 1 END)::numeric
                FROM dream_teams team
                CROSS JOIN LATERAL jsonb_array_elements(
                    CASE WHEN jsonb_typeof(team.slots) = 'array' THEN team.slots ELSE '[]'::jsonb END) slot
                WHERE team.user_id = ?
                  AND jsonb_typeof(slot) = 'object'
                  AND (slot -> 'card' ->> 'efhubId') ~ '^[0-9]{1,18}$'
                  AND (slot -> 'card' ->> 'playerId')
                      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                UNION ALL
                SELECT card.efhub_id, card.player_id, 1::numeric
                FROM user_likes liked
                JOIN listing_cards_view card ON card.listing_id = liked.listing_id
                WHERE liked.user_id = ? AND liked.liked
                UNION ALL
                SELECT interest.efhub_id, catalog.player_id, 1::numeric
                FROM user_card_interest interest
                JOIN cards_view catalog ON catalog.efhub_id = interest.efhub_id
                WHERE interest.user_id = ?
                  AND interest.last_at >= ?
                  AND catalog.player_id IS NOT NULL
            ),
            summed AS (
                SELECT efhub_id, (array_agg(player_id ORDER BY player_id))[1] AS player_id, SUM(weight) AS weight
                FROM raw
                GROUP BY efhub_id
            )
            SELECT summed.efhub_id,
                   summed.player_id,
                   summed.weight,
                   COALESCE(catalog.meta_tier = 'META'
                            AND (catalog.active_from IS NULL OR catalog.active_from <= now())
                            AND (catalog.active_until IS NULL OR catalog.active_until > now()), false) AS active_meta
            FROM summed
            LEFT JOIN cards_view catalog ON catalog.efhub_id = summed.efhub_id
            """;

    private final JdbcTemplate jdbc;

    public ProfileRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ProfileSignal> signals(UUID userId, Instant interestSince) {
        return jdbc.query(SQL, (rs, row) -> new ProfileSignal(
                        rs.getLong("efhub_id"),
                        rs.getObject("player_id", UUID.class),
                        rs.getBigDecimal("weight"),
                        rs.getBoolean("active_meta")),
                userId, userId, userId, Timestamp.from(interestSince));
    }
}
