package uz.efbazaar.marketplace.sellertools;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import java.time.*;
import java.util.*;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.exception.GlobalExceptionHandler;
import uz.efbazaar.marketplace.plan.*;
import uz.efbazaar.marketplace.security.*;

@SpringJUnitConfig(SellerToolsIT.Config.class)
@WebAppConfiguration
@org.springframework.test.annotation.DirtiesContext(
    classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class SellerToolsIT {
  @Container
  static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

  @Autowired WebApplicationContext context;
  @Autowired FilterChainProxy security;
  @Autowired JdbcTemplate jdbc;
  @Autowired PlanProjection plans;
  @Autowired ObjectMapper json;
  MockMvc mvc;
  UUID user;

  @BeforeEach
  void setup() {
    mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(security).build();
    user = UUID.randomUUID();
    paid(user, "PRO", "true", null);
  }

  @Test
  void privateNoteIsInvisibleEvenToOtherParticipantOfItsChat() throws Exception {
    UUID other = UUID.randomUUID(), chat = UUID.randomUUID();
    UUID listing = listing(user);
    jdbc.update(
        "INSERT INTO chats(id,listing_id,buyer_id,seller_id,created_at) VALUES (?,?,?,?,now())",
        chat,
        listing,
        other,
        user);
    String note =
        mvc.perform(
                post("/api/v1/seller-tools/notes")
                    .header("X-User-Id", user)
                    .contentType("application/json")
                    .content("{\"body\":\"private price floor\",\"chatId\":\"" + chat + "\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.body").value("private price floor"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    String id = json.readTree(note).path("id").asText();
    mvc.perform(get("/api/v1/seller-tools/notes/" + id).header("X-User-Id", other))
        .andExpect(status().isNotFound());
    mvc.perform(get("/api/v1/seller-tools/notes?chatId=" + chat).header("X-User-Id", other))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(0));
    mvc.perform(get("/api/v1/seller-tools/export").header("X-User-Id", other))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.notes").isEmpty());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM chat_messages WHERE chat_id=?", Long.class, chat))
        .isZero();
  }

  @Test
  void downgradeRetainsAllRowsButRejectsWritesAndForeignIds() throws Exception {
    UUID listing = listing(user);
    String created =
        mvc.perform(
                post("/api/v1/seller-tools/notes")
                    .header("X-User-Id", user)
                    .contentType("application/json")
                    .content("{\"body\":\"retained\",\"listingId\":\"" + listing + "\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    String id = json.readTree(created).path("id").asText();
    mvc.perform(
            post("/api/v1/seller-tools/notes")
                .header("X-User-Id", user)
                .contentType("application/json")
                .content("{\"body\":\"bad\",\"listingId\":\"" + listing(UUID.randomUUID()) + "\"}"))
        .andExpect(status().isNotFound());
    paid(user, "STANDARD", "false", null);
    mvc.perform(get("/api/v1/seller-tools/notes/" + id).header("X-User-Id", user))
        .andExpect(status().isOk())
        .andExpect(header().string("Cache-Control", "no-store"));
    mvc.perform(
            put("/api/v1/seller-tools/notes/" + id)
                .header("X-User-Id", user)
                .contentType("application/json")
                .content("{\"body\":\"edit\",\"listingId\":\"" + listing + "\"}"))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/seller-tools/export").header("X-User-Id", user))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.notes[0].body").value("retained"));
  }

  @Test
  void ownersDeleteSavedPrivateDataWithoutPaidAccessButNeverAnotherOwnersRows() throws Exception {
    UUID listing = listing(user);
    UUID note = UUID.randomUUID(), template = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO seller_private_notes(id,owner_id,title,body,listing_id) VALUES"
            + " (?,?,'saved','saved',?)",
        note,
        user,
        listing);
    jdbc.update(
        "INSERT INTO seller_reply_templates(id,owner_id,title,body) VALUES"
            + " (?,?,'saved','saved')",
        template,
        user);
    paid(user, "STANDARD", "false", null);
    mvc.perform(
            delete("/api/v1/seller-tools/notes/" + note).header("X-User-Id", UUID.randomUUID()))
        .andExpect(status().isNotFound());
    mvc.perform(delete("/api/v1/seller-tools/notes/" + note)).andExpect(status().isForbidden());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM seller_private_notes WHERE id=?", Long.class, note))
        .isEqualTo(1);
    mvc.perform(delete("/api/v1/seller-tools/notes/" + note).header("X-User-Id", user))
        .andExpect(status().isNoContent());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM seller_private_notes WHERE id=?", Long.class, note))
        .isZero();
    jdbc.update(
        "UPDATE plan_projection_state SET occurred_at=now()-interval '25 hours' WHERE"
            + " kind='user' AND entity_id=?",
        user.toString());
    mvc.perform(delete("/api/v1/seller-tools/templates/" + template).header("X-User-Id", user))
        .andExpect(status().isNoContent());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM seller_reply_templates WHERE id=?", Long.class, template))
        .isZero();
    mvc.perform(delete("/api/v1/seller-tools/templates/" + template).header("X-User-Id", user))
        .andExpect(status().isNotFound());
  }

  @Test
  void templatePaginationExportAndTypedPlanFailures() throws Exception {
    for (int i = 0; i < 102; i++)
      mvc.perform(
              post("/api/v1/seller-tools/templates")
                  .header("X-User-Id", user)
                  .contentType("application/json")
                  .content("{\"title\":\"reply\",\"body\":\"=formula remains JSON\"}"))
          .andExpect(status().isCreated());
    mvc.perform(get("/api/v1/seller-tools/templates?size=100").header("X-User-Id", user))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content.length()").value(100))
        .andExpect(jsonPath("$.totalElements").value(102));
    mvc.perform(get("/api/v1/seller-tools/export").header("X-User-Id", user))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.templates.length()").value(102));
    mvc.perform(get("/api/v1/seller-tools/templates?size=101").header("X-User-Id", user))
        .andExpect(status().isBadRequest());
    for (String value : Arrays.asList(null, "TRUE", "1", "garbage")) {
      paid(user, "PRO", value, null);
      mvc.perform(
              post("/api/v1/seller-tools/templates")
                  .header("X-User-Id", user)
                  .contentType("application/json")
                  .content("{\"title\":\"reply\",\"body\":\"body\"}"))
          .andExpect(status().isServiceUnavailable());
    }
    paid(user, "STANDARD", "false", null);
    paid(user, "PRO", "true", Instant.now().minusSeconds(1));
    mvc.perform(get("/api/v1/seller-tools/capabilities").header("X-User-Id", user))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.tools").value("DENIED"));
  }

  @Test
  void noteContextsAreRequiredAndRetainedContextMayBeEditedAfterOwnershipChange() throws Exception {
    mvc.perform(
            post("/api/v1/seller-tools/notes")
                .header("X-User-Id", user)
                .contentType("application/json")
                .content("{\"body\":\"missing context\"}"))
        .andExpect(status().isBadRequest());
    UUID listing = listing(user);
    String body = "{\"body\":\"before\",\"listingId\":\"" + listing + "\"}";
    String created =
        mvc.perform(
                post("/api/v1/seller-tools/notes")
                    .header("X-User-Id", user)
                    .contentType("application/json")
                    .content(body))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    String id = json.readTree(created).path("id").asText();
    jdbc.update("UPDATE listings SET seller_id=? WHERE id=?", UUID.randomUUID(), listing);
    mvc.perform(
            put("/api/v1/seller-tools/notes/" + id)
                .header("X-User-Id", user)
                .contentType("application/json")
                .content(body.replace("before", "after")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.body").value("after"));
    mvc.perform(get("/api/v1/seller-tools/export")).andExpect(status().isForbidden());
  }

  @Test
  void templatesMatchChatMessageLimitAndAccountDeletionPurgesOnlyOwnersPrivateData()
      throws Exception {
    String body = json.writeValueAsString(Map.of("title", "boundary", "body", "x".repeat(4001)));
    mvc.perform(
            post("/api/v1/seller-tools/templates")
                .header("X-User-Id", user)
                .contentType("application/json")
                .content(body))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/v1/seller-tools/templates")
                .header("X-User-Id", user)
                .contentType("application/json")
                .content(body.replace("x".repeat(4001), "x".repeat(4000))))
        .andExpect(status().isCreated());
    var consumer =
        context.getBean("sellerPrivateDataDeletedConsumer", java.util.function.Consumer.class);
    consumer.accept(
        new uz.efbazaar.marketplace.kafka.UserDeletedDto(user, null, null, Instant.now()));
    mvc.perform(get("/api/v1/seller-tools/export").header("X-User-Id", user))
        .andExpect(jsonPath("$.templates").isEmpty());
  }

  UUID listing(UUID owner) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO listings(id,seller_id,description,price,status) VALUES"
            + " (?,?,'test',100,'ACTIVE')",
        id,
        owner);
    return id;
  }

  void paid(UUID id, String code, String value, Instant expiry) {
    var grants = new HashMap<String, String>();
    for (String key : List.of("seller.tools", "seller.bulk", "profile.decoration"))
      grants.put(key, value);
    plans.replacePlan(code, grants, System.nanoTime(), UUID.randomUUID().toString(), Instant.now());
    plans.userMoved(
        id, code, expiry, System.nanoTime(), UUID.randomUUID().toString(), Instant.now());
  }

  @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;

  @Test
  void privateWritesRollBackWhenPaidAccessChangesWhileWaitingForDatabaseLocks() throws Exception {
    for (String operation :
        List.of("context-note-create", "note-update", "template-update")) {
      for (String change : List.of("downgrade", "stale")) {
        paid(user, "PRO", "true", null);
        UUID listingId = listing(user);
        UUID id = UUID.randomUUID();
        boolean create = operation.equals("context-note-create");
        boolean template = operation.startsWith("template");
        String table =
            create ? "listings" : template ? "seller_reply_templates" : "seller_private_notes";
        UUID lockedId = create ? listingId : id;
        if (!create) {
          if (template)
            jdbc.update(
                "INSERT INTO seller_reply_templates(id,owner_id,title,body) VALUES"
                    + " (?,?,'saved','saved')",
                id,
                user);
          else
            jdbc.update(
                "INSERT INTO seller_private_notes(id,owner_id,title,body,listing_id) VALUES"
                    + " (?,?,'saved','saved',?)",
                id,
                user,
                listingId);
        }
        String path =
            "/api/v1/seller-tools/" + (template ? "templates" : "notes") + (create ? "" : "/" + id);
        var request = create ? post(path) : put(path);
        request.header("X-User-Id", user).accept("application/json");
        var body = new HashMap<String, Object>();
        body.put("title", "changed");
        body.put("body", "changed");
        if (!template) body.put("listingId", listingId);
        request.contentType("application/json").content(json.writeValueAsString(body));
        var locked = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        var tx =
            new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
          var holder =
              pool.submit(
                  () ->
                      tx.executeWithoutResult(
                          status -> {
                            jdbc.queryForObject(
                                "SELECT id FROM " + table + " WHERE id=? FOR UPDATE",
                                UUID.class,
                                lockedId);
                            locked.countDown();
                            try {
                              assertThat(release.await(10, java.util.concurrent.TimeUnit.SECONDS))
                                  .isTrue();
                            } catch (InterruptedException exception) {
                              Thread.currentThread().interrupt();
                              throw new IllegalStateException(exception);
                            }
                          }));
          assertThat(locked.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
          var response = pool.submit(() -> mvc.perform(request).andReturn().getResponse());
          try {
            org.awaitility.Awaitility.await()
                .atMost(java.time.Duration.ofSeconds(5))
                .until(
                    () ->
                        jdbc.queryForObject(
                                "SELECT count(*) FROM pg_stat_activity WHERE"
                                    + " datname=current_database() AND wait_event_type='Lock'",
                                Long.class)
                            > 0);
            if (change.equals("downgrade")) paid(user, "STANDARD", "false", null);
            else
              jdbc.update(
                  "UPDATE plan_projection_state SET occurred_at=now()-interval '25 hours' WHERE"
                      + " kind='user' AND entity_id=?",
                  user.toString());
          } finally {
            release.countDown();
          }
          holder.get(10, java.util.concurrent.TimeUnit.SECONDS);
          var result = response.get(10, java.util.concurrent.TimeUnit.SECONDS);
          assertThat(result.getStatus())
              .as("%s during %s", change, operation)
              .isEqualTo(change.equals("downgrade") ? 403 : 503);
          assertThat(json.readTree(result.getContentAsString()).path("code").asText())
              .isEqualTo(change.equals("downgrade") ? "upgrade_required" : "plan_unavailable");
        }
        if (create)
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM seller_private_notes WHERE owner_id=? AND listing_id=?",
                      Long.class,
                      user,
                      listingId))
              .isZero();
        else
          assertThat(
                  jdbc.queryForObject(
                      "SELECT body FROM " + table + " WHERE id=?", String.class, id))
              .isEqualTo("saved");
      }
    }
  }

  @org.springframework.boot.test.context.TestConfiguration
  @EnableWebMvc
  @EnableTransactionManagement
  @ComponentScan(
      value = "uz.efbazaar.marketplace.sellertools",
      excludeFilters =
          @ComponentScan.Filter(
              type = FilterType.ANNOTATION,
              classes = org.springframework.boot.test.context.TestConfiguration.class))
  @Import({
    SecurityConfig.class,
    HeaderAuthenticationFilter.class,
    InternalSecretFilter.class,
    GlobalExceptionHandler.class,
    PlanProjection.class
  })
  static class Config {
    @Bean
    DataSource dataSource() {
      var ds =
          new DriverManagerDataSource(
              postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
      Flyway.configure().dataSource(ds).load().migrate();
      return ds;
    }

    @Bean
    JdbcTemplate marketplaceJdbcTemplate(DataSource ds) {
      return new JdbcTemplate(ds);
    }

    @Bean
    DataSourceTransactionManager transactionManager(DataSource ds) {
      return new DataSourceTransactionManager(ds);
    }

    @Bean
    ObjectMapper objectMapper() {
      return new ObjectMapper().findAndRegisterModules();
    }
  }
}
