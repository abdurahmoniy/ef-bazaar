package uz.efbazaar.auth.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.UserNamesBatchRequest;
import uz.efbazaar.auth.dto.UserSummaryBatchRequest;
import uz.efbazaar.auth.dto.UserSummaryResponse;
import uz.efbazaar.auth.repository.UserRepository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Server-to-server endpoint used by other efBazaar services (currently
 * marketplace-service) to resolve a batch of user IDs to display names —
 * e.g. to snapshot buyer/seller names on a Chat at creation time.
 *
 * <p>Auth: shared secret via {@code X-Internal-Secret}, enforced by
 * {@link uz.efbazaar.auth.security.InternalSecretFilter}. The path is also
 * blocked at nginx from the public network.
 *
 * <p>Behaviour: unknown IDs are simply omitted from the response map (the
 * caller falls back to a role label). No JWT is required.
 */
@RestController
@RequestMapping("/internal/auth/v1/users")
@RequiredArgsConstructor
public class InternalUserController {

    private final UserRepository userRepository;

    /**
     * Platform admins, as identity summaries.
     *
     * <p>Exists because notifications are per-user rows: a service that needs
     * to tell "the admins" something has no way to address them without a
     * roster, and roles live only here. Returns the same public projection as
     * {@code summary/batch} — ids and Telegram handles, no tokens or emails —
     * so a caller can write a notification row and send a direct message
     * without a second round trip.
     */
    @GetMapping("/admins")
    public List<UserSummaryResponse> admins() {
        return userRepository.findByRole(Role.ADMIN).stream()
                .map(UserSummaryResponse::from)
                .toList();
    }

    @PostMapping("/names/batch")
    public Map<UUID, String> resolveNames(@Valid @RequestBody UserNamesBatchRequest request) {
        Map<UUID, String> out = new LinkedHashMap<>();
        for (User user : userRepository.findAllById(request.ids())) {
            out.put(user.getId(), user.displayName());
        }
        return out;
    }

    /**
     * Richer projection than {@code names/batch} — identity summary for Gamer
     * Card aggregation and the Chempionat-X identity bridge. Lookup by UUID
     * and/or Telegram id; unknown ids are omitted, duplicates collapse.
     */
    @PostMapping("/summary/batch")
    public List<UserSummaryResponse> resolveSummaries(@Valid @RequestBody UserSummaryBatchRequest request) {
        if (request.isEmpty()) return List.of();
        Map<UUID, User> unique = new LinkedHashMap<>();
        if (request.ids() != null && !request.ids().isEmpty()) {
            for (User user : userRepository.findAllById(request.ids())) {
                unique.put(user.getId(), user);
            }
        }
        if (request.telegramIds() != null && !request.telegramIds().isEmpty()) {
            for (User user : userRepository.findByTelegramIdIn(request.telegramIds())) {
                unique.put(user.getId(), user);
            }
        }
        return unique.values().stream().map(UserSummaryResponse::from).toList();
    }
}
