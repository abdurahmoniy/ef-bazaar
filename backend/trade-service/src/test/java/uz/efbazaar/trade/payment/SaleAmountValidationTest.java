package uz.efbazaar.trade.payment;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class SaleAmountValidationTest {
    private final RestClient.Builder builder = RestClient.builder().baseUrl("http://payment");
    private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    private final EscrowClient client = new EscrowClient(RestClient.builder(), "http://payment", "");

    SaleAmountValidationTest() {
        ReflectionTestUtils.setField(client, "http", builder.build());
    }

    @ParameterizedTest
    @CsvSource({"5000,5000,10000,10,false", "5001,5000,10000,10,true",
            "4999,1000,10000,10,false", "5000,1000,10000,10,true",
            "15000,15000,10000,10,false", "15001,15000,10000,10,true",
            "100000,5000,110000,10,false", "110001,5000,110000,10,true",
            "25000,5000,10000,100,false", "25000,5000,10000,99.99,false"})
    void checksTheSelectedCommissionBand(long amount, long lowMin, long highMin, double rate, boolean valid) {
        if (amount >= 5000) server.expect(requestTo("http://payment/api/v1/payments/commission"))
                .andRespond(withSuccess("""
                        {"bandSom":100000,"lowRatePercent":%s,"highRatePercent":7.5,
                         "lowMinSom":%s,"highMinSom":%s}
                        """.formatted(rate, lowMin, highMin), MediaType.APPLICATION_JSON));
        if (valid) assertThatCode(() -> client.validateSaleAmount(amount)).doesNotThrowAnyException();
        else assertThatThrownBy(() -> client.validateSaleAmount(amount))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        server.verify();
    }

    @Test
    void doesNotGuessTheFeeWhenPaymentIsUnavailable() {
        server.expect(requestTo("http://payment/api/v1/payments/commission")).andRespond(withServerError());
        assertThatThrownBy(() -> client.validateSaleAmount(25000))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY));
        server.verify();
    }

    @Test
    void doesNotTreatMissingCommissionFieldsAsZeroFees() {
        server.expect(requestTo("http://payment/api/v1/payments/commission"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.validateSaleAmount(25000))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY));
    }
}
