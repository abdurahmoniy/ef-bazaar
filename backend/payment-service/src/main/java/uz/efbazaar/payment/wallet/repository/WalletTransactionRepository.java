package uz.efbazaar.payment.wallet.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.payment.wallet.domain.WalletTransaction;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface WalletTransactionRepository extends JpaRepository<WalletTransaction, UUID> {
    Optional<WalletTransaction> findByIdempotencyKey(String idempotencyKey);

    /**
     * Race-safe first insert for an idempotency key. Two concurrent callers
     * with the same key cannot both succeed here: the loser's INSERT blocks
     * behind the winner's, then resolves to {@code ON CONFLICT DO NOTHING}
     * once the winner commits (or proceeds normally if the winner rolls
     * back). Either way the statement returns without throwing, so it never
     * marks the caller's transaction rollback-only the way a bare UNIQUE
     * violation would.
     *
     * @return 1 if this call's row was inserted, 0 if another transaction
     * already owns the key.
     */
    @Modifying
    @Query(value = """
           INSERT INTO wallet_transactions (id, kind, idempotency_key, created_at, created_by, note)
           VALUES (:id, :kind, :idempotencyKey, :createdAt, :createdBy, :note)
           ON CONFLICT (idempotency_key) DO NOTHING
           """, nativeQuery = true)
    int insertIfAbsent(@Param("id") UUID id, @Param("kind") String kind,
                        @Param("idempotencyKey") String idempotencyKey,
                        @Param("createdAt") Instant createdAt,
                        @Param("createdBy") UUID createdBy,
                        @Param("note") String note);
}
