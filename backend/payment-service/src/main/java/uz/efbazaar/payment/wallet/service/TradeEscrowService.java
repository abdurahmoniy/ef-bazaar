package uz.efbazaar.payment.wallet.service;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.wallet.domain.AdminFeePayer;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.repository.TradeEscrowTermsRepository;
import uz.efbazaar.payment.wallet.repository.TradeEscrowTermsRepository.Terms;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Each movement is atomic and idempotent. Amounts are frozen with the initial hold. */
@Service
@RequiredArgsConstructor
public class TradeEscrowService {
    private final LedgerService ledger;
    private final TradeCommissionService commissionService;
    private final TradeEscrowTermsRepository terms;

    public Terms quote(long price, long base, AdminFeePayer payer) {
        if (price < 0 || base <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Savdo summasi noto'g'ri");
        long fee = commissionService.feeTiyin(base);
        long sellerFee = (payer == null ? AdminFeePayer.SELLER : payer).sellerShare(fee);
        return new Terms(fee, Math.addExact(price, fee - sellerFee),
                Math.max(0, sellerFee - price), price - sellerFee, null);
    }

    @Transactional
    public Terms heldQuote(UUID id, long price, long base, AdminFeePayer payer) {
        return terms.findForUpdate(id).orElseGet(() -> quote(price, base, payer));
    }

    @Transactional
    public void hold(UUID id, UUID buyer, UUID seller, long price, long base) {
        hold(id, buyer, seller, price, base, AdminFeePayer.SELLER, null);
    }

    @Transactional
    public void hold(UUID id, UUID buyer, UUID seller, long price, long base, AdminFeePayer payer, Long expectedFee) {
        if (ledger.hasPosted(key("hold", id))) {
            if (terms.findForUpdate(id).isEmpty()) terms.restoreLegacy(id, buyer, seller, price);
            return;
        }
        if (base < commissionService.minimumViablePriceTiyin()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Savdo summasi juda kichik");
        }
        Terms amounts = quote(price, base, payer);
        if (expectedFee != null && amounts.fee() != expectedFee) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Admin haqi o'zgardi — yangi taklif yuboring");
        }
        terms.insert(id, amounts);
        amounts = terms.findForUpdate(id).orElseThrow();
        if (ledger.hasPosted(key("hold", id))) return;
        requireFunds(buyer, amounts.buyerHold(), "Xaridorning hamyonida");
        requireFunds(seller, amounts.sellerHold(), "Sotuvchining hamyonida");
        var postings = new ArrayList<Posting>();
        holdPostings(postings, buyer, amounts.buyerHold());
        holdPostings(postings, seller, amounts.sellerHold());
        ledger.post(TransactionKind.TRADE_HOLD, key("hold", id), null,
                "trade " + id + " fee " + amounts.fee(), postings);
    }

    private void requireFunds(UUID user, long amount, String whose) {
        if (amount <= 0) return;
        if (user == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "To'lovchi ko'rsatilishi shart");
        long available = ledger.balanceOf(user).getAvailableTiyin();
        if (available < amount) throw new ResponseStatusException(HttpStatus.CONFLICT,
                whose + " mablag' yetarli emas — " + ((amount - available + 99) / 100) + " so'm yetishmayapti");
    }

    private void holdPostings(List<Posting> postings, UUID user, long amount) {
        if (amount == 0) return;
        postings.add(new Posting(LedgerAccount.USER_AVAILABLE, user, amount));
        postings.add(new Posting(LedgerAccount.USER_HELD, user, -amount));
    }

    @Transactional
    public void settle(UUID id, UUID buyer, UUID seller, long price, long base) {
        settle(id, buyer, seller, price, base, null, 0);
    }

    @Transactional
    public void settle(UUID id, UUID buyer, UUID seller, long price, long base, UUID partner, int partnerBp) {
        if (!ledger.hasPosted(key("hold", id))) return;
        Terms amounts = terms.findForUpdate(id).orElseGet(() -> terms.restoreLegacy(id, buyer, seller, price));
        if (resolved(amounts, "settle")) return;
        var postings = new ArrayList<Posting>();
        if (amounts.buyerHold() > 0) postings.add(new Posting(LedgerAccount.USER_HELD, buyer, amounts.buyerHold()));
        if (amounts.sellerHold() > 0) postings.add(new Posting(LedgerAccount.USER_HELD, seller, amounts.sellerHold()));
        if (amounts.sellerProceeds() > 0) postings.add(new Posting(LedgerAccount.USER_AVAILABLE, seller, -amounts.sellerProceeds()));
        postings.add(new Posting(LedgerAccount.PLATFORM_REVENUE, null, -amounts.fee()));
        ledger.post(TransactionKind.TRADE_SETTLE, key("settle", id), null, "trade " + id, postings);
        long share = partner == null || partnerBp <= 0 ? 0 : amounts.fee() * partnerBp / 10_000L;
        if (share > 0) ledger.post(TransactionKind.PARTNER_TRADE_SHARE, key("partner-share", id), null,
                "trade " + id + " partner share " + share, List.of(
                        new Posting(LedgerAccount.PLATFORM_REVENUE, null, share),
                        new Posting(LedgerAccount.USER_AVAILABLE, partner, -share)));
        terms.resolve(id, "settle");
    }

    @Transactional
    public void release(UUID id, UUID buyer, UUID seller, long price, long base) {
        if (!ledger.hasPosted(key("hold", id))) return;
        Terms amounts = terms.findForUpdate(id).orElseGet(() -> terms.restoreLegacy(id, buyer, seller, price));
        if (resolved(amounts, "release")) return;
        var postings = new ArrayList<Posting>();
        refundPostings(postings, buyer, amounts.buyerHold());
        refundPostings(postings, seller, amounts.sellerHold());
        ledger.post(TransactionKind.TRADE_RELEASE, key("release", id), null, "trade " + id, postings);
        terms.resolve(id, "release");
    }

    private boolean resolved(Terms t, String action) {
        if (t.resolution() == null) return false;
        if (!t.resolution().equals(action)) throw new ResponseStatusException(HttpStatus.CONFLICT, "Savdo to'lovi allaqachon yakunlangan");
        return true;
    }

    private void refundPostings(List<Posting> postings, UUID user, long amount) {
        if (amount == 0) return;
        postings.add(new Posting(LedgerAccount.USER_HELD, user, amount));
        postings.add(new Posting(LedgerAccount.USER_AVAILABLE, user, -amount));
    }

    private static String key(String action, UUID id) { return "trade-" + action + "-" + id; }
}
