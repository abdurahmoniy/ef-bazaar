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

/** Hamkorlik shartlari — bitta qatorli sozlama jadvali. */
@Entity
@Table(name = "partner_settings")
@Getter
@Setter
@NoArgsConstructor
public class PartnerSettings {

    public static final short SINGLETON_ID = 1;

    @Id
    @Column(nullable = false, updatable = false)
    private Short id = SINGLETON_ID;

    /** Kanalda bo'lishi kerak bo'lgan minimal obunachi soni. */
    @Column(name = "min_subscribers", nullable = false)
    private int minSubscribers;

    @Column(name = "price_som", nullable = false)
    private BigDecimal priceSom;

    /** Standart to'lov rejimi: PERCENT yoki FIXED. Kanal buni override qila oladi. */
    @Column(name = "default_payout_mode", nullable = false)
    private String defaultPayoutMode = "PERCENT";

    /**
     * Savdo komissiyasidan hamkorga ketadigan ulush, asos punktida.
     *
     * <p>Foizda emas: 10.5% ni butun songa sig'dirib bo'lmaydi, va
     * kasrli tur savdo yopilishida yaxlitlash bahsini ochadi.
     * 1000 bp = 10%.
     */
    @Column(name = "default_trade_percent_bp", nullable = false)
    private int defaultTradePercentBp = 1000;

    @Column(name = "default_fixed_monthly_som", nullable = false)
    private BigDecimal defaultFixedMonthlySom = BigDecimal.ZERO;

    /** Hamkor post narxini shu oraliqda erkin qo'yadi. */
    @Column(name = "min_post_price_som", nullable = false)
    private BigDecimal minPostPriceSom;

    @Column(name = "max_post_price_som", nullable = false)
    private BigDecimal maxPostPriceSom;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "updated_by", columnDefinition = "uuid")
    private UUID updatedBy;
}
