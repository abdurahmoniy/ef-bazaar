package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.dto.MatchRequest;
import uz.efbazaar.marketplace.exception.MarketplaceException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class MatchRequestParserTest {

    private final CardIdentityVerifier identities = mock(CardIdentityVerifier.class);
    private final MatchRequestParser parser = new MatchRequestParser(identities);

    @Test
    void parses_normal_and_priority_criteria_and_verifies_identity_pairs() {
        UUID messi = UUID.randomUUID();
        UUID ronaldo = UUID.randomUUID();

        MatchRequest request = parser.parse(List.of(
                "101:" + messi + ":N",
                "202:" + ronaldo + ":P"), 4).orElseThrow();

        assertThat(request.criteria()).extracting(criterion -> criterion.weight())
                .containsExactly(1, 3);
        assertThat(request.strictness()).isEqualTo(4);
        assertThat(request.minimumScore()).isEqualByComparingTo(new BigDecimal("0.40"));
        verify(identities).verify(anyList());
    }

    @Test
    void strictness_one_means_any_positive_overlap_and_empty_means_ordinary_browse() {
        UUID player = UUID.randomUUID();

        MatchRequest request = parser.parse(List.of("101:" + player + ":N"), 1).orElseThrow();
        assertThat(request.anyPositiveOverlap()).isTrue();
        assertThat(request.minimumScore()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(parser.parse(List.of(), 4)).isEmpty();
    }

    @Test
    void rejects_bad_syntax_range_count_and_duplicate_players_before_sql() {
        UUID player = UUID.randomUUID();
        assertThatThrownBy(() -> parser.parse(List.of("bad"), 4))
                .isInstanceOf(MarketplaceException.class);
        assertThatThrownBy(() -> parser.parse(List.of("101:" + player + ":X"), 4))
                .isInstanceOf(MarketplaceException.class);
        assertThatThrownBy(() -> parser.parse(List.of("101:" + player + ":N"), 0))
                .isInstanceOf(MarketplaceException.class);
        assertThatThrownBy(() -> parser.parse(List.of(
                "101:" + player + ":N", "202:" + player + ":P"), 4))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("player");
        List<String> twelve = IntStream.range(0, 12)
                .mapToObj(index -> (100 + index) + ":" + UUID.randomUUID() + ":N")
                .toList();
        assertThatThrownBy(() -> parser.parse(twelve, 4))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("11");
    }
}
