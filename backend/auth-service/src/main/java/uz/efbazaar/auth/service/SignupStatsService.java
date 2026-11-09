package uz.efbazaar.auth.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.repository.SignupStatsRepository;
import uz.efbazaar.auth.repository.SignupStatsRepository.DailySignups;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Kunlik ro'yxatdan o'tishlar — "auditoriya qanchalik tez o'syapti" savoliga
 * javob. Kampaniya bo'yicha bo'linish marketplace'da; bu umumiy oqim.
 */
@Service
@RequiredArgsConstructor
public class SignupStatsService {

    static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final SignupStatsRepository repo;

    @Transactional(readOnly = true)
    public Summary summary(int days) {
        LocalDate today = LocalDate.now(TASHKENT);
        LocalDate first = today.minusDays(days - 1L);
        Map<LocalDate, Long> byDay = repo.daily(first.atStartOfDay(TASHKENT).toInstant()).stream()
                .collect(Collectors.toMap(DailySignups::getDay, DailySignups::getSignups));

        List<Day> series = new ArrayList<>(days);
        long inPeriod = 0;
        for (LocalDate d = first; !d.isAfter(today); d = d.plusDays(1)) {
            long n = byDay.getOrDefault(d, 0L);
            series.add(new Day(d, n));
            inPeriod += n;
        }
        return new Summary(days, repo.countAll(), inPeriod, series);
    }

    public record Summary(int days, long total, long inPeriod, List<Day> daily) {}

    public record Day(LocalDate date, long count) {}
}
