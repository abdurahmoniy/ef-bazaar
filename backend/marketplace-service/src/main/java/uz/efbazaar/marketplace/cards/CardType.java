package uz.efbazaar.marketplace.cards;

public enum CardType {
    BIGTIME("bigtime", "89", 7),
    EPIC("epic", "88", 5),
    SHOWTIME("showtime", "1067", 8);

    private final String tableName;
    private final String efhubIdPrefix;
    private final int efhubPlayerType;

    CardType(String tableName, String efhubIdPrefix, int efhubPlayerType) {
        this.tableName = tableName;
        this.efhubIdPrefix = efhubIdPrefix;
        this.efhubPlayerType = efhubPlayerType;
    }

    public String tableName() {
        return tableName;
    }

    public String efhubIdPrefix() {
        return efhubIdPrefix;
    }

    public int efhubPlayerType() {
        return efhubPlayerType;
    }

    public static CardType fromEfhubId(long id) {
        String s = Long.toString(id);
        for (CardType t : values()) {
            if (s.startsWith(t.efhubIdPrefix)) {
                return t;
            }
        }
        return null;
    }

    public static CardType fromPlayerType(int playerType) {
        for (CardType t : values()) {
            if (t.efhubPlayerType == playerType) {
                return t;
            }
        }
        return null;
    }
}
