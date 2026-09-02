package uz.efbazaar.marketplace.referral;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Kim kimni platformaga olib keldi.
 *
 * <p>{@code rewardedAt} ikki vazifani bajaradi: to'lov vaqtini yozadi va
 * "faqat birinchi savdo" qorovuli bo'lib turadi. Ikkinchi savdo uni
 * allaqachon muhrlangan holda topadi.
 */
@Entity
@Table(name = "referrals")
@Getter
@Setter
@NoArgsConstructor
public class Referral {

    @Id
    @Column(name = "referred_user_id", nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID referredUserId;

    @Column(name = "referrer_user_id", nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID referrerUserId;

    /** Hamkor kanali orqali kelgan bo'lsa. Ikkinchi bosqichgacha null. */
    @Column(name = "partner_channel_id", columnDefinition = "uuid")
    private UUID partnerChannelId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "rewarded_at")
    private Instant rewardedAt;

    @Column(name = "reward_som")
    private BigDecimal rewardSom;

    public Referral(UUID referredUserId, UUID referrerUserId, UUID partnerChannelId) {
        this.referredUserId = referredUserId;
        this.referrerUserId = referrerUserId;
        this.partnerChannelId = partnerChannelId;
    }
}
