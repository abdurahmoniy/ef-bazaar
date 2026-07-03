package uz.efbazaar.marketplace.cards;

import java.util.List;

/** One page of catalog cards plus the total matching count for pagination UIs. */
public record CardPage(
        List<CardSearchResult> items,
        int page,
        int size,
        long total
) {}
