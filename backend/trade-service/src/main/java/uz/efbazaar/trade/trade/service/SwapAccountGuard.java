package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.marketplace.AccountSummaryClient;
import uz.efbazaar.trade.trade.domain.GiveAccountSnapshot;
import uz.efbazaar.trade.trade.domain.TradeKind;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.UUID;

/**
 * Obmenda xaridor beradigan akkount haqiqatan uniki va bo'shmi.
 *
 * <p>Taklifda ham, qabulda ham chaqiriladi: taklif 10 daqiqa yashaydi va
 * shu orada akkount boshqa savdoga kirib qolishi yoki o'chirilishi mumkin.
 */
@Component
@RequiredArgsConstructor
public class SwapAccountGuard {

    private final AccountSummaryClient accounts;
    private final TradeRepository trades;

    /** @return snapshot, yoki {@code accountId == null} ("Boshqa") bo'lsa null */
    public GiveAccountSnapshot check(UUID accountId, UUID buyerId, TradeKind kind) {
        if (accountId == null) return null;
        if (!kind.isSwap()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Akkount faqat obmenda tanlanadi");
        }
        var a = accounts.fetch(accountId);
        if (!buyerId.equals(a.ownerId()) || !"ACTIVE".equals(a.status())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu akkount sizga tegishli emas yoki faol emas");
        }
        var live = TradeState.nonTerminal();
        if (trades.existsLiveWithGiveAccount(accountId, live)
                || (a.currentListingId() != null && trades.existsLiveWithListing(a.currentListingId(), live))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bu akkount boshqa savdoda");
        }
        return new GiveAccountSnapshot(a.id(), a.title(), a.coverMessageId(),
                a.summary() == null ? "" : a.summary(), a.teamStrength());
    }
}
