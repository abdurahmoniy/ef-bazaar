package uz.efbazaar.marketplace.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.mapper.ChatMapper;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ChatAccountRequestService;
import uz.efbazaar.marketplace.service.ChatService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class ChatHistoryCutoffTest {
    @Test
    void sendsTheHistoryCutoffThroughTheEnrichedChatResponse() {
        UUID viewer = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        Instant cutoff = Instant.parse("2026-09-24T09:00:00Z");
        Chat chat = Chat.builder().id(chatId).buyerId(viewer).clearedAt(cutoff).build();
        ChatService service = mock(ChatService.class);
        when(service.getById(chatId, viewer)).thenReturn(chat);
        var controller = new ChatController(service, mock(ChatAccountRequestService.class), Mappers.getMapper(ChatMapper.class));
        var mapper = new ObjectMapper().findAndRegisterModules();
        var response = mapper.valueToTree(controller.get(new AuthenticatedUser(viewer, null, List.of()), chatId));
        assertThat(response.hasNonNull("clearedAt")).isTrue();
        assertThat(mapper.convertValue(response.get("clearedAt"), Instant.class)).isEqualTo(cutoff);
    }
}
