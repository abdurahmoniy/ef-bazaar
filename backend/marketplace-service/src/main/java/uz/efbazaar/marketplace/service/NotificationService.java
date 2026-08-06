package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.domain.Notification;
import uz.efbazaar.marketplace.domain.NotificationType;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.NotificationRepository;

import java.time.Instant;
import java.util.UUID;

/**
 * Web notification center. Producers are chat flows in this same service —
 * no Kafka hop needed (chats and notifications share the marketplace DB).
 * The bot's Telegram DM remains an independent, best-effort channel.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notifications;

    /** Buyer opened a chat on the seller's listing → notify seller. */
    @Transactional
    public void chatCreated(Chat chat) {
        notifications.save(Notification.builder()
                .userId(chat.getSellerId())
                .type(NotificationType.CHAT_CREATED)
                .chatId(chat.getId())
                .listingId(chat.getListingId())
                .actorDisplayName(chat.getBuyerDisplayName())
                .build());
    }

    /**
     * New message → notify the other participant. While an unread
     * CHAT_MESSAGE notification for this (recipient, chat) exists, it is
     * bumped instead of duplicated — a burst of messages shows as one entry.
     */
    @Transactional
    public void newMessage(Chat chat, UUID senderId) {
        boolean senderIsBuyer = senderId.equals(chat.getBuyerId());
        UUID recipient = senderIsBuyer ? chat.getSellerId() : chat.getBuyerId();
        String actorName = senderIsBuyer ? chat.getBuyerDisplayName() : chat.getSellerDisplayName();

        notifications.findFirstByUserIdAndChatIdAndTypeAndReadAtIsNull(
                        recipient, chat.getId(), NotificationType.CHAT_MESSAGE)
                .ifPresentOrElse(
                        existing -> existing.setCreatedAt(Instant.now()),
                        () -> notifications.save(Notification.builder()
                                .userId(recipient)
                                .type(NotificationType.CHAT_MESSAGE)
                                .chatId(chat.getId())
                                .listingId(chat.getListingId())
                                .actorDisplayName(actorName)
                                .build()));
    }

    /** Trust-module notice (warning/block/unblock) — no chat/listing context. */
    @Transactional
    public void trustNotice(UUID userId, NotificationType type) {
        notifications.save(Notification.builder()
                .userId(userId)
                .type(type)
                .build());
    }

    /**
     * A seller invited this admin to run a trade. Best-effort delivery — the
     * admin also sees pending invitations in their workspace — so a failure
     * here must not be treated as fatal.
     *
     * <p>Kafka redelivers at-least-once: a duplicate {@code admin-invited} for
     * the same (admin, trade) must not double the bell, so this checks for an
     * existing row first.
     */
    @Transactional
    public void tradeAdminInvited(UUID adminId, UUID tradeId, long priceUzs) {
        if (notifications.existsByUserIdAndTypeAndTradeId(
                adminId, NotificationType.TRADE_ADMIN_INVITED, tradeId)) {
            log.debug("admin-invited replay for admin={} trade={}, skipping", adminId, tradeId);
            return;
        }
        notifications.save(Notification.builder()
                .userId(adminId)
                .type(NotificationType.TRADE_ADMIN_INVITED)
                .tradeId(tradeId)
                .build());
    }

    @Transactional(readOnly = true)
    public Page<Notification> list(UUID userId, Pageable pageable) {
        return notifications.findByUserIdOrderByCreatedAtDesc(userId, pageable);
    }

    @Transactional(readOnly = true)
    public long unreadCount(UUID userId) {
        return notifications.countByUserIdAndReadAtIsNull(userId);
    }

    @Transactional
    public Notification markRead(UUID id, UUID userId) {
        Notification n = notifications.findById(id)
                .filter(x -> x.getUserId().equals(userId))
                .orElseThrow(MarketplaceException::notificationNotFound);
        if (n.getReadAt() == null) n.setReadAt(Instant.now());
        return n;
    }

    @Transactional
    public int markAllRead(UUID userId) {
        return notifications.markAllRead(userId, Instant.now());
    }
}
