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
    ChatResponse toResponse(Chat chat);

    MessageResponse toMessageResponse(ChatMessage message);
}
