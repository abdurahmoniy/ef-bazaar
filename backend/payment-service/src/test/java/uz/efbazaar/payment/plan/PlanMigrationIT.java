package uz.efbazaar.payment.plan;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Prices and slot counts belong to the admin after the first deploy.
 *
 * <p>The repeatable migration re-runs whenever its content changes; if it still
 * wrote these values, the next unrelated edit to it would quietly put every
 * admin decision back to the shipped defaults.
 */
@SpringBootTest
class PlanMigrationIT extends AbstractPostgresIT {

    @Autowired JdbcTemplate jdbc;
    @Autowired Flyway flyway;

    @Test
    void theShippedPricesAreSeeded() {
        assertThat(jdbc.queryForObject("SELECT active FROM plans WHERE code='MAX'", Boolean.class))
                .as("MAX remains for historical references but is not a public product").isFalse();
        assertThat(jdbc.queryForObject(
                "SELECT price_tiyin FROM plan_prices WHERE plan_code='PRO' AND period='MONTH'", Long.class))
                .isEqualTo(3_000_000L);
        assertThat(jdbc.queryForObject(
                "SELECT price_tiyin FROM plan_prices WHERE plan_code='MAX' AND period='YEAR'", Long.class))
                .isEqualTo(25_000_000L);
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM plan_prices WHERE plan_code='STANDARD'", Long.class))
                .as("the free plan is not for sale").isZero();
    }

    @Test
    void theRepeatableMigrationDoesNotOwnAdminManagedValues() {
        jdbc.update("UPDATE plan_entitlements SET value='7' WHERE plan_code='PRO' AND key='mailbox.slots'");
        jdbc.update("UPDATE plan_prices SET price_tiyin=1234500 WHERE plan_code='PRO' AND period='MONTH'");
        try {
            // Forces every repeatable to run again, as a content change would.
            jdbc.update("DELETE FROM flyway_schema_history WHERE type='SQL' AND version IS NULL");
            flyway.migrate();

            assertThat(jdbc.queryForObject(
                    "SELECT value FROM plan_entitlements WHERE plan_code='PRO' AND key='mailbox.slots'",
                    String.class)).isEqualTo("7");
            assertThat(jdbc.queryForObject(
                    "SELECT price_tiyin FROM plan_prices WHERE plan_code='PRO' AND period='MONTH'",
                    Long.class)).isEqualTo(1_234_500L);
        } finally {
            jdbc.update("UPDATE plan_entitlements SET value='5' WHERE plan_code='PRO' AND key='mailbox.slots'");
            jdbc.update("UPDATE plan_prices SET price_tiyin=3000000 WHERE plan_code='PRO' AND period='MONTH'");
        }
    }

    @Test
    void upgradingFromV16KeepsLegacySubscriptionsPurchasesAndForeignKeys() {
        String schema = "catalog_upgrade_" + java.util.UUID.randomUUID().toString().replace("-", "");
        var dataSource = flyway.getConfiguration().getDataSource();
        try {
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
                    .target("16").load().migrate();
            java.util.UUID user = java.util.UUID.randomUUID();
            java.util.UUID purchase = java.util.UUID.randomUUID();
            jdbc.update("INSERT INTO " + schema + ".user_subscriptions (user_id, plan_code) VALUES (?, 'MAX')", user);
            jdbc.update("INSERT INTO " + schema + ".plan_purchases "
                    + "(id,user_id,plan_code,period,price_tiyin,starts_at,expires_at,ledger_tx_id,idempotency_key) "
                    + "VALUES (?,?,'MAX','YEAR',25000000,now(),now()+interval '1 year',?,?)",
                    purchase, user, java.util.UUID.randomUUID(), purchase.toString());
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
                    .target("17").load().migrate();
            assertThat(jdbc.queryForObject("SELECT active FROM " + schema + ".plans WHERE code='MAX'", Boolean.class))
                    .isFalse();
            assertThat(jdbc.queryForObject("SELECT plan_code FROM " + schema + ".user_subscriptions WHERE user_id=?",
                    String.class, user)).isEqualTo("MAX");
            assertThat(jdbc.queryForObject("SELECT price_tiyin FROM " + schema + ".plan_purchases WHERE id=?",
                    Long.class, purchase)).isEqualTo(25_000_000);
            assertThat(jdbc.queryForObject("SELECT price_tiyin FROM " + schema
                    + ".plan_prices WHERE plan_code='PRO' AND period='MONTH'", Long.class)).isEqualTo(3_000_000);
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }
}
