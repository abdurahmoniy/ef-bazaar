package uz.efbazaar.auth.service;

/**
 * Minimal Telegram identity projection shared by Login Widget and Mini App flows.
 * Both surfaces (HMAC-validated browser widget, signed {@code initData} from
 * {@code window.Telegram.WebApp}) ultimately produce the same user info, so the
 * register-or-login pipeline accepts this single shape.
 */
public record TelegramProfile(
        Long id,
        String firstName,
        String lastName,
        String username,
        String photoUrl
) {}
