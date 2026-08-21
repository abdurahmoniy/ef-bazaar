package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeSideRepository;
import uz.efbazaar.trade.trade.service.TradeSideService;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * The gate that decides when a swap may move, without a broker in the way.
 *
 * <p>Deliberately a unit test. The same logic driven through Kafka is at the
 * mercy of MockWorker, which answers the same trade and can clear a step on
 * its own — so a test asserting "one report is not two" would be measuring the
 * scheduler, not the rule.
 */
// Lenient: a sale returns before it ever reads the sides, so the shared setup
// stub goes unused in that one case.
@org.mockito.junit.jupiter.MockitoSettings(strictness = org.mockito.quality.Strictness.LENIENT)
@ExtendWith(MockitoExtension.class)
class TradeSideGateTest {

    @Mock TradeSideRepository sides;
    @Mock uz.efbazaar.trade.mailbox.repository.MailboxRepository mailboxes;
    @InjectMocks TradeSideService service;

    private UUID tradeId;
    private TradeSide sellerSide;
    private TradeSide buyerSide;

    private static TradeSide side(UUID tradeId, ParticipantRole role, boolean withMailbox) {
        return TradeSide.builder()
                .id(new TradeSideId(tradeId, role))
                .mailboxId(withMailbox ? UUID.randomUUID() : null)
                .build();
    }

    private Trade trade(TradeKind kind) {
        Trade t = new Trade();
        t.setId(tradeId);
        t.setKind(kind);
        return t;
    }

    @BeforeEach
    void setUp() {
        tradeId = UUID.randomUUID();
        sellerSide = side(tradeId, ParticipantRole.SELLER, true);
        buyerSide = side(tradeId, ParticipantRole.BUYER, true);
        when(sides.findByIdTradeId(tradeId)).thenReturn(List.of(sellerSide, buyerSide));
    }

    @Test
    void aSaleIsNeverGated() {
        // The buyer is not asked to change an email, so waiting for them would
        // hang every sale ever opened.
        assertThat(service.bothSidesCleared(trade(TradeKind.SALE), TradeEvent.EMAIL_CHANGED))
                .isTrue();
    }

    @Test
    void aSwapWaitsForTheSecondParty() {
        sellerSide.setEmailChangedAt(Instant.now());

        assertThat(service.bothSidesCleared(trade(TradeKind.SWAP), TradeEvent.EMAIL_CHANGED))
                .as("the buyer has not touched their email yet")
                .isFalse();
    }

    @Test
    void aSwapMovesOnceBothHaveDoneIt() {
        sellerSide.setEmailChangedAt(Instant.now());
        buyerSide.setEmailChangedAt(Instant.now());

        assertThat(service.bothSidesCleared(trade(TradeKind.SWAP), TradeEvent.EMAIL_CHANGED))
                .isTrue();
    }

    @Test
    void oneWorkerReportIsNotTwoMailboxes() {
        // KonamiEmailReceived names only the trade, so a swap's two reports are
        // indistinguishable. Each has to count once: advancing on the first
        // would ask a party for a password whose reset link had not been sent.
        when(sides.find(any(), any())).thenAnswer(i -> Optional.of(
                i.getArgument(1) == ParticipantRole.SELLER ? sellerSide : buyerSide));

        service.stampNextPending(tradeId, TradeEvent.KONAMI_EMAIL_RECEIVED);
        assertThat(service.bothSidesCleared(trade(TradeKind.SWAP),
                TradeEvent.KONAMI_EMAIL_RECEIVED))
                .as("one mailbox has its link; the other has not")
                .isFalse();

        service.stampNextPending(tradeId, TradeEvent.KONAMI_EMAIL_RECEIVED);
        assertThat(service.bothSidesCleared(trade(TradeKind.SWAP),
                TradeEvent.KONAMI_EMAIL_RECEIVED))
                .isTrue();
    }

    /**
     * A swap must have both escrow mailboxes before it moves off INITIATED.
     *
     * <p>Reported from testing: one party was shown their Konami verification
     * code and the other never was, though the code was sitting in their
     * mailbox. The trade had advanced on the first provisioned report, so when
     * it asked the worker to watch the mailboxes for codes, the second one was
     * still the "pending-…" placeholder that exists in no mail server — no
     * watcher was ever started for it, and the code arrived unread.
     */
    @Test
    void aSwapWaitsForBothMailboxesBeforeItMoves() {
        provisioned(sellerSide, "trade-1a2b3c4d@efbazaar.uz");
        stillAPlaceholder(buyerSide);

        assertThat(service.bothSidesCleared(trade(TradeKind.SWAP),
                TradeEvent.MAILBOX_PROVISIONED))
                .as("the buyer's box does not exist yet")
                .isFalse();
    }

    @Test
    void aSwapMovesOnceBothMailboxesAreReal() {
        provisioned(sellerSide, "trade-1a2b3c4d@efbazaar.uz");
        provisioned(buyerSide, "trade-5e6f7a8b@efbazaar.uz");

        assertThat(service.bothSidesCleared(trade(TradeKind.SWAP),
                TradeEvent.MAILBOX_PROVISIONED))
                .isTrue();
    }

    /** Gives the side's box a real address, as the worker's report does. */
    private void provisioned(TradeSide side, String address) {
        when(mailboxes.findById(side.getMailboxId())).thenReturn(Optional.of(
                uz.efbazaar.trade.mailbox.domain.Mailbox.builder()
                        .id(side.getMailboxId())
                        .email(address)
                        .provisionedAt(Instant.now())
                        .build()));
    }

    /** The row trade-service allocates before the worker has answered. */
    private void stillAPlaceholder(TradeSide side) {
        when(mailboxes.findById(side.getMailboxId())).thenReturn(Optional.of(
                uz.efbazaar.trade.mailbox.domain.Mailbox.builder()
                        .id(side.getMailboxId())
                        .email("pending-" + UUID.randomUUID() + "@efbazaar.uz")
                        .build()));
    }

    @Test
    void aSwapCrossesOverOnlyWhenBothSaidYes() {
        sellerSide.setConfirmedAt(Instant.now());
        assertThat(service.bothConfirmed(tradeId))
                .as("one yes is not an agreement").isFalse();

        buyerSide.setConfirmedAt(Instant.now());
        assertThat(service.bothConfirmed(tradeId)).isTrue();
    }

    @Test
    void aRejectionIsNotAConfirmation() {
        sellerSide.setConfirmedAt(Instant.now());
        buyerSide.setRejectedAt(Instant.now());

        assertThat(service.bothConfirmed(tradeId))
                .as("accounts go back where they came from")
                .isFalse();
    }
}
