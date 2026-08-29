package uz.efbazaar.payment.observation.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "card_credit_observations")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CardCreditObservation {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    /** Idempotency key. A Kafka redelivery collides here and credits nothing. */
    @Column(name = "telegram_message_id", nullable = false, updatable = false)
    private long telegramMessageId;

    @Column(name = "card_last4", nullable = false, length = 4)
    private String cardLast4;

    @Column(name = "amount_tiyin", nullable = false)
    private long amountTiyin;

    @Column(name = "card_balance_tiyin")
    private Long cardBalanceTiyin;

    @Column(name = "observed_at", nullable = false)
    private Instant observedAt;

    @Column(name = "raw_text", nullable = false)
    private String rawText;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private ObservationStatus status;

    @Column(name = "invoice_id")
    private UUID invoiceId;

    @Column(name = "resolved_by")
    private UUID resolvedBy;

    /**
     * Pul kimning hisobiga tushgani.
     *
     * <p>Ledger'da ham bor, lekin u yerga bog'lovchi kalit idempotency
     * string ichida — ya'ni qatordan ledger'ga qaytib borish yo'li yo'q.
     * Amal qaytarib bo'lmagani uchun bu savol albatta so'raladi va
     * javob shu yerda turishi kerak.
     */
    @Column(name = "resolved_user_id")
    private UUID resolvedUserId;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "resolution_note")
    private String resolutionNote;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
