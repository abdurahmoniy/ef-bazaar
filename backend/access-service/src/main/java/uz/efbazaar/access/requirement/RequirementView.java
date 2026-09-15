package uz.efbazaar.access.requirement;

import java.time.Instant;
import java.util.UUID;

/**
 * Admin panel va shartlar ekrani uchun bir xil ko'rinish.
 *
 * <p>Maydonlar turdan mustaqil: frontend har bir tur uchun alohida shakl
 * bilmasdan kartochka chiza oladi. Turga xos narsa kerak bo'lsa {@code type}
 * bo'yicha ajratiladi.
 */
public record RequirementView(
        UUID id,
        RequirementType type,
        String title,
        String username,
        String url,
        String photoFileId,
        Instant createdAt) {

    public static RequirementView of(AccessRequirement requirement) {
        return switch (requirement.getType()) {
            case TELEGRAM_CHANNEL -> {
                TelegramChannelConfig channel = requirement.telegramChannel();
                yield new RequirementView(
                        requirement.getId(),
                        requirement.getType(),
                        channel.title(),
                        channel.username(),
                        channel.url(),
                        channel.photoFileId(),
                        requirement.getCreatedAt());
            }
        };
    }
}
