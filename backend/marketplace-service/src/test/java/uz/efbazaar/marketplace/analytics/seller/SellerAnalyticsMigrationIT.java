package uz.efbazaar.marketplace.analytics.seller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;

@Testcontainers
class SellerAnalyticsMigrationIT {
  @Container
  static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

  @Test
  void upgradeBackfillsOnlyExistingFirstViewsAndFirstPerListingRequests() {
    var ds =
        new DriverManagerDataSource(
            postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
    Flyway.configure().dataSource(ds).target("82").load().migrate();
    var jdbc = new JdbcTemplate(ds);
    UUID listing = UUID.randomUUID(),
        seller = UUID.randomUUID(),
        buyer = UUID.randomUUID(),
        chat = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO listings(id,seller_id,description,price,status) VALUES"
            + " (?,?,'historical',100,'ACTIVE')",
        listing,
        seller);
    jdbc.update(
        "INSERT INTO listing_views(listing_id,viewer_key,created_at) VALUES (?,?,now()-interval '20"
            + " days')",
        listing,
        "user:" + buyer);
    jdbc.update(
        "INSERT INTO listing_likes(listing_id,user_id,created_at) VALUES (?,?,now()-interval '20"
            + " days')",
        listing,
        buyer);
    jdbc.update(
        "INSERT INTO chats(id,listing_id,buyer_id,seller_id,created_at) VALUES"
            + " (?,?,?,?,now()-interval '60 days')",
        chat,
        listing,
        buyer,
        seller);
    jdbc.update(
        "INSERT INTO"
            + " chat_account_requests(chat_id,listing_id,requester_id,status,created_at,closed_at)"
            + " VALUES (?,?,?,'CANCELLED',now()-interval '10"
            + " days',now()),(?,?,?,'CANCELLED',now()-interval '5 days',now())",
        chat,
        listing,
        buyer,
        chat,
        listing,
        buyer);
    Flyway.configure().dataSource(ds).load().migrate();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM seller_analytics_facts", Long.class))
        .isEqualTo(2);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM seller_analytics_facts WHERE metric IN ('SAVE','TRADE')",
                Long.class))
        .isZero();
    assertThat(
            jdbc.queryForObject("SELECT sum(unique_views) FROM seller_analytics_daily", Long.class))
        .isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT sum(inquiries) FROM seller_analytics_daily", Long.class))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT occurred_at=(SELECT min(created_at) FROM chat_account_requests) FROM"
                    + " seller_analytics_facts WHERE metric='INQUIRY'",
                Boolean.class))
        .isTrue();
  }
}
