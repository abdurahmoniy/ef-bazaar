package uz.efbazaar.payment.wallet.repository;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.payment.wallet.domain.LedgerEntry;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
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

    /**
     * What a user has been credited under one transaction kind.
     *
     * <p>Returned POSITIVE. A credit to a user is stored negative — the
     * ledger's sign convention — and a partner reading "your earnings:
     * -300 000" would reasonably think they owed us money.
     *
     * <p>USER_AVAILABLE only. A hold moves the same money between two of
     * the user's accounts, and counting both sides would show earnings
     * that never happened.
     */
    @Query("""
           SELECT coalesce(-sum(e.amountTiyin), 0)
           FROM LedgerEntry e
           JOIN WalletTransaction t ON t.id = e.transactionId
           WHERE e.userId = :userId
             AND e.account = uz.efbazaar.payment.wallet.domain.LedgerAccount.USER_AVAILABLE
             AND t.kind = :kind
           """)
    long sumCreditedByKind(@Param("userId") UUID userId, @Param("kind") TransactionKind kind);
}
