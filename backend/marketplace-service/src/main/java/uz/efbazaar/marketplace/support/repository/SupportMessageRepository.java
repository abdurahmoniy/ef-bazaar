package uz.efbazaar.marketplace.support.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.marketplace.support.domain.SupportMessage;

import java.util.List;
import java.util.UUID;

public interface SupportMessageRepository extends JpaRepository<SupportMessage, UUID> {

    List<SupportMessage> findBySupportChatIdOrderByCreatedAtAsc(UUID supportChatId);

    java.util.Optional<SupportMessage> findFirstBySupportChatIdOrderByCreatedAtDesc(UUID supportChatId);

    boolean existsByTelegramMessageId(Long telegramMessageId);
}
