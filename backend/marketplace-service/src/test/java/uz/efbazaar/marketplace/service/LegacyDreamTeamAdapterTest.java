package uz.efbazaar.marketplace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.dto.MatchCardCriterion;
import uz.efbazaar.marketplace.dto.MatchRequest;
import uz.efbazaar.marketplace.exception.MarketplaceException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LegacyDreamTeamAdapterTest {

    @Mock CardIdentityVerifier identities;

    @Test
    void convertsBoundedLegacyJsonToCanonicalCriteria() {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        when(identities.resolvePlayerIds(List.of(10L, 20L)))
                .thenReturn(Map.of(10L, first, 20L, second));
        LegacyDreamTeamAdapter adapter = new LegacyDreamTeamAdapter(new ObjectMapper(), identities);

        MatchRequest match = adapter.parse("""
                [{"id":"10","name":"One","w":1},{"id":20,"name":"Two","w":3}]
                """, "40").orElseThrow();

        assertThat(match.strictness()).isEqualTo(4);
        assertThat(match.criteria()).containsExactly(
                new MatchCardCriterion(10L, first, MatchCardCriterion.Importance.NORMAL),
                new MatchCardCriterion(20L, second, MatchCardCriterion.Importance.PRIORITY));
    }

    @Test
    void rejectsMalformedWrongShapeUnknownWeightAndTooManyEntries() {
        LegacyDreamTeamAdapter adapter = new LegacyDreamTeamAdapter(new ObjectMapper(), identities);

        assertInvalid(adapter, "not-json");
        assertInvalid(adapter, "{}");
        assertInvalid(adapter, "[{\"id\":1,\"w\":2}]");
        assertInvalid(adapter, "[1]");
        assertInvalid(adapter, "[" + "{\"id\":1},".repeat(11) + "{\"id\":1}]");
    }

    @Test
    void rejectsUnknownAndDuplicateCanonicalPlayers() {
        UUID samePlayer = UUID.randomUUID();
        LegacyDreamTeamAdapter adapter = new LegacyDreamTeamAdapter(new ObjectMapper(), identities);

        when(identities.resolvePlayerIds(List.of(99L))).thenReturn(Map.of());
        assertInvalid(adapter, "[{\"id\":99}]");

        when(identities.resolvePlayerIds(List.of(10L, 20L)))
                .thenReturn(Map.of(10L, samePlayer, 20L, samePlayer));
        assertInvalid(adapter, "[{\"id\":10},{\"id\":20}]");
    }

    @Test
    void treatsMissingLegacyValueAsNoMatcherAndValidatesThreshold() {
        LegacyDreamTeamAdapter adapter = new LegacyDreamTeamAdapter(new ObjectMapper(), identities);
        assertThat(adapter.parse(null, null)).isEmpty();
        assertInvalid(adapter, "[{\"id\":10}]", "105");
    }

    private static void assertInvalid(LegacyDreamTeamAdapter adapter, String json) {
        assertInvalid(adapter, json, null);
    }

    private static void assertInvalid(LegacyDreamTeamAdapter adapter, String json, String threshold) {
        assertThatThrownBy(() -> adapter.parse(json, threshold))
                .isInstanceOf(MarketplaceException.class)
                .extracting(error -> ((MarketplaceException) error).getCode())
                .isEqualTo("invalid_attribute_value");
    }
}
