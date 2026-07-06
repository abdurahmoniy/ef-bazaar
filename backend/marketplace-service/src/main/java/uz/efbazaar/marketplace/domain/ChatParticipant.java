package uz.efbazaar.marketplace.domain;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/**
 * Per-user view state of a chat: my star ("Muhim") and my hide timestamp.
 * Hiding removes the chat from my list only; the aggregate
 * {@link Chat#isImportant()} flag (either side starred) still lives on the
 * chat row for the expiry scheduler.
 */
@Entity
@Table(name = "chat_participants")
@IdClass(ChatParticipant.Key.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatParticipant {

    @Id
    @Column(name = "chat_id", nullable = false)
    private UUID chatId;

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "is_important", nullable = false)
    @Builder.Default
    private boolean important = false;

    @Column(name = "hidden_at")
    private Instant hiddenAt;

    /**
     * Read cursor — messages created after this are "unread" for me.
     * Null only for rows written by pre-V13 nodes during rollout; treated as
     * "everything read" to avoid flooding the UI.
     */
    @Column(name = "last_read_at")
    private Instant lastReadAt;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private UUID chatId;
        private UUID userId;
    }
}
