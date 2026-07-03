package uz.efbazaar.marketplace.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class MarketplaceException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public MarketplaceException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static MarketplaceException listingNotFound() {
        return new MarketplaceException(HttpStatus.NOT_FOUND, "listing_not_found",
                "E'lon topilmadi");
    }

    public static MarketplaceException notOwner() {
        return new MarketplaceException(HttpStatus.FORBIDDEN, "not_owner",
                "Bu amalni faqat e'lon egasi bajara oladi");
    }

    public static MarketplaceException listingNotActive() {
        return new MarketplaceException(HttpStatus.CONFLICT, "listing_not_active",
                "E'lon aktiv emas (sotilgan yoki o'chirilgan)");
    }

    public static MarketplaceException chatNotFound() {
        return new MarketplaceException(HttpStatus.NOT_FOUND, "chat_not_found",
                "Chat topilmadi");
    }

    public static MarketplaceException notChatParticipant() {
        return new MarketplaceException(HttpStatus.FORBIDDEN, "not_chat_participant",
                "Siz bu chatda ishtirok etmaysiz");
    }

    public static MarketplaceException chatAlreadyClosed() {
        return new MarketplaceException(HttpStatus.CONFLICT, "chat_closed", "Chat yopilgan");
    }

    public static MarketplaceException activeChatAlreadyExists() {
        return new MarketplaceException(HttpStatus.CONFLICT, "active_chat_exists",
                "Sizda bu e'lon uchun allaqachon aktiv chat mavjud");
    }

    public static MarketplaceException cannotChatWithSelf() {
        return new MarketplaceException(HttpStatus.BAD_REQUEST, "cannot_chat_with_self",
                "O'zingizning e'loningiz uchun chat ocha olmaysiz");
    }

    public static MarketplaceException attributeNotFound() {
        return new MarketplaceException(HttpStatus.NOT_FOUND, "attribute_not_found",
                "Attribute topilmadi");
    }

    public static MarketplaceException attributeKeyExists(String key) {
        return new MarketplaceException(HttpStatus.CONFLICT, "attribute_key_exists",
                "Ushbu key allaqachon mavjud: " + key);
    }

    public static MarketplaceException unknownAttribute(String key) {
        return new MarketplaceException(HttpStatus.BAD_REQUEST, "unknown_attribute",
                "Noma'lum attribute: " + key);
    }

    public static MarketplaceException missingRequiredAttribute(String key) {
        return new MarketplaceException(HttpStatus.BAD_REQUEST, "missing_required_attribute",
                "Kerakli attribute yo'q: " + key);
    }

    public static MarketplaceException invalidAttributeValue(String key, String reason) {
        return new MarketplaceException(HttpStatus.BAD_REQUEST, "invalid_attribute_value",
                "Attribute qiymati noto'g'ri (" + key + "): " + reason);
    }

    public static MarketplaceException cannotReportOwnListing() {
        return new MarketplaceException(HttpStatus.BAD_REQUEST, "cannot_report_own_listing",
                "O'zingizning e'loningizni shikoyat qila olmaysiz");
    }
}
