package uz.efbazaar.marketplace.partner;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Hamkorlikka ariza.
 *
 * <p>Kanal ma'lumotlari (nomi, obunachi soni, egalik) FAQAT botdan keladi.
 * Foydalanuvchidan qabul qilinsa, ikkalasini ham soxtalashtirib bo'lardi —
 * ariza esa aynan shu ikki raqamga tayanadi.
 */
@Entity
@Table(name = "partner_applications")
@Getter
@Setter
@NoArgsConstructor
public class PartnerApplication {

    public enum Status {
        /** Ariza ochildi; foydalanuvchi botni kanalga admin qilishi kerak. */
        AWAITING_CHANNEL,
        /** Kanal tekshiruvdan o'tdi; to'lov kutilmoqda. */
        AWAITING_PAYMENT,
        /** To'landi; admin ko'rishi kerak. */
        AWAITING_REVIEW,
        APPROVED,
        REJECTED,
        /**
         * Bekor qilindi. Kim va nima uchun — {@code cancelReason} da:
         * foydalanuvchi voz kechdi, admin to'xtatdi, yoki bot kanaldan
         * chiqarib tashlandi. Uchtasi bir xil yakun, shuning uchun bitta
         * holat; sabab esa "nega men endi hamkor emasman" degan savolga
         * javob beradi.
         */
        CANCELLED;

        public boolean isOpen() {
            return this == AWAITING_CHANNEL || this == AWAITING_PAYMENT || this == AWAITING_REVIEW;
        }
    }

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, columnDefinition = "uuid")
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.AWAITING_CHANNEL;

    @Column(name = "channel_id")
    private Long channelId;

    @Column(name = "channel_title", columnDefinition = "text")
    private String channelTitle;

    @Column(name = "channel_username", columnDefinition = "text")
    private String channelUsername;

    @Column(name = "subscriber_count")
    private Integer subscriberCount;

    @Column(name = "verified_at")
    private Instant verifiedAt;

    /** Tekshiruv o'tmagan sabab — foydalanuvchiga nimani tuzatish kerakligi. */
    @Column(name = "verification_error", columnDefinition = "text")
    private String verificationError;

    /**
     * payment-service'dagi invoice. Foreign key emas: u boshqa servisning
     * bazasida va marketplace u yerga ulanmaydi.
     */
    @Column(name = "invoice_id", columnDefinition = "uuid")
    private UUID invoiceId;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "reviewed_by", columnDefinition = "uuid")
    private UUID reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "review_note", columnDefinition = "text")
    private String reviewNote;

    @Column(name = "cancel_reason", columnDefinition = "text")
    private String cancelReason;

    /** Bekor qilgan odam. Bot chiqarib tashlaganda null. */
    @Column(name = "cancelled_by", columnDefinition = "uuid")
    private UUID cancelledBy;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
