package uz.efbazaar.marketplace.dto;

public record MatchDetails(
        int percent,
        int exactCount,
        int alternateCount,
        int missingCount,
        int selectedCount,
        int strictness
) {
}
