package uz.efbazaar.marketplace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.AttributeDefinition;
import uz.efbazaar.marketplace.domain.AttributeType;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.AttributeDefinitionRepository;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * Covers the {@code min_sellable} floor, whose whole point is to be a distinct
 * failure from {@code min}: 0 remaining device transfers is a truthful value,
 * it just makes the account impossible to hand over this month.
 */
@ExtendWith(MockitoExtension.class)
class AttributeValidatorTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Mock
    AttributeDefinitionRepository repository;

    @InjectMocks
    AttributeValidator validator;

    @Test
    void device_transfer_limit_below_sellable_floor_is_rejected() {
        stubDeviceTransferLimit();

        assertThatThrownBy(() -> validator.validate(Map.of("device_transfer_limit", 1)))
                .isInstanceOf(MarketplaceException.class)
                .satisfies(e -> assertThat(((MarketplaceException) e).getCode())
                        .isEqualTo("attribute_below_sellable_minimum"))
                .hasMessageContaining("kamida 2");
    }

    @Test
    void zero_remaining_transfers_is_rejected_as_unsellable_not_as_range_error() {
        stubDeviceTransferLimit();

        assertThatThrownBy(() -> validator.validate(Map.of("device_transfer_limit", 0)))
                .isInstanceOf(MarketplaceException.class)
                .satisfies(e -> assertThat(((MarketplaceException) e).getCode())
                        .isEqualTo("attribute_below_sellable_minimum"));
    }

    @Test
    void exactly_the_floor_is_accepted() {
        stubDeviceTransferLimit();

        assertThat(validator.validate(Map.of("device_transfer_limit", 2)))
                .containsEntry("device_transfer_limit", 2L);
    }

    @Test
    void above_the_monthly_cap_is_a_plain_range_error() {
        stubDeviceTransferLimit();

        assertThatThrownBy(() -> validator.validate(Map.of("device_transfer_limit", 11)))
                .isInstanceOf(MarketplaceException.class)
                .satisfies(e -> assertThat(((MarketplaceException) e).getCode())
                        .isEqualTo("invalid_attribute_value"));
    }

    @Test
    void missing_required_device_transfer_limit_is_rejected() {
        stubDeviceTransferLimit();

        assertThatThrownBy(() -> validator.validate(Map.of()))
                .isInstanceOf(MarketplaceException.class)
                .satisfies(e -> assertThat(((MarketplaceException) e).getCode())
                        .isEqualTo("missing_required_attribute"));
    }

    private void stubDeviceTransferLimit() {
        when(repository.findAllByActiveTrueOrderByPositionAsc()).thenReturn(List.of(
                definition("device_transfer_limit", "Qurilma almashtirish limiti",
                        "{\"min\":0,\"max\":10,\"min_sellable\":2}")));
    }

    private static AttributeDefinition definition(String key, String label, String constraints) {
        AttributeDefinition def = new AttributeDefinition();
        def.setKey(key);
        def.setLabelUz(label);
        def.setType(AttributeType.INT);
        def.setRequired(true);
        try {
            def.setConstraints(MAPPER.readTree(constraints));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        return def;
    }
}
