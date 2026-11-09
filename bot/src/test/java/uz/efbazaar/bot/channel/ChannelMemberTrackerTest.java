package uz.efbazaar.bot.channel;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.bot.channel.ChannelMemberTracker.Kind;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Kanalga obuna bo'lish va chiqib ketishni tanib olish.
 *
 * <p>Telegram {@code chat_member} da eski va yangi maqomni beradi. "Chiqdi"
 * — a'zo bo'lgan odam a'zo bo'lmay qolgani; admin huquqi o'zgarishi yoki
 * cheklov qo'yilishi chiqib ketish EMAS.
 */
class ChannelMemberTrackerTest {

    private final ObjectMapper json = new ObjectMapper();

    private JsonNode update(String type, String oldStatus, String newStatus) throws Exception {
        return json.readTree("""
                {"chat": {"id": -1001, "type": "%s", "username": "EfBazaar"},
                 "from": {"id": 42}, "date": 1794200000,
                 "old_chat_member": {"status": "%s", "user": {"id": 42}},
                 "new_chat_member": {"status": "%s", "user": {"id": 42}}}
                """.formatted(type, oldStatus, newStatus));
    }

    @Test
    @DisplayName("subscribing to a channel is a join")
    void join() throws Exception {
        assertThat(ChannelMemberTracker.kind(update("channel", "left", "member"))).isEqualTo(Kind.JOIN);
    }

    @Test
    @DisplayName("leaving or being removed is a leave")
    void leave() throws Exception {
        assertThat(ChannelMemberTracker.kind(update("channel", "member", "left"))).isEqualTo(Kind.LEAVE);
        assertThat(ChannelMemberTracker.kind(update("channel", "member", "kicked"))).isEqualTo(Kind.LEAVE);
    }

    @Test
    @DisplayName("a role change inside the channel is neither")
    void roleChangeIgnored() throws Exception {
        assertThat(ChannelMemberTracker.kind(update("channel", "member", "administrator"))).isNull();
        assertThat(ChannelMemberTracker.kind(update("channel", "administrator", "member"))).isNull();
    }

    @Test
    @DisplayName("groups are ignored: only channel subscriptions are tracked")
    void groupsIgnored() throws Exception {
        assertThat(ChannelMemberTracker.kind(update("supergroup", "left", "member"))).isNull();
    }

    @Test
    @DisplayName("a recognised change is forwarded with the user, channel and Telegram's own timestamp")
    void forwards() throws Exception {
        ChannelMemberClient client = mock(ChannelMemberClient.class);

        new ChannelMemberTracker(client).handle(update("channel", "member", "left"));

        verify(client).report(-1001L, "EfBazaar", 42L, Kind.LEAVE, 1794200000L);
    }

    @Test
    @DisplayName("nothing is sent for an update that is not a join or leave")
    void silentOtherwise() throws Exception {
        ChannelMemberClient client = mock(ChannelMemberClient.class);

        new ChannelMemberTracker(client).handle(update("channel", "member", "administrator"));

        verify(client, never()).report(anyLong(), anyString(), anyLong(), any(), anyLong());
    }
}
