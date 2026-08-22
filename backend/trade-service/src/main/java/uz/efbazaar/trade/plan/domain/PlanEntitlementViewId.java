package uz.efbazaar.trade.plan.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.*;

import java.io.Serializable;

@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class PlanEntitlementViewId implements Serializable {

    @Column(name = "plan_code", length = 32, nullable = false)
    private String planCode;

    @Column(name = "key", length = 64, nullable = false)
    private String key;
}
