package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.domain.ChatParticipant;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.ChatParticipantRepository;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChatActivityServiceTest {
    private final UUID chatId = UUID.randomUUID();
    private final UUID viewer = UUID.randomUUID();
    private final UUID partner = UUID.randomUUID();
    private final Instant now = Instant.parse("2026-09-24T10:00:00Z");
    private final ChatRepository chats = mock(ChatRepository.class);
    private final ChatParticipantRepository participants = mock(ChatParticipantRepository.class);
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    @SuppressWarnings("unchecked")
    private final org.springframework.data.redis.core.ZSetOperations<String, String> leases = mock(org.springframework.data.redis.core.ZSetOperations.class);
    private ChatActivityService service;

    @BeforeEach void setup() {
        service = new ChatActivityService(chats, participants, redis, Clock.fixed(now, ZoneOffset.UTC));
        when(redis.opsForValue()).thenReturn(values);
        when(redis.opsForZSet()).thenReturn(leases);
        when(chats.findById(chatId)).thenReturn(Optional.of(Chat.builder().id(chatId).buyerId(viewer).sellerId(partner).build()));
    }
    @Test void heartbeatUsesServerTimeAndRetainsLastSeenForTwoDays() {
        service.presence(viewer);
        verify(values).set("chat:presence:" + viewer, now.toString(), Duration.ofDays(2));
        verify(redis, never()).delete(anyString());
    }
    @Test void partnerActivityIncludesDurableReadCursorOnly() {
        Instant read = now.minusSeconds(80);
        when(participants.findByChatIdAndUserId(chatId, partner)).thenReturn(Optional.of(ChatParticipant.builder().lastReadAt(read).build()));
        when(values.get("chat:presence:" + partner)).thenReturn(now.minusSeconds(40).toString());
        when(leases.count("chat:presence-sessions:" + partner, now.toEpochMilli() + 1, Double.POSITIVE_INFINITY)).thenReturn(1L);
        when(leases.count("chat:typing-sessions:" + chatId + ":" + partner, now.toEpochMilli() + 1, Double.POSITIVE_INFINITY)).thenReturn(1L);
        var activity = service.activity(chatId, viewer);
        assertThat(activity.online()).isTrue();
        assertThat(activity.typing()).isTrue();
        assertThat(activity.lastSeenAt()).isEqualTo(now.minusSeconds(40));
        assertThat(activity.lastReadAt()).isEqualTo(read);
        verify(participants, never()).findByChatIdAndUserId(chatId, viewer);
    }
    @Test void staleHeartbeatAndTypingExpireWithoutDisconnect() {
        when(values.get("chat:presence:" + partner)).thenReturn(now.minusSeconds(41).toString());

        var activity = service.activity(chatId, viewer);
        assertThat(activity.online()).isFalse();
        assertThat(activity.typing()).isFalse();
        assertThat(activity.lastSeenAt()).isEqualTo(now.minusSeconds(41));
    }
    @Test void missingEphemeralStateHasUnknownLastSeen() {
        var activity = service.activity(chatId, viewer);
        assertThat(activity.online()).isFalse();
        assertThat(activity.typing()).isFalse();
        assertThat(activity.lastSeenAt()).isNull();
        assertThat(activity.lastReadAt()).isNull();
    }
    @Test void sellerSeesBuyerActivity() {
        when(values.get("chat:presence:" + viewer)).thenReturn(now.toString());
        when(leases.count("chat:presence-sessions:" + viewer, now.toEpochMilli() + 1, Double.POSITIVE_INFINITY)).thenReturn(1L);
        assertThat(service.activity(chatId, partner).online()).isTrue();
    }
    @Test void strangersCannotReadActivityOrWriteTyping() {
        UUID stranger = UUID.randomUUID();
        assertThatThrownBy(() -> service.activity(chatId, stranger)).isInstanceOf(MarketplaceException.class);
        assertThatThrownBy(() -> service.typing(chatId, stranger, true)).isInstanceOf(MarketplaceException.class);
        verifyNoInteractions(values, participants);
    }
    @Test void typingUsesSixSecondExpiryAndCanBeCleared() {
        service.typing(chatId, viewer, true);
        verify(leases).add("chat:typing-sessions:" + chatId + ":" + viewer, "http", now.plusSeconds(6).toEpochMilli());
        service.typing(chatId, viewer, false);
        verify(leases).remove("chat:typing-sessions:" + chatId + ":" + viewer, "http");
    }
    @Test void redisFailureIsNotReportedAsOffline() {
        when(values.get(anyString())).thenThrow(new RedisConnectionFailureException("unavailable"));
        assertThatThrownBy(() -> service.activity(chatId, viewer)).isInstanceOf(RedisConnectionFailureException.class);
    }
}
