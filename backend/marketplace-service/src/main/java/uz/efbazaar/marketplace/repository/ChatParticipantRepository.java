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
