package uz.efbazaar.marketplace.support.controller;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.support.domain.SupportCategory;
import uz.efbazaar.marketplace.support.domain.SupportChatStatus;
import uz.efbazaar.marketplace.support.dto.CreateSupportChatRequest;
import uz.efbazaar.marketplace.support.dto.SendSupportMessageRequest;
import uz.efbazaar.marketplace.support.dto.SupportChatResponse;
import uz.efbazaar.marketplace.support.dto.SupportMessageResponse;
import uz.efbazaar.marketplace.support.service.SupportChatService;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class SupportControllerTest {

    @Test
    void createChatDelegatesToService() {
        SupportChatService service = mock(SupportChatService.class);
        SupportController controller = new SupportController(service);

        CreateSupportChatRequest req = new CreateSupportChatRequest(
                SupportCategory.SUPPORT, "Yordam kerak", "Alisher", null, null);
        SupportChatResponse expected = new SupportChatResponse(
                UUID.randomUUID(), SupportCategory.SUPPORT, SupportChatStatus.OPEN,
                "Alisher", null, List.of(), Instant.now(), Instant.now());

        when(service.createChat(any(), any())).thenReturn(expected);

        SupportChatResponse res = controller.createChat(null, "header-sess", req);
        assertThat(res.id()).isEqualTo(expected.id());
        verify(service).createChat(isNull(), any(CreateSupportChatRequest.class));
    }

    @Test
    void getActiveChatReturns200Or204() {
        SupportChatService service = mock(SupportChatService.class);
        SupportController controller = new SupportController(service);

        when(service.getActiveChat(any(), any())).thenReturn(Optional.empty());
        ResponseEntity<SupportChatResponse> res = controller.getActiveChat(null, null, "guest-1");
        assertThat(res.getStatusCode().value()).isEqualTo(204);

        SupportChatResponse chat = new SupportChatResponse(
                UUID.randomUUID(), SupportCategory.QUESTION, SupportChatStatus.OPEN,
                "Mehmon", null, List.of(), Instant.now(), Instant.now());
        when(service.getActiveChat(any(), eq("guest-1"))).thenReturn(Optional.of(chat));

        ResponseEntity<SupportChatResponse> foundRes = controller.getActiveChat(null, null, "guest-1");
        assertThat(foundRes.getStatusCode().value()).isEqualTo(200);
        assertThat(foundRes.getBody()).isNotNull();
        assertThat(foundRes.getBody().id()).isEqualTo(chat.id());
    }
}
