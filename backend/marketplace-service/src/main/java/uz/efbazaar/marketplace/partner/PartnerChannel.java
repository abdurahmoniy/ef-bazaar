package uz.efbazaar.marketplace.partner;

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
 * Tasdiqlangan hamkorlikning reklama yuzasi.
 *
 * <p>{@link PartnerApplication} dan ALOHIDA. Ariza — qabul qilingan
 * qarorning o'zgarmas yozuvi; kanal esa hamkorlik davomida o'zgarib
 * turadigan sozlamalarni olib yuradi.
 *
 * <p>{@code payoutMode}, {@code tradePercentBp}, {@code fixedMonthlySom}
 * null bo'lsa — kanal global siyosatga ergashadi. Yaratilish paytida
 * global qiymatni nusxalab olsak, admin siyosatni o'zgartirganda bu
 * kanal jimgina eski shartda qolardi.
 */
@Entity
@Table(name = "partner_channels")
@Getter
@Setter
@NoArgsConstructor
public class PartnerChannel {

    @Id
    @Column(nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "partner_user_id", nullable = false, updatable = false, columnDefinition = "uuid")
    private UUID partnerUserId;

    /**
     * Shu hamkorlikni TUG'DIRGAN ariza.
     *
     * <p>Qayta qo'shilganda YANGI arizaga ko'rsatadi. Bekor qilingan
     * arizada qolib ketsa, kanal yopilgan hamkorlikka bog'langandek
     * ko'rinardi va admin paneli ham o'shani ochardi.
     */
    @Column(name = "application_id", nullable = false, columnDefinition = "uuid")
    private UUID applicationId;

    @Column(name = "telegram_channel_id", nullable = false, updatable = false)
    private Long telegramChannelId;

    @Column(nullable = false)
    private String title;

    private String username;

    @Column(name = "photo_file_id")
    private String photoFileId;

    @Column(name = "subscriber_count", nullable = false)
    private int subscriberCount;

    @Column(name = "subscriber_synced_at", nullable = false)
    private Instant subscriberSyncedAt = Instant.now();

    @Column(name = "link_code", nullable = false, unique = true, updatable = false)
    private String linkCode;

    @Column(name = "post_price_som", nullable = false)
    private BigDecimal postPriceSom;

    /** null = global sozlama. */
    @Column(name = "payout_mode")
    private String payoutMode;

    /** Asos punktida: 1000 = 10%. null = global sozlama. */
    @Column(name = "trade_percent_bp")
    private Integer tradePercentBp;

    /** null = global sozlama. */
    @Column(name = "fixed_monthly_som")
    private BigDecimal fixedMonthlySom;

    /**
     * KETMA-KET muvaffaqiyatsiz yangilanishlar soni.
     *
     * <p>Muvaffaqiyatli o'qishda NOLGA qaytadi. Umumiy sanoq bo'lsa,
     * oylar davomida yig'ilgan tasodifiy xatolar sog'lom kanalni
     * o'chirib yuborardi — bizni qiziqtirgani "bot hali ham u yerdami",
     * "qachondir xato bo'lganmi" emas.
     */
    @Column(name = "refresh_failures", nullable = false)
    private int refreshFailures;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
}
