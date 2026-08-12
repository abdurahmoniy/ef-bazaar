package uz.efbazaar.payment.wallet.repository;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.payment.wallet.domain.LedgerEntry;
import uz.efbazaar.payment.wallet.dto.WalletEntryResponse;

import java.util.List;
import java.util.UUID;

public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, Long> {
    List<LedgerEntry> findByTransactionId(UUID transactionId);

    @Query("""
           SELECT new uz.efbazaar.payment.wallet.dto.WalletEntryResponse(
                    t.id, t.kind, e.account, e.amountTiyin, t.createdAt)
           FROM LedgerEntry e
           JOIN WalletTransaction t ON t.id = e.transactionId
           WHERE e.userId = :userId
           ORDER BY t.createdAt DESC
           """)
    List<WalletEntryResponse> findHistory(@Param("userId") UUID userId, Pageable pageable);
}
