package uz.efbazaar.marketplace.support.controller;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import uz.efbazaar.marketplace.dto.PageResponse;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.support.domain.SupportCategory;
import uz.efbazaar.marketplace.support.domain.SupportChatStatus;
import uz.efbazaar.marketplace.support.domain.SupportSenderType;
import uz.efbazaar.marketplace.support.dto.AdminSupportChatSummaryResponse;
import uz.efbazaar.marketplace.support.dto.AdminSupportReplyRequest;
import uz.efbazaar.marketplace.support.dto.SupportChatResponse;
import uz.efbazaar.marketplace.support.dto.SupportMessageResponse;
import uz.efbazaar.marketplace.support.service.SupportChatService;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class AdminSupportControllerTest {

    @Test
    void listReturnsPaginatedChats() {
        SupportChatService service = mock(SupportChatService.class);
        AdminSupportController controller = new AdminSupportController(service);

        AdminSupportChatSummaryResponse item = new AdminSupportChatSummaryResponse(
                UUID.randomUUID(),
                SupportCategory.PARTNERSHIP,
                SupportChatStatus.OPEN,
                null,
                "guest-123",
                "Aziz",
                "+998901234567",
                null,
                "Assalomu alaykum, hamkorlik qilmoqchiman",
                Instant.now(),
                Instant.now()
        );
        Page<AdminSupportChatSummaryResponse> page = new PageImpl<>(List.of(item), PageRequest.of(0, 20), 1);
        when(service.getChatsForAdmin(eq(SupportCategory.PARTNERSHIP), eq(SupportChatStatus.OPEN), eq("Aziz"), any(Pageable.class)))
                .thenReturn(page);

        PageResponse<AdminSupportChatSummaryResponse> response = controller.list(
                SupportCategory.PARTNERSHIP, SupportChatStatus.OPEN, "Aziz", PageRequest.of(0, 20));

        assertThat(response.content()).hasSize(1);
        assertThat(response.content().getFirst().senderName()).isEqualTo("Aziz");
        assertThat(response.totalElements()).isEqualTo(1);
        verify(service).getChatsForAdmin(eq(SupportCategory.PARTNERSHIP), eq(SupportChatStatus.OPEN), eq("Aziz"), any(Pageable.class));
    }

    @Test
    void getChatReturnsChatWithMessages() {
        SupportChatService service = mock(SupportChatService.class);
        AdminSupportController controller = new AdminSupportController(service);

        UUID chatId = UUID.randomUUID();
        SupportChatResponse expected = new SupportChatResponse(
                chatId,
                SupportCategory.SUPPORT,
                SupportChatStatus.OPEN,
                "Sardor",
                "@sardor",
                List.of(new SupportMessageResponse(UUID.randomUUID(), chatId, SupportSenderType.USER, "Sardor", "Yordam kerak", Instant.now())),
                Instant.now(),
                Instant.now()
        );
        when(service.getChatForAdmin(chatId)).thenReturn(expected);

        SupportChatResponse response = controller.getChat(chatId);
        assertThat(response.id()).isEqualTo(chatId);
        assertThat(response.messages()).hasSize(1);
        verify(service).getChatForAdmin(chatId);
    }

    @Test
    void replyDelegatesToService() {
        SupportChatService service = mock(SupportChatService.class);
        AdminSupportController controller = new AdminSupportController(service);

        UUID chatId = UUID.randomUUID();
        AuthenticatedUser adminUser = new AuthenticatedUser(UUID.randomUUID(), 111L, List.of("ROLE_ADMIN"), "Admin User");
        AdminSupportReplyRequest request = new AdminSupportReplyRequest("Sizga yordam beramiz!");

        SupportMessageResponse msg = new SupportMessageResponse(
                UUID.randomUUID(), chatId, SupportSenderType.ADMIN, "Admin User", request.content(), Instant.now());
        when(service.replyAsAdmin(chatId, adminUser, request)).thenReturn(msg);

        SupportMessageResponse res = controller.reply(adminUser, chatId, request);
        assertThat(res.content()).isEqualTo("Sizga yordam beramiz!");
        assertThat(res.senderType()).isEqualTo(SupportSenderType.ADMIN);
        verify(service).replyAsAdmin(chatId, adminUser, request);
    }

    @Test
    void closeChatDelegatesToService() {
        SupportChatService service = mock(SupportChatService.class);
        AdminSupportController controller = new AdminSupportController(service);

        UUID chatId = UUID.randomUUID();
        SupportChatResponse closed = new SupportChatResponse(
                chatId, SupportCategory.QUESTION, SupportChatStatus.CLOSED, "Ali", null, List.of(), Instant.now(), Instant.now());
        when(service.closeChatAsAdmin(chatId)).thenReturn(closed);

        SupportChatResponse res = controller.closeChat(chatId);
        assertThat(res.status()).isEqualTo(SupportChatStatus.CLOSED);
        verify(service).closeChatAsAdmin(chatId);
    }
}
