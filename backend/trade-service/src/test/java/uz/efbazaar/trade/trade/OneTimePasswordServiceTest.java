package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.Trade;
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
    @Autowired uz.efbazaar.trade.trade.repository.TradeSideRepository sideRepo;

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
        // Loops rather than running a fixed sequence: MockWorker may advance a
        // step between two of ours, and the next event then depends on where
        // the trade actually is, not on where the script thinks it is. Bounded,
        // so a genuinely stuck trade fails loudly instead of hanging.
        for (int attempt = 0; attempt < 12; attempt++) {
            TradeState now = tradeRepo.findById(tradeId).orElseThrow().getState();
            if (now == TradeState.WAITING_PASSWORD) return;
            switch (now) {
                case INITIATED -> applyIfPending(tradeId, now,
                        TradeEvent.MAILBOX_PROVISIONED, ActorType.WORKER, null);
                case WAITING_PAYMENT -> applyIfPending(tradeId, now,
                        TradeEvent.PAYMENT_CONFIRMED, ActorType.USER, buyer);
                case WAITING_EMAIL_CHANGE -> applyIfPending(tradeId, now,
                        TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);
                case VERIFYING_KONAMI_LINK -> applyIfPending(tradeId, now,
                        TradeEvent.KONAMI_EMAIL_RECEIVED, ActorType.WORKER, null);
                default -> throw new AssertionError(
                        "Trade wandered off the smart path: " + describe(tradeId));
            }
        }
        throw new AssertionError("Setup never reached WAITING_PASSWORD: " + describe(tradeId));
    }

    /** Everything needed to tell a stuck trade from a racing one. */
    private String describe(UUID tradeId) {
        Trade t = tradeRepo.findById(tradeId).orElseThrow();
        return "state=" + t.getState() + " kind=" + t.getKind() + " mode=" + t.getMode()
                + " sides=" + sideRepo.findByIdTradeId(tradeId).stream()
                .map(x -> x.role() + "{mailbox=" + (x.getMailboxId() != null)
                        + ",email=" + (x.getEmailChangedAt() != null)
                        + ",konami=" + (x.getKonamiVerifiedAt() != null) + "}")
                .toList();
    }

    /** Fires the event only if the trade is still waiting on it. */
    private void applyIfPending(UUID tradeId, TradeState expected,
                                TradeEvent event, ActorType actor, UUID actorId) {
        if (tradeRepo.findById(tradeId).orElseThrow().getState() == expected) {
            trades.transition(tradeId, event, actor, actorId);
        }
    }
}
