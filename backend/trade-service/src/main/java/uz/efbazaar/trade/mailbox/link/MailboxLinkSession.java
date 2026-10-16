package uz.efbazaar.trade.mailbox.link;

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

/** One attempt to prove a Konami account is attached to a mailbox. */
@Entity
@Table(name = "mailbox_link_sessions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailboxLinkSession {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(name = "mailbox_id", nullable = false)
    private UUID mailboxId;

    /** Marketplace account being linked. */
    @Column(name = "account_id", nullable = false)
    private UUID accountId;

    @Enumerated(EnumType.STRING)
    @Column(name = "state", nullable = false, length = 24)
    private LinkSessionState state;

    @Column(name = "step_deadline", nullable = false)
    private Instant stepDeadline;

    /** Konami's code for the email change, relayed from the box. */
    @Column(name = "email_change_code", length = 16)
    private String emailChangeCode;

    @Column(name = "code_received_at")
    private Instant codeReceivedAt;

    /** Konami said the box is not on any Konami ID — the email change has not happened yet. */
    @Column(name = "not_registered", nullable = false)
    private boolean notRegistered;

    @Enumerated(EnumType.STRING)
    @Column(name = "expired_from", length = 24)
    private LinkSessionState expiredFrom;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
