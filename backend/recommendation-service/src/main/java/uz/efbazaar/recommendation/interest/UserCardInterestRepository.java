package uz.efbazaar.recommendation.interest;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** Login qilgan foydalanuvchi qaysi kartaga qiziqqani — shaxsiy lenta signali. */
@Repository
public class UserCardInterestRepository {

    private final JdbcTemplate jdbc;

    public UserCardInterestRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void touch(UUID userId, Collection<Long> efhubIds) {
        List<Object[]> rows = efhubIds.stream().map(id -> new Object[]{userId, id}).toList();
        if (rows.isEmpty()) return;
        jdbc.batchUpdate("""
                INSERT INTO user_card_interest (user_id, efhub_id, last_at)
                VALUES (?, ?, now())
                ON CONFLICT (user_id, efhub_id) DO UPDATE SET last_at = now()
                """, rows);
    }

    public int deleteOlderThan(Duration age) {
        return jdbc.update("DELETE FROM user_card_interest WHERE last_at < now() - make_interval(secs => ?)",
                age.toSeconds());
    }
}
