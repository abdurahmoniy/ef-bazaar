package uz.efbazaar.trade.mailbox.custom;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import uz.efbazaar.trade.mailbox.custom.CustomNamePolicy.NameProblem;

import static org.assertj.core.api.Assertions.assertThat;

class CustomNamePolicyTest {

    @ParameterizedTest
    @ValueSource(strings = {"ali12", "a1b2c3d4e5f6g7h8i9j0k1l2", "12345"})
    void accepts(String s) {
        assertThat(CustomNamePolicy.check(s)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"ali", "ali.bek", "ali_bek", "ali-bek", "a1b2c3d4e5f6g7h8i9j0k1l2m", "алибек", " ", "AliBek"})
    void rejectsFormat(String s) {
        assertThat(CustomNamePolicy.check(s)).contains(NameProblem.INVALID);
    }

    @ParameterizedTest
    @ValueSource(strings = {"admin", "postmaster", "efbazaar", "noreply", "support", "efootball"})
    void rejectsReserved(String s) {
        assertThat(CustomNamePolicy.check(s)).contains(NameProblem.RESERVED);
    }

    @Test
    void normalizesCaseAndSpace() {
        assertThat(CustomNamePolicy.normalize("  AliBek ")).isEqualTo("alibek");
        assertThat(CustomNamePolicy.normalize(null)).isEmpty();
    }
}
