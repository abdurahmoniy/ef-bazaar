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

    // ----- Telegram (mandatory — primary identity) -----

    @Column(name = "telegram_id", nullable = false, unique = true)
    private Long telegramId;

    @Column(name = "telegram_username", length = 64)
    private String telegramUsername;

    @Column(name = "telegram_first_name", length = 128)
    private String telegramFirstName;

    @Column(name = "telegram_last_name", length = 128)
    private String telegramLastName;

    @Column(name = "telegram_photo_url", length = 512)
    private String telegramPhotoUrl;

    // ----- Google link (optional — sets verified flag + email) -----

    @Column(name = "google_id", length = 255)
    private String googleId;

    @Column(length = 255)
    private String email;

    @Column(nullable = false)
    @Builder.Default
    private boolean verified = false;

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
        if (sb.isEmpty()) sb.append("user-").append(telegramId);
        return sb.toString();
    }
}
