package uz.efbazaar.recommendation.feed;

import org.junit.jupiter.api.Test;
import uz.efbazaar.recommendation.match.Criterion;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ProfileHashTest {

    private static final UUID P = UUID.randomUUID();
    private static final UUID Q = UUID.randomUUID();

    @Test
    void orderDoesNotMatterButWeightsDo() {
        List<Criterion> a = List.of(new Criterion(1, P, new BigDecimal("2")), new Criterion(2, Q, BigDecimal.ONE));
        List<Criterion> reversed = List.of(a.get(1), a.get(0));
        List<Criterion> heavier = List.of(new Criterion(1, P, new BigDecimal("3")), new Criterion(2, Q, BigDecimal.ONE));

        assertThat(ProfileHash.of(a)).isEqualTo(ProfileHash.of(reversed));
        assertThat(ProfileHash.of(a)).isNotEqualTo(ProfileHash.of(heavier));
    }

    @Test
    void trailingZerosDoNotChangeTheHash() {
        assertThat(ProfileHash.of(List.of(new Criterion(1, P, new BigDecimal("1.50")))))
                .isEqualTo(ProfileHash.of(List.of(new Criterion(1, P, new BigDecimal("1.5")))));
    }

    @Test
    void onlyLowercaseSha256HexIsWellFormed() {
        String hash = ProfileHash.of(List.of(new Criterion(1, P, BigDecimal.ONE)));

        assertThat(hash).hasSize(64);
        assertThat(ProfileHash.isWellFormed(hash)).isTrue();
        assertThat(ProfileHash.isWellFormed(null)).isFalse();
        assertThat(ProfileHash.isWellFormed("../" + hash.substring(3))).isFalse();
        assertThat(ProfileHash.isWellFormed(hash.toUpperCase())).isFalse();
    }
}
