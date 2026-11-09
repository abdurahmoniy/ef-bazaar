package uz.efbazaar.auth.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.auth.repository.SignupStatsRepository;
import uz.efbazaar.auth.repository.SignupStatsRepository.DailySignups;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Kunlik ro'yxatdan o'tishlar: grafik uzilmasligi uchun har kun bor, bo'sh kun — nol. */
class SignupStatsServiceTest {

    private final SignupStatsRepository repo = mock(SignupStatsRepository.class);
    private final SignupStatsService service = new SignupStatsService(repo);

    private static DailySignups row(LocalDate day, long count) {
        DailySignups r = mock(DailySignups.class);
        when(r.getDay()).thenReturn(day);
        when(r.getSignups()).thenReturn(count);
        return r;
    }

    @Test
    @DisplayName("every day of the window is present and quiet days are zero")
    void fillsGaps() {
        LocalDate today = LocalDate.now(SignupStatsService.TASHKENT);
        List<DailySignups> rows = List.of(row(today.minusDays(2), 4), row(today, 1));
        when(repo.daily(any())).thenReturn(rows);
        when(repo.countAll()).thenReturn(226L);

        var summary = service.summary(5);

        assertThat(summary.total()).isEqualTo(226);
        assertThat(summary.inPeriod()).isEqualTo(5);
        assertThat(summary.daily()).hasSize(5);
        assertThat(summary.daily().get(4).date()).isEqualTo(today);
        assertThat(summary.daily().get(4).count()).isEqualTo(1);
        assertThat(summary.daily().get(2).count()).isEqualTo(4);
        assertThat(summary.daily().get(3).count()).isZero();
    }
}
