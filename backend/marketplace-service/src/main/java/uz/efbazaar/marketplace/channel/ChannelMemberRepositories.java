package uz.efbazaar.marketplace.channel;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class ChannelMemberRepositories {

    private ChannelMemberRepositories() {}

    public interface ChannelMemberEventRepository extends JpaRepository<ChannelMemberEvent, Long> {

        /**
         * Kunlik qo'shilish va chiqish, Toshkent vaqti bo'yicha — admin "bugun"
         * deganda UTC yarim tunini emas, o'z kunini nazarda tutadi.
         * Hodisa bo'lmagan kun qatori yo'q; bo'sh kunlarni chaqiruvchi to'ldiradi.
         */
        @Query(value = """
               SELECT (occurred_at AT TIME ZONE 'Asia/Tashkent')::date AS "day",
                      count(*) FILTER (WHERE kind = 'JOIN')  AS joins,
                      count(*) FILTER (WHERE kind = 'LEAVE') AS leaves
               FROM channel_member_events
               WHERE occurred_at >= :since
               GROUP BY 1
               ORDER BY 1
               """, nativeQuery = true)
        List<DailyProjection> daily(@Param("since") Instant since);

        interface DailyProjection {
            LocalDate getDay();
            long getJoins();
            long getLeaves();
        }
    }
}
