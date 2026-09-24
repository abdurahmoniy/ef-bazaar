package uz.efbazaar.trade.trade.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.Map;
import java.util.UUID;

/**
 * Boshqa servislar so'raydigan savdo holati.
 *
 * <p>Hozircha bitta savol bor: shu marketplace chatida tugallanmagan savdo
 * bormi. Marketplace chat tarixini tozalashdan oldin shuni so'raydi —
 * savdo davom etayotganda tarixni tozalash odamni savdoning o'rtasida
 * kontekstsiz qoldirardi.
 *
 * <p>Savdo holati trade-service'niki va shunday qolishi kerak: marketplace
 * uni o'zida takrorlasa, ikkala nusxa albatta bir kun ajralib ketadi.
 */
@RestController
@RequestMapping("/internal/trades")
@RequiredArgsConstructor
public class InternalTradeController {

    private final TradeService trades;

    @GetMapping("/live")
    public Map<String, Boolean> live(@RequestParam UUID chatId) {
        return Map.of("live", trades.hasLiveTradeInChat(chatId));
    }
}
