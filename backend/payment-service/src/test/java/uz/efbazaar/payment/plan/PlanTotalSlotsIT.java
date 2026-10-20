package uz.efbazaar.payment.plan;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.payment.plan.service.PlanService;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asAdmin;

@SpringBootTest
@AutoConfigureMockMvc
class PlanTotalSlotsIT extends AbstractPostgresIT {
    @Autowired MockMvc mvc;
    @Autowired PlanService plans;
    @Autowired JdbcTemplate jdbc;
    @Autowired Flyway flyway;

    @AfterEach void restore() {
        jdbc.update("UPDATE plan_entitlements SET value='10', updated_by=NULL WHERE plan_code='PRO' AND key='mailbox.total_slots'");
    }

    @Test void cataloguePublishesOneTotalPoolAndCustomIsASubset() throws Exception {
        mvc.perform(get("/api/v1/payments/plans"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code=='STANDARD')].entitlements['mailbox.total_slots']").value("3"))
                .andExpect(jsonPath("$[?(@.code=='PRO')].entitlements['mailbox.total_slots']").value("10"))
                .andExpect(jsonPath("$[?(@.code=='PRO')].entitlements['mailbox.custom_slots']").value("2"))
                .andExpect(jsonPath("$[?(@.code=='PRO')].prices.MONTH").value(3_000_000));
        assertThat(plans.entitlementsOf("STAFF")).containsEntry("mailbox.total_slots", null);
    }

    @Test void adminEditsTotalAndCannotSilentlyReinterpretLegacyRandomLimit() throws Exception {
        mvc.perform(get("/api/v1/admin/plans/entitlements").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.key=='mailbox.slots')]").isEmpty())
                .andExpect(jsonPath("$[?(@.key=='mailbox.total_slots')]").isNotEmpty());
        mvc.perform(put("/api/v1/admin/plans/entitlements").with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"entitlements\":[{\"planCode\":\"PRO\",\"key\":\"mailbox.total_slots\",\"value\":\"12\"}]}"))
                .andExpect(status().isOk());
        assertThat(plans.entitlementsOf("PRO")).containsEntry("mailbox.total_slots", "12")
                .containsEntry("mailbox.slots", "5").containsEntry("mailbox.custom_slots", "2");
        mvc.perform(put("/api/v1/admin/plans/entitlements").with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"entitlements\":[{\"planCode\":\"PRO\",\"key\":\"mailbox.slots\",\"value\":\"99\"}]}"))
                .andExpect(status().isBadRequest());
        assertThat(plans.entitlementsOf("PRO")).containsEntry("mailbox.slots", "5");
    }

    @Test void upgradingV18PreservesLegacyLimitsAndHistoryAndDoesNotResetAdminTotals() {
        String schema = "total_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var dataSource = flyway.getConfiguration().getDataSource();
        try {
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("18").load().migrate();
            jdbc.update("UPDATE " + schema + ".plan_entitlements SET value='7' WHERE plan_code='PRO' AND key='mailbox.slots'");
            UUID user = UUID.randomUUID();
            jdbc.update("INSERT INTO " + schema + ".user_subscriptions (user_id,plan_code) VALUES (?,'MAX')", user);
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).load().migrate();
            assertThat(jdbc.queryForObject("SELECT value FROM " + schema + ".plan_entitlements WHERE plan_code='PRO' AND key='mailbox.total_slots'", String.class)).isEqualTo("10");
            assertThat(jdbc.queryForObject("SELECT value FROM " + schema + ".plan_entitlements WHERE plan_code='PRO' AND key='mailbox.slots'", String.class)).isEqualTo("7");
            assertThat(jdbc.queryForObject("SELECT value FROM " + schema + ".plan_entitlements WHERE plan_code='MAX' AND key='mailbox.total_slots'", String.class)).isEqualTo("13");
            assertThat(jdbc.queryForObject("SELECT plan_code FROM " + schema + ".user_subscriptions WHERE user_id=?", String.class, user)).isEqualTo("MAX");
            jdbc.update("UPDATE " + schema + ".plan_entitlements SET value='12' WHERE plan_code='PRO' AND key='mailbox.total_slots'");
            jdbc.update("DELETE FROM " + schema + ".flyway_schema_history WHERE version IS NULL AND type='SQL'");
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).load().migrate();
            assertThat(jdbc.queryForObject("SELECT value FROM " + schema + ".plan_entitlements WHERE plan_code='PRO' AND key='mailbox.total_slots'", String.class)).isEqualTo("12");
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }
}
