package uz.efbazaar.marketplace.account;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PendingAccountEmailRepository
        extends JpaRepository<PendingAccountEmail, PendingAccountEmail.Key> {

    Optional<PendingAccountEmail> findByTradeIdAndUserId(UUID tradeId, UUID userId);
}
