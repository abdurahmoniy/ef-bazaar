package uz.efbazaar.marketplace.profileappearance;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.web.client.MockRestServiceServer;
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

@SpringJUnitConfig(ProfileAppearanceIT.Config.class)
@WebAppConfiguration
@org.springframework.test.annotation.DirtiesContext(
    classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class ProfileAppearanceIT {
  @Container
  static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

  @Autowired WebApplicationContext context;
  @Autowired FilterChainProxy security;
  @Autowired PlanProjection plans;
  @Autowired JdbcTemplate jdbc;
  @Autowired MockRestServiceServer bot;
  MockMvc mvc;
  UUID user;

  @BeforeEach
  void setup() {
    mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(security).build();
    bot.reset();
    user = UUID.randomUUID();
    paid("PRO", "true", Instant.now().plusSeconds(3600));
  }

  void paid(String code, String value, Instant expiry) {
    var grants = new HashMap<String, String>();
    grants.put("profile.decoration", value);
    plans.replacePlan(code, grants, System.nanoTime(), UUID.randomUUID().toString(), Instant.now());
    plans.userMoved(
        user, code, expiry, System.nanoTime(), UUID.randomUUID().toString(), Instant.now());
  }

  MockMultipartFile image() {
    return new MockMultipartFile(
        "file",
        "cover.png",
        "image/png",
        new byte[] {(byte) 137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4});
  }

  @Test
  void singleImageUploadIsValidatedAndExpiryHidesPublicDecorationButRetainsSavedCover()
      throws Exception {
    bot.expect(requestTo("http://bot/bot/internal/media/upload"))
        .andRespond(
            withSuccess(
                "{\"fileIds\":[\"cover-file\"]}",
                org.springframework.http.MediaType.APPLICATION_JSON));
    mvc.perform(
            multipart("/api/v1/profiles/me/appearance/cover")
                .file(image())
                .with(
                    r -> {
                      r.setMethod("PUT");
                      return r;
                    })
                .header("X-User-Id", user))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.coverFileId").value("cover-file"));
    mvc.perform(get("/api/v1/profiles/" + user + "/appearance"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pro").value(true))
        .andExpect(jsonPath("$.validUntil").isString())
        .andExpect(header().string("Cache-Control", "no-store"));
    paid("STANDARD", "false", null);
    mvc.perform(get("/api/v1/profiles/" + user + "/appearance"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pro").value(false))
        .andExpect(jsonPath("$.coverFileId").isEmpty());
    mvc.perform(get("/api/v1/profiles/me/appearance").header("X-User-Id", user))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.coverFileId").value("cover-file"));
    mvc.perform(delete("/api/v1/profiles/me/appearance/cover").header("X-User-Id", user))
        .andExpect(status().isForbidden());
    bot.verify();
  }

  @Test
  void spoofedOversizedAndMultipleImagesAreRejectedBeforeBot() throws Exception {
    for (var file :
        List.of(
            new MockMultipartFile("file", "bad.png", "image/png", "#!/bin/sh".getBytes()),
            new MockMultipartFile("file", "large.png", "image/png", new byte[1024 * 1024 + 1])))
      mvc.perform(
              multipart("/api/v1/profiles/me/appearance/cover")
                  .file(file)
                  .with(
                      r -> {
                        r.setMethod("PUT");
                        return r;
                      })
                  .header("X-User-Id", user))
          .andExpect(status().isBadRequest());
    mvc.perform(
            multipart("/api/v1/profiles/me/appearance/cover")
                .file(image())
                .file(image())
                .with(
                    r -> {
                      r.setMethod("PUT");
                      return r;
                    })
                .header("X-User-Id", user))
        .andExpect(status().isBadRequest());
    bot.verify();
  }

  @Test
  void expiryDuringUploadPreservesOldCoverAndMalformedGrantNeverShowsBadge() throws Exception {
    jdbc.update("INSERT INTO profile_appearances(user_id,cover_file_id) VALUES (?,?)", user, "old");
    bot.expect(requestTo("http://bot/bot/internal/media/upload"))
        .andRespond(
            request -> {
              paid("STANDARD", "false", null);
              return withSuccess(
                      "{\"fileIds\":[\"new\"]}",
                      org.springframework.http.MediaType.APPLICATION_JSON)
                  .createResponse(request);
            });
    mvc.perform(
            multipart("/api/v1/profiles/me/appearance/cover")
                .file(image())
                .with(
                    r -> {
                      r.setMethod("PUT");
                      return r;
                    })
                .header("X-User-Id", user))
        .andExpect(status().isForbidden());
    assertThat(
            jdbc.queryForObject(
                "SELECT cover_file_id FROM profile_appearances WHERE user_id=?",
                String.class,
                user))
        .isEqualTo("old");
    paid("PRO", null, null);
    mvc.perform(get("/api/v1/profiles/" + user + "/appearance"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pro").value(false));
    bot.verify();
  }

  @Test
  void deletingCoverLeavesReadableNullMetadataAndDoesNotRemoveLiveMembership() throws Exception {
    jdbc.update(
        "INSERT INTO profile_appearances(user_id,cover_file_id) VALUES (?,?)", user, "saved");
    mvc.perform(delete("/api/v1/profiles/me/appearance/cover").header("X-User-Id", user))
        .andExpect(status().isNoContent());
    mvc.perform(get("/api/v1/profiles/me/appearance").header("X-User-Id", user))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.coverFileId").isEmpty())
        .andExpect(jsonPath("$.pro").value(true));
    mvc.perform(get("/api/v1/profiles/" + user + "/appearance"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.coverFileId").isEmpty())
        .andExpect(jsonPath("$.pro").value(true));
  }

  @Test
  void publicDeadlineIsEarliestAuthoritativeExpiryAndStaleProjectionHidesEverything()
      throws Exception {
    paid("PRO", "true", Instant.now().plusSeconds(4 * 3600));
    Instant source =
        Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS).minusSeconds(23 * 3600);
    Instant expected = source.plusSeconds(24 * 3600);
    jdbc.update(
        "UPDATE plan_projection_state SET occurred_at=? WHERE kind='plan' AND entity_id='PRO'",
        java.sql.Timestamp.from(source));
    var response =
        mvc.perform(get("/api/v1/profiles/" + user + "/appearance"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.pro").value(true))
            .andReturn()
            .getResponse()
            .getContentAsString();
    String deadline = new ObjectMapper().readTree(response).path("validUntil").asText();
    assertThat(Instant.parse(deadline))
        .isEqualTo(expected.truncatedTo(java.time.temporal.ChronoUnit.MICROS));
    jdbc.update(
        "UPDATE plan_projection_state SET occurred_at=now()-interval '25 hours' WHERE kind='user'"
            + " AND entity_id=?",
        user.toString());
    mvc.perform(get("/api/v1/profiles/" + user + "/appearance"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pro").value(false))
        .andExpect(jsonPath("$.validUntil").isEmpty());
  }

  @Test
  void botFailurePreservesExistingCover() throws Exception {
    jdbc.update(
        "INSERT INTO profile_appearances(user_id,cover_file_id) VALUES (?,?)", user, "saved");
    bot.expect(requestTo("http://bot/bot/internal/media/upload")).andRespond(withServerError());
    mvc.perform(
            multipart("/api/v1/profiles/me/appearance/cover")
                .file(image())
                .with(
                    r -> {
                      r.setMethod("PUT");
                      return r;
                    })
                .header("X-User-Id", user))
        .andExpect(status().isBadGateway());
    assertThat(
            jdbc.queryForObject(
                "SELECT cover_file_id FROM profile_appearances WHERE user_id=?",
                String.class,
                user))
        .isEqualTo("saved");
  }

  @Test
  void coverCannotBeSetFromBodyMediaReferenceAndMissingMultipartFileIsRejected() throws Exception {
    mvc.perform(
            put("/api/v1/profiles/me/appearance/cover")
                .header("X-User-Id", user)
                .contentType("application/json")
                .content("{\"coverFileId\":\"foreign-file\"}"))
        .andExpect(status().isUnsupportedMediaType());
    mvc.perform(
            multipart("/api/v1/profiles/me/appearance/cover")
                .with(
                    r -> {
                      r.setMethod("PUT");
                      return r;
                    })
                .header("X-User-Id", user))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/v1/profiles/me/appearance")).andExpect(status().isForbidden());
    bot.verify();
  }

  @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;

  @Test
  void coverWritesRollBackWhenPaidAccessChangesWhileWaitingForTheSavedRow() throws Exception {
    for (boolean remove : List.of(false, true)) {
      for (String change : List.of("downgrade", "stale")) {
        bot.reset();
        paid("PRO", "true", null);
        jdbc.update(
            "INSERT INTO profile_appearances(user_id,cover_file_id) VALUES (?,'saved') ON"
                + " CONFLICT(user_id) DO UPDATE SET cover_file_id='saved'",
            user);
        var locked = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        var tx =
            new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        if (!remove)
          bot.expect(requestTo("http://bot/bot/internal/media/upload"))
              .andRespond(
                  withSuccess(
                      "{\"fileIds\":[\"replacement\"]}",
                      org.springframework.http.MediaType.APPLICATION_JSON));
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
          var holder =
              pool.submit(
                  () ->
                      tx.executeWithoutResult(
                          status -> {
                            jdbc.queryForObject(
                                "SELECT user_id FROM profile_appearances WHERE user_id=? FOR"
                                    + " UPDATE",
                                UUID.class,
                                user);
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
          var response =
              pool.submit(
                  () -> {
                    if (remove)
                      return mvc.perform(
                              delete("/api/v1/profiles/me/appearance/cover")
                                  .header("X-User-Id", user))
                          .andReturn()
                          .getResponse();
                    return mvc.perform(
                            multipart("/api/v1/profiles/me/appearance/cover")
                                .file(image())
                                .with(
                                    request -> {
                                      request.setMethod("PUT");
                                      return request;
                                    })
                                .header("X-User-Id", user))
                        .andReturn()
                        .getResponse();
                  });
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
            if (change.equals("downgrade")) paid("STANDARD", "false", null);
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
              .as("%s during cover %s", change, remove ? "deletion" : "replacement")
              .isEqualTo(change.equals("downgrade") ? 403 : 503);
        }
        assertThat(
                jdbc.queryForObject(
                    "SELECT cover_file_id FROM profile_appearances WHERE user_id=?",
                    String.class,
                    user))
            .isEqualTo("saved");
        bot.verify();
      }
    }
  }

  @org.springframework.boot.test.context.TestConfiguration
  @EnableWebMvc
  @EnableTransactionManagement
  @ComponentScan(
      value = {"uz.efbazaar.marketplace.sellertools", "uz.efbazaar.marketplace.profileappearance"},
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
    uz.efbazaar.marketplace.config.MediaProperties mediaProperties() {
      return new uz.efbazaar.marketplace.config.MediaProperties(
          2, 10, 1, List.of("image/png", "image/jpeg"));
    }

    @Bean
    org.springframework.web.client.RestClient botClient() {
      return builder.build();
    }

    static org.springframework.web.client.RestClient.Builder builder =
        org.springframework.web.client.RestClient.builder().baseUrl("http://bot");

    @Bean
    MockRestServiceServer botServer() {
      return MockRestServiceServer.bindTo(builder).build();
    }

    @Bean
    uz.efbazaar.marketplace.service.MediaService mediaService(
        uz.efbazaar.marketplace.config.MediaProperties props, MockRestServiceServer server) {
      return new uz.efbazaar.marketplace.service.MediaService(props, builder.build());
    }

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
