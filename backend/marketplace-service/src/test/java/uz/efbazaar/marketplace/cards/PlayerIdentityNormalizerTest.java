package uz.efbazaar.marketplace.cards;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PlayerIdentityNormalizerTest {

    @Test
    void normalizes_unicode_case_and_internal_whitespace_deterministically() {
        assertThat(PlayerIdentityNormalizer.normalize("  Ｌionel\t  MESSI  "))
                .isEqualTo("lionel messi");
    }

    @Test
    void keeps_meaningful_diacritics_while_normalizing_unicode_composition() {
        assertThat(PlayerIdentityNormalizer.normalize("Jose\u0301  Giménez"))
                .isEqualTo("josé giménez");
    }
}
