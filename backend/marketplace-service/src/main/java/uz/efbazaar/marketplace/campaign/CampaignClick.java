package uz.efbazaar.marketplace.campaign;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

/** Kampaniya havolasining bosilishi — voronkaning birinchi bosqichi. */
@Entity
@Table(name = "campaign_clicks")
@Getter
@NoArgsConstructor
public class CampaignClick {

    public enum Channel { WEB, BOT }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "campaign_id", nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID campaignId;

    @Column(nullable = false, updatable = false)
    private String channel;

    /** Kirmagan odam bosgan bo'lsa null — bunday bosish ham sanaladi. */
    @Column(name = "user_id", columnDefinition = "uuid", updatable = false)
    private UUID userId;

    @Column(name = "telegram_id", updatable = false)
    private Long telegramId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public CampaignClick(UUID campaignId, Channel channel, UUID userId, Long telegramId) {
        this.campaignId = campaignId;
        this.channel = channel.name();
        this.userId = userId;
        this.telegramId = telegramId;
    }
}
