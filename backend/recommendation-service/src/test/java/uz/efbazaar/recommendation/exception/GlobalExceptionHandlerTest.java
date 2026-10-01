package uz.efbazaar.recommendation.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MissingServletRequestParameterException;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void domainErrorKeepsMarketplaceShape() {
        var response = handler.onRecommendation(
                RecommendationException.invalidAttributeValue("matchCard", "yomon"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        Map<String, Object> body = response.getBody();
        assertThat(body).containsKeys("timestamp", "status", "code", "message");
        assertThat(body.get("status")).isEqualTo(400);
        assertThat(body.get("code")).isEqualTo("invalid_attribute_value");
        assertThat(body.get("message")).isEqualTo("Attribute qiymati noto'g'ri (matchCard): yomon");
    }

    @Test
    void missingParameterIsBadRequestNotServerError() {
        var response = handler.onMissingParameter(
                new MissingServletRequestParameterException("ids", "List"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("code")).isEqualTo("bad_request");
    }
}
