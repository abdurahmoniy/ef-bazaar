package uz.efbazaar.marketplace.popup;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.exception.GlobalExceptionHandler;
import uz.efbazaar.marketplace.security.HeaderAuthenticationFilter;
import uz.efbazaar.marketplace.security.InternalSecretFilter;

import javax.sql.DataSource;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringJUnitConfig(PopupCampaignIT.Config.class)
@WebAppConfiguration
@Testcontainers
class PopupCampaignIT {
    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    @Autowired WebApplicationContext context;
    @Autowired FilterChainProxy security;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    MockMvc mvc;
    UUID admin = UUID.randomUUID();
    UUID user = UUID.randomUUID();

    @BeforeEach void setup() {
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(security).build();
    }

    @Test void campaignsAreDraftUntilExplicitlyPublishedAndRecipientsStayPrivate() throws Exception {
        var body = draft();
        body.put("audience", "SELECTED");
        body.put("recipientIds", List.of(user));
        body.put("createdBy", UUID.randomUUID());
        body.put("status", "ACTIVE");
        JsonNode created = create(body);
        assertThat(created.path("status").asText()).isEqualTo("DRAFT");
        assertThat(created.path("createdBy").asText()).isEqualTo(admin.toString());
        next(user, "BROWSE").andExpect(status().isNoContent());
        publish(created.path("id").asText());
        next(user, "BROWSE").andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Useful news"))
                .andExpect(jsonPath("$.endsAt").exists())
                .andExpect(jsonPath("$.recipientIds").doesNotExist())
                .andExpect(jsonPath("$.createdBy").doesNotExist());
    }

    @Test void everyManagementOperationRequiresAdmin() throws Exception {
        var id = UUID.randomUUID();
        List<MockHttpServletRequestBuilder> calls = List.of(get("/api/v1/admin/popups"),
                post("/api/v1/admin/popups").contentType("application/json").content(json.writeValueAsString(draft())),
                patch("/api/v1/admin/popups/{id}/status", id).contentType("application/json").content("{\"status\":\"ACTIVE\"}"));
        for (var call : calls) mvc.perform(asUser(call, user)).andExpect(status().isForbidden());
    }

