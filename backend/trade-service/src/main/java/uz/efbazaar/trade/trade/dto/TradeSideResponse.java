package uz.efbazaar.trade.trade.dto;

import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeSide;

import java.time.Instant;

/**
 * One party's progress, so each side can watch the other move.
 *
 * <p>Carries no mailbox id and no address: the trade already exposes the
 * viewer's own, and a party has no business reading the box the other one is
 * moving their account through.
 */
public record TradeSideResponse(
        ParticipantRole role,
        boolean emailChanged,
        boolean konamiVerified,
        boolean passwordSent,
        boolean confirmed,
        boolean rejected,
        Instant lastStepAt,
        // Konami last said this side's mailbox is on no Konami ID — the
        // account email was not moved. Null when it never did.
        Instant konamiNotRegisteredAt
) {
    public static TradeSideResponse of(TradeSide s) {
        Instant last = s.getPasswordSentAt() != null ? s.getPasswordSentAt()
                : s.getKonamiVerifiedAt() != null ? s.getKonamiVerifiedAt()
                : s.getEmailChangedAt();
        return new TradeSideResponse(
                s.role(),
                s.getEmailChangedAt() != null,
                s.getKonamiVerifiedAt() != null,
                s.getPasswordSentAt() != null,
                s.getConfirmedAt() != null,
                s.getRejectedAt() != null,
                last,
                s.getKonamiNotRegisteredAt());
    }
}
