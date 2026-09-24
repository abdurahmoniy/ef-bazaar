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
import uz.efbazaar.marketplace.trust.BlacklistGuard;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    private final ChatRepository chats;
    private final ChatMessageRepository messages;
    private final ChatParticipantRepository participants;
    private final ListingRepository listings;
    private final AuthNameClient authNameClient;
    private final NotificationService notifications;
    private final BlacklistGuard blacklistGuard;
    private final ChatAccountRequestService accountRequests;
    private final uz.efbazaar.marketplace.security.AuthSummaryClient telegramUsers;
    private final TradeLiveClient tradeLive;

    @Transactional
    public Chat start(UUID buyerId, UUID listingId) {
        if (blacklistGuard.isBlacklisted(buyerId)) {
            throw MarketplaceException.userBlacklisted();
        }
        telegramUsers.requireTelegramLinked(buyerId);
        Listing listing = listings.findById(listingId)
                .orElseThrow(MarketplaceException::listingNotFound);
        if (listing.getStatus() != ListingStatus.ACTIVE) {
            throw MarketplaceException.listingNotActive();
        }
        if (listing.getSellerId().equals(buyerId)) {
            throw MarketplaceException.cannotChatWithSelf();
        }

        UUID sellerId = listing.getSellerId();

        // One conversation per pair, not per listing. Contacting the same
        // person about a second account reuses the chat they already have and
        // records which listing this is about (V32) instead of opening another
        // thread — that is what stopped a pair from trading twice, because the
        // second attempt landed back in the first listing's chat with no way to
        // say it was now about a different account.
        //
        // Direction-agnostic: today's buyer may be yesterday's seller.
        var existing = chats.findBetween(buyerId, sellerId)
                .stream().findFirst();
        if (existing.isPresent()) {
            Chat chat = existing.get();
            // "Deleted for me" then contacted again — bring it back.
            participants.findByChatIdAndUserId(chat.getId(), buyerId)
                    .filter(p -> p.getHiddenAt() != null)
                    .ifPresent(p -> p.setHiddenAt(null));
            accountRequests.open(buyerId, chat.getId(), listingId);
            return chat;
        }

        Map<UUID, String> names = authNameClient.resolveNames(List.of(buyerId, sellerId));

        try {
            Chat chat = chats.save(Chat.builder()
                    .listingId(listingId)
                    .buyerId(buyerId)
                    .sellerId(sellerId)
                    .buyerDisplayName(names.get(buyerId))
                    .sellerDisplayName(names.get(sellerId))
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
            // Records which account the conversation opens on, so a brand-new
            // chat and a reused one both arrive with the same context.
            accountRequests.open(buyerId, chat.getId(), listingId);
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
        return sendMessage(chatId, senderId, content, null);
    }

    @Transactional
    public ChatMessage sendMessage(UUID chatId, UUID senderId, String content, UUID replyToId) {
        Chat chat = chats.findById(chatId).orElseThrow(MarketplaceException::chatNotFound);
        if (!chat.isParticipant(senderId)) {
            throw MarketplaceException.notChatParticipant();
        }
        if (replyToId != null) {
            // Quote must reference a message from THIS chat.
            messages.findById(replyToId)
                    .filter(m -> m.getChatId().equals(chatId))
                    .orElseThrow(MarketplaceException::messageNotFound);
        }

        ChatMessage saved = messages.save(ChatMessage.builder()
                .chatId(chatId)
                .senderId(senderId)
                .content(content)
                .replyToId(replyToId)
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

    /**
     * Foydalanuvchi ko'radigan xabarlar.
     *
     * <p>Tarix tozalangan bo'lsa undan OLDINGILARI ko'rsatilmaydi. Ular
     * o'chirilmagan va admin panelida ochib ko'rish mumkin — nizo
     * chiqqanda tekshiriladigan yagona iz o'sha.
     */
    @Transactional(readOnly = true)
    public Page<ChatMessage> listMessages(UUID chatId, UUID userId, Pageable pageable) {
        Chat chat = getById(chatId, userId); // participant check
        return chat.getClearedAt() == null
                ? messages.findByChatIdOrderByCreatedAtAsc(chat.getId(), pageable)
                : messages.findByChatIdAndCreatedAtAfterOrderByCreatedAtAsc(
                        chat.getId(), chat.getClearedAt(), pageable);
    }

    @Transactional(readOnly = true)
    public long countMessages(UUID chatId) {
        return messages.countByChatId(chatId);
    }

    /**
     * Edits the caller's own message (content only — attachments are
     * immutable). Marks it with {@code editedAt} for the "tahrirlangan" label.
     */
    @Transactional
    public ChatMessage editMessage(UUID chatId, UUID messageId, UUID senderId, String content) {
        ChatMessage message = getOwnMessage(chatId, messageId, senderId);
        message.setContent(content.trim());
        message.setEditedAt(Instant.now());
        return message;
    }

    /** Hard delete of the caller's own message — gone for both sides (Telegram semantics). */
    @Transactional
    public void deleteMessage(UUID chatId, UUID messageId, UUID senderId) {
        ChatMessage message = getOwnMessage(chatId, messageId, senderId);
        messages.delete(message);
    }

    private ChatMessage getOwnMessage(UUID chatId, UUID messageId, UUID senderId) {
        Chat chat = chats.findById(chatId).orElseThrow(MarketplaceException::chatNotFound);
        if (!chat.isParticipant(senderId)) {
            throw MarketplaceException.notChatParticipant();
        }
        ChatMessage message = messages.findById(messageId)
                .filter(m -> m.getChatId().equals(chatId))
                .orElseThrow(MarketplaceException::messageNotFound);
        if (!message.getSenderId().equals(senderId)) {
            throw MarketplaceException.notMessageSender();
        }
        return message;
    }

    /** Batch lookup used to attach quoted-message previews to a page of messages. */
    @Transactional(readOnly = true)
    public Map<UUID, ChatMessage> messagesByIds(java.util.Collection<UUID> ids) {
        if (ids.isEmpty()) return Map.of();
        Map<UUID, ChatMessage> out = new java.util.HashMap<>();
        for (ChatMessage m : messages.findAllById(ids)) {
            out.put(m.getId(), m);
        }
        return out;
    }

    /** Sum of unread across all visible chats — the Chatlar nav badge. */
    @Transactional(readOnly = true)
    public long totalUnread(UUID userId) {
        return messages.totalUnreadFor(userId);
    }

    /**
     * One-line preview of the newest message for the chat list. Null when empty.
     *
     * <p>Tozalangan tarix bu yerda ham ko'rinmaydi: aks holda ro'yxatda
     * eski matn turaverib, chat ichi esa bo'sh bo'lardi.
     */
    @Transactional(readOnly = true)
    public String lastMessagePreview(UUID chatId) {
        Instant clearedAt = chats.findById(chatId).map(Chat::getClearedAt).orElse(null);
        return (clearedAt == null
                ? messages.findFirstByChatIdOrderByCreatedAtDesc(chatId)
                : messages.findFirstByChatIdAndCreatedAtAfterOrderByCreatedAtDesc(chatId, clearedAt))
                .map(ChatService::previewOf)
                .orElse(null);
    }

    public static String previewOf(ChatMessage m) {
        String content = m.getContent() == null ? "" : m.getContent().trim();
        // Savdo taklifi xabarining matni — summaning o'zi. Obmenda u nol
        // bo'ladi va chat ro'yxatida oxirgi xabar "0" bo'lib ko'rinardi.
        // Summa bu yerda baribir keraksiz: taklif kartochkasi chatning
        // ichida to'liq ko'rinadi.
        if (m.getMessageType() == ChatMessageType.TRADE_PROPOSAL) {
            return "🤝 Savdo taklifi";
        }
        if (m.getAttachmentType() != null) {
            String label = switch (m.getAttachmentType()) {
                case IMAGE -> "🖼 Rasm";
                case VOICE -> "🎤 Ovozli xabar";
                case FILE -> "📎 " + (m.getAttachmentName() != null ? m.getAttachmentName() : "Fayl");
            };
            return content.isEmpty() ? label : label + " · " + truncatePreview(content);
        }
        return truncatePreview(content);
    }

    private static String truncatePreview(String s) {
        return s.length() <= 90 ? s : s.substring(0, 87) + "…";
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
     * Chatni o'chirish: suhbat IKKALA taraf uchun ham nol holatga qaytadi.
     *
     * <p>Ilgari bu faqat yashirish edi — xabarlar joyida qolar, keyingi
     * xabar esa bayroqni tozalab butun eski tarixni qaytarardi. Juftlik
     * boshqa akkount ustida yangi suhbat boshlaganda eskisi, jumladan
     * tugagan savdolar statuslari, ko'rinib turardi.
     *
     * <p>Xabarlar O'CHIRILMAYDI: nizo chiqqanda admin panelida ochib
     * ko'rish mumkin bo'lishi kerak. Ko'rsatilmaydigan qilinadi, xolos.
     *
     * <p>Tirik savdo paytida RAD ETILADI. Savdo paneli baribir
     * trade-service'dan keladi, lekin kelishuv yozishmasining yo'qolishi
     * nizoni hal qilib bo'lmas holga keltiradi. Tekshiruv yiqilsa ham rad
     * etiladi ({@code TradeLiveClient} izohiga qarang).
     */
    @Transactional
    public void clearHistory(UUID chatId, UUID userId) {
        Chat chat = getById(chatId, userId); // participant check
        if (tradeLive.hasLiveTrade(chatId)) {
            throw MarketplaceException.chatHasLiveTrade();
        }
        Instant now = Instant.now();
        chat.setClearedAt(now);
        // Ikkala taraf ro'yxatidan ham ketadi. Keyingi xabar uni
        // qaytaradi, lekin tarixni emas — kesish nuqtasi joyida qoladi.
        participants.findByChatId(chatId)
                .forEach(p -> p.setHiddenAt(now));
        log.info("Chat {} history cleared by {}", chatId, userId);
    }

    @Transactional(readOnly = true)
    public Optional<ChatParticipant> getParticipant(UUID chatId, UUID userId) {
        return participants.findByChatIdAndUserId(chatId, userId);
    }

    /** Moves my read cursor to now — clears the unread badge for this chat. */
    @Transactional
    public void markRead(UUID chatId, UUID userId) {
        markRead(chatId, userId, null);
    }

    /** Advance only through the received message; later arrivals remain unread. */
    @Transactional
    public void markRead(UUID chatId, UUID userId, UUID messageId) {
        getById(chatId, userId);
        Instant readAt;
        if (messageId == null) {
            readAt = Instant.now(); // compatibility with older clients
        } else {
            ChatMessage message = messages.findById(messageId)
                    .filter(m -> chatId.equals(m.getChatId()))
                    .orElseThrow(MarketplaceException::messageNotFound);
            readAt = message.getCreatedAt();
        }
        participants.advanceReadCursor(chatId, userId, readAt);
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
     * Stamps the caller's VERIFIED display name (from the auth token via
     * X-User-Name) onto their own side of each chat. Needs no server-to-server
     * call or shared secret — each participant's name materialises as soon as
     * they interact, and renames propagate because we overwrite on change.
     */
    @Transactional
    public void stampOwnName(List<Chat> candidates, UUID userId, String displayName) {
        if (displayName == null || displayName.isBlank()) return;
        for (Chat chat : candidates) {
            boolean changed = false;
            if (userId.equals(chat.getBuyerId())
                    && !displayName.equals(chat.getBuyerDisplayName())) {
                chat.setBuyerDisplayName(displayName);
                changed = true;
            }
            if (userId.equals(chat.getSellerId())
                    && !displayName.equals(chat.getSellerDisplayName())) {
                chat.setSellerDisplayName(displayName);
                changed = true;
            }
            if (changed) chats.save(chat); // detached (readOnly load) — merge
        }
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
}
