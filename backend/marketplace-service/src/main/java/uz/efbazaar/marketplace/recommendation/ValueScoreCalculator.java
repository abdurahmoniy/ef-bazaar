package uz.efbazaar.marketplace.recommendation;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;

/**
 * value_score = w × narx_ulushi + (1 − w) × kartalar_kuchi, ikkalasi 0..1.
 * Qat'iy chegaralar (percentile emas): yangi e'lon boshqalarning balini o'zgartirmaydi.
 */
@Component
public class ValueScoreCalculator {

    private final ValueScoreProperties p;

    public ValueScoreCalculator(ValueScoreProperties p) {
        this.p = p;
    }

    public double score(BigDecimal price, Collection<CardFacts> cards, Instant now) {
        return p.priceWeight() * priceShare(price) + (1 - p.priceWeight()) * cardStrength(cards, now);
    }

    private double priceShare(BigDecimal price) {
        if (price == null || price.compareTo(p.priceFloor()) <= 0) {
            return 0;
        }
        double share = Math.log(price.doubleValue() / p.priceFloor().doubleValue())
                / Math.log(p.priceCap().doubleValue() / p.priceFloor().doubleValue());
        return Math.min(1, share);
    }

    private double cardStrength(Collection<CardFacts> cards, Instant now) {
        double sum = 0;
        for (CardFacts card : cards) {
            if (card.overallRating() == null) {
                continue;
            }
            double base = Math.max(0, card.overallRating() - p.ratingFloor()) / (double) p.ratingSpan();
            double tier = card.metaActiveAt(now) ? p.metaBase() + p.metaPriorityStep() * card.metaPriority() : 1.0;
            sum += base * tier;
        }
        return Math.min(1, sum / p.cardCap());
    }
}
