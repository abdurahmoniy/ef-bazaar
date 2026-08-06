package uz.efbazaar.trade.admin.dto;

import uz.efbazaar.trade.trade.domain.TradeState;

/**
 * After a party confirms: who has confirmed so far, and where the trade ended
 * up. {@code state} is still WAITING_CLOSE_CONFIRM until both are in.
 */
public record CloseConfirmResponse(
        boolean sellerConfirmed,
        boolean buyerConfirmed,
        TradeState state
) {}
