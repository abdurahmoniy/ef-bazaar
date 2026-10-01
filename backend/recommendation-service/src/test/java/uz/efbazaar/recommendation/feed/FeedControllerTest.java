package uz.efbazaar.recommendation.feed;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.recommendation.security.HeaderAuthenticationFilter;
import uz.efbazaar.recommendation.security.SecurityConfig;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(FeedController.class)
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class})
class FeedControllerTest {

    @Autowired MockMvc mvc;
    @MockBean FeedService service;

    @Test
    void guestGetsEmptyFeed() throws Exception {
        when(service.feed(isNull(), isNull())).thenReturn(FeedResponse.EMPTY);

        mvc.perform(get("/api/v1/feed"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.empty").value(true))
                .andExpect(jsonPath("$.ids").isEmpty());
    }

    @Test
    void userIdComesFromTheHeader() throws Exception {
        UUID user = UUID.randomUUID();
        UUID id = UUID.randomUUID();
        when(service.feed(eq(user), eq("h"))).thenReturn(new FeedResponse(false, "h", List.of(id)));

        mvc.perform(get("/api/v1/feed").param("profileHash", "h").header("X-User-Id", user.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ids[0]").value(id.toString()));
    }

    @Test
    void detailsRejectTooManyIds() throws Exception {
        var request = get("/api/v1/feed/details");
        for (int i = 0; i <= FeedController.MAX_DETAIL_IDS; i++) request.param("ids", UUID.randomUUID().toString());

        mvc.perform(request)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("too_many_ids"));
    }
}
