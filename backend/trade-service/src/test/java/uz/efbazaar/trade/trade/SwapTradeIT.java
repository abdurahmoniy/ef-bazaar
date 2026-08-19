package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;
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

    /**
     * Gets the trade to WAITING_EMAIL_CHANGE.
     *
     * <p>State-driven, not a fixed script: MockWorker is live under the test
     * profile and answers the same trade over Kafka, so it may already have
     * done one of these steps. Firing an event the trade has passed throws.
     */
    private void provision(Trade t) {
        for (int attempt = 0; attempt < 8; attempt++) {
            TradeState now = tradeRepo.findById(t.getId()).orElseThrow().getState();
            if (now == TradeState.WAITING_EMAIL_CHANGE) return;
            switch (now) {
                case INITIATED -> fire(t.getId(), TradeEvent.MAILBOX_PROVISIONED, ActorType.WORKER, null);
                case WAITING_PAYMENT -> fire(t.getId(), TradeEvent.PAYMENT_CONFIRMED, ActorType.SYSTEM, null);
                default -> throw new AssertionError("Unexpected state in setup: " + now);
            }
        }
        throw new AssertionError("Setup never reached WAITING_EMAIL_CHANGE");
    }

    /**
     * Fires the event, treating "already past it" as done rather than as a
     * failure.
     *
     * <p>Reading the state and then acting on it cannot be made atomic here:
     * MockWorker drives the same trade over Kafka and may advance it in the
     * gap. Swallowing that one exception is what makes the setup deterministic
     * — the caller's loop re-reads and carries on, and a trade that genuinely
     * cannot move still fails on the loop's bound.
     */
    private void fire(UUID tradeId, TradeEvent event, ActorType actor, UUID actorId) {
        try {
            trades.transition(tradeId, event, actor, actorId);
        } catch (InvalidTradeTransitionException alreadyMoved) {
            // Someone else got there first, which is the outcome we wanted.
        }
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

    /**
     * Walks a freshly opened swap to a terminal state.
     *
     * <p>Driven by what the trade still needs, not by a script. MockWorker
     * answers the same trade over Kafka — it replies to the forgot-password
     * request with konami-email-received, and can clear that step for both
     * mailboxes on its own — so firing a fixed sequence throws as soon as it
     * gets there first.
     */
    private void drive(Trade t, TradeState terminal) {
        provision(t);
        UUID id = t.getId();
        TradeEvent decision = terminal == TradeState.SUCCESS
                ? TradeEvent.BUYER_CONFIRM : TradeEvent.BUYER_REJECT;

        for (int attempt = 0; attempt < 40; attempt++) {
            TradeState now = tradeRepo.findById(id).orElseThrow().getState();
            if (now == terminal) return;
            switch (now) {
                case WAITING_EMAIL_CHANGE -> forEachPendingSide(id, TradeEvent.EMAIL_CHANGED);
                case VERIFYING_KONAMI_LINK -> forEachPendingSide(id, TradeEvent.KONAMI_EMAIL_RECEIVED);
                case WAITING_PASSWORD -> forEachPendingSide(id, TradeEvent.PASSWORD_SENT);
                case WAITING_BUYER_VERIFY -> forEachPendingSide(id, decision);
                default -> throw new AssertionError("Trade wandered off: " + now);
            }
        }
        throw new AssertionError("Never reached " + terminal + ", stuck at "
                + tradeRepo.findById(id).orElseThrow().getState());
    }

    /**
     * Fires the event for whichever party has not cleared it yet.
     *
     * <p>Re-reads the state between the two, because clearing the first side
     * may be what lets the trade move — and then the second party's event
     * belongs to the next state, not this one.
     */
    private void forEachPendingSide(UUID tradeId, TradeEvent event) {
        for (ParticipantRole role : ParticipantRole.values()) {
            TradeSide side = sides.of(tradeId, role).orElseThrow();
            if (cleared(side, event)) continue;
            UUID actorId = role == ParticipantRole.SELLER ? seller : buyer;
            ActorType actor = event == TradeEvent.KONAMI_EMAIL_RECEIVED
                    ? ActorType.WORKER : ActorType.USER;
            fire(tradeId, event, actor, actor == ActorType.WORKER ? null : actorId);
            return;   // one step at a time; the loop re-reads the state
        }
    }

    private static boolean cleared(TradeSide side, TradeEvent event) {
        return switch (event) {
            case EMAIL_CHANGED -> side.getEmailChangedAt() != null;
            case KONAMI_EMAIL_RECEIVED -> side.getKonamiVerifiedAt() != null;
            case PASSWORD_SENT -> side.getPasswordSentAt() != null;
            case BUYER_CONFIRM, BUYER_REJECT -> side.hasDecided();
            default -> true;
        };
    }
}
