package uz.efbazaar.marketplace.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.util.UUID;

/** Durable join between independently delivered proposal-created and proposal-resolved events. */
@Entity
@Table(name = "proposal_message_resolutions")
@Getter
@Setter
@NoArgsConstructor
public class ProposalMessageResolution {
    @Id
    @Column(name = "proposal_id")
    private UUID proposalId;

    @Column(length = 16)
    private String outcome;

    @Column(name = "trade_id")
    private UUID tradeId;
}
