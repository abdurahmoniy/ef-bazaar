package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class ValueScoreCalculatorTest {

    private static final Instant NOW = Instant.parse("2026-10-01T12:00:00Z");
    private final ValueScoreCalculator calc = new ValueScoreCalculator(new ValueScoreProperties(
            80, 20, 2.0, 0.25, 15, new BigDecimal("5000"), new BigDecimal("50000000"), 0.5));

    private static CardFacts normal(int rating) {
        return new CardFacts(89001, "bigtime", null, rating, "NORMAL", 0, null, null);
    }

    private static CardFacts meta(int rating, int priority, Instant from, Instant until) {
        return new CardFacts(89002, "bigtime", null, rating, "META", priority, from, until);
    }

    @Test
    void priceAtOrBelowFloorAndNoCardsIsZero() {
        assertThat(calc.score(new BigDecimal("5000"), List.of(), NOW)).isZero();
        assertThat(calc.score(new BigDecimal("1000"), List.of(), NOW)).isZero();
        assertThat(calc.score(null, Collections.emptyList(), NOW)).isZero();
    }

    @Test
    void priceShareIsLogarithmicAndCapped() {
        // ln(500000/5000) / ln(50000000/5000) = ln(100)/ln(10000) = 0.5  → 0.5 * 0.5
        assertThat(calc.score(new BigDecimal("500000"), List.of(), NOW)).isCloseTo(0.25, within(1e-9));
        assertThat(calc.score(new BigDecimal("900000000"), List.of(), NOW)).isCloseTo(0.5, within(1e-9));
    }

    @Test
    void cardStrengthUsesRatingAboveFloorAndCaps() {
        // (100-80)/20 = 1.0 per card, 3 cards → 3/15 = 0.2 → 0.5 * 0.2
        assertThat(calc.score(new BigDecimal("5000"), List.of(normal(100), normal(100), normal(100)), NOW))
                .isCloseTo(0.1, within(1e-9));
        assertThat(calc.score(new BigDecimal("5000"), List.of(normal(75), normal(80)), NOW)).isZero();
        assertThat(calc.score(new BigDecimal("5000"), Collections.nCopies(40, normal(100)), NOW))
                .isCloseTo(0.5, within(1e-9));
    }

    @Test
    void activeMetaMultipliesAndExpiredMetaDoesNot() {
        // (90-80)/20 = 0.5; META priority 4 → ×(2.0 + 1.0) = 1.5 → 1.5/15 = 0.1 → 0.05
        assertThat(calc.score(new BigDecimal("5000"), List.of(meta(90, 4, null, null)), NOW))
                .isCloseTo(0.05, within(1e-9));
        CardFacts expired = meta(90, 4, null, NOW.minusSeconds(1));
        CardFacts future = meta(90, 4, NOW.plusSeconds(60), null);
        // NORMAL bilan bir xil: 0.5/15 → 0.5 * 0.0333…
        double normalScore = calc.score(new BigDecimal("5000"), List.of(normal(90)), NOW);
        assertThat(calc.score(new BigDecimal("5000"), List.of(expired), NOW)).isCloseTo(normalScore, within(1e-9));
        assertThat(calc.score(new BigDecimal("5000"), List.of(future), NOW)).isCloseTo(normalScore, within(1e-9));
    }

    @Test
    void missingRatingCountsAsZero() {
        CardFacts unrated = new CardFacts(89003, "bigtime", null, null, "META", 10, null, null);
        assertThat(calc.score(new BigDecimal("5000"), List.of(unrated), NOW)).isZero();
    }
}
