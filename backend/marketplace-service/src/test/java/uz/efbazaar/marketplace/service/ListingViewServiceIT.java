package uz.efbazaar.marketplace.service;

import org.flywaydb.core.Flyway;
import org.hibernate.cfg.Configuration;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;

import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/** Uses Testcontainers by default, or an isolated DB supplied via listing.views.test.jdbc-url. */
class ListingViewServiceIT {
    private static PostgreSQLContainer<?> postgres;
    private static String url;
    private static String user;
    private static String password;
    private static JdbcTemplate jdbc;
    private static UUID oldListing;
    private static final UUID SELLER = UUID.randomUUID();

    @BeforeAll
    static void migrateExistingDatabase() {
        url = System.getProperty("listing.views.test.jdbc-url");
        user = System.getProperty("listing.views.test.username", "postgres");
        password = System.getProperty("listing.views.test.password", "");
        if (url == null) {
            postgres = new PostgreSQLContainer<>("postgres:16-alpine");
            postgres.start();
            url = postgres.getJdbcUrl();
            user = postgres.getUsername();
            password = postgres.getPassword();
        }
        jdbc = new JdbcTemplate(new DriverManagerDataSource(url, user, password));
        Flyway.configure().dataSource(url, user, password).target("57").load().migrate();
        oldListing = insertListing();
        Flyway.configure().dataSource(url, user, password).target("58").load().migrate();
        jdbc.update("UPDATE listings SET view_count = 12 WHERE id = ?", oldListing);
        Flyway.configure().dataSource(url, user, password).load().migrate();
    }

    @AfterAll
    static void stopDatabase() {
        if (postgres != null) postgres.stop();
    }

    @Test
    void migrationStartsExistingAndNewListingsAtZero() {
        assertThat(count(oldListing)).isZero();
        assertThat(jdbc.queryForObject("SELECT view_count FROM listings WHERE id = ?", Long.class, oldListing)).isEqualTo(12);
        assertThat(count(insertListing())).isZero();
    }

    @Test
    void simultaneousViewsPersistEveryIncrementWithoutChangingEditTime() throws Exception {
        UUID id = insertListing();
        var updatedAt = jdbc.queryForObject("SELECT updated_at FROM listings WHERE id = ?", java.sql.Timestamp.class, id);
        ListingViewService service = serviceFor(id);
        var visits = new ArrayList<Callable<Long>>();
        for (int i = 0; i < 40; i++) visits.add(() -> service.recordView(id, UUID.randomUUID(), null));
        try (var executor = Executors.newFixedThreadPool(8)) {
            var counts = new ArrayList<Long>();
            for (var future : executor.invokeAll(visits)) counts.add(future.get());
            assertThat(counts).doesNotHaveDuplicates().hasSize(40).contains(1L, 40L);
        }
        assertThat(count(id)).isEqualTo(40);
        assertThat(jdbc.queryForObject("SELECT updated_at FROM listings WHERE id = ?", java.sql.Timestamp.class, id))
                .isEqualTo(updatedAt);
    }

    @Test
    void repeatedVisitsByTheSameUserCountOnce() {
        UUID id = insertListing();
        UUID viewer = UUID.randomUUID();
        ListingViewService service = serviceFor(id);
        assertThat(service.recordView(id, viewer, null)).isEqualTo(1);
        assertThat(service.recordView(id, viewer, null)).isEqualTo(1);
        assertThat(count(id)).isEqualTo(1);
    }

    @Test
    void repeatedGuestBrowserVisitsCountOnce() {
        UUID id = insertListing();
        UUID guest = UUID.randomUUID();
        ListingViewService service = serviceFor(id);
        assertThat(service.recordView(id, null, guest)).isEqualTo(1);
        assertThat(service.recordView(id, null, guest)).isEqualTo(1);
        assertThat(service.recordView(id, null, UUID.randomUUID())).isEqualTo(2);
        assertThat(count(id)).isEqualTo(2);
    }

    @Test
    void theSameAccountCountsOnceAcrossBrowsersAndSeparatelyForEachListing() {
        UUID id = insertListing();
        UUID otherId = insertListing();
        UUID viewer = UUID.randomUUID();
        ListingViewService service = serviceFor(id);
        assertThat(service.recordView(id, viewer, UUID.randomUUID())).isEqualTo(1);
        assertThat(service.recordView(id, viewer, UUID.randomUUID())).isEqualTo(1);
        assertThat(serviceFor(otherId).recordView(otherId, viewer, null)).isEqualTo(1);
        assertThat(count(id)).isEqualTo(1);
        assertThat(count(otherId)).isEqualTo(1);
    }

    @Test
    void simultaneousRequestsFromOneUserCountOnlyOnce() throws Exception {
        UUID id = insertListing();
        UUID viewer = UUID.randomUUID();
        ListingViewService service = serviceFor(id);
        var visits = new ArrayList<Callable<Long>>();
        for (int i = 0; i < 40; i++) visits.add(() -> service.recordView(id, viewer, null));
        try (var executor = Executors.newFixedThreadPool(8)) {
            for (var future : executor.invokeAll(visits)) assertThat(future.get()).isEqualTo(1);
        }
        assertThat(count(id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM listing_views WHERE listing_id = ?", Long.class, id))
                .isEqualTo(1);
    }

    @Test
    void editingAStaleEntityDoesNotOverwriteNewViews() {
        UUID id = insertListing();
        var config = new Configuration().addAnnotatedClass(Listing.class)
                .setProperty("hibernate.connection.url", url)
                .setProperty("hibernate.connection.username", user)
                .setProperty("hibernate.connection.password", password)
                .setProperty("hibernate.hbm2ddl.auto", "validate");
        try (var factory = config.buildSessionFactory(); var session = factory.openSession()) {
            var transaction = session.beginTransaction();
            Listing listing = session.find(Listing.class, id);
            assertThat(listing.getViewCount()).isZero();
            assertThat(serviceFor(id).recordView(id, UUID.randomUUID(), null)).isEqualTo(1);
            listing.setDescription("Updated description");
            transaction.commit();
            session.clear();
            assertThat(session.find(Listing.class, id).getViewCount()).isEqualTo(1);
        }
    }

    private static ListingViewService serviceFor(UUID id) {
        ListingService listings = mock(ListingService.class);
        when(listings.getForViewer(eq(id), any())).thenReturn(Listing.builder()
                .id(id).sellerId(SELLER).status(ListingStatus.ACTIVE).build());
        return new ListingViewService(listings, jdbc);
    }

    private static long count(UUID id) {
        return jdbc.queryForObject("SELECT unique_view_count FROM listings WHERE id = ?", Long.class, id);
    }

    private static UUID insertListing() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO listings (id, seller_id, description, price) VALUES (?, ?, 'Account', 100)", id, SELLER);
        return id;
    }
}
