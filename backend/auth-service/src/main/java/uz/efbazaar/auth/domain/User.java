package uz.efbazaar.auth.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    // ----- Telegram (optional — one of {telegram_id, google_id} must be set) -----

    @Column(name = "telegram_id", unique = true)
    private Long telegramId;

    @Column(name = "telegram_username", length = 64)
    private String telegramUsername;

    @Column(name = "telegram_first_name", length = 128)
    private String telegramFirstName;

    @Column(name = "telegram_last_name", length = 128)
    private String telegramLastName;

    @Column(name = "telegram_photo_url", length = 512)
    private String telegramPhotoUrl;

    /**
     * Telegram Bot API file_id for the user's profile photo. Populated by the bot
     * after register when the Mini App initData did not include {@code photo_url}.
     * The /me/photo proxy endpoint resolves this to a file_path via getFile and
     * streams the bytes (since the download URL contains the bot token).
     */
    @Column(name = "telegram_photo_file_id", length = 256)
    private String telegramPhotoFileId;

    /**
     * Telegram's {@code file_unique_id} — stable across reuploads for the same
     * source photo. Used at login time to decide whether the user's current
     * profile photo has changed; if unchanged we skip the re-upload entirely.
     */
    @Column(name = "telegram_photo_file_unique_id", length = 64)
    private String telegramPhotoFileUniqueId;

    /** Audit pointer — the message_id of the photo in the media topic. */
    @Column(name = "telegram_photo_message_id")
    private Long telegramPhotoMessageId;

    // ----- Google (optional — one of {telegram_id, google_id} must be set) -----

    @Column(name = "google_id", length = 255)
    private String googleId;

    /** For Google-first users this is populated on first login. */
    @Column(name = "google_given_name", length = 128)
    private String googleGivenName;

    @Column(length = 255)
    private String email;

    // ----- Role + timestamps -----

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private Role role = Role.USER;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
        if (role == null) role = Role.USER;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public String displayName() {
        StringBuilder sb = new StringBuilder();
        if (telegramFirstName != null) sb.append(telegramFirstName);
        if (telegramLastName != null) {
            if (!sb.isEmpty()) sb.append(' ');
            sb.append(telegramLastName);
        }
        if (sb.isEmpty() && telegramUsername != null) sb.append('@').append(telegramUsername);
        if (sb.isEmpty() && googleGivenName != null) sb.append(googleGivenName);
        if (sb.isEmpty() && email != null) sb.append(email);
        if (sb.isEmpty()) sb.append("user-").append(id != null ? id.toString().substring(0, 8) : "?");
        return sb.toString();
    }

    /**
     * Verified iff both identities are attached. Computed, not stored — keeps a
     * single source of truth so a subsequent identity unlink can never leave
     * the flag out of sync with the linked accounts.
     */
    public boolean verified() {
        return telegramId != null && googleId != null;
    }
}
