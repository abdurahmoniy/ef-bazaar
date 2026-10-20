package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.service.ListingSorts;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
// Dispose the Spring context while its class-owned database is still running.
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
@Import(ValueScoreSortIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class ValueScoreSortIT {

    @Container @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired ListingRepository listings;
    @Autowired JdbcTemplate jdbc;

    private UUID listing(Double score) {
        Listing saved = listings.save(Listing.builder().sellerId(UUID.randomUUID()).description("d")
                .price(new BigDecimal("100000")).priceNegotiable(false).status(ListingStatus.ACTIVE).build());
        listings.flush();
        jdbc.update("UPDATE listings SET value_score = ? WHERE id = ?", score, saved.getId());
        return saved.getId();
    }

    @Test
    void highestFirstNullsLastAndTiesStableById() {
        UUID low = listing(0.1);
        UUID nul = listing(null);
        UUID tieA = listing(0.5);
        UUID tieB = listing(0.5);
        UUID high = listing(0.9);

        Page<Listing> page = listings.findAll(
                ListingSorts.orderByValueScore(Sort.Direction.DESC, false), PageRequest.of(0, 10));

        java.util.List<UUID> ties = jdbc.queryForList(
                "SELECT id FROM listings WHERE value_score = 0.5 ORDER BY id", UUID.class);
        assertThat(ties).containsExactlyInAnyOrder(tieA, tieB);
        assertThat(page.getTotalElements()).isEqualTo(5);
        assertThat(page.getContent()).extracting(Listing::getId)
                .containsExactly(high, ties.get(0), ties.get(1), low, nul);
    }

    @Test
    void paginationCoversEveryListingExactlyOnce() {
        java.util.List<UUID> all = new java.util.ArrayList<>(java.util.List.of(
                listing(0.1), listing(null), listing(0.5), listing(0.5), listing(0.9)));
        java.util.List<UUID> seen = new java.util.ArrayList<>();
        for (int p = 0; p < 3; p++) {
            listings.findAll(ListingSorts.orderByValueScore(Sort.Direction.DESC, false), PageRequest.of(p, 2))
                    .forEach(l -> seen.add(l.getId()));
        }
        assertThat(seen).containsExactlyInAnyOrderElementsOf(all);
    }

    @org.springframework.boot.autoconfigure.domain.EntityScan(basePackageClasses = Listing.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(basePackageClasses = ListingRepository.class)
    static class Config {}
}
