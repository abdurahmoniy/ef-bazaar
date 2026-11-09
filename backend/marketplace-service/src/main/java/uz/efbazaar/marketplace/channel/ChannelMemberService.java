package uz.efbazaar.marketplace.channel;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.channel.ChannelMemberRepositories.ChannelMemberEventRepository;
import uz.efbazaar.marketplace.channel.ChannelMemberRepositories.ChannelMemberEventRepository.DailyProjection;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Rasmiy kanalga obuna bo'lish va chiqib ketish.
 *
 * <p>Bot hamma kanaldagi o'zgarishni yuboradi (u hamkor kanallarda ham admin),
 * qaysi biri rasmiy ekanini shu yer hal qiladi: {@code app.channels.official}
 * — {@code @username} yoki raqamli id. Bo'sh bo'lsa hech narsa yozilmaydi.
 */
@Slf4j
@Service
public class ChannelMemberService {

    static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    private static final Set<String> KINDS = Set.of("JOIN", "LEAVE");

    private final ChannelMemberEventRepository events;
    private final String official;

    public ChannelMemberService(ChannelMemberEventRepository events,
                                @Value("${app.channels.official:}") String official) {
        this.events = events;
        this.official = official == null ? "" : official.trim();
    }

    /**
     * ATAYLAB {@code @Transactional} EMAS: takroriy update unique kalitga
     * urilsa, xato aynan {@code save()} dan qaytishi va shu yerda yutilishi kerak.
     */
    public void record(long channelId, String channelUsername, long telegramId, String kind, long unixSeconds) {
        if (!KINDS.contains(kind) || telegramId == 0 || !isOfficial(channelId, channelUsername)) return;
        try {
            events.save(new ChannelMemberEvent(telegramId, kind, Instant.ofEpochSecond(unixSeconds)));
        } catch (DataIntegrityViolationException e) {
            log.debug("Kanal hodisasi allaqachon yozilgan: {} {}", telegramId, kind);
        }
    }

    boolean isOfficial(long channelId, String channelUsername) {
        if (official.isEmpty()) return false;
        if (official.startsWith("@")) {
            return channelUsername != null && official.substring(1).equalsIgnoreCase(channelUsername);
        }
        return official.equals(String.valueOf(channelId));
    }

    /** Oxirgi {@code days} kun, bo'sh kunlar nol bilan — grafik uzilib qolmasin. */
    @Transactional(readOnly = true)
    public Summary summary(int days) {
        LocalDate today = LocalDate.now(TASHKENT);
        LocalDate first = today.minusDays(days - 1L);
        Map<LocalDate, DailyProjection> byDay = events.daily(first.atStartOfDay(TASHKENT).toInstant())
                .stream().collect(Collectors.toMap(DailyProjection::getDay, Function.identity()));

        List<Day> series = new ArrayList<>(days);
        long joins = 0;
        long leaves = 0;
        for (LocalDate d = first; !d.isAfter(today); d = d.plusDays(1)) {
            DailyProjection p = byDay.get(d);
            long j = p == null ? 0 : p.getJoins();
            long l = p == null ? 0 : p.getLeaves();
            series.add(new Day(d, j, l));
            joins += j;
            leaves += l;
        }
        return new Summary(!official.isEmpty(), days, joins, leaves, series);
    }

    /** @param configured rasmiy kanal sozlanganmi — aks holda nollar "hech kim chiqmadi" degani emas. */
    public record Summary(boolean configured, int days, long joins, long leaves, List<Day> daily) {}

    public record Day(LocalDate date, long joins, long leaves) {}
}
