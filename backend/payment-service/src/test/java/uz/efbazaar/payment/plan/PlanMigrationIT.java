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
        assertThat(jdbc.queryForObject(
                "SELECT price_tiyin FROM plan_prices WHERE plan_code='PRO' AND period='MONTH'", Long.class))
                .isEqualTo(1_000_000L);
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
            jdbc.update("UPDATE plan_prices SET price_tiyin=1000000 WHERE plan_code='PRO' AND period='MONTH'");
        }
    }
}
