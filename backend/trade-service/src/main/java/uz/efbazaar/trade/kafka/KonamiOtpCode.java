package uz.efbazaar.trade.kafka;

import java.time.Instant;

/** Reject malformed, expired and future-dated worker codes before storage or delivery. */
public final class KonamiOtpCode {
    private KonamiOtpCode() {}
    public static boolean isFresh(String code, Instant receivedAt) {
        Instant now = Instant.now();
        return code != null && code.matches("[0-9]{4,8}") && receivedAt != null
                && receivedAt.isAfter(now.minusSeconds(300)) && !receivedAt.isAfter(now);
    }
}
