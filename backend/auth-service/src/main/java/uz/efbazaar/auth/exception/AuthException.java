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

    public static AuthException usernameTaken() {
        return new AuthException(HttpStatus.CONFLICT, "username_taken",
                "Bunday username allaqachon mavjud");
    }

    public static AuthException emailTaken() {
        return new AuthException(HttpStatus.CONFLICT, "email_taken",
                "Bu email allaqachon ro'yxatdan o'tgan");
    }

    public static AuthException telegramAlreadyLinked() {
        return new AuthException(HttpStatus.CONFLICT, "telegram_already_linked",
                "Ushbu Telegram akkaunt boshqa foydalanuvchiga bog'langan");
    }

    public static AuthException invalidCredentials() {
        return new AuthException(HttpStatus.UNAUTHORIZED, "invalid_credentials",
                "Login yoki parol noto'g'ri");
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
}
