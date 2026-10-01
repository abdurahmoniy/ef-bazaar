package uz.efbazaar.recommendation.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Kirish qoidalari — haqiqiy controller'lar keyingi task'larda, bu yerda faqat yo'llar.
 * Probe test klassining ichki klassi: Spring Boot TestTypeExcludeFilter uni component scan'dan
 * chiqaradi (aks holda @SpringBootTest'da FeedController bilan bir xil yo'l to'qnashardi),
 * shuning uchun @Import orqali aniq ro'yxatga olinadi.
 */
@WebMvcTest(controllers = SecurityRulesTest.Probe.class)
@Import({SecurityRulesTest.Probe.class, SecurityConfig.class, HeaderAuthenticationFilter.class})
class SecurityRulesTest {

    @RestController
    static class Probe {
        @GetMapping({"/api/v1/feed", "/api/v1/feed/details", "/api/v1/match", "/api/v1/match/details",
                "/api/v1/dream-teams", "/api/v1/card-interest/counts"})
        String ok() { return "ok"; }

        @PostMapping("/api/v1/card-interest/apply")
        String apply() { return "ok"; }
    }

    @Autowired MockMvc mvc;

    private static final String USER = UUID.randomUUID().toString();

    @Test
    void guestReachesPublicEndpoints() throws Exception {
        mvc.perform(get("/api/v1/feed")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/feed/details")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/match")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/match/details")).andExpect(status().isOk());
        mvc.perform(post("/api/v1/card-interest/apply")).andExpect(status().isOk());
    }

    @Test
    void dreamTeamsNeedLogin() throws Exception {
        mvc.perform(get("/api/v1/dream-teams")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/dream-teams").header("X-User-Id", USER)).andExpect(status().isOk());
    }

    @Test
    void interestCountsAreAdminOnly() throws Exception {
        mvc.perform(get("/api/v1/card-interest/counts")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/card-interest/counts")
                .header("X-User-Id", USER).header("X-User-Roles", "ROLE_USER"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/card-interest/counts")
                .header("X-User-Id", USER).header("X-User-Roles", "ROLE_USER,ROLE_ADMIN"))
                .andExpect(status().isOk());
    }
}
