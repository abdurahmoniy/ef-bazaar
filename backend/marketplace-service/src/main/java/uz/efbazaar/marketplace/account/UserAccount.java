package uz.efbazaar.marketplace.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Foydalanuvchining eFootball akkounti — e'londan mustaqil yashaydigan yozuv.
 *
 * <p>Maydonlar e'lon bilan ataylab bir xil: shu bilan bozorga chiqarish
 * oddiy ko'chirishga aylanadi va ikki joyda ikki xil sxema saqlanmaydi.
 * Farqi ikkita — bu yerda narx yo'q va {@code email} bor.
 */
@Entity
@Table(name = "user_accounts")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserAccount {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    private String title;

    @Column(columnDefinition = "text")
    private String description;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> attributes = new HashMap<>();

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "media_message_ids", columnDefinition = "text[]")
    @Builder.Default
    private List<String> mediaMessageIds = new ArrayList<>();

    /** Maxfiy. Egasidan boshqa hech kimga qaytarilmaydi va e'longa ko'chmaydi. */
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(name = "email_source", length = 16)
    private EmailSource emailSource;

    @Column(name = "mailbox_id")
    private UUID mailboxId;

    /**
     * Platforma Konami akkount shu pochtaga ulanganini tasdiqlagan: savdodan
     * kelgan yoki quti ulash sessiyasi o'tgan. Qo'lda yozilgan manzil — yo'q.
     */
    @Column(name = "email_verified", nullable = false)
    @Builder.Default
    private boolean emailVerified = false;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private UserAccountStatus status = UserAccountStatus.ACTIVE;

    @Column(name = "current_listing_id")
    private UUID currentListingId;

    @Column(name = "source_listing_id")
    private UUID sourceListingId;

    /**
     * Qaysi savdodan kelgan (xaridorga ko'chgan akkountda).
     *
     * <p>Pochta manzili alohida hodisa bilan keladi va uni aynan shu savdo
     * bo'yicha topish kerak.
     */
    @Column(name = "source_trade_id")
    private UUID sourceTradeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "archived_reason", length = 24)
    private ArchivedReason archivedReason;

    /** Qachon sotilgan / obmen qilingan — tarix uchun. */
    @Column(name = "archived_at")
    private Instant archivedAt;

    /** E'lon narxi sotilgan paytda; obmenda va eski yozuvlarda null. */
    @Column(name = "sold_price", precision = 19, scale = 2)
    private java.math.BigDecimal soldPrice;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }

    public boolean isOnMarket() {
        return currentListingId != null;
    }
}
