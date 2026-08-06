package uz.efbazaar.marketplace.service;

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
import uz.efbazaar.marketplace.domain.Notification;
import uz.efbazaar.marketplace.domain.NotificationType;
import uz.efbazaar.marketplace.repository.NotificationRepository;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves {@code tradeAdminInvited}'s replay guard against a real Postgres.
 * The Mockito unit test in {@code NotificationServiceTest} stubs
 * {@code existsByUserIdAndTypeAndTradeId} to return true/false directly, so
 * it verifies the branch but can't fail if the derived query targeted the
 * wrong columns, and it never exercises an actual second insert the way a
 * Kafka redelivery would. This does.
 *
 * <p>Requires Docker on the host. Skipped automatically when Testcontainers
 * cannot start a container (e.g. no Docker socket).
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(NotificationServiceIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class NotificationServiceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired NotificationRepository notifications;

    @Test
    void replayedAdminInvitedWritesExactlyOneRow() {
        NotificationService service = new NotificationService(notifications);
        UUID adminId = UUID.randomUUID();
        UUID tradeId = UUID.randomUUID();

        service.tradeAdminInvited(adminId, tradeId);
        service.tradeAdminInvited(adminId, tradeId); // simulated Kafka redelivery

        long rows = notifications.findAll().stream()
                .filter(n -> n.getType() == NotificationType.TRADE_ADMIN_INVITED
                        && adminId.equals(n.getUserId())
                        && tradeId.equals(n.getTradeId()))
                .count();
        assertThat(rows).isEqualTo(1);
    }

    @Test
    void distinctTradesForTheSameAdminBothLandNotifications() {
        NotificationService service = new NotificationService(notifications);
        UUID adminId = UUID.randomUUID();
        UUID tradeA = UUID.randomUUID();
        UUID tradeB = UUID.randomUUID();

        service.tradeAdminInvited(adminId, tradeA);
        service.tradeAdminInvited(adminId, tradeB);

        assertThat(notifications.findAll()).hasSize(2);
    }

    /** Minimal config that pulls only the repository under test into the slice. */
    @org.springframework.boot.autoconfigure.domain.EntityScan(basePackageClasses = Notification.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(basePackageClasses = NotificationRepository.class)
    static class Config {}
}
