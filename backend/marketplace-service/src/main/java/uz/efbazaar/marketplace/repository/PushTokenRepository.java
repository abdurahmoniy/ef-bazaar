package uz.efbazaar.marketplace.repository;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class PushTokenRepository {
    private final JdbcTemplate jdbc;

    public void register(UUID userId, String token) {
        jdbc.update("""
                INSERT INTO notification_push_tokens (token, user_id, updated_at)
                VALUES (?, ?, now())
                ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = now()
                """, token, userId);
    }

    public void remove(UUID userId, String token) {
        jdbc.update("DELETE FROM notification_push_tokens WHERE user_id = ? AND token = ?", userId, token);
    }

    public List<String> findByUserId(UUID userId) {
        return jdbc.queryForList("SELECT token FROM notification_push_tokens WHERE user_id = ?", String.class, userId);
    }
}
