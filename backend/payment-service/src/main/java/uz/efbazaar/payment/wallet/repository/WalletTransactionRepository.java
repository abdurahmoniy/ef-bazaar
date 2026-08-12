package uz.efbazaar.payment.wallet.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.wallet.domain.WalletTransaction;

import java.util.Optional;
import java.util.UUID;

public interface WalletTransactionRepository extends JpaRepository<WalletTransaction, UUID> {
    Optional<WalletTransaction> findByIdempotencyKey(String idempotencyKey);
}
