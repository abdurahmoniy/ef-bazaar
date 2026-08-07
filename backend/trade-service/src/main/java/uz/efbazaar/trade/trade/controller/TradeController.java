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

    /**
     * Viewer-scoped on purpose: the assigned human admin has to be able to
     * fetch the one trade their whole workspace is about, not only find it in
     * the {@code /trade-admins/me/trades} list. {@code role} stays a
     * party-only concept — the admin is neither side, so they get {@code null},
     * exactly as the other admin-facing responses in
     * {@code TradeAdminWorkController} do.
     */
    @GetMapping("/{id}")
    public TradeResponse get(@AuthenticationPrincipal AuthenticatedUser me,
                             @PathVariable UUID id) {
        Trade t = trades.getForViewer(id, me.userId());
        return trades.toResponse(t,
                t.isParticipant(me.userId()) ? t.roleFor(me.userId()) : null);
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
