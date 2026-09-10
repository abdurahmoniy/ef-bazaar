package uz.efbazaar.marketplace.controller;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.security.HeaderAuthenticationFilter;
import uz.efbazaar.marketplace.security.InternalSecretFilter;
import uz.efbazaar.marketplace.service.ListingViewService;

import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ListingViewController.class)
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class, InternalSecretFilter.class})
class ListingViewControllerTest {
    @Autowired MockMvc mvc;
    @MockBean ListingViewService views;

    @Test
    void guestsCanRecordViewsAndReceiveTheNewCount() throws Exception {
        UUID id = UUID.randomUUID();
        when(views.recordView(eq(id), isNull(), any(UUID.class))).thenReturn(1L);
        mvc.perform(post("/api/v1/listings/{id}/views", id))
                .andExpect(status().isOk()).andExpect(jsonPath("$.viewCount").value(1))
                .andExpect(cookie().httpOnly("ef_listing_visitor", true))
                .andExpect(cookie().path("ef_listing_visitor", "/"))
                .andExpect(cookie().maxAge("ef_listing_visitor", 365 * 24 * 60 * 60));
        verify(views).recordView(eq(id), isNull(), any(UUID.class));
    }

    @Test
    void existingGuestIdentityIsReused() throws Exception {
        UUID id = UUID.randomUUID();
        UUID guest = UUID.randomUUID();
        when(views.recordView(id, null, guest)).thenReturn(1L);
        mvc.perform(post("/api/v1/listings/{id}/views", id)
                        .cookie(new Cookie("ef_listing_visitor", guest.toString())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.viewCount").value(1))
                .andExpect(header().doesNotExist("Set-Cookie"));
        verify(views).recordView(id, null, guest);
    }

    @Test
    void invalidGuestCookieIsReplacedWithAValidIdentity() throws Exception {
        UUID id = UUID.randomUUID();
        when(views.recordView(eq(id), isNull(), any(UUID.class))).thenReturn(1L);
        var result = mvc.perform(post("/api/v1/listings/{id}/views", id).secure(true)
                        .cookie(new Cookie("ef_listing_visitor", "invalid")))
                .andExpect(status().isOk()).andExpect(cookie().secure("ef_listing_visitor", true))
                .andReturn();
        assertThat(UUID.fromString(result.getResponse().getCookie("ef_listing_visitor").getValue())).isNotNull();
    }

    @Test
    void signedInIdentityIsPassedToTheCounter() throws Exception {
        UUID id = UUID.randomUUID();
        UUID viewer = UUID.randomUUID();
        when(views.recordView(id, viewer, null)).thenReturn(42L);
        mvc.perform(post("/api/v1/listings/{id}/views", id).header("X-User-Id", viewer.toString())
                        .cookie(new Cookie("ef_listing_visitor", UUID.randomUUID().toString())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.viewCount").value(42))
                .andExpect(header().doesNotExist("Set-Cookie"));
        verify(views).recordView(id, viewer, null);
    }
}
