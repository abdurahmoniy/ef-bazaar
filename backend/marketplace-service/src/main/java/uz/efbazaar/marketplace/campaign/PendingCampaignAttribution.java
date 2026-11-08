package uz.efbazaar.marketplace.campaign;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** Botga kelgan kampaniya kodi. Ro'yxatdan o'tish hodisasi uni biriktirishga aylantiradi. */
@Entity
@Table(name = "pending_campaign_attributions")
@Getter
@NoArgsConstructor
public class PendingCampaignAttribution {

    @Id
    @Column(name = "telegram_id", nullable = false, updatable = false)
    private Long telegramId;

    @Column(nullable = false)
    private String code;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public PendingCampaignAttribution(Long telegramId, String code) {
        this.telegramId = telegramId;
        this.code = code;
    }
}
