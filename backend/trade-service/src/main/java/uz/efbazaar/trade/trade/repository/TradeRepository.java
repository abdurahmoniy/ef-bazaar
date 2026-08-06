package uz.efbazaar.trade.trade.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeState;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public interface TradeRepository extends JpaRepository<Trade, UUID> {

    @Query("""
            SELECT t FROM Trade t
             WHERE t.id = :id
               AND (t.sellerId = :userId OR t.buyerId = :userId)
            """)
    Optional<Trade> findByIdAndParticipant(@Param("id") UUID id,
                                           @Param("userId") UUID userId);

    /**
     * Like {@link #findByIdAndParticipant} but also matches the assigned human
     * admin. Used by every admin endpoint; returning empty (→ 404) for a
     * stranger avoids confirming the trade exists.
     */
    @Query("""
            SELECT t FROM Trade t
             WHERE t.id = :id
               AND (t.sellerId = :userId
                 OR t.buyerId = :userId
                 OR t.assignedAdminId = :userId)
            """)
    Optional<Trade> findByIdAndViewer(@Param("id") UUID id,
                                      @Param("userId") UUID userId);

    @Query("""
            SELECT t FROM Trade t
             WHERE t.chatId = :chatId
               AND (t.sellerId = :userId OR t.buyerId = :userId)
             ORDER BY t.createdAt DESC
            """)
    List<Trade> findByChatIdAndParticipantOrderByCreatedAtDesc(@Param("chatId") UUID chatId,
                                                               @Param("userId") UUID userId);

    List<Trade> findByStateInAndStateDeadlineBefore(Set<TradeState> states,
                                                    Instant cutoff);

    Optional<Trade> findByMailboxId(UUID mailboxId);

    /**
     * How many trades this admin has ACCEPTED and not yet finished. Feeds the
     * catalogue's busy flag and the capacity check when an admin accepts.
     *
     * <p>Deliberately excludes {@code WAITING_ADMIN}: an invitation is not a
     * reservation (spec §9.5), so a pending invite — including the very trade
     * an {@code accept()} call is currently resolving, which is still
     * {@code WAITING_ADMIN} at the moment the check runs — must not count
     * against {@code maxConcurrentTrades}.
     */
    @Query("""
            SELECT COUNT(t) FROM Trade t
             WHERE t.assignedAdminId = :adminId
               AND t.state IN (uz.efbazaar.trade.trade.domain.TradeState.IN_PROGRESS,
                               uz.efbazaar.trade.trade.domain.TradeState.WAITING_CLOSE_CONFIRM)
            """)
    int countActiveByAdmin(@Param("adminId") UUID adminId);

    List<Trade> findByAssignedAdminIdAndState(UUID assignedAdminId, TradeState state);

    List<Trade> findByAssignedAdminIdOrderByCreatedAtDesc(UUID assignedAdminId);

    /**
     * Row lock for the dual-confirmation write: two parties confirming at once
     * must serialise so the second sees the first one's timestamp and fires
     * CLOSE_CONFIRMED exactly once.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM Trade t WHERE t.id = :id")
    Optional<Trade> findByIdForUpdate(@Param("id") UUID id);

    /**
     * Human trades whose admin has gone quiet and which have not been escalated
     * yet. Backed by ix_trades_escalation_due.
     */
    @Query("""
            SELECT t FROM Trade t
             WHERE t.mode = uz.efbazaar.trade.trade.domain.TradeMode.HUMAN
               AND t.state = uz.efbazaar.trade.trade.domain.TradeState.IN_PROGRESS
               AND t.escalatedAt IS NULL
               AND t.escalationDeadlineAt IS NOT NULL
               AND t.escalationDeadlineAt < :now
            """)
    List<Trade> findIdleHumanTrades(@Param("now") Instant now);

    List<Trade> findByEscalatedAtIsNotNullOrderByEscalatedAtAsc();
}
