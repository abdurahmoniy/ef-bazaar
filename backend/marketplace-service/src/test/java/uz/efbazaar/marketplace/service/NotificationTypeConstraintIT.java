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


    @Test
    void otpReplayStoresOneScopedRowAndPublishesOnePush() {
        UUID user = UUID.randomUUID(), trade = UUID.randomUUID(), chat = UUID.randomUUID();
        java.time.Instant detected = java.time.Instant.now().minusSeconds(1).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        org.springframework.context.ApplicationEventPublisher publisher = org.mockito.Mockito.mock(org.springframework.context.ApplicationEventPublisher.class);
        NotificationService service = new NotificationService(notifications, publisher);
        service.tradeVerificationCode(user, trade, chat, NotificationType.TRADE_LOGIN_CODE, "001234", detected);
        service.tradeVerificationCode(user, trade, chat, NotificationType.TRADE_LOGIN_CODE, "001234", detected);
        org.assertj.core.api.Assertions.assertThat(service.list(user, org.springframework.data.domain.Pageable.unpaged()).getContent())
                .singleElement().satisfies(n -> {
                    org.assertj.core.api.Assertions.assertThat(n.getVerificationCode()).isEqualTo("001234");
                    org.assertj.core.api.Assertions.assertThat(uz.efbazaar.marketplace.dto.NotificationResponse.from(n).verificationCode()).isEqualTo("001234");
                    org.assertj.core.api.Assertions.assertThat(n.getCreatedAt()).isEqualTo(detected.truncatedTo(java.time.temporal.ChronoUnit.MICROS));
                    org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.markRead(n.getId(), UUID.randomUUID()))
                            .isInstanceOf(uz.efbazaar.marketplace.exception.MarketplaceException.class);
                });
        org.assertj.core.api.Assertions.assertThat(service.list(UUID.randomUUID(), org.springframework.data.domain.Pageable.unpaged())).isEmpty();
        var push = org.mockito.ArgumentCaptor.forClass(uz.efbazaar.marketplace.push.NotificationPushEvent.class);
        org.mockito.Mockito.verify(publisher).publishEvent(push.capture());
        org.assertj.core.api.Assertions.assertThat(push.getValue().recipientUserId()).isEqualTo(user);
        org.assertj.core.api.Assertions.assertThat(push.getValue().data().get("body")).contains("001234");
    }

    /** Minimal config that pulls only the repository under test into the slice. */
    @org.springframework.boot.autoconfigure.domain.EntityScan(basePackageClasses = Notification.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(basePackageClasses = NotificationRepository.class)
    static class Config {}
}
