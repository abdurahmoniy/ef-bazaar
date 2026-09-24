package uz.efbazaar.marketplace.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.marketplace.domain.ChatParticipant;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatParticipantRepository extends JpaRepository<ChatParticipant, ChatParticipant.Key> {

    Optional<ChatParticipant> findByChatIdAndUserId(UUID chatId, UUID userId);

    List<ChatParticipant> findByChatId(UUID chatId);

    /** Atomic even for concurrent, out-of-order requests and absent legacy rows. */
    @Modifying
    @Query(value = """
            INSERT INTO chat_participants (chat_id, user_id, is_important, last_read_at)
            VALUES (:chatId, :userId, false, :readAt)
            ON CONFLICT (chat_id, user_id) DO UPDATE
               SET last_read_at = GREATEST(chat_participants.last_read_at, EXCLUDED.last_read_at)
            """, nativeQuery = true)
    int advanceReadCursor(@Param("chatId") UUID chatId, @Param("userId") UUID userId,
                          @Param("readAt") java.time.Instant readAt);


    /**
     * Resurfaces the chat for everyone — called on each new message so a
     * hidden ("deleted for me") conversation reappears when the partner writes.
     */
    @Modifying
    @Query("""
            UPDATE ChatParticipant p
               SET p.hiddenAt = null
             WHERE p.chatId = :chatId
               AND p.hiddenAt IS NOT NULL
            """)
    int unhideAll(@Param("chatId") UUID chatId);
}
