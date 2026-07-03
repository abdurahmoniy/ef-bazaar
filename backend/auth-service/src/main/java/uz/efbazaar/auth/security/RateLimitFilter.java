package uz.efbazaar.auth.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;

/**
 * Servlet filter that rejects requests to configured auth endpoints when a
 * client IP has already exceeded its per-minute budget. Runs before the JWT
 * filter so misbehaving clients can't burn CPU on token parsing.
 *
 * <p>Endpoints and budgets come from {@link RateLimitProperties}. Only exact
 * path matches trigger the check — unknown paths fall through untouched.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RateLimitFilter extends OncePerRequestFilter {

    private final RateLimitService rateLimitService;
    private final RateLimitProperties properties;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        if (!properties.enabled() || properties.endpoints() == null) {
            chain.doFilter(request, response);
            return;
        }

        Integer limit = matchLimit(request);
        if (limit == null) {
            chain.doFilter(request, response);
            return;
        }

        String ip = clientIp(request);
        if (!rateLimitService.tryAcquire(request.getRequestURI(), ip, limit)) {
            log.info("Rate limit exceeded: path={} ip={} limit={}",
                    request.getRequestURI(), ip, limit);
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader("Retry-After", "60");
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"error\":\"rate_limited\",\"retryAfterSeconds\":60}");
            return;
        }

        chain.doFilter(request, response);
    }

    private Integer matchLimit(HttpServletRequest request) {
        Map<String, Integer> endpoints = properties.endpoints();
        Integer direct = endpoints.get(request.getRequestURI());
        if (direct != null) return direct;
        // Support method+path keys ("POST /api/v1/auth/telegram") for callers who
        // want to scope by verb — falls through gracefully if unset.
        return endpoints.get(request.getMethod() + " " + request.getRequestURI());
    }

    /**
     * Trust {@code X-Real-IP} first (nginx sets it on the proxied request), then
     * the first entry of {@code X-Forwarded-For}. Fall back to the socket peer
     * so local calls without nginx still land under some identifier.
     */
    static String clientIp(HttpServletRequest request) {
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) return realIp.trim();
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return (comma < 0 ? forwarded : forwarded.substring(0, comma)).trim();
        }
        return request.getRemoteAddr();
    }
}
