package uz.efbazaar.bot.partner;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** Chiqib bo'lgan post matnini almashtirish — sotilgan e'lon uchun. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record PostEditRequest(String chatId, String telegramMessageId, String html) {}
