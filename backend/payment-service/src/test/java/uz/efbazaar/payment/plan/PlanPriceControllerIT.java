package uz.efbazaar.payment.plan;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asAdmin;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class PlanPriceControllerIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @AfterEach
    void restoreShippedPrices() {
        jdbc.update("UPDATE plan_prices SET price_tiyin=3000000, updated_by=NULL WHERE plan_code='PRO' AND period='MONTH'");
        jdbc.update("UPDATE plan_prices SET price_tiyin=10000000, updated_by=NULL WHERE plan_code='PRO' AND period='YEAR'");
    }

    @Test
    void theCatalogueShowsPricesWithoutSigningIn() throws Exception {
        mvc.perform(get("/api/v1/payments/plans"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code=='PRO')].prices.MONTH").value(3_000_000))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.code=='MAX')]").isEmpty())
                .andExpect(jsonPath("$[?(@.code=='PRO')].prices.YEAR").isEmpty())
                .andExpect(jsonPath("$[?(@.code=='STANDARD')].prices.MONTH").isEmpty());
    }

    @Test
    void anAdminChangesAPriceAndTheCatalogueFollows() throws Exception {
        UUID admin = UUID.randomUUID();
        mvc.perform(put("/api/v1/admin/plans/prices").with(asUser(admin, "ROLE_ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"prices\":[{\"planCode\":\"PRO\",\"period\":\"MONTH\",\"priceTiyin\":1200000}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.planCode=='PRO' && @.period=='MONTH')].updatedBy").value(admin.toString()));

        mvc.perform(get("/api/v1/payments/plans"))
                .andExpect(jsonPath("$[?(@.code=='PRO')].prices.MONTH").value(1_200_000));
    }

    @Test
    void aPlainUserCannotChangePrices() throws Exception {
        mvc.perform(put("/api/v1/admin/plans/prices").with(asUser(UUID.randomUUID()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"prices\":[{\"planCode\":\"PRO\",\"period\":\"MONTH\",\"priceTiyin\":1}]}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void zeroOrNegativeAndTheFreePlanAreRefused() throws Exception {
        for (String body : new String[]{
                "{\"prices\":[{\"planCode\":\"PRO\",\"period\":\"MONTH\",\"priceTiyin\":0}]}",
                "{\"prices\":[{\"planCode\":\"STANDARD\",\"period\":\"MONTH\",\"priceTiyin\":100}]}",
                "{\"prices\":[{\"planCode\":\"PLATINUM\",\"period\":\"MONTH\",\"priceTiyin\":100}]}"}) {
            mvc.perform(put("/api/v1/admin/plans/prices").with(asAdmin())
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/v1/admin/plans/prices").with(asAdmin()))
                .andExpect(jsonPath("$[?(@.planCode=='PRO' && @.period=='MONTH')].priceTiyin").value(3_000_000));
    }

    @Test
    void retiredProductsCannotBeSoldAgainThroughAdminPrices() throws Exception {
        for (String product : new String[]{"MAX:MONTH", "MAX:YEAR", "PRO:YEAR", "STAFF:MONTH"}) {
            String[] sku = product.split(":");
            mvc.perform(put("/api/v1/admin/plans/prices").with(asAdmin())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"prices\":[{\"planCode\":\"" + sku[0]
                                    + "\",\"period\":\"" + sku[1] + "\",\"priceTiyin\":100}]}"))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/v1/admin/plans/prices").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].planCode").value("PRO"))
                .andExpect(jsonPath("$[0].period").value("MONTH"));
    }

    @Test
    void aMixedPriceUpdateIsAtomicWhenOneProductIsRetired() throws Exception {
        mvc.perform(put("/api/v1/admin/plans/prices").with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"prices\":[{\"planCode\":\"PRO\",\"period\":\"MONTH\",\"priceTiyin\":12},"
                                + "{\"planCode\":\"PRO\",\"period\":\"YEAR\",\"priceTiyin\":100}]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/admin/plans/prices").with(asAdmin()))
                .andExpect(jsonPath("$[?(@.planCode=='PRO' && @.period=='MONTH')].priceTiyin").value(3_000_000));
    }
}
