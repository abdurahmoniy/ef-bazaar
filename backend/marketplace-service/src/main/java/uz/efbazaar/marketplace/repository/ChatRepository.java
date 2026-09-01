package uz.efbazaar.marketplace.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.marketplace.domain.Chat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface ChatRepository extends JpaRepository<Chat, UUID> {

    /**
     * The pair's conversation, whichever way round the roles were recorded.
     */
    @Query("""
            SELECT c FROM Chat c
            WHERE ((c.buyerId = :a AND c.sellerId = :b)
                OR (c.buyerId = :b AND c.sellerId = :a))
            ORDER BY c.lastMessageAt DESC
            """)
    List<Chat> findBetween(@Param("a") UUID a, @Param("b") UUID b);

    /**
     * Chats visible in the user's list — participant row exists and the user
     * has not hidden ("deleted for me") the conversation.
     */
    @Query("""
            SELECT c FROM Chat c
            JOIN ChatParticipant p ON p.chatId = c.id AND p.userId = :userId
            WHERE p.hiddenAt IS NULL
            ORDER BY c.lastMessageAt DESC
            """)
    Page<Chat> findByParticipant(@Param("userId") UUID userId, Pageable pageable);

    @Modifying
    @Query("UPDATE Chat c SET c.lastMessageAt = :ts WHERE c.id = :id")
    void touchLastMessageAt(@Param("id") UUID id, @Param("ts") Instant ts);
}
