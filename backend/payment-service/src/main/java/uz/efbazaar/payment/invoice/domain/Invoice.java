package uz.efbazaar.payment.invoice.domain;

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
@Table(name = "invoices")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Invoice {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private PaymentProviderId provider;

    @Column(name = "provider_ref", length = 128)
    private String providerRef;

    /** Null for hosted providers; always set for BY_CARD. */
    @Column(name = "card_id")
    private UUID cardId;

    /** What the user asked for, and what their wallet receives. */
    @Column(name = "requested_amount_tiyin", nullable = false)
    private long requestedAmountTiyin;

    /** What the user must actually transfer — requested plus any bump. */
    @Column(name = "transfer_amount_tiyin", nullable = false)
    private long transferAmountTiyin;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private InvoiceStatus status;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "paid_at")
    private Instant paidAt;

    /**
     * No FK: invoices and card_credit_observations reference each other, so
     * one side stays a plain column.
     */
    @Column(name = "observation_id")
    private UUID observationId;

    /**
     * Telegram message id of this invoice's announcement in the admin payments
     * topic. Null when the announcement failed or the topic is unconfigured;
     * set again when the paid message replaces the pending one.
     */
    @Column(name = "admin_notice_message_id")
    private Long adminNoticeMessageId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
