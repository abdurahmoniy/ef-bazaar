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
    @Autowired org.springframework.context.ApplicationEventPublisher events;
    @Autowired org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager entityManager;

    @Test
    void replayedAdminInvitedWritesExactlyOneRow() {
        NotificationService service = new NotificationService(notifications, events);
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
        NotificationService service = new NotificationService(notifications, events);
        UUID adminId = UUID.randomUUID();
        UUID tradeA = UUID.randomUUID();
        UUID tradeB = UUID.randomUUID();

        service.tradeAdminInvited(adminId, tradeA);
        service.tradeAdminInvited(adminId, tradeB);

        assertThat(notifications.findAll()).hasSize(2);
    }

    @Test
    void aCreditedDepositBecomesOneBellRowCarryingTheAmount() {
        NotificationService service = new NotificationService(notifications, events);
        UUID userId = UUID.randomUUID();
        UUID txId = UUID.randomUUID();

        service.walletCredited(userId, 5_000_000L, txId);

        assertThat(notifications.findAll()).singleElement().satisfies(n -> {
            assertThat(n.getType()).isEqualTo(NotificationType.WALLET_CREDITED);
            assertThat(n.getUserId()).isEqualTo(userId);
            assertThat(n.getAmountTiyin()).isEqualTo(5_000_000L);
            assertThat(n.getPaymentRef()).isEqualTo(txId);
        });
    }

    /**
     * Kafka is at-least-once. Told twice, a user would read that their wallet
     * was topped up twice and go looking for money that was never sent.
     */
    @Test
    void aRedeliveredDepositWritesExactlyOneRow() {
        NotificationService service = new NotificationService(notifications, events);
        UUID userId = UUID.randomUUID();
        UUID txId = UUID.randomUUID();

        service.walletCredited(userId, 5_000_000L, txId);
        service.walletCredited(userId, 5_000_000L, txId);

        assertThat(notifications.findAll()).hasSize(1);
    }

    /** Two real deposits of the same amount are two events, not a replay. */
    @Test
    void twoDistinctDepositsOfTheSameAmountBothLand() {
        NotificationService service = new NotificationService(notifications, events);
        UUID userId = UUID.randomUUID();

        service.walletCredited(userId, 5_000_000L, UUID.randomUUID());
        service.walletCredited(userId, 5_000_000L, UUID.randomUUID());

        assertThat(notifications.findAll()).hasSize(2);
    }

    /**
     * The admin badge counts unread WITHDRAWAL_REQUESTED rows. Once a ticket is
     * paid, every admin's row for it has to stop counting — and only that
     * ticket's: another admin's pending request must stay on the badge.
     */
    @Test
    void closingATicketTakesItOffEveryAdminsBadgeAndNothingElse() {
        NotificationService service = new NotificationService(notifications, events);
        UUID adminA = UUID.randomUUID();
        UUID adminB = UUID.randomUUID();
        UUID paid = UUID.randomUUID();
        UUID pending = UUID.randomUUID();
        service.withdrawalRequested(java.util.List.of(adminA, adminB), paid);
        service.withdrawalRequested(java.util.List.of(adminA, adminB), pending);

        service.withdrawalClosed(UUID.randomUUID(), paid, true);
        entityManager.clear();

        for (UUID admin : java.util.List.of(adminA, adminB)) {
            assertThat(notifications.countByUserIdAndTypeAndReadAtIsNull(admin, NotificationType.WITHDRAWAL_REQUESTED))
                    .as("only the still-pending ticket is left").isEqualTo(1);
        }
    }

    /** V63 clears the rows of tickets closed before the fix, and leaves open ones alone. */
    @Test
    void theMigrationClearsOnlyTicketsThatWereAlreadyClosed() throws Exception {
        UUID admin = UUID.randomUUID();
        UUID closed = UUID.randomUUID();
        UUID open = UUID.randomUUID();
        notifications.save(Notification.builder().userId(admin)
                .type(NotificationType.WITHDRAWAL_REQUESTED).withdrawalId(closed).build());
        notifications.save(Notification.builder().userId(admin)
                .type(NotificationType.WITHDRAWAL_REQUESTED).withdrawalId(open).build());
        notifications.save(Notification.builder().userId(UUID.randomUUID())
                .type(NotificationType.WITHDRAWAL_REJECTED).withdrawalId(closed).build());
        notifications.flush();

        entityManager.getEntityManager().createNativeQuery(java.nio.file.Files.readString(java.nio.file.Path.of(
                "src/main/resources/db/migration/V63__close_answered_withdrawal_requests.sql")))
                .executeUpdate();
        entityManager.clear();

        assertThat(notifications.findAll())
                .filteredOn(n -> n.getType() == NotificationType.WITHDRAWAL_REQUESTED && n.getReadAt() == null)
                .extracting(Notification::getWithdrawalId)
                .containsExactly(open);
    }

    /** Minimal config that pulls only the repository under test into the slice. */
    @org.springframework.boot.autoconfigure.domain.EntityScan(basePackageClasses = Notification.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(basePackageClasses = NotificationRepository.class)
    static class Config {}
}
