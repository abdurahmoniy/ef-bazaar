package uz.efbazaar.marketplace.dto;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ListingResponseTest {

    @Test
    void one_match_explanation_drives_both_new_and_compatibility_fields() {
        ListingResponse response = new ListingResponse(
                UUID.randomUUID(), UUID.randomUUID(), "Account", BigDecimal.TEN,
                false, Map.of(), List.of(), null, null, 0, 0, null,
                null, null, null, null);
        MatchDetails details = new MatchDetails(75, 1, 2, 8, 11, 4);

        ListingResponse matched = response.withMatchDetails(details);

        assertThat(matched.matchDetails()).isEqualTo(details);
        assertThat(matched.matchPercent()).isEqualTo(75);
    }
}
