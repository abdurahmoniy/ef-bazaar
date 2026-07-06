package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.*;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ChatMessageRepository;
import uz.efbazaar.marketplace.repository.ChatParticipantRepository;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.security.AuthNameClient;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    private final ChatRepository chats;
    private final ChatMessageRepository messages;
    private final ChatParticipantRepository participants;
    private final ListingRepository listings;
    private final MarketplaceEventPublisher events;
    private final AuthNameClient authNameClient;
    private final NotificationService notifications;

    @Transactional
    public Chat start(UUID buyerId, UUID listingId) {
        Listing listing = listings.findById(listingId)
                .orElseThrow(MarketplaceException::listingNotFound);
        if (listing.getStatus() != ListingStatus.ACTIVE) {
            throw MarketplaceException.listingNotActive();
        }
        if (listing.getSellerId().equals(buyerId)) {
            throw MarketplaceException.cannotChatWithSelf();
        }

        // Idempotency: agar allaqachon aktiv chat bor bo'lsa, qaytaramiz.
        // Xaridor uni "o'chirgan" bo'lsa ham qayta ochilgani — unhide.
        var existing = chats.findByBuyerIdAndListingIdAndStatus(buyerId, listingId, ChatStatus.ACTIVE);
        if (existing.isPresent()) {
            participants.findByChatIdAndUserId(existing.get().getId(), buyerId)
                    .filter(p -> p.getHiddenAt() != null)
                    .ifPresent(p -> p.setHiddenAt(null));
            return existing.get();
        }

        UUID sellerId = listing.getSellerId();
        Map<UUID, String> names = authNameClient.resolveNames(List.of(buyerId, sellerId));

        try {
            Chat chat = chats.save(Chat.builder()
                    .listingId(listingId)
                    .buyerId(buyerId)
                    .sellerId(sellerId)
                    .buyerDisplayName(names.get(buyerId))
                    .sellerDisplayName(names.get(sellerId))
                    .status(ChatStatus.ACTIVE)
                    .important(false)
                    .lastMessageAt(Instant.now())
                    .build());
            // Read cursor starts at creation for both sides: everything after
            // (i.e. the first message) counts as unread for the recipient.
            Instant now = Instant.now();
            participants.save(ChatParticipant.builder()
                    .chatId(chat.getId()).userId(buyerId).lastReadAt(now).build());
            participants.save(ChatParticipant.builder()
                    .chatId(chat.getId()).userId(sellerId).lastReadAt(now).build());
            events.chatCreated(chat.getId(), listingId, buyerId, sellerId);
            notifications.chatCreated(chat);
            log.info("Chat created: id={} listingId={} buyer={} seller={}",
                    chat.getId(), listingId, buyerId, sellerId);
            return chat;
        } catch (DataIntegrityViolationException e) {
            // Concurrent start — fallback to existing
            throw MarketplaceException.activeChatAlreadyExists();
        }
    }

    @Transactional(readOnly = true)
    public Chat getById(UUID id, UUID userId) {
        Chat chat = chats.findById(id).orElseThrow(MarketplaceException::chatNotFound);
        if (!chat.isParticipant(userId)) {
            throw MarketplaceException.notChatParticipant();
        }
        return chat;
    }

    @Transactional(readOnly = true)
    public Page<Chat> listMine(UUID userId, Pageable pageable) {
        return chats.findByParticipant(userId, pageable);
    }

    @Transactional
    public ChatMessage sendMessage(UUID chatId, UUID senderId, String content) {
        Chat chat = chats.findById(chatId).orElseThrow(MarketplaceException::chatNotFound);
        if (!chat.isParticipant(senderId)) {
            throw MarketplaceException.notChatParticipant();
        }
        if (chat.getStatus() != ChatStatus.ACTIVE) {
            throw MarketplaceException.chatAlreadyClosed();
        }

        ChatMessage saved = messages.save(ChatMessage.builder()
                .chatId(chatId)
                .senderId(senderId)
                .content(content)
                .build());
        chat.setLastMessageAt(saved.getCreatedAt());
        // "Delete for me" is soft: a new message resurfaces the chat for
        // whoever hid it, so the recipient never misses an active negotiation.
        participants.unhideAll(chatId);
        notifications.newMessage(chat, senderId);
        return saved;
    }

    /**
     * Persists a message carrying an already-uploaded attachment. The upload
     * itself happens in {@link ChatAttachmentService} BEFORE this call (the
     * controller checks participation first via {@link #getById} so strangers
     * can't trigger Telegram uploads).
     */
    @Transactional
    public ChatMessage sendAttachment(UUID chatId, UUID senderId,
                                      ChatAttachmentService.Uploaded uploaded, String caption) {
        Chat chat = chats.findById(chatId).orElseThrow(MarketplaceException::chatNotFound);
        if (!chat.isParticipant(senderId)) {
            throw MarketplaceException.notChatParticipant();
        }
        if (chat.getStatus() != ChatStatus.ACTIVE) {
            throw MarketplaceException.chatAlreadyClosed();
        }

        ChatMessage saved = messages.save(ChatMessage.builder()
                .chatId(chatId)
                .senderId(senderId)
                .content(caption == null ? "" : caption.trim())
                .attachmentType(uploaded.type())
                .attachmentFileId(uploaded.fileId())
                .attachmentName(uploaded.name())
                .attachmentMime(uploaded.mime())
                .attachmentSize(uploaded.size())
                .build());
        chat.setLastMessageAt(saved.getCreatedAt());
        participants.unhideAll(chatId);
        notifications.newMessage(chat, senderId);
        return saved;
    }

    @Transactional(readOnly = true)
    public Page<ChatMessage> listMessages(UUID chatId, UUID userId, Pageable pageable) {
        Chat chat = getById(chatId, userId); // participant check
        return messages.findByChatIdOrderByCreatedAtAsc(chat.getId(), pageable);
    }

    @Transactional(readOnly = true)
    public long countMessages(UUID chatId) {
        return messages.countByChatId(chatId);
    }

    /**
     * Toggles MY star only. {@code chat.important} is recomputed as the OR of
     * both participants' stars — the expiry scheduler exempts a chat when
     * either side marked it important.
     */
    @Transactional
    public Chat toggleImportant(UUID chatId, UUID userId) {
        Chat chat = getById(chatId, userId);
        ChatParticipant mine = getParticipantRow(chatId, userId);
        mine.setImportant(!mine.isImportant());
        boolean aggregate = participants.findByChatId(chatId).stream()
                .anyMatch(ChatParticipant::isImportant);
        chat.setImportant(aggregate);
        log.debug("Chat {} important toggled to {} by {} (aggregate={})",
                chatId, mine.isImportant(), userId, aggregate);
        return chat;
    }

    /**
     * One-sided delete: hides the chat from MY list only. The partner keeps
     * the conversation; any new message clears the flag and the chat
     * reappears (see {@link #sendMessage}).
     */
    @Transactional
    public void hide(UUID chatId, UUID userId) {
        getById(chatId, userId); // participant check
        ChatParticipant mine = getParticipantRow(chatId, userId);
        if (mine.getHiddenAt() == null) {
            mine.setHiddenAt(Instant.now());
            log.info("Chat {} hidden by {}", chatId, userId);
        }
    }

    @Transactional(readOnly = true)
    public Optional<ChatParticipant> getParticipant(UUID chatId, UUID userId) {
        return participants.findByChatIdAndUserId(chatId, userId);
    }

    /** Moves my read cursor to now — clears the unread badge for this chat. */
    @Transactional
    public void markRead(UUID chatId, UUID userId) {
        getById(chatId, userId); // participant check
        getParticipantRow(chatId, userId).setLastReadAt(Instant.now());
    }

    /**
     * Partner messages newer than my read cursor. A null cursor (row written
     * by a pre-V13 node during rollout) counts as "all read" — never floods
     * the UI with historic messages.
     */
    @Transactional(readOnly = true)
    public long countUnread(UUID chatId, UUID userId) {
        Instant cursor = participants.findByChatIdAndUserId(chatId, userId)
                .map(ChatParticipant::getLastReadAt)
                .orElse(null);
        if (cursor == null) return 0;
        return messages.countByChatIdAndSenderIdNotAndCreatedAtAfter(chatId, userId, cursor);
    }

    /**
     * Lazy backfill for chats created before the display-name snapshot existed
     * (or while auth was unreachable): one batched auth lookup per request,
     * persisted so subsequent reads are free. No-op when nothing is missing or
     * auth stays unreachable — the frontend keeps its role-label fallback.
     */
    @Transactional
    public void backfillDisplayNames(List<Chat> candidates) {
        List<Chat> stale = candidates.stream()
                .filter(c -> c.getBuyerDisplayName() == null || c.getSellerDisplayName() == null)
                .toList();
        if (stale.isEmpty()) return;

        List<UUID> ids = stale.stream()
                .flatMap(c -> java.util.stream.Stream.of(c.getBuyerId(), c.getSellerId()))
                .distinct()
                .toList();
        Map<UUID, String> names = authNameClient.resolveNames(ids);
        if (names.isEmpty()) return;

        for (Chat chat : stale) {
            if (chat.getBuyerDisplayName() == null) {
                chat.setBuyerDisplayName(names.get(chat.getBuyerId()));
            }
            if (chat.getSellerDisplayName() == null) {
                chat.setSellerDisplayName(names.get(chat.getSellerId()));
            }
            chats.save(chat); // detached (loaded in a readOnly tx) — merge
        }
        log.info("Backfilled display names for {} chats", stale.size());
    }

    /**
     * Participant rows exist for every chat created after V10; the migration
     * backfills older ones. A missing row can still occur for chats created by
     * a concurrent pre-deploy node — self-heal by creating it lazily.
     */
    private ChatParticipant getParticipantRow(UUID chatId, UUID userId) {
        return participants.findByChatIdAndUserId(chatId, userId)
                .orElseGet(() -> participants.save(
                        ChatParticipant.builder().chatId(chatId).userId(userId).build()));
    }

    @Transactional
    public Chat close(UUID chatId, UUID userId) {
        Chat chat = getById(chatId, userId);
        if (chat.getStatus() == ChatStatus.CLOSED) {
            return chat; // idempotent
        }
        chat.setStatus(ChatStatus.CLOSED);
        chat.setClosedAt(Instant.now());
        events.chatExpired(chat.getId(), chat.getListingId(),
                chat.getBuyerId(), chat.getSellerId(), "manual_close");
        return chat;
    }
}
