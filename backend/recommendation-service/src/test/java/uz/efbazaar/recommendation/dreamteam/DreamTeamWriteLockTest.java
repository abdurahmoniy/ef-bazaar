package uz.efbazaar.recommendation.dreamteam;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class DreamTeamWriteLockTest {

    @SuppressWarnings("unchecked")
    @Test
    void usesAStableTransactionScopedPostgresAdvisoryLockForTheUser() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DreamTeamWriteLock lock = new DreamTeamWriteLock(jdbc);
        UUID userId = UUID.fromString("12345678-1234-5678-9abc-def012345678");
        int high = (int) (userId.getMostSignificantBits()
                ^ (userId.getMostSignificantBits() >>> 32));
        int low = (int) (userId.getLeastSignificantBits()
                ^ (userId.getLeastSignificantBits() >>> 32));

        lock.acquire(userId);

        verify(jdbc).query(
                eq("SELECT pg_advisory_xact_lock(?, ?)"),
                any(ResultSetExtractor.class),
                eq(high), eq(low));
    }
}
