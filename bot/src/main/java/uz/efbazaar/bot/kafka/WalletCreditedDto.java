package uz.efbazaar.bot.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * auth-service boyitgan "hamyon to'ldirildi" hodisasi.
 *
 * <p>Manzil shu yerda keladi — bot foydalanuvchini o'zi yecha olmaydi va
 * yechmasligi ham kerak: Telegram id lari auth-service'ga tegishli.
 *
 * @param balanceAfterTiyin null bo'lishi mumkin — o'qib bo'lmagan, xabar
 *                          shunchaki o'sha qatorsiz ketadi.
 */
public record WalletCreditedDto(
        UUID userId,
        Long recipientTelegramId,
        Long amountTiyin,
        Long balanceAfterTiyin,
        Instant occurredAt) {}
