package uz.efbazaar.marketplace.partner;

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
import uz.efbazaar.marketplace.partner.PartnerApplication.Status;
import uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerApplicationRepository;
import uz.efbazaar.marketplace.repository.NotificationRepository;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Ishora sanoqlari haqiqiy Postgres ustida ishlashi.
 *
 * <p>NEGA HAQIQIY BAZA KERAK. Bu so'rovlar avval bitta metod edi va
 * `:since is null` shartini o'z ichiga olardi. Mock'li sinovlar SQL'ni
 * umuman ishlatmaydi, Hibernate esa JPQL'ni ishga tushirishdan oldin
 * qabul qildi — nosozlik faqat productionda ko'rindi:
 *
 * <pre>
 *   ERROR: could not determine data type of parameter $2   (SQLState 42P18)
 * </pre>
 *
 * <p>Postgres null parametrning turini aniqlay olmaydi, chunki uni
 * solishtiradigan hech narsa yo'q. Endi ikkita alohida metod bor va
 * ikkalasi ham shu yerda, haqiqiy drayver orqali ishlatiladi.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(AdminBadgeQueryIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class AdminBadgeQueryIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired PartnerApplicationRepository applications;
    @Autowired NotificationRepository notifications;

    @Test
    void countsApplicationsWithAndWithoutASinceBound() {
        UUID userId = UUID.randomUUID();
        PartnerApplication application = new PartnerApplication();
        application.setUserId(userId);
        application.setStatus(Status.AWAITING_REVIEW);
        applications.saveAndFlush(application);

        // Admin hech qachon ko'rmagan — chegarasiz sanoq.
        assertThatCode(() -> applications.countByStatus(Status.AWAITING_REVIEW))
                .doesNotThrowAnyException();
        assertThat(applications.countByStatus(Status.AWAITING_REVIEW)).isEqualTo(1);

        // Admin allaqachon ko'rgan — chegarali sanoq. Aynan shu yo'l
        // productionda 42P18 bilan yiqilgan edi.
        Instant future = Instant.now().plus(1, ChronoUnit.HOURS);
        assertThat(applications.countByStatusAndUpdatedAtAfter(Status.AWAITING_REVIEW, future))
                .isZero();

        Instant past = Instant.now().minus(1, ChronoUnit.HOURS);
        assertThat(applications.countByStatusAndUpdatedAtAfter(Status.AWAITING_REVIEW, past))
                .isEqualTo(1);
    }

    @Test
    void countsUnreadWithdrawalsWithAndWithoutASinceBound() {
        UUID adminId = UUID.randomUUID();
        notifications.saveAndFlush(Notification.builder()
                .userId(adminId)
                .type(NotificationType.WITHDRAWAL_REQUESTED)
                .build());

        assertThat(notifications.countByUserIdAndTypeAndReadAtIsNull(
                adminId, NotificationType.WITHDRAWAL_REQUESTED)).isEqualTo(1);

        Instant future = Instant.now().plus(1, ChronoUnit.HOURS);
        assertThat(notifications.countByUserIdAndTypeAndReadAtIsNullAndCreatedAtAfter(
                adminId, NotificationType.WITHDRAWAL_REQUESTED, future)).isZero();

        Instant past = Instant.now().minus(1, ChronoUnit.HOURS);
        assertThat(notifications.countByUserIdAndTypeAndReadAtIsNullAndCreatedAtAfter(
                adminId, NotificationType.WITHDRAWAL_REQUESTED, past)).isEqualTo(1);
    }

    @org.springframework.boot.autoconfigure.domain.EntityScan(
            basePackageClasses = {Notification.class, PartnerApplication.class})
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(
            basePackageClasses = {NotificationRepository.class, PartnerApplicationRepository.class})
    static class Config {}
}
