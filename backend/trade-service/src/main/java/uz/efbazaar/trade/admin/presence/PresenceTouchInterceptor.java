package uz.efbazaar.trade.admin.presence;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import uz.efbazaar.trade.security.AuthenticatedUser;

/**
 * Refreshes the caller's presence key after each authenticated request.
 *
 * <p>Runs in {@code afterCompletion} so it never delays the response, and reads
 * the identity from the security context rather than the raw header so it
 * agrees with {@code HeaderAuthenticationFilter} on what counts as authenticated.
 */
@Component
@RequiredArgsConstructor
public class PresenceTouchInterceptor implements HandlerInterceptor {

    private final RedisPresenceQuery presence;

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AuthenticatedUser me) {
            presence.touch(me.userId());
        }
    }
}
