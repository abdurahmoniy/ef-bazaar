package uz.efbazaar.marketplace.partner.ads;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/**
 * Xaridor shu e'lonni oxirgi marta qaysi kanaldan ko'rgani.
 *
 * <p>OXIRGI BOSISH G'OLIB. Savdo ochilgach bu qatorning o'zgarishi
 * savdoga ta'sir qilmaydi — qiymat {@code trades} ga muhrlanadi.
 */
@Entity
@Table(name = "listing_partner_attributions")
@Getter
@Setter
@NoArgsConstructor
public class ListingPartnerAttribution {

    /**
     * Tarkibiy kalit.
     *
     * <p>{@code equals}/{@code hashCode} SHART: usiz {@code findById}
     * doim keshdan o'tib ketadi va {@code save} yangilash o'rniga
     * qo'shishga urinadi.
     */
    @Embeddable
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        @Column(name = "listing_id", nullable = false, columnDefinition = "uuid")
        private UUID listingId;

        @Column(name = "user_id", nullable = false, columnDefinition = "uuid")
        private UUID userId;
    }

    @EmbeddedId
    private Key id;

    @Column(name = "partner_channel_id", nullable = false, columnDefinition = "uuid")
    private UUID partnerChannelId;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public ListingPartnerAttribution(UUID listingId, UUID userId, UUID partnerChannelId) {
        this.id = new Key(listingId, userId);
        this.partnerChannelId = partnerChannelId;
    }
}
