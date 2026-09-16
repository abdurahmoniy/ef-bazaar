package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.domain.ChatMessage;
import uz.efbazaar.marketplace.dto.AdminChatResponse;
import uz.efbazaar.marketplace.dto.AdminChatListingEventResponse;
import uz.efbazaar.marketplace.dto.AdminChatListingEventResponse.ListingSummary;
import uz.efbazaar.marketplace.repository.ChatAccountRequestRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.dto.MessageResponse;
import uz.efbazaar.marketplace.dto.PageResponse;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ChatMessageRepository;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import uz.efbazaar.marketplace.security.AuthSummaryClient.UserSummary;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Anonymous, read-only view of buyer–seller chats for admins.
 *
 * <p>"Anonymous" is kept by construction rather than by care: this service
 * reads chats, messages and listing-selection history, never participant rows,
 * so opening a chat cannot move a read cursor, un-hide a conversation, change
 * an unread badge or back-fill a name. Nothing is published to the chat's live
 * channel either. The parties see exactly what they saw before.
 *
 * <p>The one trace is a server log line when an admin opens a conversation —
 * internal, never shown to users — so it stays known which admin looked.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminChatService {

    static final int MAX_CHATS_PAGE = 50;
    static final int MAX_MESSAGES_PAGE = 200;

    private final ChatRepository chats;
    private final ChatMessageRepository messages;
    private final AuthSummaryClient users;
    private final MessageViewAssembler views;
    private final ChatAccountRequestRepository requests;
    private final ListingRepository listings;

    public PageResponse<AdminChatResponse> list(String query, int page, int size) {
        PageRequest pageable = PageRequest.of(Math.max(0, page), clamp(size, MAX_CHATS_PAGE));
        String pattern = likePattern(query);
        Page<Chat> result = pattern == null
                ? chats.findAllByOrderByLastMessageAtDesc(pageable)
                : chats.searchByName(pattern, pageable);

        Map<UUID, UserSummary> names = users.resolveAll(result.getContent().stream()
                .flatMap(c -> java.util.stream.Stream.of(c.getBuyerId(), c.getSellerId()))
                .distinct()
                .toList());
        return PageResponse.from(result, chat -> toResponse(chat, names));
    }

    public AdminChatResponse get(UUID adminId, UUID chatId) {
        Chat chat = require(chatId);
        log.info("Admin {} opened chat {}", adminId, chatId);
        return toResponse(chat, users.resolveAll(List.of(chat.getBuyerId(), chat.getSellerId())));
    }

    /** Newest first: page 0 is the latest messages, higher pages go back in time. */
    public PageResponse<MessageResponse> messages(UUID chatId, int page, int size) {
        require(chatId);
        Page<ChatMessage> result = messages.findByChatIdOrderByCreatedAtDescIdDesc(
                chatId, PageRequest.of(Math.max(0, page), clamp(size, MAX_MESSAGES_PAGE)));
        return new PageResponse<>(views.withReplyPreviews(result.getContent()),
                result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    /**
     * Anchor each selection to its preceding message, so cards stay on the
     * correct message page even when selections happened in a gap between pages.
     * No participant state, read cursors, notifications or chat messages are changed.
     */
    @Transactional(readOnly = true)
    public List<AdminChatListingEventResponse> listingHistory(UUID chatId) {
        Chat chat = require(chatId);
        var history = requests.findByChatIdOrderByCreatedAtAscIdAsc(chatId);
        List<UUID> listingIds = history.isEmpty()
                ? List.of(chat.getListingId())
                : history.stream().map(r -> r.getListingId()).distinct().toList();
        var summaries = new java.util.HashMap<UUID, ListingSummary>();
        for (var listing : listings.findAllById(listingIds)) {
            summaries.put(listing.getId(), ListingSummary.of(listing));
        }
        if (history.isEmpty()) {
            // Legacy chats without selections still retain the listing they opened on.
            return List.of(new AdminChatListingEventResponse(chat.getId(), chat.getListingId(),
                    chat.getBuyerId(), chat.getCreatedAt(), null, true, summaries.get(chat.getListingId())));
        }
        var result = new ArrayList<AdminChatListingEventResponse>(history.size());
        for (var selection : history) {
            UUID afterMessageId = messages
                    .findFirstByChatIdAndCreatedAtLessThanEqualOrderByCreatedAtDescIdDesc(chatId, selection.getCreatedAt())
                    .map(ChatMessage::getId).orElse(null);
            // Selection rows do not prove which listing originally opened a legacy chat.
            // Deleted messages can also leave a later selection without a preceding anchor.
            result.add(new AdminChatListingEventResponse(selection.getId(), selection.getListingId(),
                    selection.getRequesterId(), selection.getCreatedAt(), afterMessageId,
                    false, summaries.get(selection.getListingId())));
        }
        return result;
    }

    private Chat require(UUID chatId) {
        return chats.findById(chatId).orElseThrow(MarketplaceException::chatNotFound);
    }

    private AdminChatResponse toResponse(Chat chat, Map<UUID, UserSummary> names) {
        return new AdminChatResponse(
                chat.getId(), chat.getListingId(), chat.getBuyerId(), chat.getSellerId(),
                nameOf(names.get(chat.getBuyerId()), chat.getBuyerDisplayName()),
                nameOf(names.get(chat.getSellerId()), chat.getSellerDisplayName()),
                chat.getLastMessageAt(), chat.getCreatedAt(),
                messages.countByChatId(chat.getId()),
                messages.findFirstByChatIdOrderByCreatedAtDesc(chat.getId())
                        .map(ChatService::previewOf)
                        .orElse(null));
    }

    /** "@username" beats the display name; the chat's own snapshot covers auth being down. */
    static String nameOf(UserSummary user, String snapshot) {
        if (user != null && user.telegramUsername() != null && !user.telegramUsername().isBlank()) {
            return "@" + user.telegramUsername();
        }
        if (user != null && user.displayName() != null && !user.displayName().isBlank()) {
            return user.displayName();
        }
        return snapshot;
    }

    /**
     * Lower-cased LIKE pattern for a name search, or null for "no filter". A
     * leading "@" is dropped so a pasted username still matches, and the
     * user's own {@code %}/{@code _} are escaped so they match literally.
     */
    static String likePattern(String query) {
        if (query == null) return null;
        String q = query.strip();
        if (q.startsWith("@")) q = q.substring(1).strip();
        if (q.isEmpty()) return null;
        String escaped = q.toLowerCase(Locale.ROOT)
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }

    private static int clamp(int size, int max) {
        return Math.min(Math.max(1, size), max);
    }
}
