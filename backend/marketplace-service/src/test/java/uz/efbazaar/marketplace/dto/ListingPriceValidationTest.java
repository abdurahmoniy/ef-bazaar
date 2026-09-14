package uz.efbazaar.marketplace.dto;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ListingPriceValidationTest {
    private static final ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
    private static final Validator validator = factory.getValidator();

    @AfterAll
    static void closeValidator() { factory.close(); }

    @ParameterizedTest
    @ValueSource(strings = {"0", "4999", "4999.99"})
    void rejectsPricesBelowFiveThousand(String price) {
        var request = new ListingCreateRequest("Account with rare players", new BigDecimal(price), false, Map.of());
        assertThat(validator.validate(request)).anyMatch(v -> v.getPropertyPath().toString().equals("price"));
        var update = new ListingUpdateRequest(null, new BigDecimal(price), null, null);
        assertThat(validator.validate(update)).anyMatch(v -> v.getPropertyPath().toString().equals("price"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"5000", "10000"})
    void acceptsPricesAtOrAboveFiveThousand(String price) {
        var request = new ListingCreateRequest("Account with rare players", new BigDecimal(price), false, Map.of());
        assertThat(validator.validate(request)).isEmpty();
        assertThat(validator.validate(new ListingUpdateRequest(null, new BigDecimal(price), null, null))).isEmpty();
        assertThat(validator.validate(new ListingUpdateRequest(null, null, null, null))).isEmpty();
    }
}
