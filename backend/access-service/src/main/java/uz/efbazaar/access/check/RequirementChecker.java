package uz.efbazaar.access.check;

import uz.efbazaar.access.requirement.AccessRequirement;
import uz.efbazaar.access.requirement.RequirementType;

/**
 * Bitta shart turini tekshiradi. Yangi tur = yangi {@code @Component}
 * implementatsiya; {@link AccessCheckService} ularni turi bo'yicha o'zi topadi.
 *
 * <p>Xato tashlamaslik kerak: tekshirib bo'lmasa {@link CheckOutcome#UNKNOWN}.
 */
public interface RequirementChecker {

    RequirementType type();

    CheckOutcome check(AccessRequirement requirement, long telegramId);
}
