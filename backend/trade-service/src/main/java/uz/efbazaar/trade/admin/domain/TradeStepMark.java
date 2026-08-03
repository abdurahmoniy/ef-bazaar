package uz.efbazaar.trade.admin.domain;

import jakarta.persistence.*;
import lombok.*;
import uz.efbazaar.trade.trade.domain.TradeStep;

import java.time.Instant;
import java.util.UUID;

/** One checklist row. Six exist per human trade, created when the admin accepts. */
@Entity
@Table(name = "trade_steps")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TradeStepMark {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "trade_id", nullable = false, updatable = false)
    private UUID tradeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "step", nullable = false, length = 32, updatable = false)
    private TradeStep step;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "completed_by")
    private UUID completedBy;

    @Column(name = "note", length = 500)
    private String note;

    public boolean isComplete() {
        return completedAt != null;
    }
}
