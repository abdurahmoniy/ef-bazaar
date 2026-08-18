package uz.efbazaar.trade.trade.domain;

import jakarta.persistence.Embeddable;
import jakarta.persistence.Enumerated;
import jakarta.persistence.EnumType;
import lombok.*;

import java.io.Serializable;
import java.util.UUID;

@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class TradeSideId implements Serializable {

    private UUID tradeId;

    @Enumerated(EnumType.STRING)
    private ParticipantRole role;
}
