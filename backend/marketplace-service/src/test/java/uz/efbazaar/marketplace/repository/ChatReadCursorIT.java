package uz.efbazaar.marketplace.repository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Query;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
class ChatReadCursorIT {
    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private JdbcTemplate jdbc;
    private NamedParameterJdbcTemplate named;
    private String advanceSql;
    private final UUID chat = UUID.randomUUID();
    private final UUID user = UUID.randomUUID();
    private final Instant latest = Instant.parse("2026-09-24T10:00:00Z");

    @BeforeEach void setup() throws Exception {
        var ds = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);
        named = new NamedParameterJdbcTemplate(ds);
        jdbc.execute("DROP TABLE IF EXISTS chat_participants");
        jdbc.execute("CREATE TABLE chat_participants (chat_id UUID NOT NULL, user_id UUID NOT NULL, is_important BOOLEAN NOT NULL DEFAULT FALSE, hidden_at TIMESTAMPTZ, last_read_at TIMESTAMPTZ, PRIMARY KEY (chat_id, user_id))");
        // Execute the shipped repository SQL itself, not a test copy.
        advanceSql = ChatParticipantRepository.class.getMethod("advanceReadCursor", UUID.class, UUID.class, Instant.class)
                .getAnnotation(Query.class).value();
    }
    private void advance(Instant at) {
        named.update(advanceSql, Map.of("chatId", chat, "userId", user, "readAt", Timestamp.from(at)));
    }
    private Instant cursor() {
        return jdbc.queryForObject("SELECT last_read_at FROM chat_participants WHERE chat_id = ? AND user_id = ?", Timestamp.class, chat, user).toInstant();
    }
    @Test void delayedRequestsNeverRegressCursorOrClearParticipantState() {
        advance(latest);
        jdbc.update("UPDATE chat_participants SET is_important = true, hidden_at = ?", Timestamp.from(latest));
        advance(latest.minusSeconds(30));
        advance(latest);
        assertThat(cursor()).isEqualTo(latest);
        assertThat(jdbc.queryForObject("SELECT is_important FROM chat_participants", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("SELECT hidden_at FROM chat_participants", Timestamp.class).toInstant()).isEqualTo(latest);
    }
    @Test void nullLegacyCursorCanAdvance() {
        jdbc.update("INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)", chat, user);
        advance(latest);
        assertThat(cursor()).isEqualTo(latest);
    }
    @Test void concurrentInitialAndOutOfOrderRequestsKeepMaximumTimestamp() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(8)) {
            List<Future<?>> requests = new ArrayList<>();
            for (int i = 0; i < 24; i++) {
                Instant at = latest.minusSeconds(i);
                requests.add(pool.submit(() -> { start.await(); advance(at); return null; }));
            }
            start.countDown();
            for (var request : requests) request.get(20, TimeUnit.SECONDS);
        }
        assertThat(cursor()).isEqualTo(latest);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM chat_participants", Long.class)).isEqualTo(1L);
    }
}
