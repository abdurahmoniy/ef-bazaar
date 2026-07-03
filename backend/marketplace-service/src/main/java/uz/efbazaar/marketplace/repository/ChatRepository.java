package uz.efbazaar.marketplace.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.domain.ChatStatus;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatRepository extends JpaRepository<Chat, UUID> {

    Optional<Chat> findByBuyerIdAndListingIdAndStatus(UUID buyerId, UUID listingId, ChatStatus status);

    @Query("""
            SELECT c FROM Chat c
            WHERE (c.buyerId = :userId OR c.sellerId = :userId)
            ORDER BY c.lastMessageAt DESC
            """)
    Page<Chat> findByParticipant(@Param("userId") UUID userId, Pageable pageable);

    /**
     * Aktiv, important emas va 24 soat oldingi xabarli chatlarni qaytaradi.
     */
    @Query("""
            SELECT c FROM Chat c
            WHERE c.status = uz.efbazaar.marketplace.domain.ChatStatus.ACTIVE
              AND c.important = false
              AND c.lastMessageAt < :cutoff
            """)
    List<Chat> findExpired(@Param("cutoff") Instant cutoff);

    @Modifying
    @Query("UPDATE Chat c SET c.lastMessageAt = :ts WHERE c.id = :id")
    void touchLastMessageAt(@Param("id") UUID id, @Param("ts") Instant ts);

    /**
     * Close every ACTIVE chat the user participates in as buyer or seller.
     * Used when auth reports the user is gone — the counterpart shouldn't wait
     * on a reply that will never come. Returns the number of rows affected.
     */
    @Modifying
    @Query("""
            UPDATE Chat c
               SET c.status = uz.efbazaar.marketplace.domain.ChatStatus.CLOSED,
                   c.closedAt = :ts
             WHERE c.status = uz.efbazaar.marketplace.domain.ChatStatus.ACTIVE
               AND (c.buyerId = :userId OR c.sellerId = :userId)
            """)
    int closeAllForParticipant(@Param("userId") UUID userId, @Param("ts") Instant ts);
}
