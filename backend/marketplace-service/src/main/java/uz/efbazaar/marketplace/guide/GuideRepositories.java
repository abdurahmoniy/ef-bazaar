package uz.efbazaar.marketplace.guide;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public final class GuideRepositories {

    private GuideRepositories() {}

    public interface GuideRepository extends JpaRepository<Guide, UUID> {
        List<Guide> findAllByOrderBySortOrderAscCreatedAtAsc();
    }

    public interface GuideButtonRepository extends JpaRepository<GuideButton, UUID> {

        /**
         * Tugmalar qo'llanmasi bilan — bitta so'rovda.
         *
         * <p>Bot uchun ikkalasi ham kerak: yozuv tugmada, `file_id` esa
         * bosilganda. Lazy qoldirsak, ro'yxatni chizishda har tugma uchun
         * alohida so'rov ketardi.
         */
        @EntityGraph(attributePaths = "guide")
        List<GuideButton> findAllByOrderBySortOrderAsc();
    }
}
