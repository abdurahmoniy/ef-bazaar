package uz.efbazaar.marketplace.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.marketplace.domain.Notification;
import uz.efbazaar.marketplace.domain.NotificationType;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    Page<Notification> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    long countByUserIdAndReadAtIsNull(UUID userId);

    /**
     * Admin panelidagi ishora uchun: pul yechish so'rovlari haqidagi
     * o'qilmagan bildirishnomalar.
     *
     * <p>Alohida jadval yaratmaymiz — bu qatorlar allaqachon har admin
     * uchun yoziladi ({@code WithdrawalConsumer}) va ularni ikkinchi marta
     * sanash ikki manba orasida farq tug'dirardi.
     *
     * <p>Ikkita metod: `:since is null` bitta so'rovga qo'yilsa, Postgres
     * qiymat null bo'lganda parametr turini aniqlay olmay 42P18 beradi.
     */
    long countByUserIdAndTypeAndReadAtIsNull(UUID adminId, NotificationType type);

    long countByUserIdAndTypeAndReadAtIsNullAndCreatedAtAfter(
            UUID adminId, NotificationType type, Instant since);

    Optional<Notification> findFirstByUserIdAndChatIdAndTypeAndReadAtIsNull(
            UUID userId, UUID chatId, NotificationType type);

    /** Redelivery guard for trade-service events — one invite notice per (admin, trade). */
    boolean existsByUserIdAndTypeAndWithdrawalId(UUID userId, NotificationType type, UUID withdrawalId);

    boolean existsByUserIdAndTypeAndTradeId(UUID userId, NotificationType type, UUID tradeId);

    @Modifying
    @Query("""
            UPDATE Notification n
               SET n.readAt = :ts
             WHERE n.userId = :userId
               AND n.readAt IS NULL
            """)
    int markAllRead(@Param("userId") UUID userId, @Param("ts") Instant ts);
}
