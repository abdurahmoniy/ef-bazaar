package uz.efbazaar.marketplace.campaign;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Admin yaratgan manba havolasi: guruhdagi post, ijtimoiy tarmoq, tanishlar. */
@Entity
@Table(name = "acquisition_campaigns")
@Getter
@Setter
@NoArgsConstructor
public class Campaign {

    public enum Kind { TELEGRAM_GROUP, SOCIAL, FRIENDS, OFFLINE, OTHER }

    @Id
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String kind;

    @Column(name = "created_by", columnDefinition = "uuid", updatable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "archived_at")
    private Instant archivedAt;

    public Campaign(String code, String name, Kind kind, UUID createdBy) {
        this.id = UUID.randomUUID();
        this.code = code;
        this.name = name;
        this.kind = kind.name();
        this.createdBy = createdBy;
    }

    public boolean isActive() {
        return archivedAt == null;
    }
}
