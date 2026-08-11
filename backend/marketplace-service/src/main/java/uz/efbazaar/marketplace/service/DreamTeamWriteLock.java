package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Component;

import java.util.UUID;

/** Serializes singleton-team creation for one user within the current transaction. */
@Component
@RequiredArgsConstructor
public class DreamTeamWriteLock {

    private final JdbcTemplate jdbc;

    public void acquire(UUID userId) {
        int high = (int) (userId.getMostSignificantBits()
                ^ (userId.getMostSignificantBits() >>> 32));
        int low = (int) (userId.getLeastSignificantBits()
                ^ (userId.getLeastSignificantBits() >>> 32));
        jdbc.query("SELECT pg_advisory_xact_lock(?, ?)",
                (ResultSetExtractor<Void>) resultSet -> null,
                high, low);
    }
}
