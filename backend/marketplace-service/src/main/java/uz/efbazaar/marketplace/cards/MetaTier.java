package uz.efbazaar.marketplace.cards;

/**
 * Meta relevance of a player card — how much buyers actually want it right now.
 *
 * <p>Deliberately NOT part of {@link CardType}: that one is rarity, derived
 * from the efhub_id prefix and immutable. Meta shifts every patch, so this is
 * hand-curated by admins from {@code /admin/players} and stored in the
 * {@code meta_tier} column of each card table (see
 * {@code infra/postgres/efbazaar/V2__meta_tier.sql}).
 */
public enum MetaTier {
    NORMAL,
    META
}
