package uz.efbazaar.marketplace.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.domain.ChatMessage;
import uz.efbazaar.marketplace.dto.ChatResponse;
import uz.efbazaar.marketplace.dto.MessageResponse;

@Mapper(componentModel = "spring")
public interface ChatMapper {

    @Mapping(target = "messageCount", ignore = true)
    @Mapping(target = "unreadCount", ignore = true)
    @Mapping(target = "lastReadAt", ignore = true)
    @Mapping(target = "lastMessagePreview", ignore = true)
    ChatResponse toResponse(Chat chat);

    @Mapping(target = "replySenderId", ignore = true)
    @Mapping(target = "replyPreview", ignore = true)
    MessageResponse toMessageResponse(ChatMessage message);
}
