package uz.efbazaar.access.requirement;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/** Admin ko'radigan xato: {@code code} frontend uchun, {@code message} odam uchun. */
@Getter
public class AccessRequirementException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public AccessRequirementException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static AccessRequirementException invalidUsername() {
        return new AccessRequirementException(HttpStatus.BAD_REQUEST, "INVALID_USERNAME",
                "Kanal username'i noto'g'ri. Masalan: @efbazaar yoki https://t.me/efbazaar");
    }

    public static AccessRequirementException channelNotFound() {
        return new AccessRequirementException(HttpStatus.NOT_FOUND, "CHANNEL_NOT_FOUND",
                "Bunday kanal topilmadi. Username to'g'riligini va kanal ochiq (public) ekanini tekshiring");
    }

    public static AccessRequirementException notAChannel() {
        return new AccessRequirementException(HttpStatus.UNPROCESSABLE_ENTITY, "NOT_A_CHANNEL",
                "Bu username kanalga emas, guruh yoki foydalanuvchiga tegishli");
    }

    public static AccessRequirementException botNotChannelAdmin() {
        return new AccessRequirementException(HttpStatus.UNPROCESSABLE_ENTITY, "BOT_NOT_CHANNEL_ADMIN",
                "Bot kanalga admin qilinmagan. Avval botni kanalga admin qilib qo'shing, keyin qayta urinib ko'ring");
    }

    public static AccessRequirementException alreadyAdded() {
        return new AccessRequirementException(HttpStatus.CONFLICT, "ALREADY_ADDED",
                "Bu kanal allaqachon ulangan");
    }

    public static AccessRequirementException botUnavailable() {
        return new AccessRequirementException(HttpStatus.SERVICE_UNAVAILABLE, "BOT_UNAVAILABLE",
                "Bot bilan bog'lanib bo'lmadi. Birozdan keyin qayta urinib ko'ring");
    }

    public static AccessRequirementException notFound() {
        return new AccessRequirementException(HttpStatus.NOT_FOUND, "NOT_FOUND",
                "Shart topilmadi");
    }
}
