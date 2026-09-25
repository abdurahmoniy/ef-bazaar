package uz.efbazaar.marketplace.repository;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.nio.file.*;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class ChatMessageSendMigrationIT {
    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    @Test void migrationEnforcesScopedKeysAndPreservesDeletedMessageReceipts() throws Exception {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
        jdbc.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"");
        jdbc.execute("CREATE TABLE chats (id UUID PRIMARY KEY)");
        jdbc.execute("CREATE TABLE chat_messages (id UUID PRIMARY KEY, chat_id UUID NOT NULL, sender_id UUID NOT NULL, content TEXT NOT NULL)");
        UUID chat = UUID.randomUUID(), sender = UUID.randomUUID(), key = UUID.randomUUID(), message = UUID.randomUUID();
        jdbc.update("INSERT INTO chats VALUES (?)", chat);
        jdbc.update("INSERT INTO chat_messages VALUES (?, ?, ?, 'legacy')", message, chat, sender);
        jdbc.execute(Files.readString(Path.of("src/main/resources/db/migration/V70__chat_message_send_receipts.sql")));
        assertThat(jdbc.queryForMap("SELECT * FROM chat_messages WHERE id = ?", message).get("client_message_id")).isNull();
        jdbc.update("UPDATE chat_messages SET client_message_id = ? WHERE id = ?", key, message);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO chat_messages VALUES (?, ?, ?, 'duplicate', ?)", UUID.randomUUID(), chat, sender, key))
                .isInstanceOf(DuplicateKeyException.class);
        jdbc.update("INSERT INTO chat_message_sends (chat_id, sender_id, client_message_id, message_id) VALUES (?, ?, ?, ?)", chat, sender, key, message);
        jdbc.update("DELETE FROM chat_messages WHERE id = ?", message);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO chat_message_sends (chat_id, sender_id, client_message_id, message_id) VALUES (?, ?, ?, ?)", chat, sender, key, UUID.randomUUID()))
                .isInstanceOf(DuplicateKeyException.class);
        assertThat(jdbc.queryForObject("SELECT message_id FROM chat_message_sends", UUID.class)).isEqualTo(message);
        jdbc.update("DELETE FROM chats WHERE id = ?", chat);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM chat_message_sends", Integer.class)).isZero();
    }
}
