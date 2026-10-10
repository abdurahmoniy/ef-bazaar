package uz.efbazaar.trade.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * One party's own progress through a trade.
 *
 * <p>Exists because {@code trades.state} is a single column and a swap has two
 * parties moving at their own pace: it cannot say "the seller has sent their
 * password while the buyer is still changing their email". The trade's state
 * now means the slowest side — it advances only once both sides clear the bar —
 * and this row says where each party actually is.
 *
 * <p>A SALE keeps a row per side too, so there is one code path rather than
 * two. The buyer's row simply carries no mailbox: they hand over nothing.
 */
@Entity
@Table(name = "trade_sides")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TradeSide {

    @EmbeddedId
    private TradeSideId id;

    /** The escrow mailbox this party moves their account into. */
    @Column(name = "mailbox_id")
    private UUID mailboxId;

    @Column(name = "email_changed_at")
    private Instant emailChangedAt;

    @Column(name = "konami_verified_at")
    private Instant konamiVerifiedAt;

    /** Konami last replied that this side's mailbox is not on any Konami ID. */
    @Column(name = "konami_not_registered_at")
    private Instant konamiNotRegisteredAt;

    @Column(name = "password_sent_at")
    private Instant passwordSentAt;

    /** Konami's six digits for THIS party's account. */
    @Column(name = "email_change_code", length = 16)
    private String emailChangeCode;

    @Column(name = "email_change_code_at")
    private Instant emailChangeCodeAt;

    /**
     * Konami kirish kodi — bu taraf QABUL QILAYOTGAN akkountga kirish uchun.
     *
     * <p>Pochta hali platformada va uni oluvchi o'qiy olmaydi; kodni
     * smart-admin IMAP orqali o'qib beradi.
     */
    @Column(name = "login_code", length = 16)
    private String loginCode;

    @Column(name = "login_code_at")
    private Instant loginCodeAt;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @Column(name = "rejected_at")
    private Instant rejectedAt;

    public ParticipantRole role() {
        return id.getRole();
    }

    /** True once this party has done everything asked of them. */
    public boolean hasSentPassword() {
        return passwordSentAt != null;
    }

    public boolean hasDecided() {
        return confirmedAt != null || rejectedAt != null;
    }
}
