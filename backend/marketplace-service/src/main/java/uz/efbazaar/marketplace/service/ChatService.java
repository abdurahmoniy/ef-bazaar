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
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.time.Instant;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    private final ChatRepository chats;
    private final ChatMessageRepository messages;
    private final ListingRepository listings;
    private final MarketplaceEventPublisher events;

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

        // Idempotency: agar allaqachon aktiv chat bor bo'lsa, qaytaramiz
        var existing = chats.findByBuyerIdAndListingIdAndStatus(buyerId, listingId, ChatStatus.ACTIVE);
        if (existing.isPresent()) {
            return existing.get();
        }

        try {
            Chat chat = chats.save(Chat.builder()
                    .listingId(listingId)
                    .buyerId(buyerId)
                    .sellerId(listing.getSellerId())
                    .status(ChatStatus.ACTIVE)
                    .important(false)
                    .lastMessageAt(Instant.now())
                    .build());
            events.chatCreated(chat.getId(), listingId, buyerId, listing.getSellerId());
            log.info("Chat created: id={} listingId={} buyer={} seller={}",
                    chat.getId(), listingId, buyerId, listing.getSellerId());
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

    @Transactional
    public Chat toggleImportant(UUID chatId, UUID userId) {
        Chat chat = getById(chatId, userId);
        chat.setImportant(!chat.isImportant());
        log.debug("Chat {} important toggled to {} by {}", chatId, chat.isImportant(), userId);
        return chat;
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
