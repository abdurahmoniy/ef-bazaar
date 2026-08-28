package uz.efbazaar.marketplace.partner;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.marketplace.partner.PartnerApplication.Status;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class PartnerRepositories {

    private PartnerRepositories() {}

    public interface PartnerSettingsRepository extends JpaRepository<PartnerSettings, Short> {}

    public interface PartnerApplicationRepository extends JpaRepository<PartnerApplication, UUID> {

        Optional<PartnerApplication> findFirstByUserIdAndStatusInOrderByCreatedAtDesc(
                UUID userId, Collection<Status> statuses);

        Optional<PartnerApplication> findFirstByUserIdOrderByCreatedAtDesc(UUID userId);

        Page<PartnerApplication> findByStatusOrderByCreatedAtDesc(Status status, Pageable pageable);

        Page<PartnerApplication> findAllByOrderByCreatedAtDesc(Pageable pageable);

        /**
         * Kanal bo'yicha ochiq yoki tasdiqlangan ariza — bitta kanal ikki
         * hisobga bog'lanmasligi uchun.
         */
        Optional<PartnerApplication> findFirstByChannelIdAndStatusIn(
                Long channelId, Collection<Status> statuses);

        /**
         * Ishora uchun sanoq: shu holatdagi va admin oxirgi ko'rgandan keyin
         * o'zgargan arizalar.
         *
         * <p>Sanoq {@code created_at} emas, {@code updated_at} bo'yicha:
         * ariza avval AWAITING_CHANNEL bo'lib yaratiladi va faqat to'lovdan
         * keyin admin ko'rishi kerak bo'ladi. Yaratilish vaqti bo'yicha
         * sanasak, to'lov ko'rilgandan keyin kelgan ariza ishorasiz qolardi.
         */
        @Query("""
                select count(a) from PartnerApplication a
                 where a.status = :status
                   and (:since is null or a.updatedAt > :since)
                """)
        long countPending(@Param("status") Status status, @Param("since") Instant since);

        List<PartnerApplication> findByUserIdOrderByCreatedAtDesc(UUID userId);
    }

    public interface AdminSectionViewRepository extends JpaRepository<AdminSectionView, AdminSectionView.Key> {

        List<AdminSectionView> findByAdminId(UUID adminId);
    }
}
