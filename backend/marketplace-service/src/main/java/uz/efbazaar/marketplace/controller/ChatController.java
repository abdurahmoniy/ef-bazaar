package uz.efbazaar.marketplace.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.dto.ChatResponse;
import uz.efbazaar.marketplace.dto.PageResponse;
import uz.efbazaar.marketplace.dto.StartChatRequest;
import uz.efbazaar.marketplace.mapper.ChatMapper;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ChatService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/chats")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;
    private final ChatMapper mapper;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ChatResponse start(@AuthenticationPrincipal AuthenticatedUser user,
                              @Valid @RequestBody StartChatRequest request) {
        Chat chat = chatService.start(user.userId(), request.listingId());
        return enrich(chat);
    }

    @GetMapping
    public PageResponse<ChatResponse> mine(@AuthenticationPrincipal AuthenticatedUser user,
                                           @PageableDefault(size = 20) Pageable pageable) {
        Page<Chat> page = chatService.listMine(user.userId(), pageable);
        return PageResponse.from(page, this::enrich);
    }

    @GetMapping("/{id}")
    public ChatResponse get(@AuthenticationPrincipal AuthenticatedUser user,
                            @PathVariable UUID id) {
        return enrich(chatService.getById(id, user.userId()));
    }

    @PostMapping("/{id}/important")
    public ChatResponse toggleImportant(@AuthenticationPrincipal AuthenticatedUser user,
                                        @PathVariable UUID id) {
        return enrich(chatService.toggleImportant(id, user.userId()));
    }

    @PostMapping("/{id}/close")
    public ChatResponse close(@AuthenticationPrincipal AuthenticatedUser user,
                              @PathVariable UUID id) {
        return enrich(chatService.close(id, user.userId()));
    }

    // ----- internal -----

    private ChatResponse enrich(Chat chat) {
        ChatResponse r = mapper.toResponse(chat);
        long count = chatService.countMessages(chat.getId());
        return new ChatResponse(r.id(), r.listingId(), r.buyerId(), r.sellerId(),
                r.status(), r.important(), r.lastMessageAt(),
                r.createdAt(), r.closedAt(), count);
    }
}
