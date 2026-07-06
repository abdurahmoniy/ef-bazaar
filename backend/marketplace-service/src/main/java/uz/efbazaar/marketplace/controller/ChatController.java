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
        chatService.backfillDisplayNames(page.getContent());
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
        List<Chat> mine = chatService.listMine(user.userId(), top).getContent();
        chatService.backfillDisplayNames(mine);
        return mine.stream().map(chat -> enrich(chat, user.userId())).toList();
    }

    @GetMapping("/{id}")
    public ChatResponse get(@AuthenticationPrincipal AuthenticatedUser user,
                            @PathVariable UUID id) {
        Chat chat = chatService.getById(id, user.userId());
        chatService.backfillDisplayNames(List.of(chat));
        return enrich(chat, user.userId());
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

    /** Moves the caller's read cursor to now (clears the unread badge). */
    @PostMapping("/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@AuthenticationPrincipal AuthenticatedUser user,
                         @PathVariable UUID id) {
        chatService.markRead(id, user.userId());
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
     * participant entry. {@code unreadCount}/{@code lastReadAt} are likewise
     * viewer-specific.
     */
    private ChatResponse enrich(Chat chat, UUID viewerId) {
        ChatResponse r = mapper.toResponse(chat);
        long count = chatService.countMessages(chat.getId());
        var participant = chatService.getParticipant(chat.getId(), viewerId);
        boolean myImportant = participant
                .map(p -> p.isImportant())
                .orElse(r.important());
        var lastReadAt = participant.map(p -> p.getLastReadAt()).orElse(null);
        long unread = chatService.countUnread(chat.getId(), viewerId);
        String preview = chatService.lastMessagePreview(chat.getId());
        return new ChatResponse(r.id(), r.listingId(), r.buyerId(), r.sellerId(),
                r.buyerDisplayName(), r.sellerDisplayName(),
                r.status(), myImportant, r.lastMessageAt(),
                r.createdAt(), r.closedAt(), count, unread, lastReadAt, preview);
    }
}
