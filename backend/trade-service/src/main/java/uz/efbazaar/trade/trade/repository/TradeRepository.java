package uz.efbazaar.trade.trade.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
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

    /**
     * Shu chatda tugallanmagan savdo bormi.
     *
     * <p>Marketplace chat tarixini tozalashdan oldin so'raydi: savdo
     * davom etayotganda tozalash odamni savdoning o'rtasida kontekstsiz
     * qoldirardi.
     */
    @Query("""
            SELECT COUNT(t) > 0 FROM Trade t
             WHERE t.chatId = :chatId
               AND t.state IN :states
            """)
    boolean existsLiveInChat(@Param("chatId") UUID chatId,
                             @Param("states") java.util.Collection<TradeState> states);

    @Query("""
            SELECT COUNT(t) > 0 FROM Trade t
             WHERE t.giveAccountId = :accountId
               AND t.state IN :states
            """)
    boolean existsLiveWithGiveAccount(@Param("accountId") UUID accountId,
                                      @Param("states") java.util.Collection<TradeState> states);

    @Query("""
            SELECT COUNT(t) > 0 FROM Trade t
             WHERE t.listingId = :listingId
               AND t.state IN :states
            """)
    boolean existsLiveWithListing(@Param("listingId") UUID listingId,
                                  @Param("states") java.util.Collection<TradeState> states);

    /** Qabul oynasida "Savdoda" belgisi uchun. */
    @Query("""
            SELECT t.giveAccountId FROM Trade t
             WHERE t.buyerId = :buyerId
               AND t.giveAccountId IS NOT NULL
               AND t.state IN :states
            """)
    List<UUID> findGiveAccountIdsOfBuyer(@Param("buyerId") UUID buyerId,
                                         @Param("states") java.util.Collection<TradeState> states);

    @Query("""
            SELECT t FROM Trade t
             WHERE t.chatId = :chatId
               AND (t.sellerId = :userId OR t.buyerId = :userId)
             ORDER BY t.createdAt DESC
            """)
    List<Trade> findByChatIdAndParticipantOrderByCreatedAtDesc(@Param("chatId") UUID chatId,
                                                               @Param("userId") UUID userId);

    /**
     * Every trade the caller takes part in, either side, newest first. Backs
     * the profile's "Savdolarim" tab — before it, a trade could only be
     * reached through the chat it started in, so an escrow deal with a running
     * deadline was only findable by remembering which thread it belonged to.
     */
    @Query("""
            SELECT t FROM Trade t
             WHERE t.sellerId = :userId OR t.buyerId = :userId
             ORDER BY t.createdAt DESC
            """)
    Page<Trade> findByParticipant(@Param("userId") UUID userId, Pageable pageable);

    List<Trade> findByStateInAndStateDeadlineBefore(Set<TradeState> states,
                                                    Instant cutoff);

    Optional<Trade> findByMailboxId(UUID mailboxId);

    /**
     * Whether a trade still in progress uses this mailbox — as the trade's own
     * box or as either party's side box in a swap. {@code mailboxes.trade_id}
     * cannot answer this: placeholder boxes reserved for a trade never set it.
     */
    @Query("""
            SELECT COUNT(t) > 0 FROM Trade t
             WHERE t.state IN :states
               AND (t.mailboxId = :mailboxId
                 OR EXISTS (SELECT s FROM TradeSide s
                             WHERE s.id.tradeId = t.id AND s.mailboxId = :mailboxId))
            """)
    boolean existsLiveWithMailbox(@Param("mailboxId") UUID mailboxId,
                                  @Param("states") java.util.Collection<TradeState> states);

    /**
     * Live SMART trades for the admin's "Faol savdolar" queue, most recently
     * moved first. HUMAN trades have their own admin surface and a person
     * already working them, so they are left out on purpose.
     */
    List<Trade> findByModeAndStateInOrderByUpdatedAtDesc(TradeMode mode,
                                                         java.util.Collection<TradeState> states);

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
     * yet. Backed by ix_trades_escalation_due. Bounded by {@code pageable} so a
     * large backlog cannot make a single sweep tick unboundedly slow — oldest
     * overdue first, so a persistently poisoned row (see
     * {@code TradeEscalationSweeper}) doesn't starve the rest of the backlog
     * behind it forever.
     */
    @Query("""
            SELECT t FROM Trade t
             WHERE t.mode = uz.efbazaar.trade.trade.domain.TradeMode.HUMAN
               AND t.state = uz.efbazaar.trade.trade.domain.TradeState.IN_PROGRESS
               AND t.escalatedAt IS NULL
               AND t.escalationDeadlineAt IS NOT NULL
               AND t.escalationDeadlineAt < :now
             ORDER BY t.escalationDeadlineAt ASC
            """)
    List<Trade> findIdleHumanTrades(@Param("now") Instant now, Pageable pageable);

    /**
     * The platform-admin queue. Filters on {@code state = IN_PROGRESS} rather
     * than trusting {@code escalatedAt IS NOT NULL} alone — TradeStateHandler
     * clears {@code escalatedAt} on every exit from {@code IN_PROGRESS}, so
     * this predicate should always be redundant with that invariant, but a
     * self-defending query costs nothing and doesn't depend on a handler two
     * packages away staying correct forever. ix_trades_escalated still covers
     * the {@code escalatedAt IS NOT NULL} half of the filter.
     */
    List<Trade> findByStateAndEscalatedAtIsNotNullOrderByEscalatedAtAsc(TradeState state);

    /**
     * Flags one idle trade as escalated, touching only the two escalation
     * columns and only while every precondition still holds.
     *
     * <p>Why a conditional UPDATE rather than {@code save(entity)}: {@link
     * #findIdleHumanTrades} runs in its own read-only transaction, so the rows
     * the sweeper batches are <b>detached</b>. Saving one back is a JPA merge,
     * which rewrites every column from that stale snapshot — an admin who
     * marked a step meanwhile would have their re-armed
     * {@code escalation_deadline_at} reverted, and an admin who pressed close
     * would have {@code state} rewritten from {@code WAITING_CLOSE_CONFIRM}
     * back to {@code IN_PROGRESS} with {@code admin_closed_at} wiped —
     * resurrecting a finished trade into the platform queue after both parties
     * already saw {@code ADMIN_CLOSED} in chat. The window is real: the batch
     * is up to {@code escalation-sweep-batch-size} rows and each is saved in
     * its own transaction.
     *
     * <p>The predicate repeats {@link #findIdleHumanTrades}' filter so a row
     * that moved between the read and this write simply affects 0 rows. That
     * also makes the write idempotent, which is what lets the sweeper roll the
     * audit row back with it and retry on the next tick.
     *
     * <p>Bulk JPQL bypasses {@code @PreUpdate}, so {@code updatedAt} is set
     * explicitly.
     */
    /**
     * Writes only the verification code.
     *
     * <p>Deliberately not a read-mutate-save: the code arrives from the worker
     * while the seller may be clicking "email changed" in the same second, and
     * saving a whole Trade loaded before that click reverts the state to what
     * it was when the entity was read. Two columns, one statement, nothing else
     * touched.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Trade t
               SET t.emailChangeVerificationCode = :code,
                   t.emailChangeVerificationCodeAt = :receivedAt
             WHERE t.id = :tradeId
            """)
    int recordEmailChangeCode(@Param("tradeId") UUID tradeId,
                              @Param("code") String code,
                              @Param("receivedAt") Instant receivedAt);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Trade t
               SET t.escalatedAt = :now,
                   t.escalationReason = :reason,
                   t.updatedAt = :now
             WHERE t.id = :id
               AND t.mode = uz.efbazaar.trade.trade.domain.TradeMode.HUMAN
               AND t.state = uz.efbazaar.trade.trade.domain.TradeState.IN_PROGRESS
               AND t.escalatedAt IS NULL
               AND t.escalationDeadlineAt IS NOT NULL
               AND t.escalationDeadlineAt < :now
            """)
    int markEscalated(@Param("id") UUID id,
                      @Param("now") Instant now,
                      @Param("reason") String reason);

    /**
     * Terminal SMART trades whose escrow never moved. Backed by the partial
     * index from V10 — the set is normally empty and the table is not.
     */
    @Query("""
           SELECT t FROM Trade t
           WHERE t.escrowResolvedAt IS NULL
             AND t.mode = uz.efbazaar.trade.trade.domain.TradeMode.SMART
             AND t.state IN :states
           """)
    List<Trade> findEscrowUnresolved(@Param("states") java.util.Collection<TradeState> states);
}
