package uz.efbazaar.marketplace.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.marketplace.domain.ChatMessageSend;
import java.util.Optional;
import java.util.UUID;

public interface ChatMessageSendRepository extends JpaRepository<ChatMessageSend, UUID> {
    Optional<ChatMessageSend> findByChatIdAndSenderIdAndClientMessageId(UUID chatId, UUID senderId, UUID clientMessageId);
}
