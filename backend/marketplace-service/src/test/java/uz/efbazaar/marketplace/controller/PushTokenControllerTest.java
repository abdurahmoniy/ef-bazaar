package uz.efbazaar.marketplace.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.push.PushProperties;
import uz.efbazaar.marketplace.repository.PushTokenRepository;
import uz.efbazaar.marketplace.security.HeaderAuthenticationFilter;
import uz.efbazaar.marketplace.security.InternalSecretFilter;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PushTokenController.class)
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class, InternalSecretFilter.class})
class PushTokenControllerTest {
    @Autowired MockMvc mvc;
    @MockBean PushTokenRepository tokens;
    @MockBean PushProperties properties;
    private final UUID owner = UUID.randomUUID();

    @Test void registrationUsesPrincipalRatherThanSuppliedOwner() throws Exception {
        mvc.perform(put("/api/v1/notifications/push-tokens").header("X-User-Id", owner)
                .contentType("application/json").content("{\"token\":\"browser-token\",\"userId\":\"other-user\"}"))
                .andExpect(status().isNoContent());
        verify(tokens).register(owner, "browser-token");
    }
    @Test void removalIsScopedToPrincipal() throws Exception {
        mvc.perform(delete("/api/v1/notifications/push-tokens").header("X-User-Id", owner)
                .contentType("application/json").content("{\"token\":\"browser-token\"}"))
                .andExpect(status().isNoContent());
        verify(tokens).remove(owner, "browser-token");
    }
    @Test void anonymousUsersCannotReadOrModifyPushState() throws Exception {
        mvc.perform(get("/api/v1/notifications/push-status")).andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/notifications/push-tokens").contentType("application/json")
                .content("{\"token\":\"token\"}")).andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/notifications/push-tokens").contentType("application/json")
                .content("{\"token\":\"token\"}")).andExpect(status().isForbidden());
        verifyNoInteractions(tokens);
    }
    @Test void invalidTokensAreRejected() throws Exception {
        for (String token : new String[]{"", "  ", "has space", "x".repeat(2049)}) {
            mvc.perform(put("/api/v1/notifications/push-tokens").header("X-User-Id", owner)
                    .contentType("application/json").content("{\"token\":\"" + token + "\"}"))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(tokens);
    }
    @Test void statusReflectsServerConfiguration() throws Exception {
        mvc.perform(get("/api/v1/notifications/push-status").header("X-User-Id", owner))
                .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false));
        when(properties.isEnabled()).thenReturn(true);
        mvc.perform(get("/api/v1/notifications/push-status").header("X-User-Id", owner))
                .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(true));
    }
}
