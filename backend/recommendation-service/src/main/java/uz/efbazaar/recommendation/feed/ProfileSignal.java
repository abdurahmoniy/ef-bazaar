package uz.efbazaar.recommendation.feed;

import java.math.BigDecimal;
import java.util.UUID;

/** Bitta karta bo'yicha yig'ilgan signal (META boost'gacha). */
public record ProfileSignal(long efhubId, UUID playerId, BigDecimal weight, boolean activeMeta) {
}
