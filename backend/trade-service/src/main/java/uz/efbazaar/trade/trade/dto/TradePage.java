package uz.efbazaar.trade.trade.dto;

import java.util.List;

/**
 * Paged trade list. Deliberately not Spring's {@code Page} — the rest of this
 * service exposes {@code (items, total, limit, offset)} (see the mailbox inbox
 * endpoints), and serializing {@code PageImpl} straight to JSON leaks an
 * unstable structure that Spring itself warns about.
 */
public record TradePage(
        List<TradeResponse> items,
        long total,
        int limit,
        int offset
) {}
