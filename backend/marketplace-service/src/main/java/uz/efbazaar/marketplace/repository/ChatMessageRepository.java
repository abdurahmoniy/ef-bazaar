package uz.efbazaar.marketplace.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.marketplace.domain.ChatMessage;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {

    Page<ChatMessage> findByChatIdOrderByCreatedAtAsc(UUID chatId, Pageable pageable);

    /** Tarix tozalangandan keyingi xabarlar — foydalanuvchi ko'radigani. */
    Page<ChatMessage> findByChatIdAndCreatedAtAfterOrderByCreatedAtAsc(
            UUID chatId, java.time.Instant after, Pageable pageable);

    /** Ro'yxatdagi oxirgi xabar, tozalangandan keyingilari orasidan. */
    java.util.Optional<ChatMessage> findFirstByChatIdAndCreatedAtAfterOrderByCreatedAtDesc(
            UUID chatId, java.time.Instant after);

    /** Newest first, so page 0 of the admin transcript is where the conversation stands now. */
    Page<ChatMessage> findByChatIdOrderByCreatedAtDescIdDesc(UUID chatId, Pageable pageable);

    /** The concrete message preceding a listing selection, including timestamp ties. */
    Optional<ChatMessage> findFirstByChatIdAndCreatedAtLessThanEqualOrderByCreatedAtDescIdDesc(UUID chatId, Instant createdAt);

    long countByChatId(UUID chatId);

    /** Unread = partner's messages after my read cursor. */
    long countByChatIdAndSenderIdNotAndCreatedAtAfter(UUID chatId, UUID senderId, Instant after);

    /** Newest message — chat list preview line. */
    Optional<ChatMessage> findFirstByChatIdOrderByCreatedAtDesc(UUID chatId);

    /**
     * Total unread across every chat still visible in the user's list —
     * drives the badge on the Chatlar nav icon. Null cursors (pre-V13 rows)
     * count as fully read, matching {@code countUnread}.
     */
    @org.springframework.data.jpa.repository.Query("""
            SELECT COUNT(m) FROM ChatMessage m, ChatParticipant p
            WHERE p.chatId = m.chatId
              AND p.userId = :userId
              AND p.hiddenAt IS NULL
              AND p.lastReadAt IS NOT NULL
              AND m.senderId <> :userId
              AND m.createdAt > p.lastReadAt
            """)
    long totalUnreadFor(@org.springframework.data.repository.query.Param("userId") UUID userId);

    /** Latest negotiation, so an older rejection cannot reopen a newer pending offer. */
    Optional<ChatMessage> findFirstByChatIdAndMessageTypeOrderByCreatedAtDescIdDesc(
            UUID chatId, uz.efbazaar.marketplace.domain.ChatMessageType messageType);

    boolean existsByProposalId(UUID proposalId);

    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("""
            UPDATE ChatMessage m
               SET m.proposalOutcome = :outcome,
                   m.proposalTradeId = COALESCE(:tradeId, m.proposalTradeId)
             WHERE m.proposalId = :proposalId
            """)
    int updateProposalOutcome(@org.springframework.data.repository.query.Param("proposalId") UUID proposalId,
                              @org.springframework.data.repository.query.Param("outcome") String outcome,
                              @org.springframework.data.repository.query.Param("tradeId") UUID tradeId);
}
