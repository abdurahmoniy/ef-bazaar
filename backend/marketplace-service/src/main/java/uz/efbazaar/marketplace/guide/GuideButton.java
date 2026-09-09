package uz.efbazaar.marketplace.guide;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/** Botdagi inline tugma va u ochadigan qo'llanma. */
@Entity
@Table(name = "guide_button")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GuideButton {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String label;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "guide_id", nullable = false)
    private Guide guide;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;
}
