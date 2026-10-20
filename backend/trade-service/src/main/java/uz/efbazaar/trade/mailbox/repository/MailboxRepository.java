package uz.efbazaar.trade.mailbox.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxKind;
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
     * <p>An owned box in a live trade the owner is NOT a party to — the escrow
     * box of a human trade, lent to the assigned admin — is the admin's tool
     * for the job, not their own allowance, so it is left out (same rule as
     * {@code MailboxAccessService}).
     *
     * <p>Terminal states come in as a parameter rather than being spelled out
     * here, so the SQL cannot fall out of step with {@code TradeState}.
     *
     * <p>Random and custom share one pool. Detached resources retain responsibility.
     * Sale mailboxes reserve both the source and final recipient; swaps reserve
     * each party's own side until the crossed handoff commits atomically.
     */
    @Query(value = """
            SELECT COUNT(DISTINCT m.id) FROM mailboxes m
             WHERE m.deleted_at IS NULL
               AND m.source <> 'ADMIN'
               AND (m.retained_user_id = :userId OR (m.owner_user_id = :userId
                     AND (NOT EXISTS (SELECT 1 FROM trades t
                                       WHERE t.state NOT IN (:terminalStates)
                                         AND (t.mailbox_id = m.id
                                              OR EXISTS (SELECT 1 FROM trade_sides s
                                                          WHERE s.trade_id = t.id AND s.mailbox_id = m.id)))
                          OR EXISTS (SELECT 1 FROM trades t
                                      WHERE t.state NOT IN (:terminalStates)
                                        AND (t.seller_id = :userId OR t.buyer_id = :userId)
                                        AND (t.mailbox_id = m.id
                                             OR EXISTS (SELECT 1 FROM trade_sides s
                                                         WHERE s.trade_id = t.id AND s.mailbox_id = m.id)))))
                    OR m.id IN (
                        SELECT s.mailbox_id
                          FROM trade_sides s
                          JOIN trades t ON t.id = s.trade_id
                         WHERE s.mailbox_id IS NOT NULL
                           AND t.state NOT IN (:terminalStates)
                           AND ((s.role = 'SELLER' AND t.seller_id = :userId)
                             OR (s.role = 'BUYER'  AND t.buyer_id  = :userId)))
                    OR (m.id IN (SELECT t.mailbox_id FROM trades t
                                  WHERE t.state NOT IN (:terminalStates)
                                    AND t.kind = 'SALE'
                                    AND (t.seller_id = :userId OR t.buyer_id = :userId))))
            """, nativeQuery = true)
    long countHeldBy(@Param("userId") UUID userId,
                     @Param("terminalStates") Collection<String> terminalStates);

    /** Provisioning is write-once: a delayed replay must never roll back rotated credentials. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Mailbox m SET m.email = :email, m.encryptedPassword = :encPass,
                m.passwordIv = :iv, m.passwordTag = :tag, m.provisionedAt = :now,
                m.provisioningStatus = 'CONFIRMED'
            WHERE m.id = :id AND m.provisionedAt IS NULL
              AND m.kind = uz.efbazaar.trade.mailbox.domain.MailboxKind.RANDOM
            """)
    int recordInitialTradeProvisioning(@Param("id") UUID id, @Param("email") String email,
                                       @Param("encPass") byte[] encPass, @Param("iv") byte[] iv,
                                       @Param("tag") byte[] tag, @Param("now") java.time.Instant now);

    /** Known successful provisioning can arrive after another swap side failed. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Mailbox m SET m.deletedAt = NULL, m.retainedUserId = :responsible
            WHERE m.id = :id AND m.ownerUserId IS NULL AND m.retainedUserId IS NULL
              AND m.provisionedAt IS NOT NULL
              AND m.kind = uz.efbazaar.trade.mailbox.domain.MailboxKind.RANDOM
            """)
    int restoreFailedProvisionedResponsibility(@Param("id") UUID id, @Param("responsible") UUID responsible);

    /** A real resource survives failed provisioning even though no user gains inbox access. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Mailbox m set m.retainedUserId = :responsible where m.id = :id "
            + "and m.deletedAt is null and m.provisionedAt is not null")
    int retainProvisionedResponsibility(@Param("id") UUID id, @Param("responsible") UUID responsible);

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
                   m.provisionedAt = COALESCE(m.provisionedAt, :now),
                   m.provisioningStatus = CASE WHEN m.provisioningStatus = 'NONE' THEN 'CONFIRMED' ELSE m.provisioningStatus END
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
                   m.provisionedAt = COALESCE(m.provisionedAt, :now),
                   m.provisioningStatus = CASE WHEN m.provisioningStatus = 'NONE' THEN 'CONFIRMED' ELSE m.provisioningStatus END
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
               SET m.retainedUserId = m.ownerUserId, m.ownerUserId = NULL, m.displayName = NULL
             WHERE m.id = :id
               AND m.ownerUserId = :ownerUserId
               AND m.deletedAt IS NULL
            """)
    int detachOwnedBy(@Param("id") UUID id, @Param("ownerUserId") UUID ownerUserId);

    /** Current responsibility and reservations decide deletion, never a cached entity snapshot. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            UPDATE mailboxes m SET deleted_at = :now
            WHERE m.id = :id AND m.deleted_at IS NULL
              AND m.owner_user_id IS NULL AND m.retained_user_id IS NULL AND m.trade_id IS NULL
              AND m.email = :expectedEmail
              AND m.provisioned_at IS NOT DISTINCT FROM CAST(:expectedProvisionedAt AS timestamptz)
              AND NOT EXISTS (SELECT 1 FROM trades t
                  WHERE t.state NOT IN (:terminalStates)
                    AND (t.mailbox_id = m.id OR EXISTS
                        (SELECT 1 FROM trade_sides s WHERE s.trade_id = t.id AND s.mailbox_id = m.id)))
            """, nativeQuery = true)
    int softDeleteUnheld(@Param("id") UUID id, @Param("expectedEmail") String expectedEmail,
                         @Param("expectedProvisionedAt") java.time.Instant expectedProvisionedAt,
                         @Param("now") java.time.Instant now,
                         @Param("terminalStates") Collection<String> terminalStates);

    /** Scalar query bypasses a previously cached mailbox when classifying a refused deletion. */
    @Query(value = "SELECT EXISTS(SELECT 1 FROM mailboxes WHERE id = :id AND deleted_at IS NOT NULL)", nativeQuery = true)
    boolean isDeleted(@Param("id") UUID id);

    /** User locks precede this row lock; stale cached ownership can never be written back. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            UPDATE mailboxes SET retained_user_id = owner_user_id,
                owner_user_id = NULL, display_name = NULL
            WHERE id = :id AND deleted_at IS NULL
              AND owner_user_id IS NOT DISTINCT FROM CAST(:expectedOwner AS uuid)
              AND retained_user_id IS NOT DISTINCT FROM CAST(:expectedRetained AS uuid)
            """, nativeQuery = true)
    int detachIfUnchanged(@Param("id") UUID id, @Param("expectedOwner") UUID expectedOwner,
                          @Param("expectedRetained") UUID expectedRetained);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            UPDATE mailboxes SET owner_user_id = :newOwner, retained_user_id = NULL,
                display_name = NULL, trade_id = NULL, handed_off_at = :now, owner_mail_visible_from = :now
            WHERE id = :id AND deleted_at IS NULL
              AND owner_user_id IS NOT DISTINCT FROM CAST(:expectedOwner AS uuid)
              AND retained_user_id IS NOT DISTINCT FROM CAST(:expectedRetained AS uuid)
            """, nativeQuery = true)
    int reassignIfUnchanged(@Param("id") UUID id, @Param("expectedOwner") UUID expectedOwner,
                            @Param("expectedRetained") UUID expectedRetained,
                            @Param("newOwner") UUID newOwner, @Param("now") java.time.Instant now);

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
                   m.retainedUserId = NULL,
                   m.ownerUserId = :ownerUserId,
                   m.tradeId = NULL,
                   m.handedOffAt = :now
             WHERE m.id = :id
            """)
    int assignOwner(@Param("id") UUID id,
                    @Param("ownerUserId") UUID ownerUserId,
                    @Param("now") java.time.Instant now,
                    @Param("visibleFrom") java.time.Instant visibleFrom);

    @Query("select m from Mailbox m where m.ownerUserId = :owner and m.deletedAt is null "
            + "order by m.accessPriority desc, m.createdAt desc, m.id desc")
    List<Mailbox> findAccessOrderOwnedBy(@Param("owner") UUID owner);

    /** Admin gifts and borrowed live escrow are visible resources, exempt from quota. */
    @Query(value = """
            SELECT count(m.id) FROM mailboxes m
            WHERE m.deleted_at IS NULL AND
              ((m.source = 'ADMIN' AND (m.owner_user_id = :owner OR m.retained_user_id = :owner))
               OR (m.owner_user_id = :owner
                   AND EXISTS (SELECT 1 FROM trades t WHERE t.state NOT IN (:terminalStates)
                        AND (t.mailbox_id = m.id OR EXISTS
                            (SELECT 1 FROM trade_sides s WHERE s.trade_id = t.id AND s.mailbox_id = m.id)))
                   AND NOT EXISTS (SELECT 1 FROM trades t WHERE t.state NOT IN (:terminalStates)
                        AND (t.seller_id = :owner OR t.buyer_id = :owner)
                        AND (t.mailbox_id = m.id OR EXISTS
                            (SELECT 1 FROM trade_sides s WHERE s.trade_id = t.id AND s.mailbox_id = m.id)))))
            """, nativeQuery = true)
    long countExemptHeldBy(@Param("owner") UUID owner, @Param("terminalStates") Collection<String> terminalStates);

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

    /**
     * Kind-filtered listing for custom endpoints. Access uses the combined order above.
     */
    @Query("select m from Mailbox m where m.ownerUserId = :owner and m.deletedAt is null and m.kind = :kind "
            + "order by m.accessPriority desc, m.createdAt desc, m.id desc")
    List<Mailbox> findAccessOrderOwnedBy(@Param("owner") UUID owner, @Param("kind") MailboxKind kind);

    @Query("select count(m) from Mailbox m where m.ownerUserId = :owner and m.deletedAt is null and m.kind = :kind")
    long countLiveByOwnerAndKind(@Param("owner") UUID owner, @Param("kind") MailboxKind kind);

    /** Custom boxes the user claimed themselves — admin gifts spend no slot. */
    @Query("select count(m) from Mailbox m where (m.ownerUserId = :owner or m.retainedUserId = :owner) and m.deletedAt is null "
            + "and m.kind = uz.efbazaar.trade.mailbox.domain.MailboxKind.CUSTOM "
            + "and m.source <> uz.efbazaar.trade.mailbox.domain.MailboxSource.ADMIN")
    long countClaimedCustomOwnedBy(@Param("owner") UUID owner);

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

    /** Column-only write: the box is now verified for this account. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Mailbox m set m.linkedAccountId = :accountId where m.id = :id")
    int setLinkedAccount(@Param("id") UUID id, @Param("accountId") UUID accountId);

    /** Frees the box only if it is still linked to that account — a newer link wins. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Mailbox m set m.linkedAccountId = null where m.id = :id and m.linkedAccountId = :accountId")
    int clearLinkedAccount(@Param("id") UUID id, @Param("accountId") UUID accountId);
}
