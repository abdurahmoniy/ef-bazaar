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
