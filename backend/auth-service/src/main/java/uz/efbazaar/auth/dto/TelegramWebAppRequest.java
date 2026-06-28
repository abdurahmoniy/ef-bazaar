package uz.efbazaar.auth.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Telegram Mini App auto-login payload — the raw {@code window.Telegram.WebApp.initData}
 * query string. Backend parses + HMAC-validates it server-side; no other fields are trusted.
 */
public record TelegramWebAppRequest(@NotBlank String initData) {}
