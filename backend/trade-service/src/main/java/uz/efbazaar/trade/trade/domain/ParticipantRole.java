package uz.efbazaar.trade.trade.domain;

public enum ParticipantRole {
    SELLER, BUYER;

    public ParticipantRole other() {
        return this == SELLER ? BUYER : SELLER;
    }
}
