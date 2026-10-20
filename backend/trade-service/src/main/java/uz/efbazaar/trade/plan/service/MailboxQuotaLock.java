package uz.efbazaar.trade.plan.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.util.Arrays;
import java.util.Objects;
import java.util.UUID;

/** Cross-instance locks held until commit, in one deterministic order for multi-user trades. */
@Service
@RequiredArgsConstructor
public class MailboxQuotaLock {
    private final JdbcTemplate jdbc;

    @Transactional(propagation = Propagation.MANDATORY)
    public void lock(UUID... users) {
        Arrays.stream(users).filter(Objects::nonNull).distinct().sorted().forEach(user ->
                jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(CAST(? AS text), 61475))",
                        rs -> { }, user.toString()));
    }
}
