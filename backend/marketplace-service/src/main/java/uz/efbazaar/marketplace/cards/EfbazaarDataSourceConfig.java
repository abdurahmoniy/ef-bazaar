package uz.efbazaar.marketplace.cards;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

/**
 * Multi-DataSource config:
 *  - PRIMARY  : marketplace_db (JPA, Flyway, transactions)
 *  - SECONDARY: efbazaar  (card picker reads + nightly sync writes via JdbcTemplate)
 *
 * Note: Spring Boot's DataSourceAutoConfiguration backs off when any DataSource
 * bean is declared, so we define the primary one here explicitly too.
 *
 * <p>{@code initializeDataSourceBuilder()} does NOT apply the {@code hikari.*}
 * keys — they are bound onto each pool with {@code @ConfigurationProperties}
 * below. Without that, marketplace_db ran Hikari's default 10 and the cards
 * pool a hard-coded 8: 18 connections instead of the budgeted 12, and with
 * Postgres capped at max_connections=50 for every service that was enough to
 * refuse backups and deploys ("too many clients already").
 */
@Configuration
public class EfbazaarDataSourceConfig {

    // ---------- Primary (marketplace_db) ----------

    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource")
    public DataSourceProperties marketplaceDataSourceProperties() {
        return new DataSourceProperties();
    }

    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource.hikari")
    public HikariDataSource dataSource(
            @Qualifier("marketplaceDataSourceProperties") DataSourceProperties props) {
        return props.initializeDataSourceBuilder()
                .type(HikariDataSource.class)
                .build();
    }

    @Bean("marketplaceJdbcTemplate")
    @Primary
    public JdbcTemplate marketplaceJdbcTemplate(
            @Qualifier("dataSource") DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }

    // ---------- Secondary (efbazaar — cards) ----------

    @Bean("efbazaarDataSourceProperties")
    @ConfigurationProperties("app.cards.datasource")
    public DataSourceProperties efbazaarDataSourceProperties() {
        return new DataSourceProperties();
    }

    @Bean("efbazaarDataSource")
    @ConfigurationProperties("app.cards.datasource.hikari")
    public HikariDataSource efbazaarDataSource(
            @Qualifier("efbazaarDataSourceProperties") DataSourceProperties props) {
        HikariDataSource ds = props.initializeDataSourceBuilder()
                .type(HikariDataSource.class)
                .build();
        ds.setPoolName("efbazaar-cards-pool");
        return ds;
    }

    @Bean("efbazaarJdbcTemplate")
    public JdbcTemplate efbazaarJdbcTemplate(@Qualifier("efbazaarDataSource") DataSource ds) {
        return new JdbcTemplate(ds);
    }
}
