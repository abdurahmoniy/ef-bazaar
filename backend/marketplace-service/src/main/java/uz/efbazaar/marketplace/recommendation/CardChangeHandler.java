package uz.efbazaar.marketplace.recommendation;

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.Outbox;

import java.util.Collection;
import java.util.List;

/**
 * efbazaar'da karta o'zgargandan KEYIN chaqiriladi (META, yangi karta, META chegarasi).
 *
 * <p>Karta boshqa bazada, shuning uchun o'zgarish bilan atomik emas: efbazaar commit bo'ldi,
 * keyin shu yerda MARKETPLACE tranzaksiyasi ochiladi — tegishli e'lonlarning value_score'i
 * (V73 trigger listing snapshot'larini belgilaydi) va karta belgilari birga yoziladi.
 * Yiqilsa exception chaqiruvchiga chiqadi (admin xatoni ko'radi va qayta urinadi — ikkala
 * qadam ham idempotent); zaxira — replay.
 */
@Component
public class CardChangeHandler {

    private final Outbox outbox;
    private final ListingValueScorer scorer;
    private final TransactionTemplate tx;

    public CardChangeHandler(Outbox outbox, ListingValueScorer scorer, PlatformTransactionManager txManager) {
        this.outbox = outbox;
        this.scorer = scorer;
        this.tx = new TransactionTemplate(txManager);
    }

    public void cardsChanged(Collection<Long> efhubIds) {
        if (efhubIds.isEmpty()) {
            return;
        }
        List<Long> ids = List.copyOf(efhubIds);
        tx.executeWithoutResult(status -> {
            scorer.recomputeForCards(ids);
            ids.forEach(id -> outbox.markSnapshot(RecommendationTopics.SOURCE_CARD, Long.toString(id)));
        });
    }
}
