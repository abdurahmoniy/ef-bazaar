package uz.efbazaar.trade.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.admin.dto.TradeAdminProfileUpsertRequest;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class TradeAdminProfileControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private static final String TRADE_ADMIN = "ROLE_TRADE_ADMIN";

    private String body(Long min, Long max, Integer concurrent) throws Exception {
        return json.writeValueAsString(new TradeAdminProfileUpsertRequest(
                min, max, "5 yillik tajriba", true, concurrent));
    }

    @Test
    void createsThenReadsBackOwnProfile() throws Exception {
        UUID admin = UUID.randomUUID();

        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(admin, "ROLE_USER", TRADE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(15_000L, 40_000L, 5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.minFeeUzs").value(15000))
                .andExpect(jsonPath("$.maxFeeUzs").value(40000))
                .andExpect(jsonPath("$.maxConcurrentTrades").value(5))
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.ratingCount").value(0))
                .andExpect(jsonPath("$.averageStars").doesNotExist());

        mvc.perform(get("/api/v1/trade-admins/me")
                        .with(asUser(admin, "ROLE_USER", TRADE_ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(admin.toString()))
                .andExpect(jsonPath("$.bio").value("5 yillik tajriba"));
    }

    @Test
    void secondPostUpdatesRatherThanDuplicating() throws Exception {
        UUID admin = UUID.randomUUID();

        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(admin, "ROLE_USER", TRADE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(15_000L, 40_000L, 3)))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(admin, "ROLE_USER", TRADE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(20_000L, 60_000L, 7)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.minFeeUzs").value(20000))
                .andExpect(jsonPath("$.maxConcurrentTrades").value(7));
    }

    @Test
    void missingProfileIsNotFound() throws Exception {
        mvc.perform(get("/api/v1/trade-admins/me")
                        .with(asUser(UUID.randomUUID(), "ROLE_USER", TRADE_ADMIN)))
                .andExpect(status().isNotFound());
    }

    @Test
    void plainUserCannotOwnAProfile() throws Exception {
        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(UUID.randomUUID(), "ROLE_USER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(15_000L, 40_000L, 3)))
                .andExpect(status().isForbidden());
    }

    @Test
    void invertedFeeRangeIsRejected() throws Exception {
        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(UUID.randomUUID(), "ROLE_USER", TRADE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(40_000L, 15_000L, 3)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void zeroMinimumFeeIsRejected() throws Exception {
        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(UUID.randomUUID(), "ROLE_USER", TRADE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(0L, 15_000L, 3)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void concurrencyAboveTwentyIsRejected() throws Exception {
        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(UUID.randomUUID(), "ROLE_USER", TRADE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(15_000L, 40_000L, 21)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void publicProfileIsReadableByAnyAuthenticatedUser() throws Exception {
        UUID admin = UUID.randomUUID();
        mvc.perform(post("/api/v1/trade-admins/me")
                        .with(asUser(admin, "ROLE_USER", TRADE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(15_000L, 40_000L, 3)))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/trade-admins/" + admin)
                        .with(asUser(UUID.randomUUID(), "ROLE_USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(admin.toString()));
    }
}
