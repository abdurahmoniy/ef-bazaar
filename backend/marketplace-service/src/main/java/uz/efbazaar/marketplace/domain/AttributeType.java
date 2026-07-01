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
    ENUM
}
