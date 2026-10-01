package uz.efbazaar.recommendation.dreamteam;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PutMapping;
import uz.efbazaar.recommendation.security.AuthenticatedUser;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DreamTeamControllerTest {

    @Test
    void meRouteUpsertsTheAuthenticatedUsersTeamAndNoDeleteRouteIsExposed() throws Exception {
        DreamTeamService service = mock(DreamTeamService.class);
        DreamTeamController controller = new DreamTeamController(service);
        UUID userId = UUID.randomUUID();
        AuthenticatedUser user = new AuthenticatedUser(userId, List.of("ROLE_USER"));
        DreamTeamRequest request = new DreamTeamRequest("ignored", "4-3-3", List.of());
        DreamTeam team = DreamTeam.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .name("Mening jamoam")
                .build();
        when(service.saveMine(userId, request)).thenReturn(team);

        assertThat(controller.saveMine(user, request).id()).isEqualTo(team.getId());
        verify(service).saveMine(userId, request);

        PutMapping mapping = DreamTeamController.class
                .getDeclaredMethod("saveMine", AuthenticatedUser.class, DreamTeamRequest.class)
                .getAnnotation(PutMapping.class);
        assertThat(mapping.value()).containsExactly("/me");
        assertThat(Arrays.stream(DreamTeamController.class.getDeclaredMethods()))
                .noneMatch(method -> method.isAnnotationPresent(DeleteMapping.class));
    }
}
