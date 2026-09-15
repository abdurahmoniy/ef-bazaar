package uz.efbazaar.access.check;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import uz.efbazaar.access.bot.BotClient;
import uz.efbazaar.access.bot.BotClient.BotUnavailableException;
import uz.efbazaar.access.bot.BotClient.MemberStatus;
import uz.efbazaar.access.config.AccessProperties;
import uz.efbazaar.access.requirement.AccessRequirement;
import uz.efbazaar.access.requirement.AccessRequirementRepository;
import uz.efbazaar.access.requirement.RequirementType;
import uz.efbazaar.access.requirement.TelegramChannelConfig;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AccessCheckServiceTest {

    private static final long TELEGRAM_ID = 777L;

    private final AccessRequirementRepository repository = mock(AccessRequirementRepository.class);
    private final BotClient bot = mock(BotClient.class);
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);

    private AccessCheckService service;

    @BeforeEach
    void setUp() {
        when(redis.opsForValue()).thenReturn(values);
        var properties = new AccessProperties(null, null, new AccessProperties.Check(Duration.ofMinutes(10)));
        service = new AccessCheckService(repository, List.of(new TelegramChannelChecker(bot)), redis, properties);
    }

    @Test
    void passes_whenThereAreNoRequirements() {
        when(repository.findAllByOrderByPositionAscCreatedAtAsc()).thenReturn(List.of());

        assertThat(service.check(TELEGRAM_ID).passed()).isTrue();
    }

    @Test
    void passes_andCaches_whenUserIsChannelMember() {
        AccessRequirement channel = channel(-100L, "efbazaar");
        when(repository.findAllByOrderByPositionAscCreatedAtAsc()).thenReturn(List.of(channel));
        when(bot.memberStatus(-100L, TELEGRAM_ID)).thenReturn(new MemberStatus("member", true));

        var result = service.check(TELEGRAM_ID);

        assertThat(result.passed()).isTrue();
        verify(values).set(eq("access:met:" + channel.getId() + ":" + TELEGRAM_ID), eq("1"), any(Duration.class));
    }

    @Test
    void fails_andListsOnlyUnmetChannels() {
        AccessRequirement joined = channel(-100L, "efbazaar");
        AccessRequirement left = channel(-200L, "partner");
        when(repository.findAllByOrderByPositionAscCreatedAtAsc()).thenReturn(List.of(joined, left));
        when(bot.memberStatus(-100L, TELEGRAM_ID)).thenReturn(new MemberStatus("administrator", true));
        when(bot.memberStatus(-200L, TELEGRAM_ID)).thenReturn(new MemberStatus("left", false));

        var result = service.check(TELEGRAM_ID);

        assertThat(result.passed()).isFalse();
        assertThat(result.unmet()).extracting("username").containsExactly("partner");
    }

    @Test
    void restrictedUser_countsOnlyWhenTelegramSaysMember() {
        when(repository.findAllByOrderByPositionAscCreatedAtAsc()).thenReturn(List.of(channel(-100L, "efbazaar")));
        when(bot.memberStatus(-100L, TELEGRAM_ID)).thenReturn(new MemberStatus("restricted", false));

        assertThat(service.check(TELEGRAM_ID).passed()).isFalse();
    }

    @Test
    void skipsRequirement_whenBotIsUnavailable() {
        when(repository.findAllByOrderByPositionAscCreatedAtAsc()).thenReturn(List.of(channel(-100L, "efbazaar")));
        when(bot.memberStatus(-100L, TELEGRAM_ID)).thenThrow(new BotUnavailableException("down", null));

        assertThat(service.check(TELEGRAM_ID).passed()).isTrue();
        verify(values, never()).set(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void usesCache_withoutAskingBot() {
        AccessRequirement channel = channel(-100L, "efbazaar");
        when(repository.findAllByOrderByPositionAscCreatedAtAsc()).thenReturn(List.of(channel));
        when(redis.hasKey("access:met:" + channel.getId() + ":" + TELEGRAM_ID)).thenReturn(true);

        assertThat(service.check(TELEGRAM_ID).passed()).isTrue();
        verify(bot, never()).memberStatus(any(Long.class), any(Long.class));
    }

    @Test
    void redisFailure_fallsBackToLiveCheck() {
        when(repository.findAllByOrderByPositionAscCreatedAtAsc()).thenReturn(List.of(channel(-100L, "efbazaar")));
        when(redis.hasKey(anyString())).thenThrow(new RedisConnectionFailureException("down"));
        when(bot.memberStatus(-100L, TELEGRAM_ID)).thenReturn(new MemberStatus("kicked", false));

        assertThat(service.check(TELEGRAM_ID).passed()).isFalse();
    }

    private static AccessRequirement channel(long chatId, String username) {
        return AccessRequirement.builder()
                .id(UUID.randomUUID())
                .type(RequirementType.TELEGRAM_CHANNEL)
                .externalKey(String.valueOf(chatId))
                .config(new TelegramChannelConfig(chatId, username, username.toUpperCase(), null).toMap())
                .createdAt(Instant.now())
                .build();
    }
}
