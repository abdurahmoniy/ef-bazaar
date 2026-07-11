package uz.efbazaar.trade.card.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cards")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Card {

    /**
     * Application-assigned UUID. We deliberately don't use @GeneratedValue
     * because the id is needed *before* persistence to derive the AES-GCM
     * context ("card-pan-{id}"). The DB default (uuid_generate_v4()) stays
     * as a safety net for direct SQL inserts.
     */
    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "owner_user_id", nullable = false)
    private UUID ownerUserId;

    @Column(name = "encrypted_pan", nullable = false)
    private byte[] encryptedPan;

    @Column(name = "pan_iv", nullable = false, length = 12)
    private byte[] panIv;

    @Column(name = "pan_tag", nullable = false, length = 16)
    private byte[] panTag;

    @Column(name = "last4", nullable = false, length = 4)
    private String last4;

    @Column(name = "expiry_month", nullable = false)
    private short expiryMonth;

    @Column(name = "expiry_year", nullable = false)
    private short expiryYear;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private CardBrand brand;

    @Column(name = "encrypted_cvv")
    private byte[] encryptedCvv;

    @Column(name = "cvv_iv", length = 12)
    private byte[] cvvIv;

    @Column(name = "cvv_tag", length = 16)
    private byte[] cvvTag;

    @Column(name = "saved_to_profile", nullable = false)
    @Builder.Default
    private boolean savedToProfile = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
