package uz.efbazaar.marketplace.partner.ads;

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
 * E'lonning hamkor kanaliga joylanishi.
 *
 * <p>{@code orderId} bitta tanlash amalida buyurilgan postlarni
 * guruhlaydi. Sotuvchi TO'PLAMGA rozi bo'ladi va pul ham shu to'plam
 * uchun bir yo'la ushlanadi — aks holda mablag'i yetmagan odam
 * tanlaganining bir qismini olib qolardi.
 */
@Entity
@Table(name = "listing_channel_posts")
@Getter
@Setter
@NoArgsConstructor
public class ListingChannelPost {

    /**
     * Holat matn sifatida saqlanadi, enum ustuni sifatida emas:
     * ruxsat etilgan qiymatlar ro'yxati bazadagi CHECK'da turadi va
     * yagona haqiqat manbai o'sha bo'lib qoladi.
     */
    public enum State {
        AWAITING_FUNDS, HELD, POSTED, FAILED, REFUNDED
    }

    @Id
    @Column(nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "order_id", nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID orderId;

    @Column(name = "listing_id", nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID listingId;

    @Column(name = "partner_channel_id", nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID partnerChannelId;

    /** Buyurtma paytida muhrlanadi — hamkor narxni keyin ko'tarsa ham o'zgarmaydi. */
    @Column(name = "price_som", nullable = false, updatable = false)
    private BigDecimal priceSom;

    @Column(nullable = false)
    private String state;

    @Column(name = "telegram_message_id")
    private String telegramMessageId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    /**
     * Qayta yuborilgach kanaldagi xabar o'chirilgan payt.
     *
     * <p>Qator qolaveradi: u to'langan va hamkor undan daromad olgan.
     * O'chirilgani faqat Telegram'dagi xabar, tarix emas. Bu maydonsiz
     * panelda bir kanal uchun ikkita POSTED qator turar va qaysi
     * birining xabari hali tirikligini hech kim ayta olmasdi.
     */
    @Column(name = "replaced_at")
    private Instant replacedAt;

    /**
     * We deleted this message from the channel because the listing was taken
     * down, and we may put it back if the listing is restored.
     *
     * <p>Deliberately not {@link #replacedAt}: that one means a newer post
     * superseded this one, which is permanent. This one is reversible, and
     * folding them together would make a restored post look superseded and it
     * would never be marked SOLD again.
     */
    @Column(name = "removed_at")
    private Instant removedAt;

    @Column(name = "posted_at")
    private Instant postedAt;

    private String error;
}
