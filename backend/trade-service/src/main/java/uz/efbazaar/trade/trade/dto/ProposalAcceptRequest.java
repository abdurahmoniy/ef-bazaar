package uz.efbazaar.trade.trade.dto;

import java.util.UUID;

/**
 * Accepting a proposal takes no input.
 *
 * <p>{@code cardId} was mandatory while the buyer's money was going to be
 * charged to a bank card. It is not: the money comes out of their wallet and is
 * frozen the moment they accept, so asking which card to debit is a question
 * with nothing behind it — the same reasoning that dropped
 * {@code chk_trades_smart_cards} in trade-service V18.
 *
 * <p>The field is kept, and still stored, so older clients that send one keep
 * working and existing trades stay comparable. It is optional, and nothing
 * reads it back.
 *
 * <p>{@code giveAccountId} — sotuvchi ochgan obmenni qabul qilayotgan
 * xaridorning akkounti; null — "Boshqa".
 */
public record ProposalAcceptRequest(UUID cardId, UUID giveAccountId) {
    public ProposalAcceptRequest(UUID cardId) {
        this(cardId, null);
    }
}
