package uz.efbazaar.marketplace.channel;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import uz.efbazaar.marketplace.channel.ChannelMemberRepositories.ChannelMemberEventRepository;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Faqat rasmiy kanal hisoblanadi. Bot hamkor kanallarda ham admin — ularning
 * obunachilari bizning kanal statistikasini soxtalashtirmasligi kerak, va
 * begona kanal a'zoligini saqlashga sabab ham yo'q.
 */
class ChannelMemberServiceTest {

    private final ChannelMemberEventRepository events = mock(ChannelMemberEventRepository.class);

    private ChannelMemberService service(String official) {
        return new ChannelMemberService(events, official);
    }

    @Test
    @DisplayName("an event from the official channel, configured by username, is stored")
    void officialByUsername() {
        service("@EfBazaar").record(-1001L, "efbazaar", 42L, "LEAVE", 1794200000L);

        ArgumentCaptor<ChannelMemberEvent> saved = ArgumentCaptor.forClass(ChannelMemberEvent.class);
        verify(events).save(saved.capture());
        assertThat(saved.getValue().getTelegramId()).isEqualTo(42L);
        assertThat(saved.getValue().getKind()).isEqualTo("LEAVE");
        assertThat(saved.getValue().getOccurredAt()).isEqualTo(Instant.ofEpochSecond(1794200000L));
    }

    @Test
    @DisplayName("an event from the official channel, configured by numeric id, is stored")
    void officialById() {
        service("-1001").record(-1001L, "", 42L, "JOIN", 1794200000L);

        verify(events).save(any());
    }

    @Test
    @DisplayName("partner channels are ignored")
    void partnerChannelIgnored() {
        service("@EfBazaar").record(-1002L, "trojan_efootball", 42L, "JOIN", 1794200000L);

        verify(events, never()).save(any());
    }

    @Test
    @DisplayName("with no official channel configured nothing is stored")
    void unconfigured() {
        service("").record(-1001L, "EfBazaar", 42L, "JOIN", 1794200000L);

        verify(events, never()).save(any());
    }

    @Test
    @DisplayName("an unknown kind is ignored")
    void unknownKind() {
        service("@EfBazaar").record(-1001L, "EfBazaar", 42L, "PROMOTED", 1794200000L);

        verify(events, never()).save(any());
    }

    @Test
    @DisplayName("a redelivered update is absorbed by the unique key")
    void redeliveryAbsorbed() {
        when(events.save(any())).thenThrow(new DataIntegrityViolationException("dup"));

        assertThatCode(() -> service("@EfBazaar").record(-1001L, "EfBazaar", 42L, "JOIN", 1794200000L))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("the summary covers every day, filling quiet days with zeros")
    void summaryFillsGaps() {
        java.time.LocalDate today = java.time.LocalDate.now(ChannelMemberService.TASHKENT);
        var row = mock(ChannelMemberRepositories.ChannelMemberEventRepository.DailyProjection.class);
        when(row.getDay()).thenReturn(today.minusDays(1));
        when(row.getJoins()).thenReturn(3L);
        when(row.getLeaves()).thenReturn(2L);
        when(events.daily(any())).thenReturn(java.util.List.of(row));

        var summary = service("@EfBazaar").summary(7);

        assertThat(summary.configured()).isTrue();
        assertThat(summary.daily()).hasSize(7);
        assertThat(summary.daily().get(6).date()).isEqualTo(today);
        assertThat(summary.daily().get(5).joins()).isEqualTo(3);
        assertThat(summary.daily().get(0).joins()).isZero();
        assertThat(summary.joins()).isEqualTo(3);
        assertThat(summary.leaves()).isEqualTo(2);
    }
}
