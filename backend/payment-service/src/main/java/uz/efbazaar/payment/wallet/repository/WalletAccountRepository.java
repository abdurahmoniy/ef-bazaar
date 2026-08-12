package uz.efbazaar.payment.wallet.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.payment.wallet.domain.WalletAccount;

import java.util.Optional;
import java.util.UUID;

public interface WalletAccountRepository extends JpaRepository<WalletAccount, UUID> {

    /**
     * Row lock for the duration of a posting. Two concurrent postings against
     * the same wallet must serialise, or the projection drifts from the ledger.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT w FROM WalletAccount w WHERE w.userId = :userId")
    Optional<WalletAccount> findByIdForUpdate(@Param("userId") UUID userId);

    /**
     * Race-safe first touch of a wallet row: there is nothing to lock until
     * the row exists, so two concurrent first-time operations on the same
     * brand-new userId (a deposit crediting while the wallet page loads, say)
     * would otherwise both try to INSERT the same primary key. As with
     * {@link WalletTransactionRepository#insertIfAbsent}, the loser's INSERT
     * blocks and then resolves to {@code ON CONFLICT DO NOTHING} instead of
     * throwing. Callers must always follow this with {@link #findByIdForUpdate}
     * so the lock is taken on the now-guaranteed-to-exist row.
     *
     * @return 1 if this call created the row, 0 if it already existed.
     */
    @Modifying
    @Query(value = """
           INSERT INTO wallet_accounts (user_id)
           VALUES (:userId)
           ON CONFLICT (user_id) DO NOTHING
           """, nativeQuery = true)
    int insertIfAbsent(@Param("userId") UUID userId);
}
