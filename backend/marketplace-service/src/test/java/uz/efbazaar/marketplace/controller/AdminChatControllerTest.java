package uz.efbazaar.marketplace.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.security.HeaderAuthenticationFilter;
import uz.efbazaar.marketplace.security.InternalSecretFilter;
import uz.efbazaar.marketplace.service.AdminChatService;

import java.util.UUID;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AdminChatController.class)
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class, InternalSecretFilter.class})
class AdminChatControllerTest {
    @Autowired MockMvc mvc;
    @MockBean AdminChatService service;

    @Test
    void adminListsChats() throws Exception {
        mvc.perform(get("/api/v1/admin/chats").param("q", "ali")
                        .header("X-User-Id", UUID.randomUUID().toString()).header("X-User-Roles", "ROLE_ADMIN"))
                .andExpect(status().isOk());
        verify(service).list("ali", 0, 20);
    }

    @Test
    void openingAChatIsAttributedToTheAdmin() throws Exception {
        UUID adminId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        mvc.perform(get("/api/v1/admin/chats/{id}", chatId)
                        .header("X-User-Id", adminId.toString()).header("X-User-Roles", "ROLE_ADMIN"))
                .andExpect(status().isOk());
        verify(service).get(adminId, chatId);
    }

    @Test
    void aRegularUserCannotReadOtherPeoplesChats() throws Exception {
        mvc.perform(get("/api/v1/admin/chats/{id}/messages", UUID.randomUUID())
                        .header("X-User-Id", UUID.randomUUID().toString()).header("X-User-Roles", "ROLE_USER"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    /** Read-only: there is no write route, so a POST cannot reach the service. */
    @Test
    void thereIsNoWayToWriteIntoAChat() throws Exception {
        mvc.perform(post("/api/v1/admin/chats/{id}/messages", UUID.randomUUID())
                        .header("X-User-Id", UUID.randomUUID().toString()).header("X-User-Roles", "ROLE_ADMIN"));
        // The status is whatever the global handler makes of an unsupported
        // method; what matters is that nothing behind the controller ran.
        verifyNoInteractions(service);
    }
}
