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

    /**
     * Money the ACCEPTER's wallet is charged: the price on a sale, the
     * surcharge on a swap that has one, zero on a plain swap. One meaning, so
     * escrow takes the same path in all three and a zero skips it entirely.
     */
    @Column(name = "price_uzs", nullable = false, updatable = false)
    private long priceUzs;

    /**
     * When the escrow was settled or released. NULL on a terminal SMART trade
     * means the buyer's money is still frozen and TradeEscrowSweeper has to
     * finish the job.
     */
    @Column(name = "escrow_resolved_at")
    private Instant escrowResolvedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private TradeState state;

    @Column(name = "mailbox_id", nullable = false, updatable = false)
    private UUID mailboxId;

    @Column(name = "seller_card_id", updatable = false)
    private UUID sellerCardId;

    @Column(name = "buyer_card_id", updatable = false)
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

    /** Verification code Konami sent to the escrow mailbox during the email
     * update. Populated by KonamiEmailChangeCodeConsumer; the seller sees it
     * on the WAITING_EMAIL_CHANGE panel and types it back on Konami. */
    @Column(name = "email_change_verification_code", length = 16)
    private String emailChangeVerificationCode;

    @Column(name = "email_change_verification_code_at")
    private Instant emailChangeVerificationCodeAt;

    // ----- human trade-admin mode -----

    @Enumerated(EnumType.STRING)
    @Column(name = "mode", nullable = false, length = 8)
    @Builder.Default
    private TradeMode mode = TradeMode.SMART;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 20)
    @Builder.Default
    private TradeKind kind = TradeKind.SALE;

    /**
     * The platform's cut, charged to the PROPOSER.
     *
     * <p>Stored rather than recomputed so a later change to the commission
     * table cannot rewrite the arithmetic of a trade that already closed. On a
     * swap it is worked out from the listing price — the value of the account
     * being given up — so a token surcharge cannot buy a cheaper trade.
     */
    @Column(name = "proposer_fee_uzs")
    private Long proposerFeeUzs;

    /**
     * What the commission is worked out from: the price on a sale, the listing
     * price on a swap. Frozen at open, because a listing edited mid-trade would
     * otherwise change the fee the parties were quoted.
     */
    @Column(name = "fee_base_uzs")
    private Long feeBaseUzs;

    /** Falls back to the price for trades opened before swaps existed. */
    public long feeBaseOrPrice() {
        return feeBaseUzs != null ? feeBaseUzs : priceUzs;
    }

    @Column(name = "assigned_admin_id")
    private UUID assignedAdminId;

    /**
     * Fee agreed with the admin, in UZS. Informational only — the money is
     * handed over off-platform and no ledger entry corresponds to it. Kept so
     * both chats can show what was agreed and so stats can average it.
     */
    @Column(name = "admin_fee_uzs")
    private Long adminFeeUzs;

    /** Start of the admin's work timer. */
    @Column(name = "admin_accepted_at")
    private Instant adminAcceptedAt;

    /** End of the admin's work timer — set when they press close. */
    @Column(name = "admin_closed_at")
    private Instant adminClosedAt;

    @Column(name = "seller_confirmed_at")
    private Instant sellerConfirmedAt;

    @Column(name = "buyer_confirmed_at")
    private Instant buyerConfirmedAt;

    /**
     * Idle watchdog for IN_PROGRESS. Separate from {@code stateDeadline} on
     * purpose: TradeTimeoutScheduler fires TIMEOUT for any non-terminal state
     * with a due stateDeadline, and IN_PROGRESS has no TIMEOUT transition.
     */
    @Column(name = "escalation_deadline_at")
    private Instant escalationDeadlineAt;

    @Column(name = "escalated_at")
    private Instant escalatedAt;

    @Column(name = "escalation_reason", length = 32)
    private String escalationReason;

    /** Convenience for controllers: which side is this user? Throws if neither. */
    public ParticipantRole roleFor(UUID userId) {
        if (userId.equals(sellerId)) return ParticipantRole.SELLER;
        if (userId.equals(buyerId)) return ParticipantRole.BUYER;
        throw new IllegalArgumentException("User " + userId + " is not a party to trade " + id);
    }

    public boolean isParticipant(UUID userId) {
        return userId.equals(sellerId) || userId.equals(buyerId);
    }

    /**
     * Which of the three roles this user holds on this trade. Unlike
     * {@link #roleFor(UUID)} this also recognises the assigned human admin.
     */
    public TradeViewer viewerFor(UUID userId) {
        if (userId.equals(sellerId)) return TradeViewer.SELLER;
        if (userId.equals(buyerId))  return TradeViewer.BUYER;
        if (assignedAdminId != null && userId.equals(assignedAdminId)) return TradeViewer.ADMIN;
        throw new IllegalArgumentException("User " + userId + " cannot view trade " + id);
    }

    public boolean isViewer(UUID userId) {
        return isParticipant(userId)
                || (assignedAdminId != null && userId.equals(assignedAdminId));
    }

    /**
     * Has the assigned admin taken the job? Spec §6.1 grants admin access to
     * the two party chats at <b>accept</b> (step 5), not at invite (step 4) —
     * a candidate who is still deciding, and who may yet decline, is not
     * entitled to read what the parties have written to each other.
     *
     * <p>{@code adminAcceptedAt} rather than {@code state}: it is stamped once
     * on entry to {@code IN_PROGRESS} and survives into
     * {@code WAITING_CLOSE_CONFIRM} and the terminal states, where the admin
     * legitimately still reads the history — and it is cleared again by a
     * reassignment, which drops the trade back to {@code WAITING_ADMIN}
     * awaiting a fresh acceptance.
     */
    public boolean isAdminAccepted() {
        return adminAcceptedAt != null;
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
