package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.TransactionDefinition;
import uz.efbazaar.outbox.Outbox;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.*;

class CardChangeHandlerTest {

    /** Haqiqiy DB'siz: faqat tranzaksiya chegarasi va commit/rollback'ni kuzatadi. */
    static class RecordingTxManager extends AbstractPlatformTransactionManager {
        int commits;
        int rollbacks;
        @Override protected Object doGetTransaction() { return new Object(); }
        @Override protected void doBegin(Object tx, TransactionDefinition def) { }
        @Override protected void doCommit(DefaultTransactionStatus status) { commits++; }
        @Override protected void doRollback(DefaultTransactionStatus status) { rollbacks++; }
    }

    @Test
    void recomputesListingsAndMarksEveryCardInOneMarketplaceTransaction() {
        Outbox outbox = mock(Outbox.class);
        ListingValueScorer scorer = mock(ListingValueScorer.class);
        RecordingTxManager tm = new RecordingTxManager();

        new CardChangeHandler(outbox, scorer, tm).cardsChanged(List.of(8900000001L, 8900000002L));

        verify(scorer).recomputeForCards(List.of(8900000001L, 8900000002L));
        verify(outbox).markSnapshot("card", "8900000001");
        verify(outbox).markSnapshot("card", "8900000002");
        assertThat(tm.commits).isEqualTo(1);
    }

    @Test
    void failureRollsBackAndSurfacesToCaller() {
        Outbox outbox = mock(Outbox.class);
        ListingValueScorer scorer = mock(ListingValueScorer.class);
        when(scorer.recomputeForCards(anyCollection())).thenThrow(new IllegalStateException("db down"));
        RecordingTxManager tm = new RecordingTxManager();

        assertThatThrownBy(() -> new CardChangeHandler(outbox, scorer, tm).cardsChanged(List.of(8900000001L)))
                .hasMessageContaining("db down");
        assertThat(tm.rollbacks).isEqualTo(1);
        verifyNoInteractions(outbox);
    }

    @Test
    void emptyChangeDoesNothing() {
        Outbox outbox = mock(Outbox.class);
        ListingValueScorer scorer = mock(ListingValueScorer.class);
        new CardChangeHandler(outbox, scorer, new RecordingTxManager()).cardsChanged(List.of());
        verifyNoInteractions(outbox, scorer);
    }
}
