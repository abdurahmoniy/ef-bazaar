package uz.efbazaar.marketplace.cards;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.context.ConfigurationPropertiesAutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Production Postgres has max_connections=50 shared by every service. The pool
 * sizes in application.yml are that budget; when the hand-built data sources
 * ignored them (Hikari default 10 and a hard-coded 8), marketplace held 18
 * connections instead of 12 and backups and deploys were refused with
 * "too many clients already".
 */
class EfbazaarDataSourceConfigTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(ConfigurationPropertiesAutoConfiguration.class))
            .withUserConfiguration(EfbazaarDataSourceConfig.class)
            .withPropertyValues(
                    "spring.datasource.url=jdbc:postgresql://localhost:5432/marketplace_db",
                    "spring.datasource.username=u",
                    "spring.datasource.password=p",
                    "spring.datasource.hikari.maximum-pool-size=8",
                    "app.cards.datasource.url=jdbc:postgresql://localhost:5432/efbazaar",
                    "app.cards.datasource.username=u",
                    "app.cards.datasource.password=p",
                    "app.cards.datasource.hikari.maximum-pool-size=4",
                    "app.cards.datasource.hikari.max-lifetime=600000");

    @Test
    void theMarketplacePoolUsesTheConfiguredSize() {
        runner.run(ctx -> {
            HikariDataSource ds = (HikariDataSource) ctx.getBean("dataSource");
            assertThat(ds.getMaximumPoolSize()).isEqualTo(8);
        });
    }

    @Test
    void theCardsPoolUsesTheConfiguredSizeAndLifetime() {
        runner.run(ctx -> {
            HikariDataSource ds = (HikariDataSource) ctx.getBean("efbazaarDataSource");
            assertThat(ds.getMaximumPoolSize()).isEqualTo(4);
            assertThat(ds.getMaxLifetime()).isEqualTo(600_000L);
            assertThat(ds.getPoolName()).isEqualTo("efbazaar-cards-pool");
        });
    }
}
