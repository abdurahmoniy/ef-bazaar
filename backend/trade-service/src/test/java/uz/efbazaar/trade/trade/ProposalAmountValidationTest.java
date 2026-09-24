package uz.efbazaar.trade.trade;

import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;

import static org.assertj.core.api.Assertions.*;

class ProposalAmountValidationTest {
    private final ObjectMapper mapper = new ObjectMapper();

    private String payload(String kind, String amount) {
        return """
                {"marketplaceChatId":"00000000-0000-0000-0000-000000000001",
                 "otherPartyUserId":"00000000-0000-0000-0000-000000000002",
                 "sellerId":"00000000-0000-0000-0000-000000000003",
                 "buyerId":"00000000-0000-0000-0000-000000000002",
                 "kind":%s,"amountUzs":%s}
                """.formatted(kind == null ? "null" : '"' + kind + '"', amount);
    }

    @ParameterizedTest
    @CsvSource({"SALE,0", "SALE,4999", "SWAP_SURCHARGE,4999", ",4999", "SWAP_SURCHARGE,0", ",0", "SALE,-1", "SWAP,-1", "SWAP,1",
            "SWAP_SURCHARGE,-1", "SALE,9007199254740992", "SWAP_SURCHARGE,9007199254740992",
            "SALE,null", "SWAP,null", "SWAP_SURCHARGE,null"})
    void rejectsInvalidAmounts(String kind, String amount) throws Exception {
        var request = mapper.readValue(payload(kind, amount), ProposalCreateRequest.class);
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertThat(factory.getValidator().validate(request)).isNotEmpty();
        }
    }

    @ParameterizedTest
    @CsvSource({"SALE,5000", "SALE,25000", "SALE,9007199254740991", "SWAP_SURCHARGE,5000",
            "SWAP_SURCHARGE,25000", "SWAP_SURCHARGE,9007199254740991", "SWAP,0", ",25000"})
    void acceptsWholeAmountsForTheSelectedKind(String kind, String amount) throws Exception {
        var request = mapper.readValue(payload(kind, amount), ProposalCreateRequest.class);
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertThat(factory.getValidator().validate(request)).isEmpty();
        }
        assertThat(request.amountUzs()).isEqualTo(Long.parseLong(amount));
    }

    @ParameterizedTest
    @ValueSource(strings = {"1.5", "1.0", "1e3", "1e309", "\"25000\"", "\"bad\"", "9223372036854775808"})
    void rejectsNonIntegerJsonRatherThanRoundingIt(String amount) {
        assertThatThrownBy(() -> mapper.readValue(payload("SALE", amount), ProposalCreateRequest.class))
                .isInstanceOf(JsonMappingException.class);
    }
}
