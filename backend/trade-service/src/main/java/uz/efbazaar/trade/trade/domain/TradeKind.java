package uz.efbazaar.trade.trade.domain;

/**
 * What is being exchanged.
 *
 * <p>Decides two things: whose wallet is charged, and how many accounts move.
 * A SALE moves one account and the buyer's money; a SWAP moves two accounts and
 * no money; SWAP_SURCHARGE moves two accounts and the buyer's money on top.
 */
public enum TradeKind {
    /** Account for money. */
    SALE,
    /** Account for account. The proposer still pays the platform's fee. */
    SWAP,
    /** Account for account, with the accepter paying the difference. */
    SWAP_SURCHARGE;

    /** True when both parties hand over an account and get one back. */
    public boolean isSwap() {
        return this == SWAP || this == SWAP_SURCHARGE;
    }
}
