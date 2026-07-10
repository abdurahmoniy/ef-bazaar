package uz.efbazaar.trade.card;

import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.card.service.LuhnValidator;

import static org.assertj.core.api.Assertions.assertThat;

class LuhnValidatorTest {

    @Test
    void acceptsKnownValidNumbers() {
        assertThat(LuhnValidator.isValid("4111111111111111")).isTrue();  // Visa test
        assertThat(LuhnValidator.isValid("5555555555554444")).isTrue();  // Mastercard test
        assertThat(LuhnValidator.isValid("8600000000000000")).isFalse(); // Uzcard prefix, but not Luhn-valid stub
    }

    @Test
    void rejectsShortNumbers() {
        assertThat(LuhnValidator.isValid("411111")).isFalse();
    }

    @Test
    void rejectsNonDigits() {
        assertThat(LuhnValidator.isValid("4111-1111-1111-1111")).isFalse();
    }

    @Test
    void rejectsNull() {
        assertThat(LuhnValidator.isValid(null)).isFalse();
    }
}
