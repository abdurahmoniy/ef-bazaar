package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.outbox.Outbox;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@Testcontainers(disabledWithoutDocker = true)
class RecommendationReplayServiceIT {

    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private JdbcTemplate jdbc;
    private DataSourceTransactionManager tm;

    @BeforeEach
    void schema() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);
        tm = new DataSourceTransactionManager(ds);
        jdbc.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
        jdbc.execute("""
                CREATE TABLE listings (id UUID PRIMARY KEY);
                CREATE TABLE listing_likes (listing_id UUID NOT NULL, user_id UUID NOT NULL);
                """);
    }

    @Test
    void marksEveryListingLikeAndCardInsideTransactions() {
        UUID l1 = UUID.randomUUID(), l2 = UUID.randomUUID(), user = UUID.randomUUID();
        jdbc.update("INSERT INTO listings VALUES (?), (?)", l1, l2);
        jdbc.update("INSERT INTO listing_likes VALUES (?, ?)", l1, user);
        Outbox outbox = mock(Outbox.class);
        CardCatalogReader catalog = mock(CardCatalogReader.class);
        when(catalog.allIds()).thenReturn(List.of(8900000001L, 8800000002L));

        var result = new RecommendationReplayService(jdbc, catalog, outbox, tm).replay();

        assertThat(result).isEqualTo(new RecommendationReplayService.ReplayResult(2, 1, 2));
        verify(outbox).markSnapshot("listing", l1.toString());
        verify(outbox).markSnapshot("listing", l2.toString());
        verify(outbox).markSnapshot("like", user + ":" + l1);
        verify(outbox).markSnapshot("card", "8900000001");
        verify(outbox).markSnapshot("card", "8800000002");
    }
}
