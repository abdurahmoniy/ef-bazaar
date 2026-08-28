package uz.efbazaar.marketplace.partner;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/**
 * Admin qaysi bo'limni oxirgi marta qachon ko'rgani.
 *
 * <p>Ishora (badge) shu vaqtdan keyin paydo bo'lgan elementlarni sanaydi.
 * Har element uchun "ko'rildi" yozuvi saqlanmaydi — u jadval elementlar ×
 * adminlar bo'lib o'sardi va hech qachon tozalanmasdi.
 */
@Entity
@Table(name = "admin_section_views")
@IdClass(AdminSectionView.Key.class)
@Getter
@Setter
@NoArgsConstructor
public class AdminSectionView {

    @Id
    @Column(name = "admin_id", nullable = false, columnDefinition = "uuid")
    private UUID adminId;

    @Id
    @Column(nullable = false)
    private String section;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt = Instant.now();

    public AdminSectionView(UUID adminId, String section, Instant lastSeenAt) {
        this.adminId = adminId;
        this.section = section;
        this.lastSeenAt = lastSeenAt;
    }

    /**
     * Kompozit kalit.
     *
     * <p>{@code equals}/{@code hashCode} JPA talabi va Lombok'ning
     * {@code @Getter}/{@code @Setter} ularni yasamaydi. Ularsiz Hibernate
     * bir xil kalitni ikki xil obyekt deb qaraydi: {@code findById} kesh'dan
     * topa olmaydi va {@code save} mavjud qatorni yangilash o'rniga
     * ikkinchisini qo'shishga urinadi.
     */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private UUID adminId;
        private String section;
    }
}
