package uz.efbazaar.trade.trade;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.dto.PostTextRequest;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class TradeMessageControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired TradeService trades;

    @Test
    void sellerPostsAndRetrievesOwnText() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        TradeResponse t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .content(json.writeValueAsString(new PostTextRequest("hello")))
                        .with(asUser(seller)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value("hello"));

        mvc.perform(get("/api/v1/trades/" + t.id() + "/messages").with(asUser(seller)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].text").value("hello"));
    }

    @Test
    void buyerNeverSeesSellerText() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        TradeResponse t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .content(json.writeValueAsString(new PostTextRequest("seller-only")))
                        .with(asUser(seller)))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/trades/" + t.id() + "/messages").with(asUser(buyer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
