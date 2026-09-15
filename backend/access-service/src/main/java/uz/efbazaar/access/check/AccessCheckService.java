package uz.efbazaar.access.check;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import uz.efbazaar.access.config.AccessProperties;
import uz.efbazaar.access.requirement.AccessRequirement;
import uz.efbazaar.access.requirement.AccessRequirementRepository;
import uz.efbazaar.access.requirement.RequirementType;
import uz.efbazaar.access.requirement.RequirementView;

import java.time.Duration;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Foydalanuvchi barcha kirish shartlarini bajarganmi.
 *
 * <p>Qoida: faqat aniq {@link CheckOutcome#UNMET} login'ni to'sadi. Tekshirib
 * bo'lmagan shart ({@code UNKNOWN}) o'tkazib yuboriladi — bot yoki Telegram
 * nosozligi hech kimni platformadan chiqarib qo'ymasligi kerak.
 *
 * <p>Faqat {@code MET} keshlanadi. {@code UNMET} ni keshlasak, obuna bo'lib
 * "Tekshirish" ni bosgan odam kesh muddati tugaguncha kutib qolardi.
 */
@Slf4j
@Service
public class AccessCheckService {

    private static final String CACHE_PREFIX = "access:met:";

    private final AccessRequirementRepository repository;
    private final Map<RequirementType, RequirementChecker> checkers = new EnumMap<>(RequirementType.class);
    private final StringRedisTemplate redis;
    private final Duration metTtl;

    public AccessCheckService(AccessRequirementRepository repository,
                              List<RequirementChecker> checkers,
                              StringRedisTemplate redis,
                              AccessProperties properties) {
        this.repository = repository;
        this.redis = redis;
        this.metTtl = properties.check() != null && properties.check().metCacheTtl() != null
                ? properties.check().metCacheTtl()
                : Duration.ofMinutes(10);
        checkers.forEach(checker -> this.checkers.put(checker.type(), checker));
    }

    public CheckResult check(long telegramId) {
        List<RequirementView> unmet = new ArrayList<>();
        for (AccessRequirement requirement : repository.findAllByOrderByPositionAscCreatedAtAsc()) {
            if (outcome(requirement, telegramId) == CheckOutcome.UNMET) {
                unmet.add(RequirementView.of(requirement));
            }
        }
        return new CheckResult(unmet.isEmpty(), unmet);
    }

    private CheckOutcome outcome(AccessRequirement requirement, long telegramId) {
        String key = CACHE_PREFIX + requirement.getId() + ":" + telegramId;
        if (cachedMet(key)) return CheckOutcome.MET;

        RequirementChecker checker = checkers.get(requirement.getType());
        if (checker == null) {
            log.error("{} turi uchun checker yo'q — shart o'tkazib yuborildi", requirement.getType());
            return CheckOutcome.UNKNOWN;
        }

        CheckOutcome outcome = checker.check(requirement, telegramId);
        if (outcome == CheckOutcome.MET) rememberMet(key);
        return outcome;
    }

    private boolean cachedMet(String key) {
        try {
            return Boolean.TRUE.equals(redis.hasKey(key));
        } catch (Exception e) {
            log.debug("Redis kesh o'qilmadi: {}", e.getMessage());
            return false;
        }
    }

    private void rememberMet(String key) {
        try {
            redis.opsForValue().set(key, "1", metTtl);
        } catch (Exception e) {
            log.debug("Redis keshga yozilmadi: {}", e.getMessage());
        }
    }

    public record CheckResult(boolean passed, List<RequirementView> unmet) {}
}
