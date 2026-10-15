package uz.efbazaar.trade.mailbox.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxSource;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Admin listing goes through {@link JpaSpecificationExecutor} rather than
 * derived queries: the panel combines up to three optional filters (address,
 * owner, source) and a JPQL with nullable parameters isn't an option — Postgres
 * can't infer the type of a bound NULL in `:param IS NULL OR ...`.
 */
public interface MailboxRepository
        extends JpaRepository<Mailbox, UUID>, JpaSpecificationExecutor<Mailbox> {

    Optional<Mailbox> findByEmail(String email);

    /**
     * How many escrow mailboxes this user is holding onto.
     *
     * <p>Counts both what they own and what a live trade has reserved for their
     * side. Counting only ownership would let somebody open trades and walk
     * away from them: each one creates a real mailbox on the mail server, and
     * none of them would ever be owned by anybody.
     *
     * <p>Terminal states come in as a parameter rather than being spelled out
     * here, so the SQL cannot fall out of step with {@code TradeState}.
     */
    @Query(value = """
            SELECT COUNT(DISTINCT m.id) FROM mailboxes m
             WHERE m.deleted_at IS NULL
               AND (m.owner_user_id = :userId
                    OR m.id IN (
                        SELECT s.mailbox_id
                          FROM trade_sides s
                          JOIN trades t ON t.id = s.trade_id
                         WHERE s.mailbox_id IS NOT NULL
                           AND t.state NOT IN (:terminalStates)
                           AND ((s.role = 'SELLER' AND t.seller_id = :userId)
                             OR (s.role = 'BUYER'  AND t.buyer_id  = :userId))))
            """, nativeQuery = true)
    long countHeldBy(@Param("userId") UUID userId,
                     @Param("terminalStates") Collection<String> terminalStates);

    /**
     * Writes the credentials and nothing else.
     *
     * <p>Not a read-mutate-save. A rotation is answered by the worker seconds
     * after it is asked for, and saving the whole row put back whatever
     * {@code owner_user_id} held when the handler read it — which is how an
     * inbox that had just been handed to its owner went back to belonging to
     * nobody. Ownership is decided elsewhere and must survive a rotation.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Mailbox m
               SET m.encryptedPassword = :encPass,
                   m.passwordIv = :iv,
                   m.passwordTag = :tag,
                   m.provisionedAt = COALESCE(m.provisionedAt, :now)
             WHERE m.id = :id
            """)
    int applyCredentials(@Param("id") UUID id,
                         @Param("encPass") byte[] encPass,
                         @Param("iv") byte[] iv,
                         @Param("tag") byte[] tag,
                         @Param("now") java.time.Instant now);

    /** As above, and replaces the address too — provisioning, not rotation. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Mailbox m
               SET m.email = :email,
                   m.encryptedPassword = :encPass,
                   m.passwordIv = :iv,
                   m.passwordTag = :tag,
                   m.provisionedAt = COALESCE(m.provisionedAt, :now)
             WHERE m.id = :id
            """)
    int applyAddressAndCredentials(@Param("id") UUID id,
                                   @Param("email") String email,
                                   @Param("encPass") byte[] encPass,
                                   @Param("iv") byte[] iv,
                                   @Param("tag") byte[] tag,
                                   @Param("now") java.time.Instant now);

    /** Drop access without deleting mail; a racing handoff must not detach the new owner. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Mailbox m
               SET m.ownerUserId = NULL, m.displayName = NULL
             WHERE m.id = :id
               AND m.ownerUserId = :ownerUserId
               AND m.deletedAt IS NULL
            """)
    int detachOwnedBy(@Param("id") UUID id, @Param("ownerUserId") UUID ownerUserId);

    /** Check ownership in the write itself, including when a handoff is racing this request. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Mailbox m
               SET m.displayName = :displayName
             WHERE m.id = :id
               AND m.ownerUserId = :ownerUserId
               AND m.deletedAt IS NULL
            """)
    int updateDisplayNameOwnedBy(@Param("id") UUID id,
                                @Param("ownerUserId") UUID ownerUserId,
                                @Param("displayName") String displayName);

    /** Preserve the current name on an idempotent assignment, and clear it on a handoff. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Mailbox m
               SET m.displayName = CASE
                       WHEN m.ownerUserId = :ownerUserId
                         OR (m.ownerUserId IS NULL AND :ownerUserId IS NULL)
                       THEN m.displayName ELSE NULL END,
                   m.ownerMailVisibleFrom = COALESCE(:visibleFrom, CASE
                       WHEN m.ownerUserId = :ownerUserId THEN COALESCE(m.ownerMailVisibleFrom, m.handedOffAt, m.createdAt)
                       ELSE :now END),
                   m.ownerUserId = :ownerUserId,
                   m.tradeId = NULL,
                   m.handedOffAt = :now
             WHERE m.id = :id
            """)
    int assignOwner(@Param("id") UUID id,
                    @Param("ownerUserId") UUID ownerUserId,
                    @Param("now") java.time.Instant now,
                    @Param("visibleFrom") java.time.Instant visibleFrom);

    List<Mailbox> findByOwnerUserId(UUID ownerUserId);

    Optional<Mailbox> findByIdAndOwnerUserId(UUID id, UUID ownerUserId);

    @Query("""
            SELECT m FROM Mailbox m
             WHERE m.ownerUserId IS NULL
               AND m.tradeId IS NULL
               AND m.deletedAt IS NULL
            """)
    List<Mailbox> findOrphaned();

    boolean existsByEmail(String email);

    // ---------- admin panel counters ----------

    long countBySource(MailboxSource source);

    /** Registered but not yet confirmed by Mailcow. */
    long countByProvisionedAtIsNull();

    /** No owner attached — either an in-flight trade or a leftover. */
    long countByOwnerUserIdIsNull();

    /** Owned, not deleted, highest priority first — the order the plan limit cuts. */
    @Query("select m from Mailbox m where m.ownerUserId = :owner and m.deletedAt is null "
            + "order by m.accessPriority desc, m.createdAt desc, m.id desc")
    List<Mailbox> findAccessOrderOwnedBy(@Param("owner") UUID owner);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from Mailbox m where m.id = :id and m.ownerUserId = :owner and m.deletedAt is null")
    Optional<Mailbox> lockOwned(@Param("id") UUID id, @Param("owner") UUID owner);

    /** Column-only write, for the same reason as the credential update above: never save the whole row. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Mailbox m set m.accessPriority = :p where m.id = :id")
    int setAccessPriority(@Param("id") UUID id, @Param("p") long priority);

    /** Every live mailbox of the owner, locked in id order — see MailboxService#swapAccess. */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from Mailbox m where m.ownerUserId = :owner and m.deletedAt is null order by m.id")
    List<Mailbox> lockAllOwned(@Param("owner") UUID owner);
}
