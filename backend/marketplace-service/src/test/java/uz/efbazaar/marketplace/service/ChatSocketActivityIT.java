package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.*;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.*;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.repository.*;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@Testcontainers(disabledWithoutDocker = true)
class ChatSocketActivityIT {
    @Container static GenericContainer<?> redisContainer = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
    private LettuceConnectionFactory factory;
    private StringRedisTemplate redis;
    private ChatActivityService service;
    private final UUID chatId = UUID.randomUUID();
    private final UUID viewer = UUID.randomUUID();
    private final UUID partner = UUID.randomUUID();
    private Instant now = Instant.parse("2026-09-25T01:00:00Z");
    @BeforeEach void setup() {
        factory = new LettuceConnectionFactory(redisContainer.getHost(), redisContainer.getMappedPort(6379));
        factory.afterPropertiesSet(); factory.start();
        redis = new StringRedisTemplate(factory);
        redis.getConnectionFactory().getConnection().serverCommands().flushDb();
        var chats = mock(ChatRepository.class);
        when(chats.findById(chatId)).thenReturn(Optional.of(Chat.builder().id(chatId).buyerId(viewer).sellerId(partner).build()));
        Clock clock = new Clock() {
            public ZoneId getZone() { return ZoneOffset.UTC; }
            public Clock withZone(ZoneId zone) { return this; }
            public Instant instant() { return now; }
        };
        service = new ChatActivityService(chats, mock(ChatParticipantRepository.class), redis, clock);
    }
    @AfterEach void cleanup() { factory.destroy(); }
    @Test void closingOneTabKeepsTheOtherOnlineAndTyping() {
        service.socketPresence(partner, "one", true);
        service.socketPresence(partner, "two", true);
        service.socketTyping(chatId, partner, "one", true);
        service.socketTyping(chatId, partner, "two", true);
        service.socketPresence(partner, "one", false);
        service.socketTyping(chatId, partner, "one", false);
        assertThat(service.activity(chatId, viewer).online()).isTrue();
        assertThat(service.activity(chatId, viewer).typing()).isTrue();
        service.socketPresence(partner, "two", false);
        service.socketTyping(chatId, partner, "two", false);
        assertThat(service.activity(chatId, viewer).online()).isFalse();
        assertThat(service.activity(chatId, viewer).typing()).isFalse();
    }
    @Test void leasesExpireWithoutDisconnectAndLastSeenIsRetained() {
        service.socketPresence(partner, "crashed", true);
        service.socketTyping(chatId, partner, "crashed", true);
        Instant lastSeen = now;
        now = now.plusSeconds(6);
        assertThat(service.activity(chatId, viewer).typing()).isFalse();
        assertThat(service.activity(chatId, viewer).online()).isTrue();
        now = now.plusSeconds(34);
        assertThat(service.activity(chatId, viewer).online()).isFalse();
        assertThat(service.activity(chatId, viewer).lastSeenAt()).isEqualTo(lastSeen);
    }
    @Test void lastSeenHasNoExpiryAndRemainsAvailableAfterSeveralDays() {
        String key = "chat:presence:" + partner;
        // An existing expiring key is upgraded on the next presence update.
        redis.opsForValue().set(key, now.minusSeconds(60).toString(), Duration.ofDays(2));
        service.socketPresence(partner, "tab", true);
        now = now.plusSeconds(10);
        service.socketPresence(partner, "tab", false);
        Instant lastSeen = now;
        assertThat(redis.getExpire(key)).isEqualTo(-1L);
        now = now.plus(Duration.ofDays(10));
        assertThat(service.activity(chatId, viewer).online()).isFalse();
        assertThat(service.activity(chatId, viewer).lastSeenAt()).isEqualTo(lastSeen);
        var target = new ChatActivityService.ActivityTarget(chatId, partner, null);
        assertThat(service.activities(List.of(target)).get(target).lastSeenAt()).isEqualTo(lastSeen);
    }
    @Test void repeatedHiddenHeartbeatDoesNotPretendTheUserWasJustSeen() {
        service.socketPresence(partner, "tab", true);
        service.socketPresence(partner, "tab", false);
        Instant lastSeen = now;
        now = now.plusSeconds(100);
        service.socketPresence(partner, "tab", false);
        assertThat(service.activity(chatId, viewer).lastSeenAt()).isEqualTo(lastSeen);
    }
    @Test void pipelinePreservesDurableCursorAndEphemeralState() {
        service.socketPresence(partner, "tab", true);
        service.socketTyping(chatId, partner, "tab", true);
        Instant read = now.minusSeconds(60);
        var target = new ChatActivityService.ActivityTarget(chatId, partner, read);
        var response = service.activities(List.of(target)).get(target);
        assertThat(response.online()).isTrue();
        assertThat(response.typing()).isTrue();
        assertThat(response.lastReadAt()).isEqualTo(read);
        assertThat(response.lastSeenAt()).isEqualTo(now);
    }
}
