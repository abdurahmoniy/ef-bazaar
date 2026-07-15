package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.service.OneTimePasswordService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/**
 * HTTP-level coverage for the one-time password reveal endpoint, in particular
 * that a second reveal attempt is surfaced as a proper 4xx (410 Gone) rather
 * than a generic 500 — see Task 13 review, Critical/Minor #4.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PasswordRevealControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired TradeService trades;
    @Autowired OneTimePasswordService otp;

    @Test
    void secondRevealReturns410() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();

        var trade = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        trades.transition(trade.id(), TradeEvent.MAILBOX_PROVISIONED, ActorType.WORKER, null);
        trades.transition(trade.id(), TradeEvent.PAYMENT_CONFIRMED, ActorType.USER, buyer);
        trades.transition(trade.id(), TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);
        trades.transition(trade.id(), TradeEvent.KONAMI_EMAIL_RECEIVED, ActorType.WORKER, null);

        UUID msgId = otp.sendPassword(trade.id(), "SuperSecret42", seller);

        String path = "/api/v1/trades/" + trade.id() + "/messages/" + msgId + "/reveal";

        mvc.perform(post(path).with(asUser(buyer)))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"password\":\"SuperSecret42\"}"));

        mvc.perform(post(path).with(asUser(buyer)))
                .andExpect(status().isGone());
    }
}
