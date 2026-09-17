package uz.efbazaar.marketplace.push;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.*;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.*;
import uz.efbazaar.marketplace.domain.Notification;
import uz.efbazaar.marketplace.domain.NotificationType;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class NotificationPushListenerTest {
    @Configuration @EnableTransactionManagement
    static class Config {
        @Bean PushDeliveryService delivery() { return mock(PushDeliveryService.class); }
        @Bean NotificationPushListener listener(PushDeliveryService delivery) { return new NotificationPushListener(delivery); }
    }
    private final NotificationPushEvent event = NotificationPushEvent.from(Notification.builder()
            .id(UUID.randomUUID()).userId(UUID.randomUUID()).type(NotificationType.CHAT_MESSAGE).build());
    private TransactionTemplate transaction() {
        return new TransactionTemplate(new AbstractPlatformTransactionManager() {
            protected Object doGetTransaction() { return new Object(); }
            protected void doBegin(Object transaction, TransactionDefinition definition) {}
            protected void doCommit(DefaultTransactionStatus status) {}
            protected void doRollback(DefaultTransactionStatus status) {}
        });
    }
    @Test void waitsForCommitAndNeverDeliversRollbackOrNontransactionalEvents() {
        try (var context = new AnnotationConfigApplicationContext(Config.class)) {
            var delivery = context.getBean(PushDeliveryService.class);
            context.publishEvent(event);
            verifyNoInteractions(delivery);
            transaction().executeWithoutResult(status -> {
                context.publishEvent(event);
                verifyNoInteractions(delivery);
                status.setRollbackOnly();
            });
            verifyNoInteractions(delivery);
            transaction().executeWithoutResult(status -> {
                context.publishEvent(event);
                verifyNoInteractions(delivery);
            });
            verify(delivery).enqueue(event);
        }
    }
    @Test void unexpectedSchedulingFailureCannotTurnSuccessfulCommitIntoRequestFailure() {
        try (var context = new AnnotationConfigApplicationContext(Config.class)) {
            doThrow(new IllegalStateException("executor failed")).when(context.getBean(PushDeliveryService.class)).enqueue(event);
            assertThatCode(() -> transaction().executeWithoutResult(s -> context.publishEvent(event)))
                    .doesNotThrowAnyException();
        }
    }
}
