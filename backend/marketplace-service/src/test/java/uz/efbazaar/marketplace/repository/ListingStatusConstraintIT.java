package uz.efbazaar.marketplace.repository;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Every listing status the code can write must survive {@code chk_listings_status}.
 *
 * <p>V1 enumerated ACTIVE/SOLD/DELETED; BLOCKED was added to {@code ListingStatus}
 * for the trust blacklist without a migration, so blocking a seller who had
 * ACTIVE listings failed the CHECK and rolled the whole block back — in
 * production only, because the other trust tests run on {@code ddl-auto} or
 * hand-built schemas. Same failure shape as {@code NotificationTypeConstraintIT}.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(ListingStatusConstraintIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class ListingStatusConstraintIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired ListingRepository listings;
    @Autowired JdbcTemplate jdbc;

    private UUID listingOf(UUID seller) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listings (id, seller_id, description, price, status)
                VALUES (?, ?, 'd', 100000, 'ACTIVE')""", id, seller);
        return id;
    }

    private String statusOf(UUID id) {
        return jdbc.queryForObject("SELECT status FROM listings WHERE id = ?", String.class, id);
    }

    @Test
    void theConstraintAcceptsEveryStatusTheCodeCanWrite() {
        UUID seller = UUID.randomUUID();
        UUID id = listingOf(seller);
        ListingStatus current = ListingStatus.ACTIVE;
        for (ListingStatus next : ListingStatus.values()) {
            ListingStatus from = current;
            assertThatCode(() -> listings.retagBySellerAndStatus(seller, from, next))
                    .as("%s is in ListingStatus but not in chk_listings_status", next)
                    .doesNotThrowAnyException();
            assertThat(statusOf(id)).isEqualTo(next.name());
            current = next;
        }
    }

    @Test
    void blacklistHidesAndRestoresActiveListings() {
        UUID seller = UUID.randomUUID();
        UUID id = listingOf(seller);

        assertThat(listings.retagBySellerAndStatus(seller, ListingStatus.ACTIVE, ListingStatus.BLOCKED)).isEqualTo(1);
        assertThat(statusOf(id)).isEqualTo("BLOCKED");

        assertThat(listings.retagBySellerAndStatus(seller, ListingStatus.BLOCKED, ListingStatus.ACTIVE)).isEqualTo(1);
        assertThat(statusOf(id)).isEqualTo("ACTIVE");
    }

    /** Minimal config that pulls only the repository under test into the slice. */
    @org.springframework.boot.autoconfigure.domain.EntityScan(basePackageClasses = Listing.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(basePackageClasses = ListingRepository.class)
    static class Config {}
}
