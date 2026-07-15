package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
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

    @Test
    void revealYieldsPlaintextOnceThenIsGone() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();

        var trade = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        // Fast-forward to WAITING_PASSWORD.
        trades.transition(trade.id(), TradeEvent.MAILBOX_PROVISIONED, ActorType.WORKER, null);
        trades.transition(trade.id(), TradeEvent.PAYMENT_CONFIRMED,  ActorType.USER, buyer);
        trades.transition(trade.id(), TradeEvent.EMAIL_CHANGED,       ActorType.USER, seller);
        trades.transition(trade.id(), TradeEvent.KONAMI_EMAIL_RECEIVED, ActorType.WORKER, null);

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
        trades.transition(trade.id(), TradeEvent.MAILBOX_PROVISIONED, ActorType.WORKER, null);
        trades.transition(trade.id(), TradeEvent.PAYMENT_CONFIRMED,  ActorType.USER, buyer);
        trades.transition(trade.id(), TradeEvent.EMAIL_CHANGED,       ActorType.USER, seller);
        trades.transition(trade.id(), TradeEvent.KONAMI_EMAIL_RECEIVED, ActorType.WORKER, null);

        UUID msgId = otp.sendPassword(trade.id(), "topsecret", seller);
        assertThatThrownBy(() -> otp.reveal(trade.id(), msgId, seller))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
