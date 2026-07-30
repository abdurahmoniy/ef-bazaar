package uz.efbazaar.auth.event;

import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.mockito.ArgumentCaptor;
import uz.efbazaar.auth.domain.Role;

class UserRoleChangedPublishTest {

    @SuppressWarnings("unchecked")
    private final KafkaTemplate<String, Object> kafka = mock(KafkaTemplate.class);
    private final AuthEventPublisher publisher = new AuthEventPublisher(kafka);

    @Test
    void publishesOldAndNewRoleNamesKeyedByUserId() {
        when(kafka.send(any(), any(), any())).thenReturn(new CompletableFuture<>());
        UUID userId = UUID.randomUUID();

        publisher.userRoleChanged(userId, Role.USER, Role.TRADE_ADMIN);

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(kafka).send(eq(AuthEvents.TOPIC_USER_ROLE_CHANGED),
                eq(userId.toString()), payload.capture());

        assertThat(payload.getValue())
                .isInstanceOf(AuthEvents.UserRoleChanged.class);
        var e = (AuthEvents.UserRoleChanged) payload.getValue();
        assertThat(e.userId()).isEqualTo(userId);
        assertThat(e.oldRole()).isEqualTo("USER");
        assertThat(e.newRole()).isEqualTo("TRADE_ADMIN");
        assertThat(e.occurredAt()).isNotNull();
    }

    @Test
    void topicFollowsNamingConvention() {
        assertThat(AuthEvents.TOPIC_USER_ROLE_CHANGED)
                .isEqualTo("efbazaar.auth.user-role-changed");
    }
}
