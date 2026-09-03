package uz.efbazaar.marketplace.partner.ads;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Hamkor havolasining bosilishi — voronkaning birinchi bosqichi. */
@Entity
@Table(name = "partner_link_clicks")
@Getter
@Setter
@NoArgsConstructor
public class PartnerClick {

    public enum Kind { REFERRAL, LISTING }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "partner_channel_id", nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID partnerChannelId;

    @Column(nullable = false)
    private String kind;

    @Column(name = "listing_id", columnDefinition = "uuid")
    private UUID listingId;

    /** Kirmagan odam bosgan bo'lsa null — bunday bosish ham sanaladi. */
    @Column(name = "user_id", columnDefinition = "uuid")
    private UUID userId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public PartnerClick(UUID partnerChannelId, Kind kind, UUID listingId, UUID userId) {
        this.partnerChannelId = partnerChannelId;
        this.kind = kind.name();
        this.listingId = listingId;
        this.userId = userId;
    }
}
