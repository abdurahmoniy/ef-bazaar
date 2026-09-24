package uz.efbazaar.marketplace.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.security.HeaderAuthenticationFilter;
import uz.efbazaar.marketplace.security.InternalSecretFilter;
import uz.efbazaar.marketplace.service.ChatActivityService;
import uz.efbazaar.marketplace.service.ChatService;
import uz.efbazaar.marketplace.service.ChatAccountRequestService;
import uz.efbazaar.marketplace.mapper.ChatMapper;
import uz.efbazaar.marketplace.dto.ChatActivityResponse;
import java.time.Instant;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest({ChatActivityController.class, ChatController.class})
@Import({SecurityConfig.class, HeaderAuthenticationFilter.class, InternalSecretFilter.class})
class ChatActivityControllerTest {
    @Autowired MockMvc mvc;
    @MockBean ChatActivityService activity;
    @MockBean ChatService chats;
    @MockBean ChatAccountRequestService accountRequests;
    @MockBean ChatMapper mapper;
    private final UUID user = UUID.randomUUID();
    private final UUID chat = UUID.randomUUID();

    @Test void heartbeatAndTypingReturnNoContentForAuthenticatedUser() throws Exception {
        mvc.perform(post("/api/v1/chats/presence").header("X-User-Id", user)).andExpect(status().isNoContent());
        verify(activity).presence(user);
        mvc.perform(post("/api/v1/chats/{id}/typing", chat).header("X-User-Id", user)
                .contentType(MediaType.APPLICATION_JSON).content("{\"typing\":true}")).andExpect(status().isNoContent());
        verify(activity).typing(chat, user, true);
    }
    @Test void anonymousRequestsCannotReachActivityOrReadService() throws Exception {
        mvc.perform(post("/api/v1/chats/presence")).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/chats/{id}/activity", chat)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/chats/{id}/typing", chat).contentType(MediaType.APPLICATION_JSON)
                .content("{\"typing\":true}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/chats/{id}/read", chat)).andExpect(status().isForbidden());
        verifyNoInteractions(activity, chats);
    }
    @Test void activityReturnsPartnerTimestampsInIsoFormat() throws Exception {
        var at = Instant.parse("2026-09-24T10:00:00Z");
        when(activity.activity(chat, user)).thenReturn(new ChatActivityResponse(true, false, at, at));
        mvc.perform(get("/api/v1/chats/{id}/activity", chat).header("X-User-Id", user))
                .andExpect(status().isOk()).andExpect(jsonPath("$.online").value(true))
                .andExpect(jsonPath("$.typing").value(false)).andExpect(jsonPath("$.lastSeenAt").value(at.toString()))
                .andExpect(jsonPath("$.lastReadAt").value(at.toString()));
    }
    @Test void readRequestAcceptsMessageIdAndLegacyEmptyBody() throws Exception {
        UUID message = UUID.randomUUID();
        mvc.perform(post("/api/v1/chats/{id}/read", chat).header("X-User-Id", user)
                .contentType(MediaType.APPLICATION_JSON).content("{\"messageId\":\"" + message + "\"}"))
                .andExpect(status().isNoContent());
        verify(chats).markRead(chat, user, message);
        mvc.perform(post("/api/v1/chats/{id}/read", chat).header("X-User-Id", user))
                .andExpect(status().isNoContent());
        verify(chats).markRead(chat, user);
    }
    @Test void malformedBodiesDoNotAdvanceReadOrTypingState() throws Exception {
        mvc.perform(post("/api/v1/chats/{id}/read", chat).header("X-User-Id", user)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/chats/{id}/typing", chat).header("X-User-Id", user)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(chats, activity);
    }
}
