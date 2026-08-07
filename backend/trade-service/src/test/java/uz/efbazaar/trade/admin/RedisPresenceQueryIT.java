package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.admin.presence.PresenceQuery;
import uz.efbazaar.trade.admin.presence.RedisPresenceQuery;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class RedisPresenceQueryIT extends AbstractIntegrationIT {

    @Autowired RedisPresenceQuery presence;

    @Test
    void touchedUserIsOnline() {
        UUID user = UUID.randomUUID();
        presence.touch(user);

        PresenceQuery.Presence p = presence.of(List.of(user)).get(user);

        assertThat(p).isNotNull();
        assertThat(p.online()).isTrue();
        assertThat(p.lastSeenAt()).isNotNull();
    }

    @Test
    void untouchedUserIsOfflineWithNoLastSeen() {
        UUID user = UUID.randomUUID();

        PresenceQuery.Presence p = presence.of(List.of(user)).get(user);

        assertThat(p).isNotNull();
        assertThat(p.online()).isFalse();
        assertThat(p.lastSeenAt()).isNull();
    }

    @Test
    void batchLookupReturnsAnEntryForEveryRequestedId() {
        UUID online = UUID.randomUUID(), offline = UUID.randomUUID();
        presence.touch(online);

        var result = presence.of(List.of(online, offline));

        assertThat(result).containsOnlyKeys(online, offline);
        assertThat(result.get(online).online()).isTrue();
        assertThat(result.get(offline).online()).isFalse();
    }

    @Test
    void emptyRequestDoesNotHitRedis() {
        assertThat(presence.of(List.of())).isEmpty();
    }
}
