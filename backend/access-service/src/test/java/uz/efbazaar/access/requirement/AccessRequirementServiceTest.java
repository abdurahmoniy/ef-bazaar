package uz.efbazaar.access.requirement;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import uz.efbazaar.access.bot.BotClient;
import uz.efbazaar.access.bot.BotClient.BotUnavailableException;
import uz.efbazaar.access.bot.BotClient.ChannelInfo;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AccessRequirementServiceTest {

    private final AccessRequirementRepository repository = mock(AccessRequirementRepository.class);
    private final BotClient bot = mock(BotClient.class);
    private final AccessRequirementService service = new AccessRequirementService(repository, bot);

    @ParameterizedTest
    @ValueSource(strings = {"efbazaar", "@efbazaar", " @efbazaar ", "t.me/efbazaar", "https://t.me/efbazaar", "https://t.me/efbazaar/"})
    void normalizeUsername_acceptsCommonForms(String raw) {
        assertThat(AccessRequirementService.normalizeUsername(raw)).isEqualTo("efbazaar");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "abc", "ef bazaar", "https://t.me/+invite123", "efbazaar!"})
    void normalizeUsername_rejectsInvalid(String raw) {
        assertThatThrownBy(() -> AccessRequirementService.normalizeUsername(raw))
                .isInstanceOf(AccessRequirementException.class)
                .extracting("code").isEqualTo("INVALID_USERNAME");
    }

    @Test
    void add_savesChannel_whenBotIsAdmin() {
        when(bot.resolveChannel("efbazaar")).thenReturn(Optional.of(
                new ChannelInfo(-100L, "channel", "efBazaar", "efbazaar", "photo", "administrator")));
        when(repository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        RequirementView view = service.addTelegramChannel("@efbazaar", UUID.randomUUID());

        var captor = ArgumentCaptor.forClass(AccessRequirement.class);
        verify(repository).saveAndFlush(captor.capture());
        assertThat(captor.getValue().getExternalKey()).isEqualTo("-100");
        assertThat(view.title()).isEqualTo("efBazaar");
        assertThat(view.url()).isEqualTo("https://t.me/efbazaar");
    }

    @Test
    void add_rejects_whenBotIsNotAdmin() {
        when(bot.resolveChannel("efbazaar")).thenReturn(Optional.of(
                new ChannelInfo(-100L, "channel", "efBazaar", "efbazaar", null, "left")));

        assertThatThrownBy(() -> service.addTelegramChannel("efbazaar", UUID.randomUUID()))
                .extracting("code").isEqualTo("BOT_NOT_CHANNEL_ADMIN");
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void add_rejects_unknownChannel() {
        when(bot.resolveChannel("efbazaar")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.addTelegramChannel("efbazaar", UUID.randomUUID()))
                .extracting("code").isEqualTo("CHANNEL_NOT_FOUND");
    }

    @Test
    void add_rejects_groups() {
        when(bot.resolveChannel("efbazaar")).thenReturn(Optional.of(
                new ChannelInfo(-100L, "supergroup", "efBazaar", "efbazaar", null, "administrator")));

        assertThatThrownBy(() -> service.addTelegramChannel("efbazaar", UUID.randomUUID()))
                .extracting("code").isEqualTo("NOT_A_CHANNEL");
    }

    @Test
    void add_rejects_duplicate() {
        when(bot.resolveChannel("efbazaar")).thenReturn(Optional.of(
                new ChannelInfo(-100L, "channel", "efBazaar", "efbazaar", null, "administrator")));
        when(repository.existsByTypeAndExternalKey(RequirementType.TELEGRAM_CHANNEL, "-100")).thenReturn(true);

        assertThatThrownBy(() -> service.addTelegramChannel("efbazaar", UUID.randomUUID()))
                .extracting("code").isEqualTo("ALREADY_ADDED");
    }

    @Test
    void add_reportsBotOutage() {
        when(bot.resolveChannel("efbazaar")).thenThrow(new BotUnavailableException("down", null));

        assertThatThrownBy(() -> service.addTelegramChannel("efbazaar", UUID.randomUUID()))
                .extracting("code").isEqualTo("BOT_UNAVAILABLE");
    }
}
