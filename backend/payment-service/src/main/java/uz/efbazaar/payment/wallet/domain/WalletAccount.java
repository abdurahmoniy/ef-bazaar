package uz.efbazaar.payment.wallet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "wallet_accounts")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WalletAccount {

    @Id
    @Column(name = "user_id", columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID userId;

    @Column(name = "available_tiyin", nullable = false)
    private long availableTiyin;

    @Column(name = "held_tiyin", nullable = false)
    private long heldTiyin;

    @Column(name = "withdraw_pending_tiyin", nullable = false)
    private long withdrawPendingTiyin;

    @Column(name = "lifetime_deposited_tiyin", nullable = false)
    private long lifetimeDepositedTiyin;

    @Column(name = "lifetime_earned_tiyin", nullable = false)
    private long lifetimeEarnedTiyin;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PreUpdate
    void touch() {
        this.updatedAt = Instant.now();
    }
}
