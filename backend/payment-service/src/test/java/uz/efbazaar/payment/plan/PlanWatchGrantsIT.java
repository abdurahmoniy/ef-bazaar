package uz.efbazaar.payment.plan;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.payment.plan.service.PlanService;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class PlanWatchGrantsIT extends AbstractPostgresIT {
    @Autowired PlanService plans;
    @Autowired MockMvc mvc;

    @Test void freeAndPaidWatchBudgetsAreAuthoritativeAndPublishedInTheCatalogue() throws Exception {
        assertThat(plans.entitlementsOf("STANDARD")).containsEntry("watch.search_limit", "1")
                .containsEntry("watch.price_limit", "3").containsEntry("watch.immediate", "false");
        assertThat(plans.entitlementsOf("PRO")).containsEntry("watch.search_limit", "5")
                .containsEntry("watch.price_limit", "20").containsEntry("watch.immediate", "true");
        mvc.perform(get("/api/v1/payments/plans"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code=='STANDARD')].entitlements['watch.search_limit']").value("1"))
                .andExpect(jsonPath("$[?(@.code=='PRO')].entitlements['watch.price_limit']").value("20"));
    }
    @Test void analyticsPolicyIsTypedAndIndependentOfMailboxBudgets() {
        assertThat(plans.entitlementsOf("STANDARD")).containsEntry("analytics.history_days", "0").containsEntry("analytics.export", "false");
        for (String code : java.util.List.of("PRO", "MAX"))
            assertThat(plans.entitlementsOf(code)).containsEntry("analytics.history_days", "90").containsEntry("analytics.export", "true");
        assertThat(plans.entitlementsOf("STAFF")).containsEntry("analytics.history_days", null).containsEntry("analytics.export", "true");
    }
    @Test void staffHasExplicitUnlimitedBudgetsAndLegacyMaxRemainsBounded() {
        assertThat(plans.entitlementsOf("STAFF")).containsEntry("watch.search_limit", null)
                .containsEntry("watch.price_limit", null).containsEntry("watch.immediate", "true");
        assertThat(plans.entitlementsOf("MAX")).containsEntry("watch.search_limit", "5")
                .containsEntry("watch.price_limit", "20").containsEntry("watch.immediate", "true");
        assertThat(plans.entitlementsOf("PRO")).containsEntry("mailbox.total_slots", "10")
                .containsEntry("mailbox.custom_slots", "2");
    }
    @Test void sellerProductGrantsAreExplicitTypedBooleansForEveryPlan() {
        for (String key : java.util.List.of("seller.tools", "seller.bulk", "profile.decoration")) {
            assertThat(plans.entitlementsOf("STANDARD")).containsEntry(key, "false");
            for (String code : java.util.List.of("PRO", "MAX", "STAFF"))
                assertThat(plans.entitlementsOf(code)).containsEntry(key, "true");
        }
    }
}
