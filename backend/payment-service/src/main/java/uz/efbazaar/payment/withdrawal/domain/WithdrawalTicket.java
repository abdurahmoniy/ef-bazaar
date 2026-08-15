package uz.efbazaar.payment.withdrawal.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A request to take money out of the wallet, paid by hand.
 *
 * <p>The money is frozen when the ticket opens, not when it closes: a ticket
 * that only debited on close would let the holder spend the same balance on a
 * trade while it sat in the queue, and the debit would then be impossible
 * against {@code chk_wallet_non_negative} — after the admin had already paid.
 *
 * <p>The card number is stored encrypted and revealed only in the admin's
 * ticket view, because that is the number the admin sends money to. Everywhere
 * else — lists, logs, the Telegram notice — it is {@link #last4}.
 */
@Entity
@Table(name = "withdrawal_tickets")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WithdrawalTicket {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "amount_tiyin", nullable = false, updatable = false)
    private long amountTiyin;

    @Column(name = "pan_encrypted", nullable = false, updatable = false)
    private byte[] panEncrypted;

    @Column(name = "pan_iv", nullable = false, updatable = false)
    private byte[] panIv;

    @Column(name = "pan_tag", nullable = false, updatable = false)
    private byte[] panTag;

    @Column(nullable = false, length = 4, updatable = false)
    private String last4;

    /** Uppercase — {@code chk_wt_holder} enforces it in the database too. */
    @Column(name = "holder_name", nullable = false, length = 64, updatable = false)
    private String holderName;

    @Column(nullable = false, length = 32, updatable = false)
    private String phone;

    /** Null when the account has no Telegram linked. */
    @Column(name = "telegram_username", length = 64, updatable = false)
    private String telegramUsername;

    /**
     * Numeric chat id, from the session rather than the request body — it is
     * what a direct message is addressed to, and a username the user typed
     * would let them point the notice at somebody else.
     */
    @Column(name = "telegram_id", updatable = false)
    private Long telegramId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private WithdrawalStatus status = WithdrawalStatus.OPEN;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "closed_by")
    private UUID closedBy;

    @Column(name = "close_note", length = 256)
    private String closeNote;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }

    /** Keeps {@code chk_wt_closed} satisfied — the three move together. */
    public void close(WithdrawalStatus terminal, UUID adminId, String note) {
        this.status = terminal;
        this.closedAt = Instant.now();
        this.closedBy = adminId;
        this.closeNote = note;
    }
}
