package uz.efbazaar.auth.controller;

import org.junit.jupiter.api.Test;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.UserNamesBatchRequest;
import uz.efbazaar.auth.repository.UserRepository;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class InternalUserControllerTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final InternalUserController controller = new InternalUserController(userRepository);

    @Test
    void resolvesKnownIds_omitsUnknown() {
        UUID knownId = UUID.randomUUID();
        UUID unknownId = UUID.randomUUID();
        User known = new User();
        known.setId(knownId);
        known.setTelegramFirstName("Aziz");
        known.setTelegramLastName("Rahmatov");

        when(userRepository.findAllById(List.of(knownId, unknownId)))
                .thenReturn(List.of(known));

        Map<UUID, String> result =
                controller.resolveNames(new UserNamesBatchRequest(List.of(knownId, unknownId)));

        assertThat(result).containsExactly(Map.entry(knownId, "Aziz Rahmatov"));
        assertThat(result).doesNotContainKey(unknownId);
    }

    @Test
    void returnsEmptyMap_whenNoUsersFound() {
        UUID id = UUID.randomUUID();
        when(userRepository.findAllById(List.of(id))).thenReturn(List.of());

        Map<UUID, String> result =
                controller.resolveNames(new UserNamesBatchRequest(List.of(id)));

        assertThat(result).isEmpty();
    }
}
