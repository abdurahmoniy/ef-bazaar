package uz.efbazaar.trade.mailbox.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import uz.efbazaar.trade.mailbox.domain.Mailbox;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MailboxRepository extends JpaRepository<Mailbox, UUID> {

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

    /*
     * Admin panel listing. Four derived queries rather than one JPQL with
     * nullable parameters: Postgres can't infer the type of a bound NULL in
     * `:param IS NULL OR ...`, and the UUID case fails outright. Soft-deleted
     * rows stay visible in all of them — an admin auditing history needs them.
     */

    Page<Mailbox> findByEmailContainingIgnoreCase(String search, Pageable pageable);

    Page<Mailbox> findByOwnerUserId(UUID ownerUserId, Pageable pageable);

    Page<Mailbox> findByOwnerUserIdAndEmailContainingIgnoreCase(
            UUID ownerUserId, String search, Pageable pageable);

    boolean existsByEmail(String email);
}
