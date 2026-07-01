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
    public DataSource dataSource(
            @Qualifier("marketplaceDataSourceProperties") DataSourceProperties props) {
        return props.initializeDataSourceBuilder()
                .type(HikariDataSource.class)
                .build();
    }

    // ---------- Secondary (efbazaar — cards) ----------

    @Bean("efbazaarDataSourceProperties")
    @ConfigurationProperties("app.cards.datasource")
    public DataSourceProperties efbazaarDataSourceProperties() {
        return new DataSourceProperties();
    }

    @Bean("efbazaarDataSource")
    public DataSource efbazaarDataSource(
            @Qualifier("efbazaarDataSourceProperties") DataSourceProperties props) {
        HikariDataSource ds = props.initializeDataSourceBuilder()
                .type(HikariDataSource.class)
                .build();
        ds.setMaximumPoolSize(8);
        ds.setPoolName("efbazaar-cards-pool");
        return ds;
    }

    @Bean("efbazaarJdbcTemplate")
    public JdbcTemplate efbazaarJdbcTemplate(@Qualifier("efbazaarDataSource") DataSource ds) {
        return new JdbcTemplate(ds);
    }
}
