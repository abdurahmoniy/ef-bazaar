package uz.efbazaar.trade.trade.service;

import uz.efbazaar.trade.trade.domain.*;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/** Immutable turn keys for comparing progress before and after a locked mutation. */
final class TradeTurns {
    private TradeTurns() {}

    static Map<ParticipantRole, String> snapshot(Trade trade, List<TradeSide> sides) {
        Map<ParticipantRole, String> result = new EnumMap<>(ParticipantRole.class);
        for (ParticipantRole role : ParticipantRole.values()) {
            boolean swap = trade.getKind().isSwap();
            boolean actionable = switch (trade.getState()) {
                case WAITING_EMAIL_CHANGE, VERIFYING_KONAMI_LINK, WAITING_PASSWORD ->
                        role == ParticipantRole.SELLER || swap;
                case WAITING_BUYER_VERIFY -> role == ParticipantRole.BUYER || swap;
                case WAITING_ADMIN -> role == ParticipantRole.SELLER && trade.getAssignedAdminId() == null;
                case WAITING_CLOSE_CONFIRM -> true;
                default -> false;
            };
            if (!actionable || cleared(trade, sides, role)) continue;
            ParticipantRole partner = role == ParticipantRole.SELLER ? ParticipantRole.BUYER : ParticipantRole.SELLER;
            result.put(role, trade.getState().name() + ":" + cleared(trade, sides, partner));
        }
        return result;
    }

    private static boolean cleared(Trade trade, List<TradeSide> sides, ParticipantRole role) {
        if (trade.getState() == TradeState.WAITING_CLOSE_CONFIRM) {
            return (role == ParticipantRole.SELLER ? trade.getSellerConfirmedAt() : trade.getBuyerConfirmedAt()) != null;
        }
        return sides.stream().filter(side -> side.role() == role).anyMatch(side -> switch (trade.getState()) {
            case WAITING_EMAIL_CHANGE -> side.getEmailChangedAt() != null;
            case VERIFYING_KONAMI_LINK -> side.getKonamiVerifiedAt() != null;
            case WAITING_PASSWORD -> side.getPasswordSentAt() != null;
            case WAITING_BUYER_VERIFY -> side.hasDecided();
            default -> false;
        });
    }
}
