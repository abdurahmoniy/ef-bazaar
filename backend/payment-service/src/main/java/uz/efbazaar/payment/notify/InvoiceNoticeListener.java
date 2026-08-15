package uz.efbazaar.payment.notify;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;
import uz.efbazaar.payment.card.domain.PlatformCard;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;

import java.util.Optional;
import java.util.OptionalLong;

/**
 * Turns committed invoice facts into Telegram messages.
 *
 * <p>{@code AFTER_COMMIT} is the point: a notice announcing a credit that later
 * rolled back would be a lie, and a Telegram round trip inside the credit
 * transaction would hold a database connection for its duration. The cost — a
 * notice that is never sent if the process dies between commit and post — is
 * the right trade, because the invoice and the credit are what must survive.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InvoiceNoticeListener {

    private final InvoiceRepository invoices;
    private final CardCreditObservationRepository observations;
    private final PlatformCardService cards;
    private final AdminTelegramNotifier notifier;
    private final uz.efbazaar.payment.withdrawal.repository.WithdrawalTicketRepository withdrawals;
    private final uz.efbazaar.payment.kafka.PaymentEventPublisher paymentEvents;

    /**
     * Announces a payout waiting for a human.
     *
     * <p>Re-read after commit rather than passed in the event: the reserve
     * posting and the ticket row commit together, and a notice sent from
     * inside that transaction could advertise money that was never frozen.
     */
    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onWithdrawalOpened(InvoiceNoticeEvents.WithdrawalOpened event) {
        withdrawals.findById(event.ticketId()).ifPresent(t -> {
            notifier.withdrawalOpened(new WithdrawalNotice(
                    t.getId(), t.getUserId(), t.getAmountTiyin(), t.getLast4(),
                    t.getHolderName(), t.getPhone(), t.getTelegramUsername()));
            // Kafka reaches the admin panel's bell; the topic reaches the phone
            // in someone's pocket. Both, because neither is watched all day.
            paymentEvents.withdrawalRequested(
                    t.getId(), t.getUserId(), t.getAmountTiyin(), t.getLast4());
        });
    }

    /**
     * Tells the wallet owner how their payout ended.
     *
     * <p>The card is not in the event: the user knows which card they asked
     * for, and last4 is already on the ticket they can open.
     */
    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onWithdrawalClosed(InvoiceNoticeEvents.WithdrawalClosed event) {
        withdrawals.findById(event.ticketId()).ifPresent(t -> paymentEvents.withdrawalClosed(
                t.getId(), t.getUserId(), t.getAmountTiyin(),
                t.getStatus() == uz.efbazaar.payment.withdrawal.domain.WithdrawalStatus.PAID,
                t.getCloseNote()));
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onPaid(InvoiceNoticeEvents.InvoicePaid event) {
        Optional<Invoice> found = invoices.findById(event.invoiceId());
        if (found.isEmpty()) return;
        Invoice inv = found.get();

        PlatformCard card = cards.findById(inv.getCardId()).orElse(null);
        if (card == null) {
            log.warn("Invoice {} points at a missing card — paid notice skipped", inv.getId());
            return;
        }

        OptionalLong newId = notifier.invoicePaid(new InvoiceNotice(
                inv.getId(), inv.getUserId(), card.getLast4(), card.getHolderName(),
                inv.getRequestedAmountTiyin(), inv.getTransferAmountTiyin(),
                inv.getExpiresAt(), inv.getPaidAt()), inv.getAdminNoticeMessageId());

        // Store the receipt's id, or clear the stale pending one. Either way the
        // row stops pointing at a message that no longer exists.
        inv.setAdminNoticeMessageId(newId.isPresent() ? newId.getAsLong() : null);
        invoices.save(inv);
    }

    @TransactionalEventListener
    public void onExpired(InvoiceNoticeEvents.InvoicesExpired event) {
        // No transaction needed: this only deletes messages.
        event.messageIds().forEach(notifier::invoiceExpired);
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onUnmatched(InvoiceNoticeEvents.UnmatchedCredit event) {
        observations.findById(event.observationId()).ifPresent(obs ->
                notifier.unmatchedCredit(new UnmatchedNotice(
                        obs.getId(), obs.getCardLast4(),
                        obs.getAmountTiyin(), obs.getObservedAt())));
    }
}
