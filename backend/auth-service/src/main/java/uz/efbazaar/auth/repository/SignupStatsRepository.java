package uz.efbazaar.auth.repository;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.auth.domain.User;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Adminka "O'sish" sahifasi uchun faqat o'qiladigan statistika. */
public interface SignupStatsRepository extends Repository<User, UUID> {

    /**
     * Kunlik ro'yxatdan o'tishlar, Toshkent kuni bo'yicha. Bo'sh kunlar
     * qaytmaydi — ularni {@code SignupStatsService} to'ldiradi.
     */
    @Query(value = """
           SELECT (created_at AT TIME ZONE 'Asia/Tashkent')::date AS "day",
                  count(*) AS signups
           FROM users
           WHERE created_at >= :since
           GROUP BY 1
           ORDER BY 1
           """, nativeQuery = true)
    List<DailySignups> daily(@Param("since") Instant since);

    @Query(value = "SELECT count(*) FROM users", nativeQuery = true)
    long countAll();

    interface DailySignups {
        LocalDate getDay();
        long getSignups();
    }
}
