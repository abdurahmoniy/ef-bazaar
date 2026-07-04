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
import uz.efbazaar.marketplace.dto.MessageResponse;
import uz.efbazaar.marketplace.dto.PageResponse;
import uz.efbazaar.marketplace.dto.SendMessageRequest;
import uz.efbazaar.marketplace.mapper.ChatMapper;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ChatAttachmentService;
import uz.efbazaar.marketplace.service.ChatService;

import java.util.UUID;

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
        Page<MessageResponse> page = chatService.listMessages(chatId, user.userId(), pageable)
                .map(mapper::toMessageResponse);
        return new PageResponse<>(page.getContent(), page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MessageResponse send(@AuthenticationPrincipal AuthenticatedUser user,
                                @PathVariable UUID chatId,
                                @Valid @RequestBody SendMessageRequest request) {
        return mapper.toMessageResponse(
                chatService.sendMessage(chatId, user.userId(), request.content()));
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
}
