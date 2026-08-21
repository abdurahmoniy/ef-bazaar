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

import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Every notification type the code can write must survive the CHECK.
 *
 * <p>{@code chk_notifications_type} enumerates its values, so adding one to
 * {@code NotificationType} without a migration makes every insert of that type
 * fail — in production only, and silently as far as the sender is concerned.
 * It has happened twice: the trust types went unwritable from V11 until V29
 * caught them, and the withdrawal types from the day they shipped until V34,
 * meaning not one payout notification was ever stored.
 *
 * <p>Runs against the real migrations rather than {@code ddl-auto}, which is
 * the whole point — the sibling {@code NotificationServiceIT} generates its
 * schema from the entities and so has no constraint to break.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(NotificationTypeConstraintIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class NotificationTypeConstraintIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired NotificationRepository notifications;

    @Test
    void theConstraintAcceptsEveryTypeTheCodeCanWrite() {
        for (NotificationType type : NotificationType.values()) {
            assertThatCode(() -> notifications.saveAndFlush(Notification.builder()
                    .userId(UUID.randomUUID())
                    .type(type)
                    .build()))
                    .as("%s is in NotificationType but not in chk_notifications_type — "
                            + "every notification of this kind is dropped by the database", type)
                    .doesNotThrowAnyException();
        }
    }

    /** Minimal config that pulls only the repository under test into the slice. */
    @org.springframework.boot.autoconfigure.domain.EntityScan(basePackageClasses = Notification.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(basePackageClasses = NotificationRepository.class)
    static class Config {}
}
