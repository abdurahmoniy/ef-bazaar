package uz.efbazaar.marketplace.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.dto.ListingResponse;
import uz.efbazaar.marketplace.security.HeaderAuthenticationFilter;
import uz.efbazaar.marketplace.security.InternalSecretFilter;
import uz.efbazaar.marketplace.service.LegacyDreamTeamAdapter;
import uz.efbazaar.marketplace.service.ListingService;
import uz.efbazaar.marketplace.service.ListingViewAssembler;
import uz.efbazaar.marketplace.service.MatchRequestParser;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ListingController.class)
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class, InternalSecretFilter.class})
class RankedListingsControllerTest {
    @Autowired MockMvc mvc;
    @MockBean ListingService listingService;
    @MockBean ListingViewAssembler assembler;
    @MockBean MatchRequestParser matchRequestParser;
    @MockBean LegacyDreamTeamAdapter legacyDreamTeamAdapter;

    private static ListingResponse responseWithId(UUID id) {
        return new ListingResponse(id, null, null, null, null, false, null, null, null, null,
                0, 0L, 0L, null, null, null, null, null);
    }

    @Test
    void rejectsMoreThanThousandIds() throws Exception {
        String ids = java.util.stream.IntStream.range(0, 1001)
                .mapToObj(i -> "\"" + java.util.UUID.randomUUID() + "\"")
                .collect(java.util.stream.Collectors.joining(","));
        mvc.perform(post("/api/v1/listings/ranked").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[" + ids + "],\"page\":0,\"size\":20}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anonymousRequestReturnsAssembledPageInRankedOrder() throws Exception {
        UUID a = UUID.randomUUID(), b = UUID.randomUUID();
        Listing la = Listing.builder().id(a).build();
        Listing lb = Listing.builder().id(b).build();
        when(listingService.ranked(eq(List.of(b, a)), any(), eq(0), eq(20)))
                .thenReturn(new PageImpl<>(List.of(lb, la), PageRequest.of(0, 20), 2));
        when(assembler.assembleAll(eq(List.of(lb, la)), any()))
                .thenReturn(List.of(responseWithId(b), responseWithId(a)));

        mvc.perform(post("/api/v1/listings/ranked").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[\"" + b + "\",\"" + a + "\"],\"page\":0,\"size\":20}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(b.toString()))
                .andExpect(jsonPath("$.content[1].id").value(a.toString()))
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    private void expect400(String body) throws Exception {
        mvc.perform(post("/api/v1/listings/ranked").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
    }

    @Test
    void hugePageIsRejected() throws Exception {
        expect400("{\"ids\":[],\"page\":2147483647,\"size\":100}");
    }

    @Test
    void nullIdIsRejected() throws Exception {
        expect400("{\"ids\":[null],\"page\":0,\"size\":20}");
    }

    @Test
    void malformedIdIsRejected() throws Exception {
        expect400("{\"ids\":[\"not-a-uuid\"],\"page\":0,\"size\":20}");
    }
}
