package uz.efbazaar.marketplace.cards;

import java.text.Normalizer;
import java.util.Locale;

/** Stable grouping key used when a card has not been assigned by an admin. */
public final class PlayerIdentityNormalizer {

    private PlayerIdentityNormalizer() {
    }

    public static String normalize(String name) {
        if (name == null) {
            return "";
        }
        return Normalizer.normalize(name, Normalizer.Form.NFKC)
                .strip()
                .replaceAll("\\s+", " ")
                .toLowerCase(Locale.ROOT);
    }
}
