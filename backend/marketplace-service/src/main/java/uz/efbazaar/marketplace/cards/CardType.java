package uz.efbazaar.marketplace.cards;

public enum CardType {
    BIGTIME("bigtime", "89", 7),
    EPIC("epic", "88", 5),
    SHOWTIME("showtime", "1067", 8);

    // Real card IDs are 14-15 digits; short IDs (e.g. 8959, 106725) share a
    // prefix by coincidence and are ordinary players, not our card types.
    // Matches infra/scrapers/efhub/scrape.py:MIN_ID_LEN.
    private static final int MIN_ID_LEN = 10;

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
        if (s.length() < MIN_ID_LEN) {
            return null;
        }
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
