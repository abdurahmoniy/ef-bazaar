package uz.efbazaar.payment.history.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.debit.repository.CardDebitObservationRepository;
import uz.efbazaar.payment.history.dto.CardMovementResponse;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * The card movement history: credits and debits, newest first.
 *
 * <p>Merged in memory rather than in SQL. A UNION over two tables with
 * different columns would need either a view to keep in step with both or a
 * native query that no longer type-checks against the entities — and the read
 * is bounded to a page, so the sort is over a few hundred rows at most.
 */
@Service
@RequiredArgsConstructor
public class CardHistoryService {

    /**
     * The most any one call will return. A history screen is read by a human
     * scrolling; an unbounded read here would let one request pull the whole
     * ledger of observations into memory as the platform grows.
     */
    public static final int MAX_LIMIT = 200;
    public static final int DEFAULT_LIMIT = 50;

    private final CardCreditObservationRepository credits;
    private final CardDebitObservationRepository debits;

    /**
     * @param last4 narrows to one card, or null for every card
     * @param limit clamped to {@link #MAX_LIMIT}; a non-positive value means
     *              {@link #DEFAULT_LIMIT}
     */
    @Transactional(readOnly = true)
    public List<CardMovementResponse> recent(String last4, int limit) {
        int capped = limit <= 0 ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);
        // Each side is read at the full limit, not half: a day of only debits
        // must still fill the page. The merge below then trims.
        var page = PageRequest.of(0, capped);

        List<CardMovementResponse> merged = new ArrayList<>();
        if (last4 == null || last4.isBlank()) {
            credits.findAllByOrderByObservedAtDesc(page)
                    .forEach(c -> merged.add(CardMovementResponse.of(c)));
            debits.findAllByOrderByObservedAtDesc(page)
                    .forEach(d -> merged.add(CardMovementResponse.of(d)));
        } else {
            credits.findByCardLast4OrderByObservedAtDesc(last4, page)
                    .forEach(c -> merged.add(CardMovementResponse.of(c)));
            debits.findByCardLast4OrderByObservedAtDesc(last4, page)
                    .forEach(d -> merged.add(CardMovementResponse.of(d)));
        }

        // Two notices can share a second, so the id breaks the tie. Without it
        // the order is whatever the two lists happened to be concatenated in,
        // and the same request answers differently on consecutive calls.
        merged.sort(Comparator
                .comparing(CardMovementResponse::observedAt).reversed()
                .thenComparing(CardMovementResponse::id));
        return merged.size() > capped ? merged.subList(0, capped) : merged;
    }
}
