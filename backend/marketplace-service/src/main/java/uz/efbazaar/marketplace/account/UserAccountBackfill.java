package uz.efbazaar.marketplace.account;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.List;
import java.util.UUID;

/**
 * "Akkountlarim" bo'limi joriy qilingunga qadar yaratilgan e'lonlar uchun
 * bir martalik ta'mir: har bir FAOL e'lon ortida akkount ochiladi.
 *
 * <p>Sotilgan va o'chirilgan e'lonlar ataylab chetda — sotilgan akkount
 * endi sotuvchiniki emas.
 *
 * <p>Qayta ishga tushirsa bo'ladi: {@code source_listing_id} bo'yicha
 * qisman unique indeks va {@code existsBySourceListingId} tekshiruvi
 * ikkinchi nusxaga yo'l qo'ymaydi. Kursor bitta yozuv yiqilsa ham
 * oldinga siljiydi — bitta buzuq e'lon butun ta'mirni to'xtatmasligi kerak
 * ({@code ListingCardInventoryBackfill} bilan bir xil qoida).
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "app.user-account-backfill", name = "enabled", havingValue = "true")
public class UserAccountBackfill implements ApplicationRunner {

    private static final String PAGE_SQL = """
            SELECT l.id
            FROM listings l
            WHERE (?::uuid IS NULL OR l.id > ?::uuid)
              AND l.status = 'ACTIVE'
              AND NOT EXISTS (
                  SELECT 1 FROM user_accounts a WHERE a.source_listing_id = l.id
              )
            ORDER BY l.id
            LIMIT ?
            """;

    private final JdbcTemplate jdbc;
    private final ListingRepository listings;
    private final ListingAccountLink link;
    private final int batchSize;

    public UserAccountBackfill(JdbcTemplate jdbc,
                               ListingRepository listings,
                               ListingAccountLink link,
                               @Value("${app.user-account-backfill.batch-size:200}") int batchSize) {
        this.jdbc = jdbc;
        this.listings = listings;
        this.link = link;
        this.batchSize = batchSize;
    }

    @Override
    public void run(ApplicationArguments args) {
        UUID cursor = null;
        int created = 0;
        int failed = 0;

        while (true) {
            List<UUID> page = jdbc.queryForList(PAGE_SQL, UUID.class, cursor, cursor, batchSize);
            if (page.isEmpty()) {
                break;
            }
            for (UUID listingId : page) {
                cursor = listingId;
                try {
                    var listing = listings.findById(listingId);
                    if (listing.isEmpty()) {
                        continue;
                    }
                    link.onListingCreated(listing.get());
                    created++;
                } catch (Exception e) {
                    failed++;
                    log.warn("Account backfill failed for listing {}: {}", listingId, e.getMessage());
                }
            }
        }

        if (created > 0 || failed > 0) {
            log.info("Account backfill finished: created={} failed={}", created, failed);
        }
    }
}
