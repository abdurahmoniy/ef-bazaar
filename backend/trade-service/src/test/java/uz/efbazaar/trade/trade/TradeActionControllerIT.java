package uz.efbazaar.trade.trade;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class TradeActionControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired TradeService trades;
    @Autowired TradeRepository repo;

    @Test
    void buyerCanConfirmPayment_thenSellerChangesEmail() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        var t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        // Push it to WAITING_PAYMENT — normally the mock worker does this on email-provisioned.
        trades.transition(t.id(), uz.efbazaar.trade.trade.domain.TradeEvent.MAILBOX_PROVISIONED,
                uz.efbazaar.trade.trade.domain.ActorType.SYSTEM, null);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/payment-confirmed").with(asUser(buyer)))
                .andExpect(status().isOk());
        assertThat(repo.findById(t.id()).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_EMAIL_CHANGE);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/email-changed").with(asUser(seller)))
                .andExpect(status().isOk());
        assertThat(repo.findById(t.id()).orElseThrow().getState())
                .isEqualTo(TradeState.VERIFYING_KONAMI_LINK);
    }

    @Test
    void sellerCannotConfirmPayment() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        var t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        trades.transition(t.id(), uz.efbazaar.trade.trade.domain.TradeEvent.MAILBOX_PROVISIONED,
                uz.efbazaar.trade.trade.domain.ActorType.SYSTEM, null);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/payment-confirmed").with(asUser(seller)))
                .andExpect(status().isForbidden());
    }

}
