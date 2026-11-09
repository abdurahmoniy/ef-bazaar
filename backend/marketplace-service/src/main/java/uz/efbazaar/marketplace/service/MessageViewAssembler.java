package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.domain.ChatMessage;
import uz.efbazaar.marketplace.dto.MessageResponse;
import uz.efbazaar.marketplace.mapper.ChatMapper;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Turns stored messages into responses with their quoted-message previews.
 * Shared by the participant chat and the admin viewer so both show a reply
 * the same way.
 */
@Component
@RequiredArgsConstructor
public class MessageViewAssembler {

    private final ChatService chatService;
    private final ChatMapper mapper;

    /** Attaches quoted-message previews with a single batch lookup. */
    public List<MessageResponse> withReplyPreviews(List<ChatMessage> raw) {
        Set<UUID> replyIds = raw.stream()
                .map(ChatMessage::getReplyToId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, ChatMessage> replied = chatService.messagesByIds(replyIds);

        return raw.stream().map(m -> {
            MessageResponse base = mapper.toMessageResponse(m);
            if (m.getReplyToId() == null) return base;
            ChatMessage quoted = replied.get(m.getReplyToId());
            if (quoted == null) return base; // deleted quote — frontend shows placeholder
            return new MessageResponse(base.id(), base.chatId(), base.senderId(),
                    base.content(), base.attachmentType(), base.attachmentFileId(),
                    base.attachmentName(), base.attachmentMime(), base.attachmentSize(),
                    base.replyToId(), quoted.getSenderId(), ChatService.previewOf(quoted),
                    base.editedAt(), base.createdAt(),
                    base.messageType(), base.proposalId(), base.proposalOutcome(),
                    base.proposalKind(), base.proposalListingId(), base.proposalExpiresAt(), base.proposalTradeId(), base.clientMessageId(),
                    base.contactHidden());
        }).toList();
    }
}
