package uz.efbazaar.trade.admin.presence;

import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * How the admin catalogue learns who is around.
 *
 * <p>Deliberately a port. This iteration ships a stopgap backed by a Redis key
 * with a TTL, refreshed on every authenticated trade-service request — good
 * enough to sort the catalogue, and scoped to trade-service only. The separate
 * global-presence spec (WebSocket, every user, all services) replaces the
 * implementation without touching the catalogue.
 */
public interface PresenceQuery {

    /**
     * One entry per requested id — never a partial map, so callers do not have
     * to null-check. Unknown users come back offline with a {@code null}
     * {@code lastSeenAt}.
     */
    Map<UUID, Presence> of(Collection<UUID> userIds);

    record Presence(boolean online, Instant lastSeenAt) {
        public static Presence offline() {
            return new Presence(false, null);
        }
    }
}
