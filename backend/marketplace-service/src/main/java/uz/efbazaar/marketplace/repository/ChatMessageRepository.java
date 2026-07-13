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

    boolean existsByProposalId(UUID proposalId);

    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("""
            UPDATE ChatMessage m
               SET m.proposalOutcome = :outcome
             WHERE m.proposalId = :proposalId
            """)
    int updateProposalOutcome(@org.springframework.data.repository.query.Param("proposalId") UUID proposalId,
                              @org.springframework.data.repository.query.Param("outcome") String outcome);
}
