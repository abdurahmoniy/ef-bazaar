package uz.efbazaar.marketplace.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.security.HeaderAuthenticationFilter;
import uz.efbazaar.marketplace.security.InternalSecretFilter;
import uz.efbazaar.marketplace.service.ListingService;
import uz.efbazaar.marketplace.service.ListingViewAssembler;

import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AdminListingController.class)
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class, InternalSecretFilter.class})
class AdminListingControllerTest {
    @Autowired MockMvc mvc;
    @MockBean ListingService listings;
    @MockBean ListingViewAssembler assembler;

    /**
     * Katalogni egasi bo'yicha suzish.
     *
     * <p>Nizo yoki shikoyat kelganda admin "shu odamning e'lonlari" ni
     * ko'rishi kerak. Ilgari yagona filtr status edi va bitta sotuvchini
     * topish uchun butun katalogni varaqlashdan boshqa yo'l yo'q edi.
     */
    @Test
    void theCatalogueCanBeNarrowedToOneOwner() throws Exception {
        UUID adminId = UUID.randomUUID();
        UUID owner = UUID.randomUUID();
        when(listings.findForAdmin(eq(null), eq(owner), any()))
                .thenReturn(org.springframework.data.domain.Page.empty());

        mvc.perform(get("/api/v1/admin/listings").param("ownerId", owner.toString())
                        .header("X-User-Id", adminId.toString()).header("X-User-Roles", "ROLE_ADMIN"))
                .andExpect(status().isOk());

        verify(listings).findForAdmin(eq(null), eq(owner), any());
    }

    @Test
    void withoutAnOwnerTheWholeCatalogueIsReturned() throws Exception {
        UUID adminId = UUID.randomUUID();
        when(listings.findForAdmin(any(), eq(null), any()))
                .thenReturn(org.springframework.data.domain.Page.empty());

        mvc.perform(get("/api/v1/admin/listings")
                        .header("X-User-Id", adminId.toString()).header("X-User-Roles", "ROLE_ADMIN"))
                .andExpect(status().isOk());

        verify(listings).findForAdmin(eq(null), eq(null), any());
    }

    @Test
    void adminCanMarkAnotherSellersListingSold() throws Exception {
        UUID id = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        Listing sold = new Listing();
        when(listings.adminMarkSold(id, adminId)).thenReturn(sold);
        mvc.perform(post("/api/v1/admin/listings/{id}/sold", id)
                        .header("X-User-Id", adminId.toString()).header("X-User-Roles", "ROLE_ADMIN"))
                .andExpect(status().isOk());
        verify(listings).adminMarkSold(id, adminId);
        verify(assembler).assemble(sold, adminId);
    }

    @Test
    void regularUserCannotUseAdminSoldEndpoint() throws Exception {
        mvc.perform(post("/api/v1/admin/listings/{id}/sold", UUID.randomUUID())
                        .header("X-User-Id", UUID.randomUUID().toString()).header("X-User-Roles", "ROLE_USER"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(listings, assembler);
    }

    @Test
    void guestCannotUseAdminSoldEndpoint() throws Exception {
        mvc.perform(post("/api/v1/admin/listings/{id}/sold", UUID.randomUUID()))
                .andExpect(status().is4xxClientError());
        verifyNoInteractions(listings, assembler);
    }
}
