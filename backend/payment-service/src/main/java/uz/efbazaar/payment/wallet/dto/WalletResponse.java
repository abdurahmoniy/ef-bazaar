package uz.efbazaar.payment.wallet.dto;

import uz.efbazaar.payment.wallet.domain.WalletAccount;

public record WalletResponse(
        long availableTiyin,
        long heldTiyin,
        long withdrawPendingTiyin,
        long lifetimeDepositedTiyin,
        long lifetimeEarnedTiyin
) {
    public static WalletResponse of(WalletAccount w) {
        return new WalletResponse(
                w.getAvailableTiyin(),
                w.getHeldTiyin(),
                w.getWithdrawPendingTiyin(),
                w.getLifetimeDepositedTiyin(),
                w.getLifetimeEarnedTiyin());
    }
}
