package uz.efbazaar.payment.invoice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {

    Optional<Invoice> findByUserIdAndStatus(UUID userId, InvoiceStatus status);

    /**
     * Whether any invoice — live, paid, expired or cancelled — was ever issued
     * against this card. {@code invoices.card_id} is a foreign key, so a delete
     * that ignored this would be refused by PostgreSQL with a constraint name
     * instead of a sentence an admin can act on.
     */
    boolean existsByCardId(UUID cardId);

    /**
     * Candidates for an incoming transfer. Expired invoices are excluded
     * deliberately: their slot has been released and may already belong to
     * somebody else's live invoice, so crediting on amount alone would credit
     * the wrong user.
     */
    @Query("""
           SELECT i FROM Invoice i
           WHERE i.cardId = :cardId
             AND i.transferAmountTiyin = :amount
             AND i.status = uz.efbazaar.payment.invoice.domain.InvoiceStatus.PENDING
             AND i.expiresAt > :at
           """)
    List<Invoice> findLiveSlot(@Param("cardId") UUID cardId,
                               @Param("amount") long amount,
                               @Param("at") Instant at);

    @Query("""
           SELECT i FROM Invoice i
           WHERE i.status = uz.efbazaar.payment.invoice.domain.InvoiceStatus.PENDING
             AND i.expiresAt <= :now
           """)
    List<Invoice> findDue(@Param("now") Instant now);

    /**
     * Claims an invoice for a payment. The {@code status = PENDING} predicate is
     * the whole point: {@code Invoice} has no {@code @Version} and Hibernate's
     * default update writes every column, so saving a snapshot taken before
     * somebody else committed silently overwrites their work. Here the database
     * decides, and the row count says who won.
     *
     * @return 1 if this caller took the invoice, 0 if somebody else already had
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
           UPDATE Invoice i
              SET i.status = uz.efbazaar.payment.invoice.domain.InvoiceStatus.PAID,
                  i.paidAt = :paidAt,
                  i.observationId = :observationId
            WHERE i.id = :id
              AND i.status = uz.efbazaar.payment.invoice.domain.InvoiceStatus.PENDING
           """)
    int markPaidIfPending(@Param("id") UUID id,
                          @Param("paidAt") Instant paidAt,
                          @Param("observationId") UUID observationId);

    /**
     * The sweeper's write, conditional for the same reason. A payment that lands
     * between {@code findDue} and this statement flips the row to PAID, and this
     * update then matches nothing instead of stamping EXPIRED over it and wiping
     * {@code paid_at} and {@code observation_id}.
     *
     * @return how many of the given invoices this sweep actually expired
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
           UPDATE Invoice i
              SET i.status = uz.efbazaar.payment.invoice.domain.InvoiceStatus.EXPIRED
            WHERE i.id IN :ids
              AND i.status = uz.efbazaar.payment.invoice.domain.InvoiceStatus.PENDING
           """)
    int expireIfStillPending(@Param("ids") List<UUID> ids);
}
