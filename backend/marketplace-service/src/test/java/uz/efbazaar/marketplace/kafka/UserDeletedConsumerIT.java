package uz.efbazaar.marketplace.kafka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.domain.Like;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.repository.LikeRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies that the {@code auth.user-deleted} orphan cleanup actually runs
 * against a real Postgres — the bulk update JPQL is easy to typo and the
 * mock-based unit tests can't catch a bad JPA path.
 *
 * <p>Requires Docker on the host. Skipped automatically when Testcontainers
 * cannot start a container (e.g. no Docker socket).
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(UserDeletedConsumerIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class UserDeletedConsumerIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired ListingRepository listings;
    @Autowired LikeRepository likes;

    private UUID victimUserId;
    private UUID bystanderUserId;

    @BeforeEach
    void seed() {
        victimUserId = UUID.randomUUID();
        bystanderUserId = UUID.randomUUID();

        // Victim owns two listings — one ACTIVE, one already SOLD (should stay SOLD).
        listings.save(listing(victimUserId, ListingStatus.ACTIVE));
        listings.save(listing(victimUserId, ListingStatus.SOLD));
        // Bystander's listing — must not be touched.
        listings.save(listing(bystanderUserId, ListingStatus.ACTIVE));

        // Likes belonging to victim + a bystander like.
        likes.save(Like.builder().userId(victimUserId).listingId(UUID.randomUUID()).build());
        likes.save(Like.builder().userId(victimUserId).listingId(UUID.randomUUID()).build());
        likes.save(Like.builder().userId(bystanderUserId).listingId(UUID.randomUUID()).build());
    }

    @Test
    void bulkPurgeClosesListingsAndDeletesLikes() {
        int listingsClosed = listings.softDeleteAllBySeller(victimUserId);
        int likesRemoved = likes.deleteAllByUserId(victimUserId);

        // Victim owns 2 listings (1 ACTIVE, 1 SOLD); softDeleteAllBySeller
        // filters to ACTIVE only (matches its own javadoc and the SOLD one's
        // "should stay SOLD" intent above), so only 1 is closed.
        assertThat(listingsClosed).isEqualTo(1);
        assertThat(likesRemoved).isEqualTo(2);

        // Bystander state untouched
        long bystanderActive = listings.findByStatus(ListingStatus.ACTIVE,
                org.springframework.data.domain.PageRequest.of(0, 10)).getTotalElements();
        assertThat(bystanderActive).isEqualTo(1);
    }

    private static Listing listing(UUID sellerId, ListingStatus status) {
        return Listing.builder()
                .sellerId(sellerId)
                .description("test listing owned by " + sellerId)
                .price(new BigDecimal("100000"))
                .priceNegotiable(false)
                .status(status)
                .build();
    }

    /** Minimal config that pulls only the repositories under test into the slice. */
    @org.springframework.boot.autoconfigure.domain.EntityScan(basePackageClasses = Listing.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(basePackageClasses = ListingRepository.class)
    static class Config {}
}
