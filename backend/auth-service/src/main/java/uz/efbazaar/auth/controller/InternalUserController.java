package uz.efbazaar.auth.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.UserNamesBatchRequest;
import uz.efbazaar.auth.repository.UserRepository;

import java.util.LinkedHashMap;
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

    @PostMapping("/names/batch")
    public Map<UUID, String> resolveNames(@Valid @RequestBody UserNamesBatchRequest request) {
        Map<UUID, String> out = new LinkedHashMap<>();
        for (User user : userRepository.findAllById(request.ids())) {
            out.put(user.getId(), user.displayName());
        }
        return out;
    }
}
