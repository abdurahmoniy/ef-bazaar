package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.exception.PasswordAlreadyRevealedException;
import uz.efbazaar.trade.trade.repository.TradeMessageRepository;
import uz.efbazaar.trade.trade.service.OneTimePasswordService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class OneTimePasswordServiceTest extends AbstractIntegrationIT {

    @Autowired OneTimePasswordService otp;
    @Autowired TradeService trades;
    @Autowired TradeMessageRepository messages;
    @Autowired uz.efbazaar.trade.trade.repository.TradeRepository tradeRepo;

    @Test
    void revealYieldsPlaintextOnceThenIsGone() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();

        var trade = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        // Fast-forward to WAITING_PASSWORD.
        driveToWaitingPassword(trade.id(), seller, buyer);

        UUID msgId = otp.sendPassword(trade.id(), "SuperSecret42", seller);

        assertThat(otp.reveal(trade.id(), msgId, buyer)).isEqualTo("SuperSecret42");
        // Second reveal is impossible — Redis key gone.
        assertThatThrownBy(() -> otp.reveal(trade.id(), msgId, buyer))
                .isInstanceOf(PasswordAlreadyRevealedException.class);
    }

    @Test
    void sellerCannotReveal() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();

        var trade = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        driveToWaitingPassword(trade.id(), seller, buyer);

        UUID msgId = otp.sendPassword(trade.id(), "topsecret", seller);
        assertThatThrownBy(() -> otp.reveal(trade.id(), msgId, seller))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }

    /**
     * Walks the trade to WAITING_PASSWORD without racing MockWorker.
     *
     * <p>MockWorker is live under the {@code test} profile and drives the same
     * trade over Kafka: entering VERIFYING_KONAMI_LINK fires a forgot-password
     * request, and MockWorker answers it with konami-email-received. So the
     * trade can arrive at the next state on its own, and a hard-coded sequence
     * of transitions is a race — whichever thread gets there first wins, and
     * the loser throws InvalidTradeTransition.
     *
     * <p>Skipping events the trade has already passed makes the setup say what
     * it means: get to WAITING_PASSWORD, however it happens.
     */
    private void driveToWaitingPassword(UUID tradeId, UUID seller, UUID buyer) {
        applyIfPending(tradeId, TradeState.INITIATED,
                TradeEvent.MAILBOX_PROVISIONED, ActorType.WORKER, null);
        applyIfPending(tradeId, TradeState.WAITING_PAYMENT,
                TradeEvent.PAYMENT_CONFIRMED, ActorType.USER, buyer);
        applyIfPending(tradeId, TradeState.WAITING_EMAIL_CHANGE,
                TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);
        applyIfPending(tradeId, TradeState.VERIFYING_KONAMI_LINK,
                TradeEvent.KONAMI_EMAIL_RECEIVED, ActorType.WORKER, null);
        assertThat(tradeRepo.findById(tradeId).orElseThrow().getState())
                .as("setup must reach the state the assertions are about")
                .isEqualTo(TradeState.WAITING_PASSWORD);
    }

    /** Fires the event only if the trade is still waiting on it. */
    private void applyIfPending(UUID tradeId, TradeState expected,
                                TradeEvent event, ActorType actor, UUID actorId) {
        if (tradeRepo.findById(tradeId).orElseThrow().getState() == expected) {
            trades.transition(tradeId, event, actor, actorId);
        }
    }
}
