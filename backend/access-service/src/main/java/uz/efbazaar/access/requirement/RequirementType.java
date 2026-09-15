package uz.efbazaar.access.requirement;

/**
 * Kirish sharti turi. Har bir turga bitta
 * {@link uz.efbazaar.access.check.RequirementChecker} to'g'ri keladi.
 *
 * <p>Yangi tur (masalan Instagram obunasi) = shu yerga qiymat + yangi checker.
 * Jadval o'zgarmaydi: turga xos ma'lumot {@code config} JSONB da.
 */
public enum RequirementType {
    TELEGRAM_CHANNEL
}
