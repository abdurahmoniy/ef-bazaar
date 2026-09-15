package uz.efbazaar.marketplace.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.security.HeaderAuthenticationFilter;
import uz.efbazaar.marketplace.security.InternalSecretFilter;
import uz.efbazaar.marketplace.service.LegacyDreamTeamAdapter;
import uz.efbazaar.marketplace.service.ListingService;
import uz.efbazaar.marketplace.service.ListingViewAssembler;
import uz.efbazaar.marketplace.service.MatchRequestParser;

import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ListingController.class)
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class, InternalSecretFilter.class})
class ListingRelistControllerTest {
    @Autowired MockMvc mvc;
    @MockBean ListingService listings;
    @MockBean ListingViewAssembler assembler;
    @MockBean MatchRequestParser matchRequestParser;
    @MockBean LegacyDreamTeamAdapter legacyDreamTeamAdapter;

    @Test
    void relistsUsingAuthenticatedSellerIdentity() throws Exception {
        UUID id = UUID.randomUUID();
        UUID sellerId = UUID.randomUUID();
        Listing listing = new Listing();
        when(listings.relist(id, sellerId)).thenReturn(listing);

        mvc.perform(post("/api/v1/listings/{id}/relist", id)
                        .header("X-User-Id", sellerId.toString()).header("X-User-Roles", "ROLE_USER"))
                .andExpect(status().isOk());

        verify(listings).relist(id, sellerId);
        verify(assembler).assemble(listing, sellerId);
    }

    @Test
    void guestCannotRelist() throws Exception {
        mvc.perform(post("/api/v1/listings/{id}/relist", UUID.randomUUID()))
                .andExpect(status().is4xxClientError());
        verifyNoInteractions(listings, assembler);
    }

    @Test
    void nonOwnerIsRejected() throws Exception {
        UUID id = UUID.randomUUID();
        UUID viewerId = UUID.randomUUID();
        when(listings.relist(id, viewerId)).thenThrow(MarketplaceException.notOwner());

        mvc.perform(post("/api/v1/listings/{id}/relist", id)
                        .header("X-User-Id", viewerId.toString()).header("X-User-Roles", "ROLE_USER"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(assembler);
    }
}
