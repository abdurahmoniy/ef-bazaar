package uz.efbazaar.marketplace.analytics.seller;

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

@SpringJUnitConfig(SellerAnalyticsIT.Config.class)
@WebAppConfiguration
@Testcontainers
class SellerAnalyticsIT {
  static final Instant TEST_NOW = Instant.now().plusSeconds(60);

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
  }

  @Test
  void basicCountsAreAvailableWithoutPaidSnapshotAndAnonymousIsRejected() throws Exception {
    listing(user, "one");
    listing(UUID.randomUUID(), "foreign");
    mvc.perform(get("/api/v1/seller-analytics/summary").header("X-User-Id", user))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.listingCount").value(1))
        .andExpect(jsonPath("$.capabilities.status").value("UNAVAILABLE"));
    mvc.perform(get("/api/v1/seller-analytics/summary")).andExpect(status().isForbidden());
  }

  @Test
  void firstViewsSavesAndRequestsUseRealSourceIdentity() throws Exception {
    UUID id = listing(user, "metrics"), other = listing(user, "other");
    UUID buyer = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO listing_views(listing_id,viewer_key) VALUES (?,?) ON CONFLICT DO NOTHING",
        id,
        "user:" + buyer);
    jdbc.update(
        "INSERT INTO listing_views(listing_id,viewer_key) VALUES (?,?) ON CONFLICT DO NOTHING",
        id,
        "user:" + buyer);
    jdbc.update(
        "INSERT INTO listing_views(listing_id,viewer_key) VALUES (?,?)", id, "user:" + user);
    like(id, buyer);
    jdbc.update("DELETE FROM listing_likes WHERE listing_id=? AND user_id=?", id, buyer);
    like(id, buyer);
    like(id, user);
    UUID chat = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO chats(id,listing_id,buyer_id,seller_id,created_at) VALUES"
            + " (?,?,?,?,now()-interval '2 years')",
        chat,
        id,
        buyer,
        user);
    request(chat, id, buyer);
    request(chat, id, buyer);
    request(chat, other, buyer);
    request(chat, id, user);
    paid("PRO", "90", "true", null);
    JsonNode r = report(7);
    assertThat(r.path("totals").path("uniqueViews").asInt()).isEqualTo(1);
    assertThat(r.path("totals").path("saveAdditions").asInt()).isEqualTo(2);
    assertThat(r.path("totals").path("inquiries").asInt()).isEqualTo(2);
    mvc.perform(get("/api/v1/seller-analytics/summary").header("X-User-Id", user))
        .andExpect(jsonPath("$.uniqueViews").value(1))
        .andExpect(jsonPath("$.currentFavorites").value(1))
        .andExpect(jsonPath("$.inquiries").value(2));
  }

  @Test
  void freeExpiredMissingMalformedAndStaffPolicyAreFailClosed() throws Exception {
    paid("STANDARD", "0", "false", null);
    getReport(7).andExpect(status().isForbidden());
    paid("PRO", "90", "true", Instant.now().minusSeconds(1));
    getReport(7).andExpect(status().isForbidden());
    paid("PRO", null, "true", null);
    getReport(7).andExpect(status().isServiceUnavailable());
    paid("PRO", "true", "true", null);
    getReport(7).andExpect(status().isServiceUnavailable());
    paid("PRO", "90", "garbage", null);
    getReport(7).andExpect(status().isServiceUnavailable());
    paid("STAFF", null, "true", null);
    getReport(90).andExpect(status().isOk());
    paid("MAX", "90", "true", null);
    getReport(90).andExpect(status().isOk());
    jdbc.update(
        "UPDATE plan_projection_state SET occurred_at=now()-interval '25 hours' WHERE kind='user'"
            + " AND entity_id=?",
        user.toString());
    getReport(7).andExpect(status().isServiceUnavailable());
  }

  @Test
  void ownershipStatusAllPageExportAndCsvEscaping() throws Exception {
    paid("PRO", "90", "true", null);
    UUID own = listing(user, "  =SUM(1,2)\nnext");
    for (int i = 0; i < 52; i++) listing(user, "row" + i);
    UUID foreign = listing(UUID.randomUUID(), "secret"), hidden = listing(user, "hidden");
    jdbc.update("UPDATE listings SET status='BLOCKED' WHERE id=?", hidden);
    mvc.perform(
            get("/api/v1/seller-analytics/report?days=7&listingId=" + foreign)
                .header("X-User-Id", user))
        .andExpect(status().isNotFound());
    mvc.perform(
            get("/api/v1/seller-analytics/report?days=7&listingId=" + hidden)
                .header("X-User-Id", user))
        .andExpect(status().isNotFound());
    JsonNode r = report(7);
    assertThat(r.path("totalListings").asInt()).isEqualTo(53);
    assertThat(r.path("listings")).hasSize(50);
    var csv =
        mvc.perform(get("/api/v1/seller-analytics/export?days=7").header("X-User-Id", user))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(csv)
        .contains("'  =SUM(1,2) next", own.toString(), "row51")
        .doesNotContain("secret", "hidden");
  }

  @Test
  void exactRangesSamarkandBoundaryFutureEventsAndTradeFacts() throws Exception {
    paid("PRO", "90", "true", null);
    UUID id = listing(user, "range");
    LocalDate today = TEST_NOW.atZone(ZoneId.of("Asia/Samarkand")).toLocalDate();
    for (int age : List.of(0, 6, 7, 29, 30, 89, 90)) {
      Instant at = today.minusDays(age).atStartOfDay(ZoneId.of("Asia/Samarkand")).toInstant();
      jdbc.update(
          "INSERT INTO listing_views(listing_id,viewer_key,created_at) VALUES (?,?,?)",
          id,
          "guest:" + UUID.randomUUID(),
          java.sql.Timestamp.from(at));
    }
    jdbc.update(
        "INSERT INTO listing_views(listing_id,viewer_key,created_at) VALUES (?,?,now()+interval '1"
            + " hour')",
        id,
        "guest:" + UUID.randomUUID());
    assertThat(report(7).path("totals").path("uniqueViews").asInt()).isEqualTo(2);
    assertThat(report(30).path("totals").path("uniqueViews").asInt()).isEqualTo(4);
    assertThat(report(90).path("totals").path("uniqueViews").asInt()).isEqualTo(6);
    assertThat(report(90).path("daily").get(0).path("date").asText())
        .isEqualTo(today.minusDays(89).toString());
  }

  void like(UUID id, UUID buyer) {
    jdbc.update("INSERT INTO listing_likes(listing_id,user_id) VALUES (?,?)", id, buyer);
  }

  void request(UUID chat, UUID id, UUID buyer) {
    jdbc.update(
        "INSERT INTO chat_account_requests(chat_id,listing_id,requester_id,status,closed_at) VALUES"
            + " (?,?,?,'CANCELLED',now())",
        chat,
        id,
        buyer);
  }

  void paid(String code, String days, String export, Instant expiry) {
    var grants = new HashMap<String, String>();
    grants.put("analytics.history_days", days);
    grants.put("analytics.export", export);
    plans.replacePlan(code, grants, System.nanoTime(), UUID.randomUUID().toString(), Instant.now());
    plans.userMoved(
        user, code, expiry, System.nanoTime(), UUID.randomUUID().toString(), Instant.now());
  }

  ResultActions getReport(int days) throws Exception {
    return mvc.perform(
        get("/api/v1/seller-analytics/report?days=" + days).header("X-User-Id", user));
  }

  JsonNode report(int days) throws Exception {
    return json.readTree(
        getReport(days).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
  }

  @Test
  void durableTradeFactsDeduplicateDeferAndNeverTreatSwapsAsRevenue() throws Exception {
    paid("PRO", "90", "true", null);
    UUID listing = listing(user, "source price differs");
    jdbc.update("UPDATE listings SET price=1 WHERE id=?", listing);
    for (String kind : List.of("SALE", "SWAP", "SWAP_SURCHARGE")) {
      UUID trade = UUID.randomUUID();
      var event = completion(trade, listing, user, kind, 9_007_199_254_740_993L);
      accept(event);
      accept(event);
      var conflict = new HashMap<>(event);
      conflict.put("priceUzs", 1L);
      accept(conflict);
    }
    JsonNode r = report(7);
    assertThat(r.path("totals").path("completedTrades").asInt()).isEqualTo(3);
    assertThat(r.path("totals").path("grossSalesUzs").asText()).isEqualTo("9007199254740993");
    assertThat(r.path("listings").get(0).path("grossSalesUzs").asText())
        .isEqualTo("9007199254740993");
    UUID delayed = UUID.randomUUID();
    accept(completion(UUID.randomUUID(), delayed, user, "SALE", 7));
    assertThat(report(7).path("totals").path("completedTrades").asInt()).isEqualTo(3);
    jdbc.update(
        "INSERT INTO listings(id,seller_id,description,price,status) VALUES"
            + " (?,?,'late',999,'ACTIVE')",
        delayed,
        user);
    context.getBean(SellerTradeCompletionConsumer.class).retryPending();
    assertThat(report(7).path("totals").path("grossSalesUzs").asText())
        .isEqualTo("9007199254741000");
    var malformed = completion(UUID.randomUUID(), listing, user, "SALE", 2);
    malformed.remove("kind");
    assertThatThrownBy(() -> accept(malformed)).isInstanceOf(IllegalArgumentException.class);
    assertThat(report(7).path("totals").path("completedTrades").asInt()).isEqualTo(4);
    assertThat(
            jdbc.queryForObject(
                "SELECT sum(completed_trades) FROM seller_analytics_daily WHERE seller_id=?",
                Long.class,
                user))
        .isEqualTo(4);
  }

  @Test
  void sourceRollbackAndConcurrentDuplicatesDoNotInflateDailyRollups() throws Exception {
    paid("PRO", "90", "true", null);
    UUID listing = listing(user, "parallel"), buyer = UUID.randomUUID();
    var tx =
        new org.springframework.transaction.support.TransactionTemplate(
            new DataSourceTransactionManager(jdbc.getDataSource()));
    tx.executeWithoutResult(
        status -> {
          like(listing, buyer);
          status.setRollbackOnly();
        });
    try (var pool = java.util.concurrent.Executors.newFixedThreadPool(4)) {
      var futures = new ArrayList<java.util.concurrent.Future<?>>();
      for (int i = 0; i < 12; i++)
        futures.add(
            pool.submit(
                () ->
                    jdbc.update(
                        "INSERT INTO listing_views(listing_id,viewer_key) VALUES (?,?) ON CONFLICT"
                            + " DO NOTHING",
                        listing,
                        "user:" + buyer)));
      for (var future : futures) future.get(10, java.util.concurrent.TimeUnit.SECONDS);
    }
    var r = report(7);
    assertThat(r.path("totals").path("uniqueViews").asInt()).isEqualTo(1);
    assertThat(r.path("totals").path("saveAdditions").asInt()).isZero();
    jdbc.update("UPDATE listings SET seller_id=? WHERE id=?", UUID.randomUUID(), listing);
    assertThat(report(7).path("totals").path("uniqueViews").asInt()).isZero();
  }

  Map<String, Object> completion(UUID trade, UUID listing, UUID seller, String kind, long price) {
    var e = new HashMap<String, Object>();
    e.put("idempotencyKey", "seller-trade-completed:" + trade);
    e.put("tradeId", trade);
    e.put("listingId", listing);
    e.put("sellerId", seller);
    e.put("buyerId", UUID.randomUUID());
    e.put("kind", kind);
    e.put("mode", "HUMAN");
    e.put("priceUzs", price);
    e.put("completedAt", Instant.now());
    return e;
  }

  void accept(Map<String, Object> event) throws Exception {
    context
        .getBean(SellerTradeCompletionConsumer.class)
        .onCompleted(json.writeValueAsString(event));
  }

  @Test
  void blockedReceiptsCannotStarveHealthyCompletionBehindFirstHundred() throws Exception {
    paid("PRO", "90", "true", null);
    for (int i = 0; i < 100; i++)
      accept(completion(UUID.randomUUID(), UUID.randomUUID(), user, "SALE", 1));
    UUID listing = listing(user, "healthy");
    accept(completion(UUID.randomUUID(), listing, user, "SALE", 9));
    assertThat(report(7).path("totals").path("completedTrades").asInt()).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM seller_analytics_trade_receipts WHERE seller_id=? AND"
                    + " applied_at IS NULL",
                Long.class,
                user))
        .isEqualTo(100);
  }

  @Test
  void reportCoverageReflectsSelectedCollectionWindow() throws Exception {
    paid("PRO", "90", "true", null);
    Instant original =
        jdbc.queryForObject(
                "SELECT started_at FROM seller_analytics_collection", java.sql.Timestamp.class)
            .toInstant();
    try {
      assertThat(report(7).path("coverage").path("historyPartial").asBoolean()).isTrue();
      jdbc.update("UPDATE seller_analytics_collection SET started_at=now()-interval '100 days'");
      assertThat(report(90).path("coverage").path("historyPartial").asBoolean()).isFalse();
    } finally {
      jdbc.update(
          "UPDATE seller_analytics_collection SET started_at=?", java.sql.Timestamp.from(original));
    }
  }

  @Test
  void changedListingOwnerNeverGetsPriorSellersFactsInBasicSummary() throws Exception {
    UUID listing = listing(user, "old owner");
    jdbc.update(
        "INSERT INTO listing_views(listing_id,viewer_key) VALUES (?,?)",
        listing,
        "guest:" + UUID.randomUUID());
    UUID next = UUID.randomUUID();
    jdbc.update("UPDATE listings SET seller_id=? WHERE id=?", next, listing);
    mvc.perform(get("/api/v1/seller-analytics/summary").header("X-User-Id", next))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.uniqueViews").value(0));
  }

  @Test
  void malformedNumericSourceAmountsCannotBeCoercedIntoRevenue() throws Exception {
    paid("PRO", "90", "true", null);
    UUID listing = listing(user, "bad amount");
    for (Object price : List.of(1.25, "123")) {
      var event = completion(UUID.randomUUID(), listing, user, "SALE", 1);
      event.put("priceUzs", price);
      assertThatThrownBy(() -> accept(event)).isInstanceOf(IllegalArgumentException.class);
    }
    assertThat(report(7).path("totals").path("completedTrades").asInt()).isZero();
  }

  UUID listing(UUID seller, String title) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO listings(id,seller_id,description,price,status) VALUES (?,?,?,100,'ACTIVE')",
        id,
        seller,
        title);
    return id;
  }

  @Configuration
  @EnableWebMvc
  @EnableTransactionManagement
  @ComponentScan(
      value = "uz.efbazaar.marketplace.analytics.seller",
      excludeFilters =
          @ComponentScan.Filter(
              type = FilterType.ASSIGNABLE_TYPE,
              classes = SellerAnalyticsService.class))
  @Import({
    SecurityConfig.class,
    HeaderAuthenticationFilter.class,
    InternalSecretFilter.class,
    GlobalExceptionHandler.class,
    PlanProjection.class
  })
  static class Config {
    @Bean
    SellerAnalyticsService sellerAnalyticsService(JdbcTemplate jdbc, PlanProjection plans) {
      return new SellerAnalyticsService(jdbc, plans, Clock.fixed(TEST_NOW, ZoneOffset.UTC));
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
