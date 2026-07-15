package uz.efbazaar.trade.trade.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/trades")
@RequiredArgsConstructor
public class TradeController {

    private final TradeService trades;

    @GetMapping("/{id}")
    public TradeResponse get(@AuthenticationPrincipal AuthenticatedUser me,
                             @PathVariable UUID id) {
        Trade t = trades.get(id, me.userId());
        return trades.toResponse(t, t.roleFor(me.userId()));
    }
}
