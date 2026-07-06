package uz.efbazaar.marketplace.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.marketplace.domain.ChatMessage;

import java.time.Instant;
import java.util.UUID;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {

    Page<ChatMessage> findByChatIdOrderByCreatedAtAsc(UUID chatId, Pageable pageable);

    long countByChatId(UUID chatId);

    /** Unread = partner's messages after my read cursor. */
    long countByChatIdAndSenderIdNotAndCreatedAtAfter(UUID chatId, UUID senderId, Instant after);
}
