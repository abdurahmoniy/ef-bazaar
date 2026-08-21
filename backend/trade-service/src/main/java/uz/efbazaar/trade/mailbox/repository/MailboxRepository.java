package uz.efbazaar.trade.mailbox.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxSource;

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
}
