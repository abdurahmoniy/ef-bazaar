package uz.efbazaar.marketplace.recommendation;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;

/** "Katta bozor" formulasi konstantalari — spec §5.4. */
@ConfigurationProperties("app.recommendation.value-score")
public record ValueScoreProperties(int ratingFloor, int ratingSpan, double metaBase, double metaPriorityStep,
                                   double cardCap, BigDecimal priceFloor, BigDecimal priceCap,
                                   double priceWeight) {
}
