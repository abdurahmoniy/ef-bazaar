package uz.efbazaar.marketplace.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
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

import java.util.List;
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
        return enrich(chat, user.userId());
    }

    @GetMapping
    public PageResponse<ChatResponse> mine(@AuthenticationPrincipal AuthenticatedUser user,
                                           @PageableDefault(size = 20) Pageable pageable) {
        Page<Chat> page = chatService.listMine(user.userId(), pageable);
        return PageResponse.from(page, chat -> enrich(chat, user.userId()));
    }

    /**
     * Compact "my chats" endpoint returning a plain list (no pagination envelope).
     * Frontend profile page loads a small, fixed slice — 100 items is enough for
     * the current UX (there's no infinite scroll on that view).
     */
    @GetMapping("/me")
    public List<ChatResponse> me(@AuthenticationPrincipal AuthenticatedUser user) {
        Pageable top = PageRequest.of(0, 100, Sort.by(Sort.Direction.DESC, "createdAt"));
        return chatService.listMine(user.userId(), top).stream()
                .map(chat -> enrich(chat, user.userId())).toList();
    }

    @GetMapping("/{id}")
    public ChatResponse get(@AuthenticationPrincipal AuthenticatedUser user,
                            @PathVariable UUID id) {
        return enrich(chatService.getById(id, user.userId()), user.userId());
    }

    @PostMapping("/{id}/important")
    public ChatResponse toggleImportant(@AuthenticationPrincipal AuthenticatedUser user,
                                        @PathVariable UUID id) {
        return enrich(chatService.toggleImportant(id, user.userId()), user.userId());
    }

    /**
     * One-sided delete — removes the chat from the caller's list only.
     * The partner keeps the conversation and a new message resurfaces it.
     */
    @PostMapping("/{id}/hide")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void hide(@AuthenticationPrincipal AuthenticatedUser user,
                     @PathVariable UUID id) {
        chatService.hide(id, user.userId());
    }

    @PostMapping("/{id}/close")
    public ChatResponse close(@AuthenticationPrincipal AuthenticatedUser user,
                              @PathVariable UUID id) {
        return enrich(chatService.close(id, user.userId()), user.userId());
    }

    // ----- internal -----

    /**
     * {@code important} in the response is the CALLER's own star, not the
     * aggregate stored on the chat row (that one only drives auto-close
     * exemption). Falls back to the aggregate for pre-V10 rows without a
     * participant entry.
     */
    private ChatResponse enrich(Chat chat, UUID viewerId) {
        ChatResponse r = mapper.toResponse(chat);
        long count = chatService.countMessages(chat.getId());
        boolean myImportant = chatService.getParticipant(chat.getId(), viewerId)
                .map(p -> p.isImportant())
                .orElse(r.important());
        return new ChatResponse(r.id(), r.listingId(), r.buyerId(), r.sellerId(),
                r.buyerDisplayName(), r.sellerDisplayName(),
                r.status(), myImportant, r.lastMessageAt(),
                r.createdAt(), r.closedAt(), count);
    }
}
