package uz.efbazaar.marketplace.campaign;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class CampaignRepositories {

    private CampaignRepositories() {}

    public interface CampaignRepository extends JpaRepository<Campaign, UUID> {
        Optional<Campaign> findByCode(String code);
        boolean existsByCode(String code);

        /**
         * Adminka voronkasi: har kampaniya uchun bitta qator.
         *
         * <p>"E'lon joylagan" va "sotgan" — kampaniyadan kelgan
         * foydalanuvchilar ichida, e'lon soni emas, ODAM soni. Bitta
         * faol sotuvchi o'nta e'lon qo'ysa, kampaniya o'nta odam olib
         * kelgandek ko'rinmasligi kerak.
         *
         * <p>Taxalluslar getter nomlariga aynan mos: interfeys
         * proyeksiyasi ularni shu nom bo'yicha bog'laydi. camelCase
         * taxalluslar qo'shtirnoqda — aks holda Postgres ularni kichik
         * harfga aylantiradi va {@code getCreatedAt()} bo'sh qaytadi.
         */
        @Query(value = """
               SELECT c.id          AS id,
                      c.code        AS code,
                      c.name        AS name,
                      c.kind        AS kind,
                      c.created_at  AS "createdAt",
                      c.archived_at AS "archivedAt",
                      (SELECT count(*) FROM campaign_clicks k
                        WHERE k.campaign_id = c.id) AS clicks,
                      (SELECT count(*) FROM user_acquisitions a
                        WHERE a.campaign_id = c.id) AS registrations,
                      (SELECT count(DISTINCT a.user_id) FROM user_acquisitions a
                         JOIN listings l ON l.seller_id = a.user_id
                        WHERE a.campaign_id = c.id) AS listed,
                      (SELECT count(DISTINCT a.user_id) FROM user_acquisitions a
                         JOIN listings l ON l.seller_id = a.user_id AND l.status = 'SOLD'
                        WHERE a.campaign_id = c.id) AS sold
               FROM acquisition_campaigns c
               ORDER BY c.archived_at IS NOT NULL, c.created_at DESC
               """, nativeQuery = true)
        List<FunnelProjection> funnel();

        interface FunnelProjection {
            UUID getId();
            String getCode();
            String getName();
            String getKind();
            Instant getCreatedAt();
            Instant getArchivedAt();
            long getClicks();
            long getRegistrations();
            long getListed();
            long getSold();
        }
    }

    public interface CampaignClickRepository extends JpaRepository<CampaignClick, Long> {}

    public interface UserAcquisitionRepository extends JpaRepository<UserAcquisition, UUID> {}

    public interface PendingCampaignAttributionRepository
            extends JpaRepository<PendingCampaignAttribution, Long> {
        long deleteByCreatedAtBefore(Instant cutoff);
    }
}
