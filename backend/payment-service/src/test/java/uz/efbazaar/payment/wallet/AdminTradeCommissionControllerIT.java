package uz.efbazaar.payment.wallet;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.wallet.dto.UpdateTradeCommissionConfigRequest;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asAdmin;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class AdminTradeCommissionControllerIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    @Test
    void publicCanReadCommissionConfig() throws Exception {
        mvc.perform(get("/api/v1/payments/commission"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bandSom").isNumber())
                .andExpect(jsonPath("$.lowRatePercent").isNumber())
                .andExpect(jsonPath("$.highRatePercent").isNumber());
    }

    @Test
    void plainUserCannotUpdateCommissionConfig() throws Exception {
        var req = new UpdateTradeCommissionConfigRequest(120_000L, 9.0, 6.0, 4_000L, 8_000L);

        mvc.perform(put("/api/v1/admin/payments/commission")
                        .with(asUser(UUID.randomUUID()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(req)))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCanReadAndUpdateCommissionConfig() throws Exception {
        mvc.perform(get("/api/v1/admin/payments/commission").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bandSom").value(100_000));

        var req = new UpdateTradeCommissionConfigRequest(200_000L, 8.5, 5.5, 4_000L, 8_000L);

        mvc.perform(put("/api/v1/admin/payments/commission")
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bandSom").value(200_000))
                .andExpect(jsonPath("$.lowRatePercent").value(8.5))
                .andExpect(jsonPath("$.highRatePercent").value(5.5))
                .andExpect(jsonPath("$.lowMinSom").value(4_000))
                .andExpect(jsonPath("$.highMinSom").value(8_000));

        // Verify public endpoint reflects updated rates
        mvc.perform(get("/api/v1/payments/commission"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bandSom").value(200_000))
                .andExpect(jsonPath("$.lowRatePercent").value(8.5));
    }
}
