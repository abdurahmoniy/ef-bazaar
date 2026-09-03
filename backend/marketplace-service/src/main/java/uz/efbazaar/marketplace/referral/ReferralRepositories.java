package uz.efbazaar.marketplace.referral;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class ReferralRepositories {

    private ReferralRepositories() {}

    public interface ReferralCodeRepository extends JpaRepository<ReferralCode, UUID> {
        Optional<ReferralCode> findByCode(String code);
        boolean existsByCode(String code);
    }

    public interface ReferralRepository extends JpaRepository<Referral, UUID> {
        List<Referral> findByReferrerUserIdOrderByCreatedAtDesc(UUID referrerUserId);
        Page<Referral> findByReferrerUserIdOrderByCreatedAtDesc(UUID referrerUserId, Pageable pageable);
        long countByReferrerUserId(UUID referrerUserId);

        /**
         * Reyting: kim nechta odam olib kelgan.
         *
         * <p>Ismlar bu yerda emas — ular auth-service'da. Xizmat
         * identifikatorlarni bitta {@code resolveAll} chaqiruvi bilan
         * to'ldiradi, har qator uchun alohida so'rov qilmaydi.
         *
         * <p>Taxalluslar getter nomlariga aynan mos: interfeys
         * proyeksiyasi ularni shu nom bo'yicha bog'laydi.
         */
        @Query("""
               select r.referrerUserId as userId,
                      count(r) as invitedCount,
                      sum(case when r.rewardedAt is not null then 1 else 0 end) as rewardedCount,
                      coalesce(sum(r.rewardSom), 0) as earnedSom
               from Referral r
               group by r.referrerUserId
               order by count(r) desc
               """)
        List<ReferrerProjection> leaderboard(Pageable pageable);

        interface ReferrerProjection {
            UUID getUserId();
            long getInvitedCount();
            long getRewardedCount();
            BigDecimal getEarnedSom();
        }
    }

    public interface ReferralSettingsRepository extends JpaRepository<ReferralSettings, Short> {}

    public interface PendingReferralRepository extends JpaRepository<PendingReferral, Long> {

        /**
         * Ro'yxatdan o'tishga aylanmagan eski kodlarni tozalaydi.
         *
         * <p>Botdagi havolani bosgan har bir odam ro'yxatdan o'tmaydi —
         * ko'pchiligi shunchaki qarab chiqadi. Ularning qatorlarini
         * o'chiradigan hech narsa yo'q edi, ya'ni jadval faqat o'sardi.
         */
        long deleteByCreatedAtBefore(Instant cutoff);
    }
}
