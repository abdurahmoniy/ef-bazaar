package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;
import uz.efbazaar.trade.trade.service.TradeSideService;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The two things a swap has to get right: it waits for both parties, and at the
 * end the accounts cross over.
 *
 * <p>Driven through {@code TradeService.transition} rather than HTTP, because
 * the subject is the state machine's gate, not the controller.
 */
@SpringBootTest
@Import(StubEscrowConfig.class)
class SwapTradeIT extends AbstractIntegrationIT {

    @Autowired TradeService trades;
    @Autowired TradeSideService sides;
    @Autowired TradeRepository tradeRepo;
    @Autowired MailboxRepository mailboxes;

    private UUID seller;
    private UUID buyer;

    private Trade openSwap() {
        seller = UUID.randomUUID();
        buyer = UUID.randomUUID();
        var response = trades.openTrade(UUID.randomUUID(), seller, buyer, 0L,
                null, null, UUID.randomUUID(), null, TradeMode.SMART, null, null,
                TradeKind.SWAP, 500_000L);
        return tradeRepo.findById(response.id()).orElseThrow();
    }

    /** Drives the worker step that a real trade gets from Kafka. */
    private void provision(Trade t) {
        trades.transition(t.getId(), TradeEvent.MAILBOX_PROVISIONED, ActorType.WORKER, null);
        trades.transition(t.getId(), TradeEvent.PAYMENT_CONFIRMED, ActorType.SYSTEM, null);
    }

    @Test
    void bothPartiesGetTheirOwnMailbox() {
        Trade t = openSwap();

        var boxes = sides.of(t.getId()).stream().map(TradeSide::getMailboxId).toList();

        assertThat(boxes).as("each party moves their own account out").doesNotContainNull();
        assertThat(boxes).doesNotHaveDuplicates();
    }

    @Test
    void aSaleStillAllocatesOneMailbox() {
        var response = trades.openTrade(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                500_000L, null, null, UUID.randomUUID(), null, TradeMode.SMART, null, null,
                TradeKind.SALE, 500_000L);

        var boxes = sides.of(response.id()).stream()
                .map(TradeSide::getMailboxId).filter(java.util.Objects::nonNull).toList();

        assertThat(boxes).as("the buyer hands over nothing, so has nothing to move it through")
                .hasSize(1);
    }

    @Test
    void oneSideChangingItsEmailDoesNotMoveTheTrade() {
        // The whole reason sides exist. Advancing here would ask the second
        // party for a Konami password before they had even changed their email.
        Trade t = openSwap();
        provision(t);
        TradeState before = tradeRepo.findById(t.getId()).orElseThrow().getState();

        trades.transition(t.getId(), TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);

        assertThat(tradeRepo.findById(t.getId()).orElseThrow().getState())
                .as("still waiting for the buyer").isEqualTo(before);
        assertThat(sides.of(t.getId(), ParticipantRole.SELLER).orElseThrow().getEmailChangedAt())
                .as("but the seller's own progress is recorded").isNotNull();
    }

