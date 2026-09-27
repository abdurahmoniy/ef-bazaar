package uz.efbazaar.payment.wallet.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.wallet.service.TradeCommissionService;
import uz.efbazaar.payment.wallet.service.TradeEscrowService;

import java.util.UUID;
import uz.efbazaar.payment.wallet.domain.AdminFeePayer;

/**
 * Escrow, called by trade-service as the trade advances.
 *
 * <p>Auth is the shared secret enforced by {@code InternalSecretFilter}; no
 * user identity is involved, because the actor here is a service acting on a
 * trade's state machine, not a person.
 *
 * <p>Synchronous on purpose. A hold has to be able to fail the trade — a buyer
 * who cannot pay must not have a mailbox provisioned for them — and that is an
 * answer the caller needs before it advances. Retries are safe: every movement
 * is keyed by trade id.
 */
@RestController
@RequestMapping("/internal/trades/{tradeId}/escrow")
@RequiredArgsConstructor
public class InternalTradeEscrowController {

    private final TradeEscrowService escrow;
    private final TradeCommissionService commissionService;

    /**
     * {@code buyerId} is the accepter, {@code sellerId} the proposer.
     *
     * <p>{@code feeBaseTiyin} is what the commission is worked out from, which
     * is not always what changes hands: on a swap it is the listing price. It
     * and {@code sellerId} are optional so a caller that predates swaps keeps
     * working — a sale's fee base is its price, and its proposer is never
     * charged, so the old payload still describes it exactly.
     */
    public record HoldRequest(@NotNull UUID buyerId, UUID sellerId,
                              @NotNull @PositiveOrZero Long priceTiyin,
                              Long feeBaseTiyin, AdminFeePayer adminFeePayer, Long expectedFeeTiyin) {
        public HoldRequest(UUID buyerId, UUID sellerId, Long priceTiyin, Long feeBaseTiyin) {
            this(buyerId, sellerId, priceTiyin, feeBaseTiyin, null, null);
        }
    }

    /**
     * {@code partnerUserId} and {@code partnerPercentBp} are the advertising
     * partner the trade was attributed to, and the rate stamped on it when it
     * opened. Both are nullable: a trade that came through no channel, and a
     * replayed request written before advertising existed, send neither.
     */
    public record SettleRequest(@NotNull UUID buyerId, @NotNull UUID sellerId,
                                @NotNull @PositiveOrZero Long priceTiyin,
                                Long feeBaseTiyin,
                                UUID partnerUserId,
                                @PositiveOrZero @Max(10_000) Integer partnerPercentBp) {}

    public record ReleaseRequest(@NotNull UUID buyerId, UUID sellerId,
                                 @NotNull @PositiveOrZero Long priceTiyin,
                                 Long feeBaseTiyin) {}

    /** What the proposer will actually receive, so the caller can show it. */
    public record EscrowResult(long priceTiyin, long feeTiyin, long sellerProceedsTiyin,
                               long buyerHoldTiyin, long sellerHoldTiyin) {}

    private static long feeBase(Long declared, long priceTiyin) {
        return declared != null ? declared : priceTiyin;
    }

    @PostMapping("/hold")
    public EscrowResult hold(@PathVariable UUID tradeId, @Valid @RequestBody HoldRequest req) {
        long base = feeBase(req.feeBaseTiyin(), req.priceTiyin());
        escrow.hold(tradeId, req.buyerId(), req.sellerId(), req.priceTiyin(), base, req.adminFeePayer(), req.expectedFeeTiyin());
        return result(req.priceTiyin(), escrow.heldQuote(tradeId, req.priceTiyin(), base, req.adminFeePayer()));
    }

    @PostMapping("/settle")
    public EscrowResult settle(@PathVariable UUID tradeId, @Valid @RequestBody SettleRequest req) {
        long base = feeBase(req.feeBaseTiyin(), req.priceTiyin());
        escrow.settle(tradeId, req.buyerId(), req.sellerId(), req.priceTiyin(), base,
                req.partnerUserId(),
                req.partnerPercentBp() == null ? 0 : req.partnerPercentBp());
        // The quote is unchanged: the partner's share comes out of the
        // platform's half of the fee, so what the seller receives is the same.
        return result(req.priceTiyin(), escrow.heldQuote(tradeId, req.priceTiyin(), base, null));
    }

    @PostMapping("/release")
    public EscrowResult release(@PathVariable UUID tradeId, @Valid @RequestBody ReleaseRequest req) {
        long base = feeBase(req.feeBaseTiyin(), req.priceTiyin());
        escrow.release(tradeId, req.buyerId(), req.sellerId(), req.priceTiyin(), base);
        // No fee is taken on a release; report it as zero rather than quoting
        // one that was never charged.
        return new EscrowResult(req.priceTiyin(), 0, req.priceTiyin(), 0, 0);
    }

    @PostMapping("/quote")
    public EscrowResult quote(@PathVariable UUID tradeId, @Valid @RequestBody HoldRequest req) {
        return quote(req.priceTiyin(), feeBase(req.feeBaseTiyin(), req.priceTiyin()), req.adminFeePayer());
    }

    private EscrowResult quote(long price, long base, AdminFeePayer payer) {
        return result(price, escrow.quote(price, base, payer));
    }

    private EscrowResult result(long price, uz.efbazaar.payment.wallet.repository.TradeEscrowTermsRepository.Terms q) {
        return new EscrowResult(price, q.fee(), q.sellerProceeds(), q.buyerHold(), q.sellerHold());
    }
}
