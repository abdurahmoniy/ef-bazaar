package uz.efbazaar.marketplace.referral;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Foydalanuvchining taklif kodi. Birinchi so'ralganda yaratiladi. */
@Entity
@Table(name = "user_referral_codes")
@Getter
@Setter
@NoArgsConstructor
public class ReferralCode {

    @Id
    @Column(name = "user_id", nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID userId;

    @Column(nullable = false, unique = true, updatable = false)
    private String code;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public ReferralCode(UUID userId, String code) {
        this.userId = userId;
        this.code = code;
    }
}