    @Test void anonymousUsersCannotReadClaimOrRecordEvents() throws Exception {
        mvc.perform(get("/api/v1/popups/next").param("trigger", "BROWSE")).andExpect(status().is4xxClientError());
        mvc.perform(post("/api/v1/popups/{id}/claim", UUID.randomUUID()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("trigger", "BROWSE", "sessionId", UUID.randomUUID()))))
                .andExpect(status().is4xxClientError());
        mvc.perform(post("/api/v1/popups/deliveries/{id}/events", UUID.randomUUID()).contentType("application/json")
                .content("{\"event\":\"SHOWN\"}")).andExpect(status().is4xxClientError());
    }

    @Test void validatesTextSchedulePriorityAudienceAndActionPair() throws Exception {
        var invalid = new ArrayList<Map<String, Object>>();
        invalid.add(changed("title", " "));
        invalid.add(changed("title", "x".repeat(101)));
        invalid.add(changed("message", "x".repeat(601)));
        invalid.add(changed("tone", "UNKNOWN"));
        invalid.add(changed("priority", 11));
        invalid.add(changed("priority", -1));
        invalid.add(changed("endsAt", Instant.now().minus(2, ChronoUnit.DAYS).toString()));
        invalid.add(changed("endsAt", Instant.now().plus(31, ChronoUnit.DAYS).toString()));
        invalid.add(changed("startsAt", null));
        invalid.add(changed("endsAt", null));
        invalid.add(changed("audience", "SELECTED"));
        invalid.add(changed("recipientIds", List.of(user)));
        invalid.add(changed("actionLabel", "Open"));
        invalid.add(changed("actionPath", "/help"));
        var tooMany = changed("audience", "SELECTED");
        tooMany.put("recipientIds", java.util.stream.IntStream.range(0, 101).mapToObj(i -> UUID.randomUUID()).toList());
        invalid.add(tooMany);
        var nullId = changed("audience", "SELECTED");
        nullId.put("recipientIds", java.util.Arrays.asList((Object) null));
        invalid.add(nullId);
        for (var body : invalid) adminPost(body).andExpect(status().isBadRequest());
    }

    @Test void allowsOnlyExplicitInternalCtaDestinations() throws Exception {
        for (String path : List.of("https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)",
                "/help?next=https://evil.test", "/profile?tab=accounts&next=//evil.test", "/help/../admin",
                "/help/%2e%2e/admin", "/admin", "/auth/logout", "/help#x", "/marketplace/not-a-uuid")) {
            var body = draft(); body.put("actionLabel", "Open"); body.put("actionPath", path);
            adminPost(body).andExpect(status().isBadRequest());
        }
        for (String path : List.of("/marketplace", "/profile", "/help", "/invite", "/notifications",
                "/marketplace/new", "/blacklist", "/profile?tab=accounts", "/profile?tab=favorites",
                "/marketplace/" + UUID.randomUUID(), "/help/safe-guide")) {
            var body = draft(); body.put("actionLabel", "Open"); body.put("actionPath", path);
            adminPost(body).andExpect(status().isCreated());
        }
    }

    @Test void selectedAudienceAndTriggerAreRecheckedAtClaim() throws Exception {
        String id = active("SELECTED", List.of(user), "EMPTY_SEARCH", 0);
        next(user, "BROWSE").andExpect(status().isNoContent());
        next(UUID.randomUUID(), "EMPTY_SEARCH").andExpect(status().isNoContent());
        claim(id, user, "BROWSE", UUID.randomUUID()).andExpect(status().isNoContent());
        claim(id, UUID.randomUUID(), "EMPTY_SEARCH", UUID.randomUUID()).andExpect(status().isNoContent());
        claim(id, user, "EMPTY_SEARCH", UUID.randomUUID()).andExpect(status().isOk());
    }

    @Test void sellersAudienceUsesOwnedNonDeletedListings() throws Exception {
        String id = active("SELLERS", List.of(), "LISTING_PUBLISHED", 0);
        claim(id, user, "LISTING_PUBLISHED", UUID.randomUUID()).andExpect(status().isNoContent());
        UUID listingId = UUID.randomUUID();
        jdbc.update("INSERT INTO listings (id, seller_id, description, price, status) VALUES (?, ?, 'test', 1, 'DELETED')", listingId, user);
        claim(id, user, "LISTING_PUBLISHED", UUID.randomUUID()).andExpect(status().isNoContent());
        jdbc.update("UPDATE listings SET status = 'SOLD' WHERE id = ?", listingId);
        claim(id, user, "LISTING_PUBLISHED", UUID.randomUUID()).andExpect(status().isOk());
    }

    @Test void prioritySelectsOnlyCurrentActiveCampaigns() throws Exception {
        String low = active("SELECTED", List.of(user), "BROWSE", 1);
        String high = active("SELECTED", List.of(user), "BROWSE", 10);
        next(user, "BROWSE").andExpect(jsonPath("$.id").value(high));
        setStatus(high, "PAUSED").andExpect(status().isOk());
        claim(high, user, "BROWSE", UUID.randomUUID()).andExpect(status().isNoContent());
        next(user, "BROWSE").andExpect(jsonPath("$.id").value(low));
        jdbc.update("UPDATE popup_campaigns SET starts_at = now() + interval '1 hour' WHERE id = ?", UUID.fromString(low));
        claim(low, user, "BROWSE", UUID.randomUUID()).andExpect(status().isNoContent());
        jdbc.update("UPDATE popup_campaigns SET starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour' WHERE id = ?", UUID.fromString(low));
        next(user, "BROWSE").andExpect(status().isNoContent());
        claim(low, user, "BROWSE", UUID.randomUUID()).andExpect(status().isNoContent());
    }

    @Test void expiredDraftCannotBePublishedAndDraftCannotBeRestoredByStatusPatch() throws Exception {
        String id = create(draft()).path("id").asText();
        jdbc.update("UPDATE popup_campaigns SET starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour' WHERE id = ?", UUID.fromString(id));
        setStatus(id, "ACTIVE").andExpect(status().isBadRequest());
        setStatus(id, "DRAFT").andExpect(status().isBadRequest());
    }

    @Test void claimsEnforceSessionSixHourRollingDayAndCampaignLimits() throws Exception {
        String first = active("SELECTED", List.of(user), "BROWSE", 0);
        String second = active("SELECTED", List.of(user), "BROWSE", 0);
        String third = active("SELECTED", List.of(user), "BROWSE", 0);
        UUID session = UUID.randomUUID();
        claim(first, user, "BROWSE", session).andExpect(status().isOk());
        claim(second, user, "BROWSE", UUID.randomUUID()).andExpect(status().isNoContent());
        next(user, "BROWSE").andExpect(status().isNoContent());
        age(first, "7 hours");
        claim(second, user, "BROWSE", session).andExpect(status().isNoContent());
        claim(first, user, "BROWSE", UUID.randomUUID()).andExpect(status().isNoContent());
        claim(second, user, "BROWSE", UUID.randomUUID()).andExpect(status().isOk());
        age(first, "14 hours"); age(second, "7 hours");
        claim(third, user, "BROWSE", UUID.randomUUID()).andExpect(status().isNoContent());
        age(first, "25 hours");
        claim(third, user, "BROWSE", UUID.randomUUID()).andExpect(status().isOk());
    }

    @Test void concurrentTabsCannotReserveMultipleCampaigns() throws Exception {
        String a = active("SELECTED", List.of(user), "BROWSE", 0);
        String b = active("SELECTED", List.of(user), "BROWSE", 0);
        CountDownLatch ready = new CountDownLatch(8), start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(8)) {
            var results = new ArrayList<java.util.concurrent.Future<Integer>>();
            for (int i = 0; i < 8; i++) {
                String id = i % 2 == 0 ? a : b;
                results.add(executor.submit(() -> {
                    ready.countDown();
                    assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
                    return claim(id, user, "BROWSE", UUID.randomUUID()).andReturn().getResponse().getStatus();
                }));
            }
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue(); start.countDown();
            var statuses = new ArrayList<Integer>();
            for (var result : results) statuses.add(result.get(20, TimeUnit.SECONDS));
            assertThat(statuses).containsOnly(200, 204).filteredOn(code -> code == 200).hasSize(1);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM popup_deliveries WHERE user_id = ?", Integer.class, user)).isEqualTo(1);
    }

    @Test void acknowledgementsAreIdempotentOwnedAndDoNotCountReservationsAsImpressions() throws Exception {
        var body = changed("audience", "SELECTED"); body.put("recipientIds", List.of(user));
        body.put("actionLabel", "Open"); body.put("actionPath", "/help");
        String id = create(body).path("id").asText(); publish(id);
        JsonNode delivery = read(claim(id, user, "BROWSE", UUID.randomUUID()).andExpect(status().isOk()));
        String deliveryId = delivery.path("deliveryId").asText();
        assertThat(delivery.path("campaign").path("id").asText()).isEqualTo(id);
        assertThat(stats(id).path("shownCount").asInt()).isZero();
        for (String event : List.of("SHOWN", "CLICKED")) {
            event(deliveryId, UUID.randomUUID(), event).andExpect(status().isNotFound());
            event(deliveryId, user, event).andExpect(status().isNoContent());
            event(deliveryId, user, event).andExpect(status().isNoContent());
        }
        assertThat(stats(id).path("shownCount").asInt()).isEqualTo(1);
        assertThat(stats(id).path("clickedCount").asInt()).isEqualTo(1);
        event(deliveryId, user, "DISMISSED").andExpect(status().isNoContent());
        assertThat(stats(id).path("dismissedCount").asInt()).isZero();
        JsonNode paused = read(setStatus(id, "PAUSED").andExpect(status().isOk()));
        assertThat(paused.path("shownCount").asInt()).isEqualTo(1);
        assertThat(paused.path("clickedCount").asInt()).isEqualTo(1);
        event(deliveryId, user, "INVALID").andExpect(status().isBadRequest());
        age(id, "25 hours");
        claim(id, user, "BROWSE", UUID.randomUUID()).andExpect(status().isNoContent());
    }

    @Test void statusResponsePreservesAccumulatedStatistics() throws Exception {
        String id = active("SELECTED", List.of(user), "BROWSE", 0);
        String delivery = read(claim(id, user, "BROWSE", UUID.randomUUID()).andExpect(status().isOk())).path("deliveryId").asText();
        event(delivery, user, "SHOWN").andExpect(status().isNoContent());
        assertThat(read(setStatus(id, "PAUSED").andExpect(status().isOk())).path("shownCount").asInt()).isEqualTo(1);
    }

    @Test void terminalEventCanArriveBeforeShownAndFirstOutcomeWins() throws Exception {
        String id = active("SELECTED", List.of(user), "BROWSE", 0);
        String delivery = read(claim(id, user, "BROWSE", UUID.randomUUID()).andExpect(status().isOk())).path("deliveryId").asText();
        event(delivery, user, "DISMISSED").andExpect(status().isNoContent());
        event(delivery, user, "CLICKED").andExpect(status().isNoContent());
        assertThat(stats(id).path("shownCount").asInt()).isZero();
        event(delivery, user, "SHOWN").andExpect(status().isNoContent());
        event(delivery, user, "SHOWN").andExpect(status().isNoContent());
        assertThat(stats(id).path("shownCount").asInt()).isEqualTo(1);
        assertThat(stats(id).path("dismissedCount").asInt()).isEqualTo(1);
        assertThat(stats(id).path("clickedCount").asInt()).isZero();
    }

    @Test void concurrentTerminalEventsCountExactlyOneOutcome() throws Exception {
        String id = active("SELECTED", List.of(user), "BROWSE", 0);
        String delivery = read(claim(id, user, "BROWSE", UUID.randomUUID()).andExpect(status().isOk())).path("deliveryId").asText();
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var click = executor.submit(() -> { start.await(); return event(delivery, user, "CLICKED").andReturn().getResponse().getStatus(); });
            var dismiss = executor.submit(() -> { start.await(); return event(delivery, user, "DISMISSED").andReturn().getResponse().getStatus(); });
            start.countDown();
            assertThat(click.get(10, TimeUnit.SECONDS)).isEqualTo(204);
            assertThat(dismiss.get(10, TimeUnit.SECONDS)).isEqualTo(204);
        }
        JsonNode stats = stats(id);
        assertThat(stats.path("clickedCount").asInt() + stats.path("dismissedCount").asInt()).isEqualTo(1);
    }

    @Test void malformedClaimAndMissingResourcesHaveControlledResponses() throws Exception {
        var id = UUID.randomUUID();
        mvc.perform(asUser(get("/api/v1/popups/next"), user)).andExpect(status().isBadRequest());
        next(user, "INVALID").andExpect(status().isBadRequest());
        mvc.perform(asUser(post("/api/v1/popups/{id}/claim", id).contentType("application/json")
                .content("{\"trigger\":\"BROWSE\"}"), user)).andExpect(status().isBadRequest());
        claim(id.toString(), user, "BROWSE", UUID.randomUUID()).andExpect(status().isNoContent());
        setStatus(id.toString(), "PAUSED").andExpect(status().isNotFound());
        event(id.toString(), user, "SHOWN").andExpect(status().isNotFound());
    }

    @Test void adminListIsNewestFirstAndBounded() throws Exception {
        jdbc.update("""
                INSERT INTO popup_campaigns (id, title, message, tone, audience, trigger, starts_at, ends_at, priority, status, created_at, created_by)
                SELECT gen_random_uuid(), 'seed', 'text', 'INFO', 'ALL', 'BROWSE', now(), now() + interval '1 day', 0, 'DRAFT', now() - make_interval(days => n), ?
                FROM generate_series(1, 105) n
                """, admin);
        String newest = create(draft()).path("id").asText();
        JsonNode items = read(mvc.perform(asAdmin(get("/api/v1/admin/popups"))).andExpect(status().isOk()));
        assertThat(items.size()).isEqualTo(100);
        assertThat(items.get(0).path("id").asText()).isEqualTo(newest);
    }

    private Map<String, Object> draft() {
        var body = new LinkedHashMap<String, Object>();
        body.put("title", "Useful news"); body.put("message", "Plain text <b>not HTML</b>");
        body.put("tone", "INFO"); body.put("audience", "ALL"); body.put("recipientIds", List.of());
        body.put("trigger", "BROWSE"); body.put("priority", 0);
        body.put("startsAt", Instant.now().minus(1, ChronoUnit.MINUTES).toString());
        body.put("endsAt", Instant.now().plus(1, ChronoUnit.DAYS).toString());
        return body;
    }
    private Map<String, Object> changed(String key, Object value) { var body = draft(); body.put(key, value); return body; }
    private ResultActions adminPost(Map<String, Object> body) throws Exception {
        return mvc.perform(asAdmin(post("/api/v1/admin/popups").contentType("application/json").content(json.writeValueAsString(body))));
    }
    private JsonNode create(Map<String, Object> body) throws Exception { return read(adminPost(body).andExpect(status().isCreated())); }
    private ResultActions setStatus(String id, String status) throws Exception {
        return mvc.perform(asAdmin(patch("/api/v1/admin/popups/{id}/status", id).contentType("application/json").content(json.writeValueAsString(Map.of("status", status)))));
    }
    private void publish(String id) throws Exception { setStatus(id, "ACTIVE").andExpect(status().isOk()); }
    private String active(String audience, List<UUID> users, String trigger, int priority) throws Exception {
        var body = draft(); body.put("audience", audience); body.put("recipientIds", users); body.put("trigger", trigger); body.put("priority", priority);
        String id = create(body).path("id").asText(); publish(id); return id;
    }
    private ResultActions next(UUID userId, String trigger) throws Exception {
        return mvc.perform(asUser(get("/api/v1/popups/next").param("trigger", trigger), userId));
    }
    private ResultActions claim(String id, UUID userId, String trigger, UUID session) throws Exception {
        return mvc.perform(asUser(post("/api/v1/popups/{id}/claim", id).contentType("application/json")
                .content(json.writeValueAsString(Map.of("trigger", trigger, "sessionId", session, "userId", UUID.randomUUID()))), userId));
    }
    private ResultActions event(String id, UUID userId, String event) throws Exception {
        return mvc.perform(asUser(post("/api/v1/popups/deliveries/{id}/events", id).contentType("application/json")
                .content(json.writeValueAsString(Map.of("event", event))), userId));
    }
    private JsonNode stats(String id) throws Exception {
        JsonNode list = read(mvc.perform(asAdmin(get("/api/v1/admin/popups"))).andExpect(status().isOk()));
        for (JsonNode campaign : list) if (campaign.path("id").asText().equals(id)) return campaign;
        throw new AssertionError("Missing campaign " + id);
    }
    private JsonNode read(ResultActions response) throws Exception { return json.readTree(response.andReturn().getResponse().getContentAsString()); }
    private MockHttpServletRequestBuilder asUser(MockHttpServletRequestBuilder request, UUID id) { return request.accept("application/json").header("X-User-Id", id).header("X-User-Roles", "ROLE_USER"); }
    private MockHttpServletRequestBuilder asAdmin(MockHttpServletRequestBuilder request) { return request.accept("application/json").header("X-User-Id", admin).header("X-User-Roles", "ROLE_ADMIN"); }
    private void age(String campaign, String interval) { jdbc.update("UPDATE popup_deliveries SET claimed_at = now() - ?::interval WHERE campaign_id = ? AND user_id = ?", interval, UUID.fromString(campaign), user); }

    @Configuration
    @EnableWebMvc
    @EnableTransactionManagement
    @ComponentScan("uz.efbazaar.marketplace.popup")
    @Import({SecurityConfig.class, HeaderAuthenticationFilter.class, InternalSecretFilter.class, GlobalExceptionHandler.class})
    static class Config {
        @Bean DataSource dataSource() {
            var dataSource = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
            Flyway.configure().dataSource(dataSource).load().migrate();
            return dataSource;
        }
        @Bean JdbcTemplate jdbcTemplate(DataSource dataSource) { return new JdbcTemplate(dataSource); }
        @Bean DataSourceTransactionManager transactionManager(DataSource dataSource) { return new DataSourceTransactionManager(dataSource); }
        @Bean ObjectMapper objectMapper() { return new ObjectMapper().findAndRegisterModules(); }
    }
}