    @Test
    void theTradeMovesOnceBothSidesHaveChangedTheirEmail() {
        Trade t = openSwap();
        provision(t);

        trades.transition(t.getId(), TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);
        trades.transition(t.getId(), TradeEvent.EMAIL_CHANGED, ActorType.USER, buyer);

        assertThat(tradeRepo.findById(t.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.VERIFYING_KONAMI_LINK);
    }

    @Test
    void oneSideDoingItTwiceIsNotBothSides() {
        // A double-clicked button must not stand in for the other party.
        Trade t = openSwap();
        provision(t);
        TradeState before = tradeRepo.findById(t.getId()).orElseThrow().getState();

        trades.transition(t.getId(), TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);
        trades.transition(t.getId(), TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);

        assertThat(tradeRepo.findById(t.getId()).orElseThrow().getState()).isEqualTo(before);
    }

    @Test
    void aSaleNeedsOnlyTheSeller() {
        // The gate must be invisible on the path that already worked.
        var response = trades.openTrade(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                500_000L, null, null, UUID.randomUUID(), null, TradeMode.SMART, null, null,
                TradeKind.SALE, 500_000L);
        Trade sale = tradeRepo.findById(response.id()).orElseThrow();
        provision(sale);

        trades.transition(sale.getId(), TradeEvent.EMAIL_CHANGED, ActorType.USER,
                sale.getSellerId());

        assertThat(tradeRepo.findById(sale.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.VERIFYING_KONAMI_LINK);
    }

    @Test
    void aSuccessfulSwapHandsEachAccountToTheOtherParty() {
        Trade t = openSwap();
        UUID sellerBox = sides.of(t.getId(), ParticipantRole.SELLER).orElseThrow().getMailboxId();
        UUID buyerBox = sides.of(t.getId(), ParticipantRole.BUYER).orElseThrow().getMailboxId();

        drive(t, TradeState.SUCCESS);

        assertThat(mailboxes.findById(sellerBox).orElseThrow().getOwnerUserId())
                .as("the seller's account goes to the buyer").isEqualTo(buyer);
        assertThat(mailboxes.findById(buyerBox).orElseThrow().getOwnerUserId())
                .as("and the buyer's to the seller").isEqualTo(seller);
    }

    @Test
    void aRejectedSwapGivesEachPartyTheirOwnAccountBack() {
        Trade t = openSwap();
        UUID sellerBox = sides.of(t.getId(), ParticipantRole.SELLER).orElseThrow().getMailboxId();
        UUID buyerBox = sides.of(t.getId(), ParticipantRole.BUYER).orElseThrow().getMailboxId();

        drive(t, TradeState.REJECTED);

        assertThat(mailboxes.findById(sellerBox).orElseThrow().getOwnerUserId())
                .as("nothing was agreed, so nothing changes hands").isEqualTo(seller);
        assertThat(mailboxes.findById(buyerBox).orElseThrow().getOwnerUserId())
                .isEqualTo(buyer);
    }

    @Test
    void theWorkerReportingOnceIsNotBothMailboxes() {
        // KonamiEmailReceived names only the trade, so on a swap its two
        // reports look identical. Each one must still count once: advancing on
        // the first would ask a party for a password whose reset link had not
        // arrived yet.
        Trade t = openSwap();
        provision(t);
        trades.transition(t.getId(), TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);
        trades.transition(t.getId(), TradeEvent.EMAIL_CHANGED, ActorType.USER, buyer);

        trades.transition(t.getId(), TradeEvent.KONAMI_EMAIL_RECEIVED, ActorType.WORKER, null);

        assertThat(tradeRepo.findById(t.getId()).orElseThrow().getState())
                .as("one mailbox has its link; the other has not")
                .isEqualTo(TradeState.VERIFYING_KONAMI_LINK);

        trades.transition(t.getId(), TradeEvent.KONAMI_EMAIL_RECEIVED, ActorType.WORKER, null);

        assertThat(tradeRepo.findById(t.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_PASSWORD);
    }

    /** Walks a freshly opened swap to a terminal state, both sides in step. */
    private void drive(Trade t, TradeState terminal) {
        provision(t);
        trades.transition(t.getId(), TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);
        trades.transition(t.getId(), TradeEvent.EMAIL_CHANGED, ActorType.USER, buyer);
        // Worker-driven, one report per mailbox.
        trades.transition(t.getId(), TradeEvent.KONAMI_EMAIL_RECEIVED, ActorType.WORKER, null);
        trades.transition(t.getId(), TradeEvent.KONAMI_EMAIL_RECEIVED, ActorType.WORKER, null);
        trades.transition(t.getId(), TradeEvent.PASSWORD_SENT, ActorType.USER, seller);
        trades.transition(t.getId(), TradeEvent.PASSWORD_SENT, ActorType.USER, buyer);
        TradeEvent decision = terminal == TradeState.SUCCESS
                ? TradeEvent.BUYER_CONFIRM : TradeEvent.BUYER_REJECT;
        trades.transition(t.getId(), decision, ActorType.USER, seller);
        trades.transition(t.getId(), decision, ActorType.USER, buyer);
        assertThat(tradeRepo.findById(t.getId()).orElseThrow().getState()).isEqualTo(terminal);
    }
}
