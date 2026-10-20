package uz.efbazaar.payment.plan;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.payment.plan.domain.PlanPeriod;
import uz.efbazaar.payment.plan.dto.PlanEntitlementsSnapshot;
import uz.efbazaar.payment.plan.dto.PurchasePlanRequest;
import uz.efbazaar.payment.plan.service.PlanEventPublisher;
import uz.efbazaar.payment.plan.service.PlanService;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asAdmin;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asUser;

/** STAFF: the hidden plan an ADMIN sits on. Everything unlimited, never for sale. */
@SpringBootTest
@AutoConfigureMockMvc
class StaffPlanIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlanService plans;
    @SpyBean PlanEventPublisher events;

    @Test
    void everyBudgetIsUnlimitedAndBooleanCapabilitiesAreEnabledOnStaff() {
        // A future entitlement key added to PRO but forgotten on STAFF would
        // quietly cap every admin. Fail here instead.
        List<String> keys = jdbc.queryForList(
                "SELECT DISTINCT key FROM plan_entitlements WHERE plan_code <> 'STAFF'", String.class);
        assertThat(keys).isNotEmpty();
        Map<String, String> staff = plans.entitlementsOf("STAFF");
        for (String key : keys) {
            assertThat(staff).as("STAFF must carry %s", key).containsKey(key);
            if (java.util.Set.of("watch.immediate", "analytics.export", "seller.tools", "seller.bulk", "profile.decoration").contains(key)) {
                assertThat(staff.get(key)).as("STAFF boolean capability must be enabled").isEqualTo("true");
            } else {
                assertThat(staff.get(key)).as("STAFF %s budget must be unlimited (null)", key).isNull();
            }
        }
    }

    @Test
    void staffIsNotInThePublicCatalogue() throws Exception {
        mvc.perform(get("/api/v1/payments/plans"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code=='STAFF')]").isEmpty())
                .andExpect(jsonPath("$[?(@.code=='PRO')]").isNotEmpty());
    }

    @Test
    void staffHasNoPriceRows() {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM plan_prices WHERE plan_code='STAFF'", Integer.class);
        assertThat(n).isZero();
    }

    @Test
    void theStartupSnapshotCarriesStaffWithNullValues() {
        plans.publishAllEntitlements();
        var captor = org.mockito.ArgumentCaptor.forClass(PlanEntitlementsSnapshot.class);
        verify(events, org.mockito.Mockito.atLeastOnce()).planEntitlements(captor.capture());
        var staff = captor.getAllValues().stream().filter(s -> s.planCode().equals("STAFF")).findFirst();
        assertThat(staff).isPresent();
        assertThat(staff.get().entitlements()).containsEntry("mailbox.slots", null)
                .containsEntry("mailbox.custom_slots", null).containsEntry("mailbox.total_slots", null);
    }

    @Test
    void anAdminCanPutSomeoneOnStaffThroughTheAssignEndpoint() throws Exception {
        UUID user = UUID.randomUUID();
        mvc.perform(post("/api/v1/admin/plans/assign").with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":\"" + user + "\",\"planCode\":\"STAFF\",\"expiresAt\":null,\"source\":\"ROLE\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("STAFF"));

        assertThat(plans.planFor(user)).isEqualTo("STAFF");
        verify(events).subscriptionChanged(eq(user), eq("STAFF"), eq(null), eq(null));
    }

    @Test
    void staffPricesCannotBeSet() throws Exception {
        mvc.perform(put("/api/v1/admin/plans/prices").with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"prices\":[{\"planCode\":\"STAFF\",\"period\":\"MONTH\",\"priceTiyin\":1000}]}"))
                .andExpect(status().isBadRequest());
        Integer n = jdbc.queryForObject("SELECT count(*) FROM plan_prices WHERE plan_code='STAFF'", Integer.class);
        assertThat(n).isZero();
    }

    @Test
    void staffEntitlementsCannotBeEdited() throws Exception {
        mvc.perform(put("/api/v1/admin/plans/entitlements").with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"entitlements\":[{\"planCode\":\"STAFF\",\"key\":\"mailbox.total_slots\",\"value\":\"5\"}]}"))
                .andExpect(status().isBadRequest());
        assertThat(plans.entitlementsOf("STAFF").get("mailbox.total_slots")).isNull();
    }

    @Test
    void theAdminEntitlementGridDoesNotListStaff() throws Exception {
        mvc.perform(get("/api/v1/admin/plans/entitlements").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.planCode=='STAFF')]").isEmpty())
                .andExpect(jsonPath("$[?(@.planCode=='PRO')]").isNotEmpty());
    }

    @Test
    void aStaffUserCannotBuyAPlan() throws Exception {
        UUID user = UUID.randomUUID();
        plans.assign(user, "STAFF", null, "ROLE");
        var req = new PurchasePlanRequest("MAX", PlanPeriod.MONTH, 3_000_000L, UUID.randomUUID().toString());

        mvc.perform(post("/api/v1/payments/plans/purchase").with(asUser(user))
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(req)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("staff_unlimited"))
                .andExpect(jsonPath("$.detail").value("Admin sifatida barcha imkoniyatlar cheklovsiz"));
    }
}
