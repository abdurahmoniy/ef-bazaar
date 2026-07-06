package uz.efbazaar.marketplace.domain;

/**
 * Controls form widget rendering on the frontend and value coercion +
 * validation on the backend. Extend cautiously — every new type needs
 * matching client-side rendering and server-side validation logic.
 */
public enum AttributeType {
    INT,
    DECIMAL,
    BOOLEAN,
    STRING,
    TEXT,
    LIST_STRING,
    ENUM,
    /**
     * Array of full player card entities — used by valuable_players. Each item
     * must be an object with {@code efhub_id} (long) and {@code name} (string);
     * other fields (type, overall_rating, playing_style, position, image_url,
     * skills, …) are stored as-is so the frontend can render rich card badges
     * and future filters can query any card attribute without a schema change.
     */
    CARD_LIST
}
