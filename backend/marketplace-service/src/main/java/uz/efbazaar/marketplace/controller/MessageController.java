package uz.efbazaar.marketplace.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import uz.efbazaar.marketplace.domain.ChatMessage;
import uz.efbazaar.marketplace.dto.EditMessageRequest;
import uz.efbazaar.marketplace.dto.MessageResponse;
import uz.efbazaar.marketplace.dto.PageResponse;
import uz.efbazaar.marketplace.dto.SendMessageRequest;
import uz.efbazaar.marketplace.mapper.ChatMapper;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ChatAttachmentService;
import uz.efbazaar.marketplace.service.ChatService;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/chats/{chatId}/messages")
@RequiredArgsConstructor
public class MessageController {

    private final ChatService chatService;
    private final ChatAttachmentService attachments;
    private final ChatMapper mapper;

    @GetMapping
    public PageResponse<MessageResponse> list(@AuthenticationPrincipal AuthenticatedUser user,
                                              @PathVariable UUID chatId,
                                              @PageableDefault(size = 50) Pageable pageable) {
        Page<ChatMessage> page = chatService.listMessages(chatId, user.userId(), pageable);
        List<MessageResponse> content = withReplyPreviews(page.getContent());
        return new PageResponse<>(content, page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MessageResponse send(@AuthenticationPrincipal AuthenticatedUser user,
                                @PathVariable UUID chatId,
                                @Valid @RequestBody SendMessageRequest request) {
        ChatMessage sent = chatService.sendMessage(
                chatId, user.userId(), request.content(), request.replyToId());
        return withReplyPreviews(List.of(sent)).get(0);
    }

    /** Edit own message content (attachments immutable). */
    @PatchMapping("/{messageId}")
    public MessageResponse edit(@AuthenticationPrincipal AuthenticatedUser user,
                                @PathVariable UUID chatId,
                                @PathVariable UUID messageId,
                                @Valid @RequestBody EditMessageRequest request) {
        ChatMessage edited = chatService.editMessage(
                chatId, messageId, user.userId(), request.content());
        return withReplyPreviews(List.of(edited)).get(0);
    }

    /** Delete own message — hard delete, gone for both sides. */
    @DeleteMapping("/{messageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser user,
                       @PathVariable UUID chatId,
                       @PathVariable UUID messageId) {
        chatService.deleteMessage(chatId, messageId, user.userId());
    }

    /**
     * Sends a message carrying an attachment (photo / file / voice note).
     * Participation and chat status are checked BEFORE the Telegram upload so
     * strangers or closed chats can't trigger outbound media traffic.
     *
     * @param voice mark an {@code audio/*} upload as a voice note (renders as
     *              a playable bubble instead of a file card)
     */
    @PostMapping(value = "/attachments", consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    public MessageResponse sendAttachment(@AuthenticationPrincipal AuthenticatedUser user,
                                          @PathVariable UUID chatId,
                                          @RequestParam("file") MultipartFile file,
                                          @RequestParam(value = "caption", required = false) String caption,
                                          @RequestParam(value = "voice", required = false,
                                                  defaultValue = "false") boolean voice) {
        chatService.getById(chatId, user.userId()); // participant + existence check
        ChatAttachmentService.Uploaded uploaded = attachments.upload(file, voice);
        return mapper.toMessageResponse(
                chatService.sendAttachment(chatId, user.userId(), uploaded, caption));
    }

    // ----- internal -----

    /** Attaches quoted-message previews with a single batch lookup. */
    private List<MessageResponse> withReplyPreviews(List<ChatMessage> raw) {
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
                    base.messageType(), base.proposalId(), base.proposalOutcome());
        }).toList();
    }
}
