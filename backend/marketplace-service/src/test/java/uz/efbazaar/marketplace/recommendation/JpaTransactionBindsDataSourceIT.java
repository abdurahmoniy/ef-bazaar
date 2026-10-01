package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.repository.ListingRepository;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The outbox library refuses to write unless its DataSource is bound to the current
 * transaction. This proves a marketplace JPA transaction binds the primary DataSource;
 * if it did not, every outbox call in marketplace would throw.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(JpaTransactionBindsDataSourceIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class JpaTransactionBindsDataSourceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired ListingRepository listings;
    @Autowired DataSource dataSource;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void jpaTransactionBindsThePrimaryDataSource() {
        assertThat(transactionManager).isInstanceOf(JpaTransactionManager.class);

        Boolean bound = new TransactionTemplate(transactionManager).execute(status -> {
            listings.count();
            return TransactionSynchronizationManager.hasResource(dataSource);
        });

        assertThat(bound).isTrue();
    }

    @org.springframework.boot.autoconfigure.domain.EntityScan(basePackageClasses = Listing.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(basePackageClasses = ListingRepository.class)
    static class Config {}
}
