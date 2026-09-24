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
import uz.efbazaar.marketplace.dto.AccountRequestCreateRequest;
import uz.efbazaar.marketplace.dto.AccountRequestResponse;
import uz.efbazaar.marketplace.dto.ChatListingOptionResponse;
import uz.efbazaar.marketplace.dto.ChatResponse;
import uz.efbazaar.marketplace.dto.PageResponse;
import uz.efbazaar.marketplace.dto.StartChatRequest;
import uz.efbazaar.marketplace.mapper.ChatMapper;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ChatAccountRequestService;
import uz.efbazaar.marketplace.service.ChatService;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/chats")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;
    private final ChatAccountRequestService accountRequests;
    private final ChatMapper mapper;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ChatResponse start(@AuthenticationPrincipal AuthenticatedUser user,
                              @Valid @RequestBody StartChatRequest request) {
        Chat chat = chatService.start(user.userId(), request.listingId());
        chatService.stampOwnName(List.of(chat), user.userId(), user.displayName());
        return enrich(chat, user.userId());
    }

    @GetMapping
    public PageResponse<ChatResponse> mine(@AuthenticationPrincipal AuthenticatedUser user,
                                           @PageableDefault(size = 20) Pageable pageable) {
        Page<Chat> page = chatService.listMine(user.userId(), pageable);
        chatService.stampOwnName(page.getContent(), user.userId(), user.displayName());
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
        chatService.stampOwnName(mine, user.userId(), user.displayName());
        chatService.backfillDisplayNames(mine);
        return mine.stream().map(chat -> enrich(chat, user.userId())).toList();
    }

    @GetMapping("/{id}")
    public ChatResponse get(@AuthenticationPrincipal AuthenticatedUser user,
                            @PathVariable UUID id) {
        Chat chat = chatService.getById(id, user.userId());
        chatService.stampOwnName(List.of(chat), user.userId(), user.displayName());
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
        chatService.clearHistory(id, user.userId());
    }

    /** Moves the caller's read cursor to now (clears the unread badge). */
    @PostMapping("/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@AuthenticationPrincipal AuthenticatedUser user,
                         @PathVariable UUID id) {
        chatService.markRead(id, user.userId());
    }

    /** Sum of unread messages across all visible chats — nav-icon badge. */
    @GetMapping("/unread-total")
    public java.util.Map<String, Long> unreadTotal(@AuthenticationPrincipal AuthenticatedUser user) {
        return java.util.Map.of("count", chatService.totalUnread(user.userId()));
    }

    // ----- account requests: which listing this chat is currently about -----

    /**
     * The partner's active listings. Either participant may ask, because either
     * may be the one buying next.
     */
    @GetMapping("/{id}/partner-listings")
    public List<ChatListingOptionResponse> partnerListings(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID id) {
        return accountRequests.partnerListings(user.userId(), id).stream()
                .map(ChatListingOptionResponse::of)
                .toList();
    }

    /** Null body when nothing is being negotiated — an empty chat is not an error. */
    @GetMapping("/{id}/account-request")
    public AccountRequestResponse currentRequest(@AuthenticationPrincipal AuthenticatedUser user,
                                                 @PathVariable UUID id) {
        return accountRequests.current(user.userId(), id)
                .map(accountRequests::describe)
                .orElse(null);
    }

    /** Picking an account: the caller becomes the buyer, the partner the seller. */
    @PostMapping("/{id}/account-request")
    @ResponseStatus(HttpStatus.CREATED)
    public AccountRequestResponse openRequest(@AuthenticationPrincipal AuthenticatedUser user,
                                              @PathVariable UUID id,
                                              @Valid @RequestBody AccountRequestCreateRequest body) {
        return accountRequests.describe(
                accountRequests.open(user.userId(), id, body.listingId()));
    }

    @DeleteMapping("/{id}/account-request")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancelRequest(@AuthenticationPrincipal AuthenticatedUser user,
                              @PathVariable UUID id) {
        accountRequests.cancel(user.userId(), id);
    }

    // ----- internal -----

    /**
     * {@code important} in the response is the CALLER's own star, not the
     * aggregate stored on the chat row. Falls back to the aggregate for pre-V10 rows without a
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
                myImportant, r.lastMessageAt(),
                r.createdAt(), count, unread, lastReadAt, preview);
    }
}
