package uz.efbazaar.marketplace.gamer;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Self-declared Gamer Card fields, owner-editable via /gamer-cards/me. */
@Entity
@Table(name = "gamer_profiles")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GamerProfile {

    public enum Platform { ANDROID, IOS, BOTH }

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(length = 280)
    private String bio;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private Platform platform;

    @Column(name = "highest_division")
    private Integer highestDivision;

    @Column(name = "favorite_team", length = 64)
    private String favoriteTeam;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
