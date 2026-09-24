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

    /** Every conversation on the platform, most recently active first — admin read-only view. */
    Page<Chat> findAllByOrderByLastMessageAtDesc(Pageable pageable);

    /**
     * Admin search over the name snapshots of either party. {@code pattern} is
     * a lower-cased LIKE pattern whose own {@code %} / {@code _} are escaped
     * with a backslash.
     */
    @Query("""
            SELECT c FROM Chat c
            WHERE LOWER(COALESCE(c.buyerDisplayName, '')) LIKE :pattern ESCAPE '\\'
               OR LOWER(COALESCE(c.sellerDisplayName, '')) LIKE :pattern ESCAPE '\\'
            ORDER BY c.lastMessageAt DESC
            """)
    Page<Chat> searchByName(@Param("pattern") String pattern, Pageable pageable);

    /**
     * Admin ro'yxati: o'chirilgan chatlar ALOHIDA turadi.
     *
     * <p>"O'chirilgan" — tarixi tozalangan va shundan keyin yangi xabar
     * kelmagan chat. Juftlik yana yozishsa, u toza ro'yxatga qaytadi:
     * eski tarixi admin uchun baribir ochiq qoladi, lekin ro'yxatda
     * "o'chirilgan" bo'lib turishi chalg'itardi.
     *
     * <p>Nomlar bo'yicha qidiruv ikkala ro'yxatda ham ishlaydi — nizoda
     * aynan o'chirilganini topish kerak bo'ladi.
     */
    @Query("""
            SELECT c FROM Chat c
            WHERE (:deleted = false AND (c.clearedAt IS NULL OR c.lastMessageAt > c.clearedAt))
               OR (:deleted = true  AND c.clearedAt IS NOT NULL
                     AND (c.lastMessageAt IS NULL OR c.lastMessageAt <= c.clearedAt))
            ORDER BY c.lastMessageAt DESC
            """)
    Page<Chat> findForAdmin(@Param("deleted") boolean deleted, Pageable pageable);

    @Query("""
            SELECT c FROM Chat c
            WHERE ((:deleted = false AND (c.clearedAt IS NULL OR c.lastMessageAt > c.clearedAt))
                OR (:deleted = true  AND c.clearedAt IS NOT NULL
                      AND (c.lastMessageAt IS NULL OR c.lastMessageAt <= c.clearedAt)))
              AND (LOWER(COALESCE(c.buyerDisplayName, '')) LIKE :pattern ESCAPE '\\'
                OR LOWER(COALESCE(c.sellerDisplayName, '')) LIKE :pattern ESCAPE '\\')
            ORDER BY c.lastMessageAt DESC
            """)
    Page<Chat> searchForAdmin(@Param("pattern") String pattern,
                              @Param("deleted") boolean deleted,
                              Pageable pageable);

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
