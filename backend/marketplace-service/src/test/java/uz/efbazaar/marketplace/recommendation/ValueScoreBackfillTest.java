package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ValueScoreBackfillTest {

    @Test
    void failureDoesNotAbortStartup() {
        ListingValueScorer scorer = mock(ListingValueScorer.class);
        when(scorer.backfillBatch(500)).thenThrow(new RuntimeException("boom"));

        assertThatCode(() -> new ValueScoreBackfill(scorer).run(null)).doesNotThrowAnyException();
    }
}
