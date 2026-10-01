package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingFilter;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.service.RankedListings;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(RankedListingsIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class RankedListingsIT {

    @Container @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired ListingRepository listings;

    private UUID listing(String price, ListingStatus status) {
        return listings.saveAndFlush(Listing.builder().sellerId(UUID.randomUUID()).description("d")
                .price(new BigDecimal(price)).priceNegotiable(false).status(status).build()).getId();
    }

    private static ListingFilter noFilter() {
        return new ListingFilter(null, null, null, null, Map.of(), false);
    }

    @Test
    void keepsCallerOrderDropsNonActiveMissingAndDuplicates() {
        UUID a = listing("100000", ListingStatus.ACTIVE);
        UUID sold = listing("100000", ListingStatus.SOLD);
        UUID b = listing("100000", ListingStatus.ACTIVE);
        UUID c = listing("100000", ListingStatus.ACTIVE);

        Page<Listing> page = RankedListings.page(listings,
                List.of(c, sold, UUID.randomUUID(), a, c, b), noFilter(), 0, 10);

        assertThat(page.getContent()).extracting(Listing::getId).containsExactly(c, a, b);
        assertThat(page.getTotalElements()).isEqualTo(3);
    }

    @Test
    void appliesFiltersAndPaginatesAfterFiltering() {
        UUID cheap = listing("50000", ListingStatus.ACTIVE);
        UUID p1 = listing("200000", ListingStatus.ACTIVE);
        UUID p2 = listing("300000", ListingStatus.ACTIVE);
        UUID p3 = listing("400000", ListingStatus.ACTIVE);
        ListingFilter minPrice = new ListingFilter(new BigDecimal("100000"), null, null, null, Map.of(), false);

        Page<Listing> second = RankedListings.page(listings, List.of(p3, cheap, p1, p2), minPrice, 1, 2);

        assertThat(second.getContent()).extracting(Listing::getId).containsExactly(p2);
        assertThat(second.getTotalElements()).isEqualTo(3);
        assertThat(second.getTotalPages()).isEqualTo(2);
    }

    @org.springframework.boot.autoconfigure.domain.EntityScan(basePackageClasses = Listing.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(basePackageClasses = ListingRepository.class)
    static class Config {}
}
