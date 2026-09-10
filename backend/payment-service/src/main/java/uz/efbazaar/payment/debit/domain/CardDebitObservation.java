package uz.efbazaar.payment.debit.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Money that LEFT a platform card, as the userbot read it off the bank's
 * notification.
 *
 * <p>A record, not an instruction. Nothing in this package posts to the ledger:
 * a payout is already written there when an admin closes the withdrawal ticket,
 * and writing it again from this side would count every payout twice. What
 * these rows give us is the other half of the reconciliation — what the ledger
 * says a card holds, against what the bank says it holds.
 */
@Entity
@Table(name = "card_debit_observations")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CardDebitObservation {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    /** Idempotency key. A Kafka redelivery collides here and records nothing. */
    @Column(name = "telegram_message_id", nullable = false, updatable = false)
    private long telegramMessageId;

    /** Null when the movement was on a card the platform does not own. */
    @Column(name = "card_id")
    private UUID cardId;

    @Column(name = "card_last4", nullable = false, length = 4)
    private String cardLast4;

    /** Always positive. The direction is the table, not the sign. */
    @Column(name = "amount_tiyin", nullable = false)
    private long amountTiyin;

    /**
     * Null means the notice carried no commission line — which is a different
     * fact from a commission of zero, and some notices do state zero.
     */
    @Column(name = "commission_tiyin")
    private Long commissionTiyin;

    @Column(name = "card_balance_tiyin")
    private Long cardBalanceTiyin;

    /** Free text from the bank. Shown to admins, never parsed for meaning. */
    @Column(name = "description")
    private String description;

    @Column(name = "raw_text", nullable = false)
    private String rawText;

    @Column(name = "observed_at", nullable = false)
    private Instant observedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
