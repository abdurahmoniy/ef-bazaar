package uz.efbazaar.payment.testsupport;

import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.UUID;

/**
 * MockMvc helper: sets the nginx identity headers so
 * {@link uz.efbazaar.payment.security.HeaderAuthenticationFilter} picks up
 * a synthetic identity.
 */
public final class AuthHeaderRequestPostProcessor {

    private AuthHeaderRequestPostProcessor() {}

    public static RequestPostProcessor asUser(UUID userId) {
        return asUser(userId, "ROLE_USER");
    }

    public static RequestPostProcessor asUser(UUID userId, String... roles) {
        return req -> {
            req.addHeader("X-User-Id", userId.toString());
            req.addHeader("X-User-Roles", String.join(",", roles));
            return req;
        };
    }

    public static RequestPostProcessor asAdmin() {
        return asUser(UUID.randomUUID(), "ROLE_USER", "ROLE_ADMIN");
    }
}
