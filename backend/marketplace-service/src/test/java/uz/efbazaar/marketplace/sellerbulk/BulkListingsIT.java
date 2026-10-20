package uz.efbazaar.marketplace.sellerbulk;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import java.math.BigDecimal;
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
import uz.efbazaar.marketplace.account.*;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.domain.*;
import uz.efbazaar.marketplace.exception.GlobalExceptionHandler;
import uz.efbazaar.marketplace.plan.*;
import uz.efbazaar.marketplace.repository.*;
import uz.efbazaar.marketplace.security.*;
import uz.efbazaar.marketplace.service.*;

@SpringJUnitConfig(BulkListingsIT.Config.class)
@WebAppConfiguration
@org.springframework.test.annotation.DirtiesContext(
    classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class BulkListingsIT {
  @Container
  static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

  @Autowired WebApplicationContext context;
  @Autowired FilterChainProxy security;
  @Autowired PlanProjection plans;
  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper json;
  @Autowired uz.efbazaar.marketplace.event.MarketplaceEventPublisher events;
  @Autowired uz.efbazaar.marketplace.partner.ads.ChannelTakedown takedown;
  MockMvc mvc;
  UUID user;

  @BeforeEach
  void setup() {
    mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(security).build();
    user = UUID.randomUUID();
    reset(events, takedown);
    plans.replacePlan(
        "PRO",
        Map.of("seller.bulk", "true"),
        System.nanoTime(),
        UUID.randomUUID().toString(),
        Instant.now());
    plans.userMoved(
        user, "PRO", null, System.nanoTime(), UUID.randomUUID().toString(), Instant.now());
  }

  UUID listing(UUID owner, String status) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO listings(id,seller_id,description,price,status) VALUES (?,?,'bulk',10000,?)",
        id,
        owner,
        status);
    return id;
  }

  String request(String operation, List<UUID> ids, String price) throws Exception {
    var body = new HashMap<String, Object>();
    body.put("operation", operation);
    body.put("listingIds", ids);
    if (price != null) body.put("price", new BigDecimal(price));
    return json.writeValueAsString(body);
  }

  ResultActions postBulk(String body) throws Exception {
    return mvc.perform(
        post("/api/v1/seller-tools/listings/bulk")
            .header("X-User-Id", user)
            .contentType("application/json")
            .content(body));
  }

  @Test
  void mixedOwnersAndStatusesHaveIsolatedOutcomesAndRetainExistingUnpublishLifecycle()
      throws Exception {
    UUID own = listing(user, "ACTIVE"),
        foreign = listing(UUID.randomUUID(), "ACTIVE"),
        sold = listing(user, "SOLD"),
        later = listing(user, "ACTIVE"),
        failure = listing(user, "ACTIVE");
    UUID account = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO"
            + " user_accounts(id,owner_id,status,current_listing_id,source_listing_id,created_at,updated_at)"
            + " VALUES (?,?,'ACTIVE',?,?,now(),now())",
        account,
        user,
        own,
        own);
    doThrow(new IllegalStateException("injected lifecycle failure"))
        .when(takedown)
        .onRemoved(argThat(l -> l.getId().equals(failure)));
    postBulk(request("UNPUBLISH", List.of(own, foreign, sold, failure, later), null))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[0].success").value(true))
        .andExpect(jsonPath("$.results[1].success").value(false))
        .andExpect(jsonPath("$.results[2].success").value(false))
        .andExpect(jsonPath("$.results[3].success").value(false))
        .andExpect(jsonPath("$.results[4].success").value(true));
    assertThat(
            jdbc.queryForObject(
                "SELECT current_listing_id FROM user_accounts WHERE id=?", UUID.class, account))
        .isNull();
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM user_accounts WHERE id=?", String.class, account))
        .isEqualTo("ACTIVE");
    assertThat(jdbc.queryForObject("SELECT status FROM listings WHERE id=?", String.class, failure))
        .isEqualTo("ACTIVE");
    verify(events).listingDeleted(own, user, ListingStatus.DELETED);
    verify(takedown).onRemoved(argThat(l -> l.getId().equals(own)));
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM outbox_snapshot_pending WHERE source='listing' AND"
                    + " entity_id=CAST(? AS text)",
                Long.class,
                own))
        .isEqualTo(1);
  }

  @Test
  void priceUsesExistingLifecycleAndRejectsDuplicatesOverLimitAndBelowMinimum() throws Exception {
    UUID own = listing(user, "ACTIVE"), foreign = listing(UUID.randomUUID(), "ACTIVE");
    postBulk(request("PRICE", List.of(own, foreign), "9000"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[0].success").value(true));
    assertThat(jdbc.queryForObject("SELECT price FROM listings WHERE id=?", BigDecimal.class, own))
        .isEqualByComparingTo("9000");
    verify(events).listingUpdated(argThat(l -> l.getId().equals(own)));
    postBulk(request("PRICE", List.of(own, own), "9000")).andExpect(status().isBadRequest());
    postBulk(request("PRICE", List.of(own), "4999.99")).andExpect(status().isBadRequest());
    postBulk(
            request(
                "UNPUBLISH",
                java.util.stream.IntStream.range(0, 51).mapToObj(i -> UUID.randomUUID()).toList(),
                null))
        .andExpect(status().isBadRequest());
  }

  @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;

  @Test
  void concurrentStatusChangeIsRecheckedAfterTheListingLock() throws Exception {
    UUID own = listing(user, "ACTIVE");
    var tx = new org.springframework.transaction.support.TransactionTemplate(transactionManager);
    var changed = new java.util.concurrent.CountDownLatch(1);
    var release = new java.util.concurrent.CountDownLatch(1);
    try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
      var writer =
          pool.submit(
              () ->
                  tx.executeWithoutResult(
                      status -> {
                        jdbc.update("UPDATE listings SET status='SOLD' WHERE id=?", own);
                        changed.countDown();
                        try {
                          assertThat(release.await(10, java.util.concurrent.TimeUnit.SECONDS))
                              .isTrue();
                        } catch (InterruptedException ex) {
                          throw new IllegalStateException(ex);
                        }
                      }));
      assertThat(changed.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
      var requestBody = request("PRICE", List.of(own), "9000");
      var bulk =
          pool.submit(
              () ->
                  postBulk(requestBody)
                      .andExpect(status().isOk())
                      .andExpect(jsonPath("$.results[0].code").value("listing_not_active")));
      try {
        org.awaitility.Awaitility.await()
            .atMost(java.time.Duration.ofSeconds(5))
            .until(
                () ->
                    jdbc.queryForObject(
                            "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()"
                                + " AND wait_event_type='Lock'",
                            Long.class)
                        > 0);
      } finally {
        release.countDown();
      }
      writer.get(10, java.util.concurrent.TimeUnit.SECONDS);
      bulk.get(10, java.util.concurrent.TimeUnit.SECONDS);
    }
    assertThat(jdbc.queryForObject("SELECT price FROM listings WHERE id=?", BigDecimal.class, own))
        .isEqualByComparingTo("10000");
  }

  @Test
  void capabilityIsRecheckedAfterWaitingForAccountOrListingLocks() throws Exception {
    plans.replacePlan(
        "STANDARD",
        Map.of("seller.bulk", "false"),
        System.nanoTime(),
        UUID.randomUUID().toString(),
        Instant.now());
    for (boolean lockAccount : List.of(false, true)) {
      for (String change : List.of("downgrade", "stale")) {
        plans.userMoved(
            user, "PRO", null, System.nanoTime(), UUID.randomUUID().toString(), Instant.now());
        UUID id = listing(user, "ACTIVE");
        UUID account = UUID.randomUUID();
        if (lockAccount) {
          jdbc.update(
              "INSERT INTO"
                  + " user_accounts(id,owner_id,status,current_listing_id,source_listing_id,created_at,updated_at)"
                  + " VALUES (?,?,'ACTIVE',?,?,now(),now())",
              account,
              user,
              id,
              id);
        }
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
                            if (lockAccount) {
                              jdbc.queryForObject(
                                  "SELECT id FROM user_accounts WHERE id=? FOR UPDATE",
                                  UUID.class,
                                  account);
                            } else {
                              jdbc.queryForObject(
                                  "SELECT id FROM listings WHERE id=? FOR UPDATE", UUID.class, id);
                            }
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
          String body = request("PRICE", List.of(id), "9000");
          var bulk =
              pool.submit(
                  () ->
                      postBulk(body)
                          .andExpect(status().isOk())
                          .andReturn()
                          .getResponse()
                          .getContentAsString());
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
            if (change.equals("downgrade")) {
              plans.userMoved(
                  user,
                  "STANDARD",
                  null,
                  System.nanoTime(),
                  UUID.randomUUID().toString(),
                  Instant.now());
            } else {
              jdbc.update(
                  "UPDATE plan_projection_state SET occurred_at=now()-interval '25 hours' WHERE"
                      + " kind='user' AND entity_id=?",
                  user.toString());
            }
          } finally {
            release.countDown();
          }
          holder.get(10, java.util.concurrent.TimeUnit.SECONDS);
          JsonNode result =
              json.readTree(bulk.get(10, java.util.concurrent.TimeUnit.SECONDS))
                  .path("results")
                  .get(0);
          assertThat(result.path("code").asText())
              .as("%s while waiting for %s lock", change, lockAccount ? "account" : "listing")
              .isEqualTo(change.equals("downgrade") ? "upgrade_required" : "plan_unavailable");
          assertThat(result.path("success").asBoolean()).isFalse();
        }
        assertThat(
                jdbc.queryForObject("SELECT price FROM listings WHERE id=?", BigDecimal.class, id))
            .isEqualByComparingTo("10000");
      }
    }
    verify(events, never()).listingUpdated(any());
  }

  @Test
  void archivedAccountAndDowngradeBetweenItemsCannotBypassChecks() throws Exception {
    UUID archived = listing(user, "ACTIVE"),
        first = listing(user, "ACTIVE"),
        second = listing(user, "ACTIVE");
    jdbc.update(
        "INSERT INTO"
            + " user_accounts(id,owner_id,status,current_listing_id,source_listing_id,created_at,updated_at)"
            + " VALUES (?,?,'ARCHIVED',?,?,now(),now())",
        UUID.randomUUID(),
        user,
        archived,
        archived);
    postBulk(request("PRICE", List.of(archived), "9000"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[0].code").value("account_archived"));
    plans.replacePlan(
        "STANDARD",
        Map.of("seller.bulk", "false"),
        System.nanoTime(),
        UUID.randomUUID().toString(),
        Instant.now());
    doAnswer(
            invocation -> {
              plans.userMoved(
                  user,
                  "STANDARD",
                  null,
                  System.nanoTime(),
                  UUID.randomUUID().toString(),
                  Instant.now());
              return null;
            })
        .when(events)
        .listingUpdated(argThat(l -> l.getId().equals(first)));
    postBulk(request("PRICE", List.of(first, second), "9000"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[0].success").value(true))
        .andExpect(jsonPath("$.results[1].code").value("upgrade_required"));
    assertThat(
            jdbc.queryForObject("SELECT price FROM listings WHERE id=?", BigDecimal.class, second))
        .isEqualByComparingTo("10000");
    postBulk(request("UNPUBLISH", List.of(second), null)).andExpect(status().isForbidden());
  }

  @Autowired ListingAccountLink accountLink;
  @Autowired ListingRepository listingRepository;

  @Test
  void concurrentUnpublishDoesNotCreateAnAccountLinkedToRemovedListing() throws Exception {
    UUID id = listing(user, "ACTIVE");
    Listing stale = listingRepository.findById(id).orElseThrow();
    var tx = new org.springframework.transaction.support.TransactionTemplate(transactionManager);
    var removed = new java.util.concurrent.CountDownLatch(1);
    var release = new java.util.concurrent.CountDownLatch(1);
    try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
      var writer =
          pool.submit(
              () ->
                  tx.executeWithoutResult(
                      status -> {
                        jdbc.update("UPDATE listings SET status='DELETED' WHERE id=?", id);
                        removed.countDown();
                        try {
                          assertThat(release.await(10, java.util.concurrent.TimeUnit.SECONDS))
                              .isTrue();
                        } catch (InterruptedException ex) {
                          throw new IllegalStateException(ex);
                        }
                      }));
      assertThat(removed.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
      var creation = pool.submit(() -> accountLink.onListingCreated(stale));
      try {
        org.awaitility.Awaitility.await()
            .atMost(java.time.Duration.ofSeconds(5))
            .until(
                () ->
                    creation.isDone()
                        || jdbc.queryForObject(
                                "SELECT count(*) FROM pg_stat_activity WHERE"
                                    + " datname=current_database() AND wait_event_type='Lock'",
                                Long.class)
                            > 0);
        assertThat(
                jdbc.queryForObject(
                    "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND"
                        + " wait_event_type='Lock'",
                    Long.class))
            .isPositive();
      } finally {
        release.countDown();
      }
      writer.get(10, java.util.concurrent.TimeUnit.SECONDS);
      creation.get(10, java.util.concurrent.TimeUnit.SECONDS);
    }
    assertThat(
            jdbc.queryForObject(
                "SELECT current_listing_id FROM user_accounts WHERE source_listing_id=?",
                UUID.class,
                id))
        .isNull();
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM user_accounts WHERE source_listing_id=?", String.class, id))
        .isEqualTo("ACTIVE");
  }

  @org.springframework.boot.test.context.TestConfiguration
  @EnableWebMvc
  @EnableTransactionManagement
  @ComponentScan(
      value = {"uz.efbazaar.marketplace.sellertools", "uz.efbazaar.marketplace.sellerbulk"},
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
    org.springframework.orm.jpa.JpaTransactionManager transactionManager(
        jakarta.persistence.EntityManagerFactory emf, DataSource ds) {
      var tx = new org.springframework.orm.jpa.JpaTransactionManager(emf);
      tx.setDataSource(ds);
      return tx;
    }

    @Bean
    org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean entityManagerFactory(
        DataSource ds) {
      var factory = new org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean();
      factory.setDataSource(ds);
      factory.setPackagesToScan(
          "uz.efbazaar.marketplace.domain", "uz.efbazaar.marketplace.account");
      factory.setJpaVendorAdapter(
          new org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter());
      factory.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto", "none"));
      return factory;
    }

    @Bean
    jakarta.persistence.EntityManager entityManager(jakarta.persistence.EntityManagerFactory emf) {
      return org.springframework.orm.jpa.SharedEntityManagerCreator.createSharedEntityManager(emf);
    }

    @Bean
    ListingRepository listingRepository(jakarta.persistence.EntityManager em) {
      return new org.springframework.data.jpa.repository.support.JpaRepositoryFactory(em)
          .getRepository(ListingRepository.class);
    }

    @Bean
    UserAccountRepository userAccountRepository(jakarta.persistence.EntityManager em) {
      return new org.springframework.data.jpa.repository.support.JpaRepositoryFactory(em)
          .getRepository(UserAccountRepository.class);
    }

    @Bean
    uz.efbazaar.marketplace.event.MarketplaceEventPublisher events() {
      return mock(uz.efbazaar.marketplace.event.MarketplaceEventPublisher.class);
    }

    @Bean
    uz.efbazaar.marketplace.partner.ads.ChannelTakedown takedown() {
      return mock(uz.efbazaar.marketplace.partner.ads.ChannelTakedown.class);
    }

    @Bean
    uz.efbazaar.marketplace.recommendation.ListingValueScorer scorer() {
      return mock(uz.efbazaar.marketplace.recommendation.ListingValueScorer.class);
    }

    @Bean
    ListingCardInventory inventory(JdbcTemplate jdbc, ObjectMapper json) {
      return new ListingCardInventory(jdbc, json);
    }

    @Bean
    ListingPersistence persistence(
        ListingRepository repo,
        ListingCardInventory inventory,
        uz.efbazaar.marketplace.recommendation.ListingValueScorer scorer) {
      return new ListingPersistence(repo, inventory, scorer);
    }

    @Bean
    ListingService listingService(
        ListingRepository repo,
        ListingPersistence persistence,
        uz.efbazaar.marketplace.partner.ads.ChannelTakedown takedown,
        uz.efbazaar.marketplace.event.MarketplaceEventPublisher events) {
      return new ListingService(
          repo,
          mock(uz.efbazaar.marketplace.partner.ads.OfficialChannelService.class),
          mock(uz.efbazaar.marketplace.partner.ads.SoldPostMarker.class),
          takedown,
          new uz.efbazaar.marketplace.mapper.ListingMapperImpl(),
          mock(AttributeValidator.class),
          mock(MediaService.class),
          mock(ListingCaptionBuilder.class),
          events,
          mock(AttributeDefinitionRepository.class),
          mock(uz.efbazaar.marketplace.trust.BlacklistGuard.class),
          mock(uz.efbazaar.marketplace.partner.ads.ChannelPostService.class),
          persistence,
          mock(ListingMatchRepository.class),
          mock(uz.efbazaar.marketplace.security.AuthSummaryClient.class),
          mock(ListingAccountLink.class));
    }

    @Bean
    ListingAccountLink accountLink(
        UserAccountRepository accounts,
        ListingRepository listings,
        JdbcTemplate jdbc,
        ObjectMapper mapper) {
      return new ListingAccountLink(
          accounts,
          new UserAccountCardInventory(jdbc, mapper),
          listings,
          mock(PendingAccountEmailRepository.class),
          mock(AccountEmailUnlinks.class));
    }

    @Bean
    UserAccountPublisher publisher(UserAccountRepository accounts, ListingService listings) {
      return new UserAccountPublisher(accounts, listings);
    }

    @Bean
    ObjectMapper objectMapper() {
      return new ObjectMapper().findAndRegisterModules();
    }
  }
}
