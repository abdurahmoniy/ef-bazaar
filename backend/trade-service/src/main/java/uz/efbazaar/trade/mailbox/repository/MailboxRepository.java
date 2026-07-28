package uz.efbazaar.trade.mailbox.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
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
