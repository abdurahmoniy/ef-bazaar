package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.security.HeaderAuthenticationFilter;
import uz.efbazaar.marketplace.security.InternalApiProperties;
import uz.efbazaar.marketplace.security.InternalSecretFilter;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(InternalRecommendationController.class)
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class, InternalSecretFilter.class})
@EnableConfigurationProperties(InternalApiProperties.class)
@TestPropertySource(properties = "app.internal.secret=s3cret")
class InternalRecommendationControllerTest {

    private static final String URL = "/internal/marketplace/v1/rec/replay";

    @Autowired MockMvc mvc;
    @MockBean RecommendationReplayService replay;

    @Test
    void withoutSecretIsRejectedAndReplayNotRun() throws Exception {
        mvc.perform(post(URL)).andExpect(status().isForbidden());
        mvc.perform(post(URL).header("X-Internal-Secret", "wrong")).andExpect(status().isForbidden());
        verifyNoInteractions(replay);
    }

    @Test
    void withSecretRunsReplay() throws Exception {
        when(replay.replay()).thenReturn(new RecommendationReplayService.ReplayResult(2, 1, 3));
        mvc.perform(post(URL).header("X-Internal-Secret", "s3cret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.listings").value(2))
                .andExpect(jsonPath("$.likes").value(1))
                .andExpect(jsonPath("$.cards").value(3));
    }
}
