package uz.efbazaar.trade.trade.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.dto.TradePage;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/trades")
@RequiredArgsConstructor
public class TradeController {

    private static final int MAX_LIMIT = 50;

    private final TradeService trades;

    @GetMapping("/{id}")
    public TradeResponse get(@AuthenticationPrincipal AuthenticatedUser me,
                             @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        return trades.toResponse(t, t.roleFor(me.userId()));
    }

    /**
     * Trades in a marketplace chat where the caller is a participant.
     * Used by the chat UI to render the trade panel without having to
     * remember the trade id.
     */
    @GetMapping(params = "chatId")
    public List<TradeResponse> listByChat(@AuthenticationPrincipal AuthenticatedUser me,
                                          @RequestParam("chatId") UUID chatId) {
        return trades.listByChat(chatId, me.userId());
    }

    /**
     * Every trade the caller is a party to, newest first. Backs the profile's
     * "Savdolarim" tab; declared without {@code params} so it only matches
     * when {@code chatId} is absent.
     */
    @GetMapping
    public TradePage listMine(@AuthenticationPrincipal AuthenticatedUser me,
                              @RequestParam(defaultValue = "20") int limit,
                              @RequestParam(defaultValue = "0") int offset) {
        int safeLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
        int safeOffset = Math.max(offset, 0);
        return trades.listMine(me.userId(), safeLimit, safeOffset);
    }
}
