package uz.efbazaar.marketplace.channel;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** Rasmiy kanalga obuna bo'lish (JOIN) yoki chiqib ketish (LEAVE). */
@Entity
@Table(name = "channel_member_events")
@Getter
@NoArgsConstructor
public class ChannelMemberEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "telegram_id", nullable = false, updatable = false)
    private Long telegramId;

    @Column(nullable = false, updatable = false)
    private String kind;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public ChannelMemberEvent(long telegramId, String kind, Instant occurredAt) {
        this.telegramId = telegramId;
        this.kind = kind;
        this.occurredAt = occurredAt;
    }
}
