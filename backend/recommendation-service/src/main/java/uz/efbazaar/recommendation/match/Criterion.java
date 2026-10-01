package uz.efbazaar.recommendation.match;

import java.math.BigDecimal;
import java.util.UUID;

/** Ball hisobidagi bitta kriteriy. Player filtrida og'irlik 1 yoki 3, lentada — profil og'irligi. */
public record Criterion(long efhubId, UUID playerId, BigDecimal weight) {
}
