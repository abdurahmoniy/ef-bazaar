package uz.efbazaar.marketplace.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.account.UserAccount;
import uz.efbazaar.marketplace.account.UserAccountRepository;

import java.util.List;
import java.util.UUID;

/**
 * Obmenda xaridor beradigan akkountning qisqachasi — trade-service uchun.
 *
 * <p>trade-service egasini, holatini va e'lonini tekshiradi, qolganini esa
 * savdoga snapshot qilib yozadi: sotuvchi xaridorning shaxsiy akkountlarini
 * o'qiy olmaydi, lekin nima olishini ko'rishi kerak.
 */
@RestController
@RequestMapping("/internal/marketplace/v1/accounts")
@RequiredArgsConstructor
public class InternalAccountController {

    private static final int SUMMARY_LIMIT = 80;

    private final UserAccountRepository accounts;

    public record AccountSummary(UUID id, UUID ownerId, String status, String title,
                                 String coverMessageId, String summary,
                                 Integer teamStrength, UUID currentListingId) {}

    @GetMapping("/{id}")
    public AccountSummary summary(@PathVariable UUID id) {
        UserAccount a = accounts.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Akkount topilmadi"));
        List<String> media = a.getMediaMessageIds();
        return new AccountSummary(a.getId(), a.getOwnerId(), a.getStatus().name(), a.getTitle(),
                media == null || media.isEmpty() ? null : media.get(0),
                shorten(a.getDescription()),
                teamStrength(a.getAttributes() == null ? null : a.getAttributes().get("team_strength")),
                a.getCurrentListingId());
    }

    private static String shorten(String description) {
        if (description == null) return "";
        String flat = description.replaceAll("\\s+", " ").trim();
        return flat.length() <= SUMMARY_LIMIT ? flat : flat.substring(0, SUMMARY_LIMIT) + "…";
    }

    private static Integer teamStrength(Object raw) {
        if (raw == null) return null;
        try {
            int value = Integer.parseInt(raw.toString().trim());
            return value > 0 ? value : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
