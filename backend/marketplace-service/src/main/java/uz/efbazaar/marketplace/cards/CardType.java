package uz.efbazaar.marketplace.cards;

public enum CardType {
    BIGTIME("bigtime"),
    EPIC("epic"),
    SHOWTIME("showtime");

    private final String tableName;

    CardType(String tableName) {
        this.tableName = tableName;
    }

    public String tableName() {
        return tableName;
    }
}
