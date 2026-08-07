package uz.efbazaar.trade.trade;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.dto.ProposalResponse;

import java.util.Map;
import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class TradeProposalControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    @Test
    void createReturns201WithProposalId() throws Exception {
        UUID proposer = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        ProposalCreateRequest req = new ProposalCreateRequest(
                UUID.randomUUID(), other, proposer, other, 500_000L, UUID.randomUUID(), null,
                TradeMode.SMART, null, null);

        mvc.perform(post("/api/v1/trades/proposals")
                        .contentType(APPLICATION_JSON)
                        .content(json.writeValueAsString(req))
                        .with(asUser(proposer)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.proposalId").isString());
    }

    @Test
    void rejectMissingProposalIs404() throws Exception {
        UUID rejecter = UUID.randomUUID();
        mvc.perform(post("/api/v1/trades/proposals/" + UUID.randomUUID() + "/reject")
                        .with(asUser(rejecter)))
                .andExpect(status().isNotFound());
    }

    /**
     * Whole-branch review Critical #2: self-accept must be a client error
     * (400), not an IllegalStateException falling through the catch-all
     * that used to map to 410 Gone.
     */
    @Test
    void proposerAcceptingOwnProposalIs400() throws Exception {
        UUID proposer = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        ProposalCreateRequest req = new ProposalCreateRequest(
                UUID.randomUUID(), other, proposer, other, 500_000L, UUID.randomUUID(), null,
                TradeMode.SMART, null, null);

        var createResult = mvc.perform(post("/api/v1/trades/proposals")
                        .contentType(APPLICATION_JSON)
                        .content(json.writeValueAsString(req))
                        .with(asUser(proposer)))
                .andExpect(status().isCreated())
                .andReturn();
        var proposal = json.readValue(createResult.getResponse().getContentAsString(), ProposalResponse.class);

        mvc.perform(post("/api/v1/trades/proposals/" + proposal.proposalId() + "/accept")
                        .with(asUser(proposer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("cardId", UUID.randomUUID()))))
                .andExpect(status().isBadRequest());
    }
}
