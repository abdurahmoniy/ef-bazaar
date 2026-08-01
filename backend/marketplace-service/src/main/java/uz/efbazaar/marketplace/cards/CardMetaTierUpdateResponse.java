package uz.efbazaar.marketplace.cards;

/**
 * @param updated   rows whose tier actually changed
 * @param requested ids in the request — {@code requested > updated} means some
 *                  cards already had that tier, or their efhub_id prefix
 *                  matches no card table we hold
 */
public record CardMetaTierUpdateResponse(int updated, int requested) {}
