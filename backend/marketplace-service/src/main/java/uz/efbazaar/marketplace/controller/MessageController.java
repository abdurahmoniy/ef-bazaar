package uz.efbazaar.marketplace.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.dto.MessageResponse;
import uz.efbazaar.marketplace.dto.PageResponse;
import uz.efbazaar.marketplace.dto.SendMessageRequest;
import uz.efbazaar.marketplace.mapper.ChatMapper;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ChatService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/chats/{chatId}/messages")
@RequiredArgsConstructor
public class MessageController {

    private final ChatService chatService;
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
}
