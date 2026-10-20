package uz.efbazaar.trade.mailbox.resource;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.testsupport.AbstractMailboxFeatureIT;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@org.springframework.transaction.annotation.Transactional
class MailboxInventoryIT extends AbstractMailboxFeatureIT {
    @Autowired MockMvc mvc;
    @Autowired MailboxRepository mailboxes;
    @Autowired JdbcTemplate jdbc;
    @Autowired MailboxInventoryService inventory;
    @Autowired com.fasterxml.jackson.databind.ObjectMapper json;

    private MailboxInventoryEvents.Observed page(UUID request, Instant at, int page, boolean last,
                                                java.util.List<MailboxInventoryEvents.Entry> entries) {
        return new MailboxInventoryEvents.Observed(request, at, page, last, true, null, entries);
    }

    private String resources(UUID owner) throws Exception {
        return mvc.perform(get("/api/v1/mailboxes/resources").with(asUser(owner)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private UUID box(UUID owner) {
        UUID id = UUID.randomUUID();
        mailboxes.saveAndFlush(Mailbox.builder().id(id).email("observed-" + id + "@efbazaar.uz")
            .ownerUserId(owner).encryptedPassword(new byte[]{1}).passwordIv(new byte[12])
            .passwordTag(new byte[16]).provisionedAt(Instant.now().minusSeconds(5)).build());
        return id;
    }

    @Test
    void pagesMustBeCompleteBeforeUsageAndOrphansBecomeVisible() throws Exception {
        UUID user = UUID.randomUUID(), id = box(user), request = inventory.requestRefresh();
        Instant at = Instant.now();
        String email = mailboxes.findById(id).orElseThrow().getEmail();
        var entry = new MailboxInventoryEvents.Entry(email, 777L, 1000L, true);
        inventory.observe(page(request, at, 1, true, java.util.List.of(entry)));
        assertThat(resources(user)).contains("\"usageStatus\":\"UNKNOWN\"");
        inventory.observe(page(request, at, 0, false, java.util.List.of(
            new MailboxInventoryEvents.Entry("server-orphan-" + request + "@efbazaar.uz", 20L, 50L, true))));
        assertThat(resources(user)).contains("\"usageBytes\":777", "\"mailcowPresent\":true");
        String admin = mvc.perform(get("/api/v1/admin/mailboxes/resources")
            .with(uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asAdmin()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(admin).contains("server-orphan-" + request);
        assertThat(resources(user)).doesNotContain("server-orphan-" + request);
        inventory.observe(page(request, at, 0, false, java.util.List.of(
            new MailboxInventoryEvents.Entry("server-orphan-" + request + "@efbazaar.uz", 20L, 50L, true))));
        assertThat(resources(user)).contains("\"usageBytes\":777");
    }

    @Test
    void failedObservationRetainsPriorUsageAndDoesNotInferAbsence() throws Exception {
        UUID user = UUID.randomUUID(), id = box(user), first = inventory.requestRefresh();
        String email = mailboxes.findById(id).orElseThrow().getEmail();
        inventory.observe(page(first, Instant.now(), 0, true, java.util.List.of(
            new MailboxInventoryEvents.Entry(email, 456L, 1000L, true))));
        UUID failed = inventory.requestRefresh();
        inventory.observe(new MailboxInventoryEvents.Observed(failed, Instant.now(), 0,
            false, false, "ReadTimeout", java.util.List.of()));
        assertThat(resources(user)).contains("\"usageBytes\":456", "\"usageStatus\":\"ERROR\"",
            "\"mailcowPresent\":true");
        assertThat(mailboxes.findById(id).orElseThrow().getDeletedAt()).isNull();
    }

    @Test
    void newerRequestWinsAndConfirmedAbsenceDoesNotChangeOwnership() throws Exception {
        UUID user = UUID.randomUUID(), id = box(user), old = inventory.requestRefresh();
        String email = mailboxes.findById(id).orElseThrow().getEmail();
        UUID newer = inventory.requestRefresh();
        inventory.observe(page(newer, Instant.now(), 0, true, java.util.List.of()));
        inventory.observe(page(old, Instant.now(), 0, true, java.util.List.of(
            new MailboxInventoryEvents.Entry(email, 99L, 1000L, true))));
        assertThat(resources(user)).contains("\"mailcowPresent\":false");
        var mailbox = mailboxes.findById(id).orElseThrow();
        assertThat(mailbox.getOwnerUserId()).isEqualTo(user);
        assertThat(mailbox.getDeletedAt()).isNull();
        assertThat(mailbox.getEncryptedPassword()).containsExactly((byte) 1);
    }

    @Test
    void malformedAndMismatchedPagesCannotBecomeCompleteSnapshots() {
        UUID request = inventory.requestRefresh();
        Instant at = Instant.now();
        inventory.observe(page(request, at, 0, false, java.util.List.of(
            new MailboxInventoryEvents.Entry("safe@efbazaar.uz", 1L, 100L, true))));
        inventory.observe(page(request, at.plusSeconds(1), 1, true, java.util.List.of()));
        assertThat(jdbc.queryForObject("SELECT status FROM mailbox_inventory_runs WHERE id=?", String.class, request))
            .isEqualTo("ERROR");
        UUID invalid = inventory.requestRefresh();
        inventory.observe(page(invalid, at.plusSeconds(2), 0, true, java.util.List.of(
            new MailboxInventoryEvents.Entry("staff@other.test", -1L, 100L, true))));
        assertThat(jdbc.queryForObject("SELECT status FROM mailbox_inventory_runs WHERE id=?", String.class, invalid))
            .isEqualTo("ERROR");
    }

    @Test
    void refreshIsDurableBeforeDispatchAndCannotRequestArbitraryDomains() throws Exception {
        UUID request = inventory.requestRefresh();
        assertThat(jdbc.queryForObject("SELECT status FROM mailbox_inventory_runs WHERE id=?", String.class, request))
            .isEqualTo("PENDING");
        assertThat(json.readTree(jdbc.queryForObject("SELECT domains::text FROM mailbox_inventory_runs WHERE id=?", String.class, request)))
            .isEqualTo(json.valueToTree(java.util.List.of("efbazaar.uz", "efootball.uz")));
    }


    @Test
    void absencePreservesLastBytesAsStaleAndDoesNotPretendTheyAreZero() throws Exception {
        UUID user = UUID.randomUUID(), id = box(user), first = inventory.requestRefresh();
        String email = mailboxes.findById(id).orElseThrow().getEmail();
        inventory.observe(page(first, Instant.now(), 0, true, java.util.List.of(
            new MailboxInventoryEvents.Entry(email, 890L, 1000L, true))));
        UUID missing = inventory.requestRefresh();
        inventory.observe(page(missing, Instant.now(), 0, true, java.util.List.of()));
        assertThat(resources(user)).contains("\"mailcowPresent\":false", "\"usageBytes\":890",
            "\"usageStatus\":\"STALE\"");
        assertThat(mailboxes.findById(id).orElseThrow().getOwnerUserId()).isEqualTo(user);
    }

    @Test
    void deletedButStillPresentServerResourceIsCountedAndPreservedForAdmins() throws Exception {
        UUID id = box(null);
        String email = mailboxes.findById(id).orElseThrow().getEmail();
        jdbc.update("UPDATE mailboxes SET deleted_at=now(),preservation_hold_reason='LEGAL_HOLD' WHERE id=?", id);
        UUID request = inventory.requestRefresh();
        inventory.observe(page(request, Instant.now(), 0, true, java.util.List.of(
            new MailboxInventoryEvents.Entry(email, 123L, 1000L, true))));
        String admin = mvc.perform(get("/api/v1/admin/mailboxes/resources")
            .with(uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asAdmin()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var row = java.util.stream.StreamSupport.stream(json.readTree(admin).spliterator(), false)
            .filter(item -> email.equals(item.path("email").asText())).findFirst().orElseThrow();
        assertThat(row.path("deleted").asBoolean()).isTrue();
        assertThat(row.path("mailcowPresent").asBoolean()).isTrue();
        assertThat(row.path("usageBytes").asLong()).isEqualTo(123);
        assertThat(row.path("legalHold").asBoolean()).isTrue();
        assertThat(row.path("holdReason").asText()).isEqualTo("LEGAL_HOLD");
        assertThat(mailboxes.findById(id).orElseThrow().getOwnerUserId()).isNull();
        assertThat(mailboxes.findById(id).orElseThrow().getEncryptedPassword()).containsExactly((byte) 1);
        assertThat(resources(UUID.randomUUID())).doesNotContain(email);
    }

    @Test
    void unknownAndConflictingRequestsNeverReplaceACompleteObservation() {
        UUID request = inventory.requestRefresh();
        Instant at = Instant.now();
        inventory.observe(page(UUID.randomUUID(), at, 0, true, java.util.List.of()));
        var first = new MailboxInventoryEvents.Entry("duplicate@efbazaar.uz", 5L, 50L, true);
        inventory.observe(page(request, at, 0, false, java.util.List.of(first)));
        inventory.observe(page(request, at, 0, false, java.util.List.of(
            new MailboxInventoryEvents.Entry("duplicate@efbazaar.uz", 6L, 50L, true))));
        assertThat(jdbc.queryForObject("SELECT status FROM mailbox_inventory_runs WHERE id=?", String.class, request))
            .isEqualTo("ERROR");
    }

    @Test
    void retainedResourcesRemainVisibleWithoutInventingZeroUsageOrInboxAccess() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID id = UUID.randomUUID();
        String email = "inventory-retained-" + id + "@efbazaar.uz";
        mailboxes.saveAndFlush(Mailbox.builder().id(id).email(email).retainedUserId(owner)
            .encryptedPassword(new byte[]{1}).passwordIv(new byte[12]).passwordTag(new byte[16])
            .provisionedAt(Instant.now()).build());
        String json = mvc.perform(get("/api/v1/mailboxes/resources").with(asUser(owner)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(json).contains(email, "\"accessState\":\"RECOVERY\"", "\"usageStatus\":\"UNKNOWN\"",
            "\"usageBytes\":null", "\"mailcowPresent\":null", "\"provisioningStatus\":\"NONE\"");
        assertThat(json).doesNotContain("encryptedPassword", "passwordIv", "passwordTag");
        String stranger = mvc.perform(get("/api/v1/mailboxes/resources").with(asUser(UUID.randomUUID())))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(stranger).doesNotContain(email);
        mvc.perform(get("/api/v1/admin/mailboxes/resources").with(asUser(owner)))
            .andExpect(status().isForbidden());
    }
}
