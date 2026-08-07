package uz.efbazaar.auth.domain;

import java.util.List;

/**
 * Single-valued user role. The JWT roles claim is a *list* derived from it —
 * see {@link #authorities()}. Kept single-valued deliberately: no user needs
 * to be both a platform admin and a trade admin, and a join table would
 * complicate every token issue path.
 */
public enum Role {
    USER,
    ADMIN,
    /** Runs escrow trades by hand for a fee. See the human trade-admin spec. */
    TRADE_ADMIN;

    /**
     * Authorities put into the JWT {@code roles} claim and forwarded by nginx
     * as {@code X-User-Roles}. Every role grants {@code ROLE_USER} so a trade
     * admin can still buy and sell like anyone else.
     */
    public List<String> authorities() {
        return switch (this) {
            case USER        -> List.of("ROLE_USER");
            case ADMIN       -> List.of("ROLE_USER", "ROLE_ADMIN");
            case TRADE_ADMIN -> List.of("ROLE_USER", "ROLE_TRADE_ADMIN");
        };
    }
}
