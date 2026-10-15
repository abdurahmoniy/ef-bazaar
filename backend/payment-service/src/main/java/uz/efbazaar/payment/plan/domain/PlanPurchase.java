package uz.efbazaar.payment.plan.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/** One paid period. History and audit; user_subscriptions holds what is live. */
@Entity
@Table(name = "plan_purchases")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PlanPurchase {
    @Id private UUID id;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "plan_code", nullable = false, length = 32) private String planCode;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 8) private PlanPeriod period;
    @Column(name = "price_tiyin", nullable = false) private long priceTiyin;
    @Column(name = "starts_at", nullable = false) private Instant startsAt;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "ledger_tx_id", nullable = false) private UUID ledgerTxId;
    @Column(name = "idempotency_key", nullable = false, unique = true, length = 128) private String idempotencyKey;
    @Column(name = "telegram_id") private Long telegramId;
    @Column(name = "reminded_before_at") private Instant remindedBeforeAt;
    @Column(name = "reminded_expired_at") private Instant remindedExpiredAt;
    @Column(name = "created_at", nullable = false) @Builder.Default private Instant createdAt = Instant.now();
}
