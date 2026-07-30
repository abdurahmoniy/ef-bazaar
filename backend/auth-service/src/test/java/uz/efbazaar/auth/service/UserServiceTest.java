package uz.efbazaar.auth.service;

import org.junit.jupiter.api.Test;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.event.AuthEventPublisher;
import uz.efbazaar.auth.repository.UserRepository;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers {@link UserService#changeRole} at the point the no-op guard actually
 * matters: whether a same-role request skips the save + event, and a genuine
 * change does both exactly once. {@link uz.efbazaar.auth.event.AuthEventPublisher}
 * itself is exercised in isolation by
 * {@link uz.efbazaar.auth.event.UserRoleChangedPublishTest} — this class proves
 * {@link UserService} actually calls it (or doesn't) under the right conditions.
 */
class UserServiceTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final AuthEventPublisher events = mock(AuthEventPublisher.class);
    private final UserService userService = new UserService(userRepository, events);

    @Test
    void sameRoleRequestSkipsSaveAndPublish() {
        UUID adminId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        User user = User.builder().id(targetId).role(Role.USER).build();
        when(userRepository.findById(targetId)).thenReturn(Optional.of(user));

        User result = userService.changeRole(adminId, targetId, Role.USER);

        assertThat(result.getRole()).isEqualTo(Role.USER);
        verify(userRepository, never()).save(any());
        verify(events, never()).userRoleChanged(any(), any(), any());
    }

    @Test
    void genuineRoleChangeSavesAndPublishesExactlyOnce() {
        UUID adminId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        User user = User.builder().id(targetId).role(Role.USER).build();
        when(userRepository.findById(targetId)).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        User result = userService.changeRole(adminId, targetId, Role.TRADE_ADMIN);

        assertThat(result.getRole()).isEqualTo(Role.TRADE_ADMIN);
        verify(userRepository).save(user);
        verify(events).userRoleChanged(targetId, Role.USER, Role.TRADE_ADMIN);
    }
}
