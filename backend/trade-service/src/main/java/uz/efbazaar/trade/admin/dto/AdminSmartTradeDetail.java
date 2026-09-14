package uz.efbazaar.trade.admin.dto;

import java.util.List;

/**
 * A SMART trade opened in the admin's split view: where it stands, and each
 * party's escrow mailbox so the admin can read Konami's mail beside it.
 *
 * @param sides always SELLER then BUYER; on a sale the buyer has no mailbox
 */
public record AdminSmartTradeDetail(AdminSmartTradeRow trade, List<AdminSmartTradeSide> sides) {}
