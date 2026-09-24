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
        socketPresence(userId, "http", true);
    }

    @Transactional(readOnly = true)
    public ChatActivityResponse activity(UUID chatId, UUID userId) {
        Chat chat = requireParticipant(chatId, userId);
        UUID partnerId = userId.equals(chat.getBuyerId()) ? chat.getSellerId() : chat.getBuyerId();
        Instant now = clock.instant();
        // Propagate Redis errors: an unavailable signal must never look like offline.
        Instant lastSeen = timestamp(redis.opsForValue().get(presenceKey(partnerId)));
        boolean online = hasLiveSession(presenceSessionsKey(partnerId), now);
        boolean typing = hasLiveSession(typingKey(chatId, partnerId), now);
        Instant lastRead = participants.findByChatIdAndUserId(chatId, partnerId)
                .map(ChatParticipant::getLastReadAt).orElse(null);
        return new ChatActivityResponse(online, typing, lastSeen, lastRead);
    }

    @Transactional(readOnly = true)
    public void typing(UUID chatId, UUID userId, boolean typing) {
        socketTyping(chatId, userId, "http", typing);
    }

    /** A tab only removes its own lease; crashed connections disappear after 40 seconds. */
    public void socketPresence(UUID userId, String sessionId, boolean active) {
        Instant now = clock.instant();
        boolean changed = lease(presenceSessionsKey(userId), sessionId, active, now, Duration.ofSeconds(40));
        if (active || changed) {
            redis.opsForValue().set(presenceKey(userId), now.toString(), PRESENCE_RETENTION);
            signal(userId);
        }
    }

    @Transactional(readOnly = true)
    public void socketTyping(UUID chatId, UUID userId, String sessionId, boolean typing) {
        requireParticipant(chatId, userId);
        if (lease(typingKey(chatId, userId), sessionId, typing, clock.instant(), TYPING_TTL) || typing)
            signal(userId);
    }

    private boolean lease(String key, String sessionId, boolean active, Instant now, Duration lifetime) {
        redis.opsForZSet().removeRangeByScore(key, Double.NEGATIVE_INFINITY, now.toEpochMilli());
        if (active) {
            redis.opsForZSet().add(key, sessionId, now.plus(lifetime).toEpochMilli());
            redis.expire(key, lifetime.plusSeconds(5));
            return true;
        }
        Long removed = redis.opsForZSet().remove(key, sessionId);
        return removed != null && removed > 0;
    }

    private boolean hasLiveSession(String key, Instant now) {
        Long count = redis.opsForZSet().count(key, now.toEpochMilli() + 1, Double.POSITIVE_INFINITY);
        return count != null && count > 0;
    }

    /** Only the socket handler constructs these after authenticating chat membership. */
    public record ActivityTarget(UUID chatId, UUID partnerId, Instant lastReadAt) {}

    /** One Redis pipeline per replica tick; durable cursors are refreshed by committed chat events. */
    public java.util.Map<ActivityTarget, ChatActivityResponse> activities(java.util.Collection<ActivityTarget> requested) {
        java.util.List<ActivityTarget> targets = requested.stream().distinct().toList();
        if (targets.isEmpty()) return java.util.Map.of();
        long after = clock.instant().toEpochMilli() + 1;
        java.util.List<Object> values = redis.executePipelined((org.springframework.data.redis.core.RedisCallback<Object>) connection -> {
            for (ActivityTarget target : targets) {
                connection.stringCommands().get(bytes(presenceKey(target.partnerId())));
                connection.zSetCommands().zCount(bytes(presenceSessionsKey(target.partnerId())), after, Double.POSITIVE_INFINITY);
                connection.zSetCommands().zCount(bytes(typingKey(target.chatId(), target.partnerId())), after, Double.POSITIVE_INFINITY);
            }
            return null;
        });
        java.util.Map<ActivityTarget, ChatActivityResponse> result = new java.util.HashMap<>();
        int index = 0;
        for (ActivityTarget target : targets) {
            String lastSeen = (String) values.get(index++);
            long online = ((Number) values.get(index++)).longValue();
            long typing = ((Number) values.get(index++)).longValue();
            result.put(target, new ChatActivityResponse(online > 0, typing > 0, timestamp(lastSeen), target.lastReadAt()));
        }
        return result;
    }

    private static byte[] bytes(String value) { return value.getBytes(java.nio.charset.StandardCharsets.UTF_8); }

    private void signal(UUID userId) {
        redis.convertAndSend(uz.efbazaar.marketplace.websocket.ChatSocketSignals.CHANNEL, "activity:" + userId);
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
    private static String presenceSessionsKey(UUID userId) { return "chat:presence-sessions:" + userId; }
    private static String typingKey(UUID chatId, UUID userId) { return "chat:typing-sessions:" + chatId + ":" + userId; }
}
