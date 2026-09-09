package uz.efbazaar.marketplace.support.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.marketplace.support.domain.SupportCategory;
import uz.efbazaar.marketplace.support.domain.SupportChat;
import uz.efbazaar.marketplace.support.domain.SupportChatStatus;

import java.util.Optional;
import java.util.UUID;

public interface SupportChatRepository extends JpaRepository<SupportChat, UUID> {

    Optional<SupportChat> findFirstByUserIdAndStatusNotOrderByLastMessageAtDesc(
            UUID userId, SupportChatStatus status);

    Optional<SupportChat> findFirstByGuestSessionIdAndStatusNotOrderByLastMessageAtDesc(
            String guestSessionId, SupportChatStatus status);

    Optional<SupportChat> findByTelegramRootMessageId(Long telegramRootMessageId);

    @Query("SELECT c FROM SupportChat c WHERE c.telegramRootMessageId = :telegramMessageId " +
           "OR c.id IN (SELECT m.supportChatId FROM SupportMessage m WHERE m.telegramMessageId = :telegramMessageId)")
    Optional<SupportChat> findByAnyTelegramMessageId(@Param("telegramMessageId") Long telegramMessageId);

    @Query("SELECT c FROM SupportChat c WHERE " +
           "(:category IS NULL OR c.category = :category) AND " +
           "(:status IS NULL OR c.status = :status) AND " +
           "(:search IS NULL OR LOWER(c.senderName) LIKE LOWER(CONCAT('%', :search, '%')) OR LOWER(c.senderContact) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<SupportChat> findForAdmin(
            @Param("category") SupportCategory category,
            @Param("status") SupportChatStatus status,
            @Param("search") String search,
            Pageable pageable);

    long countByStatus(SupportChatStatus status);
}
