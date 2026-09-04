package uz.efbazaar.marketplace.partner.ads;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * E'lonning efBazaar rasmiy kanalidagi nusxasi.
 *
 * <p>Har e'londan BITTA. Kalit — e'lonning o'zi: rasmiy kanal
 * efBazaar'ning to'liq lentasi va bir e'lon u yerda bir marta turadi.
 * Hamkor kanaliga qayta yuborish uni takrorlamaydi, aks holda lenta
 * bir xil akkauntning nusxalari bilan to'lardi.
 */
@Entity
@Table(name = "listing_official_posts")
@Getter
@Setter
@NoArgsConstructor
public class OfficialChannelPost {

    public enum State { PENDING, POSTED, FAILED }

    @Id
    @Column(name = "listing_id", nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID listingId;

    /**
     * Forward manbai — qaysi hamkor postidan ko'chirilgani.
     *
     * <p>null bo'lsa to'g'ridan-to'g'ri joylangan: hamkor tanlanmagan,
     * yoki tanlangani chiqmay qolgan.
     */
    @Column(name = "source_post_id", columnDefinition = "uuid")
    private UUID sourcePostId;

    @Column(nullable = false)
    private String state = State.PENDING.name();

    @Column(name = "telegram_message_id")
    private String telegramMessageId;

    private String error;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "posted_at")
    private Instant postedAt;
}
