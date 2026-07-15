package uz.efbazaar.trade.trade.dto;

import uz.efbazaar.trade.trade.domain.TradeMessageType;
import uz.efbazaar.trade.trade.domain.TradeSenderType;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record TradeMessageResponse(
        UUID id,
        TradeSenderType senderType,
        TradeMessageType messageType,
        String text,             // populated for TEXT / null otherwise
        Map<String, Object> metadata,
        Instant createdAt) {}
