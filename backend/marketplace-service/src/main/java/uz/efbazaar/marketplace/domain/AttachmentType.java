package uz.efbazaar.marketplace.domain;

public enum AttachmentType {
    /** Rendered inline as an image bubble (served via /bot/photo). */
    IMAGE,
    /** Downloadable document card (served via /bot/file). */
    FILE,
    /** Playable audio bubble (served via /bot/file). */
    VOICE
}
