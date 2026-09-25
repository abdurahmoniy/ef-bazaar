package uz.efbazaar.auth.kafka;

import java.time.Instant;
import java.util.UUID;

public record TradeActionNotificationEvent(
        UUID tradeId,
        UUID chatId,
        UUID recipientUserId,
        Long recipientTelegramId,
        String recipientDisplayName,
        String actionType,
        long amountUzs,
        String details,
        /**
         * Savdo turi: SALE / SWAP / SWAP_SURCHARGE. Xabar matni shunga
         * qarab yoziladi — obmen obmen deb atalishi kerak, doplatalisi
         * ham. Summa buni ayta olmaydi: doplatali obmenda u noldan katta
         * va sotuvdan farq qilmaydi. Eski hodisalarda null.
         */
        String kind,
        Instant occurredAt) {}
