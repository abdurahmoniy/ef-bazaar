package uz.efbazaar.trade.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "trades")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Trade {

    /**
     * Application-assigned UUID (same reasoning as Card in Plan A — the id is
     * needed before insert to seed encryption contexts on child records).
     */
    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "seller_id", nullable = false, updatable = false)
    private UUID sellerId;

    @Column(name = "buyer_id", nullable = false, updatable = false)
    private UUID buyerId;

    @Column(name = "listing_id", updatable = false)
    private UUID listingId;

    /**
     * The marketplace-service chat this trade was opened from. Nullable
     * because openTrade callers that don't have a chat context (some
     * integration tests, legacy rows) are still valid.
     */
    @Column(name = "chat_id", updatable = false)
    private UUID chatId;

    @Column(name = "price_uzs", nullable = false, updatable = false)
    private long priceUzs;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private TradeState state;

    @Column(name = "mailbox_id", nullable = false, updatable = false)
    private UUID mailboxId;

    @Column(name = "seller_card_id", nullable = false, updatable = false)
    private UUID sellerCardId;

    @Column(name = "buyer_card_id", nullable = false, updatable = false)
    private UUID buyerCardId;

    @Column(name = "payment_intent_id", length = 128)
    private String paymentIntentId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "state_deadline")
    private Instant stateDeadline;

    @Column(name = "terminal_reason", length = 64)
    private String terminalReason;

    /** Convenience for controllers: which side is this user? Throws if neither. */
    public ParticipantRole roleFor(UUID userId) {
        if (userId.equals(sellerId)) return ParticipantRole.SELLER;
        if (userId.equals(buyerId)) return ParticipantRole.BUYER;
        throw new IllegalArgumentException("User " + userId + " is not a party to trade " + id);
    }

    public boolean isParticipant(UUID userId) {
        return userId.equals(sellerId) || userId.equals(buyerId);
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
