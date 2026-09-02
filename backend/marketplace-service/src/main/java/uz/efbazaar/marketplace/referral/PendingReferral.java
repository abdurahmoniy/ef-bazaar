package uz.efbazaar.marketplace.referral;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** Botga kelgan kod. Ro'yxatdan o'tish hodisasi uni referalga aylantiradi. */
@Entity
@Table(name = "pending_referrals")
@Getter
@Setter
@NoArgsConstructor
public class PendingReferral {

    @Id
    @Column(name = "telegram_id", nullable = false, updatable = false)
    private Long telegramId;

    @Column(nullable = false)
    private String code;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public PendingReferral(Long telegramId, String code) {
        this.telegramId = telegramId;
        this.code = code;
    }
}
