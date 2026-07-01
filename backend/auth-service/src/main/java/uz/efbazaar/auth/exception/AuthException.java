package uz.efbazaar.auth.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class AuthException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public AuthException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static AuthException telegramAlreadyLinked() {
        return new AuthException(HttpStatus.CONFLICT, "telegram_already_linked",
                "Ushbu Telegram akkaunt boshqa foydalanuvchiga bog'langan");
    }

    /** Current user is already Telegram-linked — re-linking a different Telegram is rejected. */
    public static AuthException telegramAlreadyOwned() {
        return new AuthException(HttpStatus.CONFLICT, "telegram_already_owned",
                "Sizning akkauntingiz allaqachon Telegram bilan bog'langan");
    }

    /** Current user is already Google-linked — re-linking a different Google is rejected. */
    public static AuthException googleAlreadyOwned() {
        return new AuthException(HttpStatus.CONFLICT, "google_already_owned",
                "Sizning akkauntingiz allaqachon Google bilan bog'langan");
    }

    public static AuthException invalidToken() {
        return new AuthException(HttpStatus.UNAUTHORIZED, "invalid_token",
                "Token noto'g'ri yoki muddati o'tgan");
    }

    public static AuthException invalidTelegramHash() {
        return new AuthException(HttpStatus.UNAUTHORIZED, "invalid_telegram_hash",
                "Telegram login ma'lumotlari noto'g'ri");
    }

    public static AuthException userNotFound() {
        return new AuthException(HttpStatus.NOT_FOUND, "user_not_found",
                "Foydalanuvchi topilmadi");
    }

    public static AuthException googleNotLinked() {
        return new AuthException(HttpStatus.NOT_FOUND, "GOOGLE_NOT_LINKED",
                "Bu Google akkaunt biror profilga ulanmagan. Telegram orqali kiring va profilda Google'ni bog'lang.");
    }

    public static AuthException googleAlreadyLinked() {
        return new AuthException(HttpStatus.CONFLICT, "google_already_linked",
                "Bu Google akkaunt boshqa foydalanuvchiga ulangan");
    }

    public static AuthException invalidGoogleToken() {
        return new AuthException(HttpStatus.UNAUTHORIZED, "invalid_google_token",
                "Google token noto'g'ri yoki muddati o'tgan");
    }

    public static AuthException googleEmailUnverified() {
        return new AuthException(HttpStatus.BAD_REQUEST, "google_email_unverified",
                "Google email tasdiqlanmagan");
    }

    public static AuthException googleNotConfigured() {
        return new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "google_not_configured",
                "Google OAuth hozircha sozlanmagan");
    }
}
