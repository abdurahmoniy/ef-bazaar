package uz.efbazaar.recommendation.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class RecommendationException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public RecommendationException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    /** marketplace'dagi bilan bir xil kod va matn — frontend xabarlari o'zgarmasin. */
    public static RecommendationException invalidAttributeValue(String key, String reason) {
        return new RecommendationException(HttpStatus.BAD_REQUEST, "invalid_attribute_value",
                "Attribute qiymati noto'g'ri (" + key + "): " + reason);
    }

    public static RecommendationException listingNotFound() {
        return new RecommendationException(HttpStatus.NOT_FOUND, "listing_not_found", "E'lon topilmadi");
    }

    public static RecommendationException badRequest(String code, String message) {
        return new RecommendationException(HttpStatus.BAD_REQUEST, code, message);
    }
}
