package uz.efbazaar.payment.wallet.domain;

/**
 * The six accounts. Names are written into {@code ledger_entries.account} as
 * plain text, so a rename here is a data migration, not a refactor.
 */
public enum LedgerAccount {
    /** Asset — real UZS sitting on the platform's Humo cards. */
    PLATFORM_CARDS,
    /** Liability — owed to a user, spendable. */
    USER_AVAILABLE,
    /** Liability — owed to a user, frozen by an active trade. */
    USER_HELD,
    /** Liability — owed to a user, payout in progress. */
    WITHDRAW_PENDING,
    /** Equity — commission and disambiguation bumps. */
    PLATFORM_REVENUE,
    /** Expense — bank transfer fees the platform absorbs. */
    PLATFORM_FEES;

    /** True when entries on this account belong to a specific user. */
    public boolean isUserScoped() {
        return this == USER_AVAILABLE || this == USER_HELD || this == WITHDRAW_PENDING;
    }
}
