package uz.efbazaar.marketplace.campaign;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

/** Foydalanuvchi qaysi kampaniyadan kelgani. Birinchi manba g'olib. */
@Entity
@Table(name = "user_acquisitions")
@Getter
@NoArgsConstructor
public class UserAcquisition {

    @Id
    @Column(name = "user_id", columnDefinition = "uuid", updatable = false)
    private UUID userId;

    @Column(name = "campaign_id", nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID campaignId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public UserAcquisition(UUID userId, UUID campaignId) {
        this.userId = userId;
        this.campaignId = campaignId;
    }
}
