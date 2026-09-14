package uz.efbazaar.trade.admin.dto;

import uz.efbazaar.trade.trade.domain.TradeKind;
import uz.efbazaar.trade.trade.domain.TradeState;

import java.time.Instant;
import java.util.UUID;

/**
 * One live SMART trade in the admin's "Faol savdolar" queue.
 *
 * @param sellerName     {@code @telegram} handle, else display name, else null
 *                       when auth-service does not know the user any more
 * @param stateSince     when the trade last moved — how long it has been stuck
 * @param expectedAction what an admin could do by hand right now, if anything
 */
public record AdminSmartTradeRow(
        UUID id,
        TradeKind kind,
        TradeState state,
        UUID sellerId,
        UUID buyerId,
        String sellerName,
        String buyerName,
        Instant stateSince,
        Instant stateDeadline,
        AdminSmartTradeAction expectedAction,
        Instant createdAt) {}
