package uz.efbazaar.payment.wallet.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.wallet.service.TradeCommission;
import uz.efbazaar.payment.wallet.service.TradeEscrowService;

import java.util.UUID;

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

    public record HoldRequest(@NotNull UUID buyerId, @NotNull @Positive Long priceTiyin) {}

    public record SettleRequest(@NotNull UUID buyerId, @NotNull UUID sellerId,
                                @NotNull @Positive Long priceTiyin) {}

    public record ReleaseRequest(@NotNull UUID buyerId, @NotNull @Positive Long priceTiyin) {}

    /** What the seller will actually receive, so the caller can show it. */
    public record EscrowResult(long priceTiyin, long feeTiyin, long sellerProceedsTiyin) {}

    @PostMapping("/hold")
    public EscrowResult hold(@PathVariable UUID tradeId, @Valid @RequestBody HoldRequest req) {
        escrow.hold(tradeId, req.buyerId(), req.priceTiyin());
        return quote(req.priceTiyin());
    }

    @PostMapping("/settle")
    public EscrowResult settle(@PathVariable UUID tradeId, @Valid @RequestBody SettleRequest req) {
        escrow.settle(tradeId, req.buyerId(), req.sellerId(), req.priceTiyin());
        return quote(req.priceTiyin());
    }

    @PostMapping("/release")
    public EscrowResult release(@PathVariable UUID tradeId, @Valid @RequestBody ReleaseRequest req) {
        escrow.release(tradeId, req.buyerId(), req.priceTiyin());
        // No fee is taken on a release; report it as zero rather than quoting
        // one that was never charged.
        return new EscrowResult(req.priceTiyin(), 0, req.priceTiyin());
    }

    private static EscrowResult quote(long priceTiyin) {
        long fee = TradeCommission.feeTiyin(priceTiyin);
        return new EscrowResult(priceTiyin, fee, priceTiyin - fee);
    }
}
