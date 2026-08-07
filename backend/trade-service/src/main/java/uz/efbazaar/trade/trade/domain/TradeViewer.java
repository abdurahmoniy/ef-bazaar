package uz.efbazaar.trade.trade.domain;

/**
 * Who is looking at a trade. Wider than {@link ParticipantRole}: a human
 * trade also has an assigned admin, who reads and writes both party chats
 * but is not a party and never confirms the close.
 */
public enum TradeViewer {
    SELLER, BUYER, ADMIN;

    public boolean isParty() {
        return this != ADMIN;
    }

    /** The party chat this viewer owns, or {@code null} for the admin. */
    public ParticipantRole asParticipantRole() {
        return switch (this) {
            case SELLER -> ParticipantRole.SELLER;
            case BUYER  -> ParticipantRole.BUYER;
            case ADMIN  -> null;
        };
    }
}
