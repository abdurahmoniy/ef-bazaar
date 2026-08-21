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

import uz.efbazaar.trade.kafka.TradeEvents;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.awaitility.Awaitility.await;

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
    @Autowired uz.efbazaar.trade.kafka.KonamiEmailChangeCodeConsumer codeConsumer;

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

    @Test
    void eachPartyIsShownTheirOwnMailboxNotTheOthers() {
        // Reported from production: both users were handed the same address
        // and told to move their account there. Two boxes were being created;
        // the response only ever carried the seller's.
        Trade t = openSwap();

        // By id, not address: the worker has not provisioned them yet, and a
        // placeholder address is deliberately hidden until it is real.
        UUID sellerSees = trades.toResponseFor(t.getId(), seller).mailboxId();
        UUID buyerSees = trades.toResponseFor(t.getId(), buyer).mailboxId();

        assertThat(sellerSees).isNotNull();
        assertThat(buyerSees).isNotNull();
        assertThat(buyerSees)
                .as("a swap gives each side its own escrow mailbox")
                .isNotEqualTo(sellerSees);
    }

    @Test
    void eachPartyIsToldWhichAccountTheyAreReceiving() {
        // The boxes cross over at the end, so the address of the account you
        // get is the other party's — not the one you moved your own into.
        Trade t = openSwap();

        var forSeller = trades.toResponseFor(t.getId(), seller);
        var forBuyer = trades.toResponseFor(t.getId(), buyer);
        UUID sellerBox = sides.of(t.getId(), ParticipantRole.SELLER).orElseThrow().getMailboxId();
        UUID buyerBox = sides.of(t.getId(), ParticipantRole.BUYER).orElseThrow().getMailboxId();

        assertThat(forSeller.mailboxId()).isEqualTo(sellerBox);
        assertThat(forBuyer.mailboxId()).isEqualTo(buyerBox);
        // Addresses are still placeholders here; the crossing is asserted on
        // the boxes themselves, which is what the addresses will follow.
        assertThat(forSeller.mailboxId()).isNotEqualTo(forBuyer.mailboxId());
    }

    @Test
    void aSaleShowsTheBuyerTheBoxTheyAreReceiving() {
        // The buyer transfers nothing, so they have no box of their own and
        // must keep seeing the seller's — which is what they are buying.
        var response = trades.openTrade(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                500_000L, null, null, UUID.randomUUID(), null, TradeMode.SMART, null, null,
                TradeKind.SALE, 500_000L);
        Trade sale = tradeRepo.findById(response.id()).orElseThrow();

        var forBuyer = trades.toResponseFor(sale.getId(), sale.getBuyerId());
        var forSeller = trades.toResponseFor(sale.getId(), sale.getSellerId());

        assertThat(forBuyer.mailboxId())
                .as("unchanged from before swaps existed")
                .isEqualTo(forSeller.mailboxId());
    }

    /**
     * A party who moved their account in keeps it when the trade dies.
     *
     * <p>Reported from testing: one party transferred their account into their
     * escrow mailbox, the other went quiet, the deadline passed — and the
     * account was left in a mailbox belonging to nobody. The trade failing is
     * not a reason to take somebody's account away from them; every ending
     * short of a completed swap hands each box back to whoever put it up.
     */
    @Test
    void atimedOutSwapGivesEachPartyTheirOwnMailboxBack() {
        Trade t = openSwap();
        provision(t);
        // One party has moved their account across; the other never shows up.
        fire(t.getId(), TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);
        UUID sellerBox = sides.of(t.getId(), ParticipantRole.SELLER).orElseThrow().getMailboxId();
        UUID buyerBox = sides.of(t.getId(), ParticipantRole.BUYER).orElseThrow().getMailboxId();

        trades.transition(t.getId(), TradeEvent.TIMEOUT, ActorType.SYSTEM, null);

        assertThat(tradeRepo.findById(t.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.ORPHANED);
        assertThat(mailboxes.findById(sellerBox).orElseThrow().getOwnerUserId())
                .as("the account they transferred is theirs, not the platform's")
                .isEqualTo(seller);
        assertThat(mailboxes.findById(buyerBox).orElseThrow().getOwnerUserId())
                .as("and the box the other party never used goes back to them too")
                .isEqualTo(buyer);
    }

    /**
     * Konami mints a code per account, so a swap has two of them.
     *
     * <p>Reported from production: the party was never shown a code at all.
     * Both codes were landing in one column on the trade, last write winning,
     * so a party saw either nothing or — worse — the code Konami issued for
     * the other person's account, which their own Konami form rejects.
     */
    @Test
    void eachPartySeesTheCodeMintedForTheirOwnAccount() {
        Trade t = openSwap();
        UUID sellerBox = sides.of(t.getId(), ParticipantRole.SELLER).orElseThrow().getMailboxId();
        UUID buyerBox = sides.of(t.getId(), ParticipantRole.BUYER).orElseThrow().getMailboxId();
        String sellerAddress = provisionedAddress(sellerBox);
        String buyerAddress = provisionedAddress(buyerBox);
        assertThat(buyerAddress)
                .as("two boxes on one trade must not share an address")
                .isNotEqualTo(sellerAddress);

        // Two arrivals, one per mailbox, in the order the poller happened to
        // see them. The second must not displace the first.
        codeConsumer.onCode(new TradeEvents.KonamiEmailChangeCodeReceived(
                t.getId(), "111111", Instant.now(), "noreply@konami.net", sellerAddress));
        codeConsumer.onCode(new TradeEvents.KonamiEmailChangeCodeReceived(
                t.getId(), "222222", Instant.now(), "noreply@konami.net", buyerAddress));

        assertThat(trades.toResponseFor(t.getId(), seller).emailChangeVerificationCode())
                .as("the code Konami sent to the seller's own escrow mailbox")
                .isEqualTo("111111");
        assertThat(trades.toResponseFor(t.getId(), buyer).emailChangeVerificationCode())
                .as("the buyer must not be handed the seller's code — Konami "
                        + "issued it for a different account")
                .isEqualTo("222222");
    }

    /**
     * That a party is shown nothing rather than somebody else's code.
     *
     * <p>The trade-level column is still written for the sale path, so a naive
     * read would fall back to it and quietly show the wrong six digits.
     */
    @Test
    void aPartyWhoseCodeHasNotArrivedIsShownNoCode() {
        Trade t = openSwap();
        UUID sellerBox = sides.of(t.getId(), ParticipantRole.SELLER).orElseThrow().getMailboxId();
        String sellerAddress = provisionedAddress(sellerBox);

        codeConsumer.onCode(new TradeEvents.KonamiEmailChangeCodeReceived(
                t.getId(), "333333", Instant.now(), "noreply@konami.net", sellerAddress));

        assertThat(trades.toResponseFor(t.getId(), seller).emailChangeVerificationCode())
                .isEqualTo("333333");
        assertThat(trades.toResponseFor(t.getId(), buyer).emailChangeVerificationCode())
                .as("waiting is honest; the seller's code would only fail on Konami")
                .isNull();
    }

    /**
     * The box's real address, once provisioning has given it one.
     *
     * <p>Waited for rather than written: MockWorker is live under the test
     * profile and overwrites the address itself a moment later, so a test that
     * sets its own would have it pulled out from under the assertion.
     */
    private String provisionedAddress(UUID boxId) {
        await().atMost(20, TimeUnit.SECONDS).until(() ->
                mailboxes.findById(boxId)
                        .map(m -> m.getEmail() != null && !m.getEmail().startsWith("pending-"))
                        .orElse(false));
        return mailboxes.findById(boxId).orElseThrow().getEmail();
    }

    /**
     * Gets the trade to WAITING_EMAIL_CHANGE.
     *
     * <p>A swap does not leave INITIATED until both escrow mailboxes exist for
     * real — the gate reads the mailbox rows, not the event — so the rows are
     * filled in here for any box MockWorker has not reached. Waiting on it
     * instead would tie every one of these tests to Kafka timing: its consumer
     * may still be joining the group when the request is published, and the
     * first test to run would hang for a reason that has nothing to do with
     * what it asserts. Same addresses MockWorker would write, so the two agree
     * whichever gets there first.
     *
     * <p>The rest is state-driven rather than a fixed script, because
     * MockWorker answers the same trade and may already have done a step.
     */
    private void provision(Trade t) {
        for (TradeSide side : sides.of(t.getId())) {
            if (side.getMailboxId() == null) continue;
            var box = mailboxes.findById(side.getMailboxId()).orElseThrow();
            if (box.getEmail() == null || box.getEmail().startsWith("pending-")) {
                box.setEmail("trade-" + side.getMailboxId().toString().substring(0, 8)
                        + "@efbazaar.uz");
                box.setProvisionedAt(Instant.now());
                mailboxes.saveAndFlush(box);
            }
        }
        for (int attempt = 0; attempt < 20; attempt++) {
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
