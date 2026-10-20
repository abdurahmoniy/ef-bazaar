package uz.efbazaar.payment.plan;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.payment.plan.dto.PlanEntitlementsSnapshot;
import uz.efbazaar.payment.plan.service.PlanEventPublisher;
import uz.efbazaar.payment.plan.service.PlanService;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asAdmin;

@SpringBootTest
@AutoConfigureMockMvc
class PlanEntitlementAdminIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired PlanService plans;
    @Autowired JdbcTemplate jdbc;
    @SpyBean PlanEventPublisher events;

    @AfterEach
    void restore() {
        jdbc.update("UPDATE plan_entitlements SET value='3', updated_by=NULL WHERE plan_code='STANDARD' AND key='mailbox.total_slots'");
        jdbc.update("UPDATE plan_entitlements SET value='13', updated_by=NULL WHERE plan_code='MAX' AND key='mailbox.total_slots'");
    }

    private void putEntitlements(String json, int expected) throws Exception {
        mvc.perform(put("/api/v1/admin/plans/entitlements").with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().is(expected));
    }

    @Test
    void anAdminSetsAPlanToUnlimited() throws Exception {
        putEntitlements("{\"entitlements\":[{\"planCode\":\"MAX\",\"key\":\"mailbox.total_slots\",\"value\":null}]}", 200);

        assertThat(plans.entitlementsOf("MAX")).containsKey("mailbox.total_slots");
        assertThat(plans.entitlementsOf("MAX").get("mailbox.total_slots")).isNull();
    }

    @Test
    void savingPublishesTheChangedPlanWholeStraightAway() throws Exception {
        clearInvocations(events);
        putEntitlements("{\"entitlements\":[{\"planCode\":\"STANDARD\",\"key\":\"mailbox.total_slots\",\"value\":\"4\"}]}", 200);

        var captor = ArgumentCaptor.forClass(PlanEntitlementsSnapshot.class);
        verify(events, times(1)).planEntitlements(captor.capture());
        assertThat(captor.getValue().planCode()).isEqualTo("STANDARD");
        assertThat(captor.getValue().entitlements())
                .containsEntry("mailbox.total_slots", "4").containsEntry("mailbox.custom_slots", "0");
    }

    @Test
    void badValuesAndUnknownKeysChangeNothing() throws Exception {
        clearInvocations(events);
        putEntitlements("{\"entitlements\":[{\"planCode\":\"STANDARD\",\"key\":\"mailbox.total_slots\",\"value\":\"-1\"}]}", 400);
        putEntitlements("{\"entitlements\":[{\"planCode\":\"STANDARD\",\"key\":\"mailbox.total_slots\",\"value\":\"abc\"}]}", 400);
        putEntitlements("{\"entitlements\":[{\"planCode\":\"STANDARD\",\"key\":\"fee.discount\",\"value\":\"5\"}]}", 400);
        putEntitlements("{\"entitlements\":[{\"planCode\":\"GOLD\",\"key\":\"mailbox.total_slots\",\"value\":\"5\"}]}", 400);
        // All-or-nothing: the good row in a batch with a bad one is not applied either.
        putEntitlements("{\"entitlements\":[{\"planCode\":\"STANDARD\",\"key\":\"mailbox.total_slots\",\"value\":\"9\"},"
                + "{\"planCode\":\"STANDARD\",\"key\":\"mailbox.total_slots\",\"value\":\"-2\"}]}", 400);

        assertThat(plans.entitlementsOf("STANDARD")).containsEntry("mailbox.total_slots", "3");
        verify(events, never()).planEntitlements(any());
    }
}
