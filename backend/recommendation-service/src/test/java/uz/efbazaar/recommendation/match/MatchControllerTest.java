package uz.efbazaar.recommendation.match;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.recommendation.security.HeaderAuthenticationFilter;
import uz.efbazaar.recommendation.security.SecurityConfig;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(MatchController.class)
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class,
        MatchRequestParser.class, LegacyDreamTeamAdapter.class})
class MatchControllerTest {

    @Autowired MockMvc mvc;
    @MockBean MatchEngine engine;
    @MockBean CardIdentityVerifier identities;

    private static final UUID PLAYER = UUID.randomUUID();
    private static final String CARD = "101:" + PLAYER + ":N";

    @Test
    void criteriaAreRequired() throws Exception {
        mvc.perform(get("/api/v1/match"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("match_required"));
    }

    @Test
    void returnsRankedIds() throws Exception {
        UUID id = UUID.randomUUID();
        when(engine.rank(any(MatchRequest.class), eq(MatchController.MAX_IDS))).thenReturn(List.of(id));

        mvc.perform(get("/api/v1/match").param("matchCard", CARD))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ids[0]").value(id.toString()));
    }

    @Test
    void detailsRejectTooManyIds() throws Exception {
        var request = get("/api/v1/match/details").param("matchCard", CARD);
        for (int i = 0; i <= MatchController.MAX_DETAIL_IDS; i++) request.param("ids", UUID.randomUUID().toString());

        mvc.perform(request)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("too_many_ids"));
    }

    @Test
    void singleListingUnknownToProjectionIs404() throws Exception {
        when(engine.hits(any(), any(Collection.class))).thenReturn(Map.of());

        mvc.perform(get("/api/v1/match/" + UUID.randomUUID()).param("matchCard", CARD))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("listing_not_found"));
    }
}
