package uz.efbazaar.marketplace.cards;

import java.util.List;

public record AdminCardPage(List<AdminCardSearchResult> items, int page, int size, long total) {}
