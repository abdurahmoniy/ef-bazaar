package uz.efbazaar.marketplace.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.domain.ChatParticipant;
import uz.efbazaar.marketplace.dto.ChatActivityResponse;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.ChatParticipantRepository;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Service
public class ChatActivityService {
    private static final Duration PRESENCE_RETENTION = Duration.ofDays(2);
    private static final Duration TYPING_TTL = Duration.ofSeconds(6);
    private final ChatRepository chats;
    private final ChatParticipantRepository participants;
    private final StringRedisTemplate redis;
    private final Clock clock;

    @Autowired
    public ChatActivityService(ChatRepository chats, ChatParticipantRepository participants, StringRedisTemplate redis) {
        this(chats, participants, redis, Clock.systemUTC());
    }

    ChatActivityService(ChatRepository chats, ChatParticipantRepository participants, StringRedisTemplate redis, Clock clock) {
        this.chats = chats;
        this.participants = participants;
        this.redis = redis;
        this.clock = clock;
    }

    /** No disconnect mutation: another tab's heartbeat keeps the user online. */
    public void presence(UUID userId) {
        redis.opsForValue().set(presenceKey(userId), clock.instant().toString(), PRESENCE_RETENTION);
    }

    @Transactional(readOnly = true)
    public ChatActivityResponse activity(UUID chatId, UUID userId) {
        Chat chat = requireParticipant(chatId, userId);
        UUID partnerId = userId.equals(chat.getBuyerId()) ? chat.getSellerId() : chat.getBuyerId();
        Instant now = clock.instant();
        // Propagate Redis errors: an unavailable signal must never look like offline.
        Instant lastSeen = timestamp(redis.opsForValue().get(presenceKey(partnerId)));
        Instant typingAt = timestamp(redis.opsForValue().get(typingKey(chatId, partnerId)));
        boolean online = lastSeen != null && !lastSeen.isBefore(now.minusSeconds(40));
        boolean typing = typingAt != null && typingAt.isAfter(now.minus(TYPING_TTL));
        Instant lastRead = participants.findByChatIdAndUserId(chatId, partnerId)
                .map(ChatParticipant::getLastReadAt).orElse(null);
        return new ChatActivityResponse(online, typing, lastSeen, lastRead);
    }

    @Transactional(readOnly = true)
    public void typing(UUID chatId, UUID userId, boolean typing) {
        requireParticipant(chatId, userId);
        String key = typingKey(chatId, userId);
        if (typing) redis.opsForValue().set(key, clock.instant().toString(), TYPING_TTL);
        else redis.delete(key);
    }

    private Chat requireParticipant(UUID chatId, UUID userId) {
        Chat chat = chats.findById(chatId).orElseThrow(MarketplaceException::chatNotFound);
        if (!chat.isParticipant(userId)) throw MarketplaceException.notChatParticipant();
        return chat;
    }

    private static Instant timestamp(String value) {
        return value == null ? null : Instant.parse(value);
    }
    private static String presenceKey(UUID userId) { return "chat:presence:" + userId; }
    private static String typingKey(UUID chatId, UUID userId) { return "chat:typing:" + chatId + ":" + userId; }
}
