package uz.efbazaar.payment.plan.domain;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;

@Embeddable
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @EqualsAndHashCode
public class PlanPriceId implements Serializable {
    @Column(name = "plan_code", length = 32, nullable = false)
    private String planCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "period", length = 8, nullable = false)
    private PlanPeriod period;
}
