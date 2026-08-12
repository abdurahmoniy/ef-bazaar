package uz.efbazaar.payment.invoice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
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
}
