package uz.efbazaar.marketplace.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * Reads identity headers injected by nginx after the {@code auth_request} subrequest.
 *
 * <p>Headers (all optional — anonymous request when absent):
 * <ul>
 *   <li>{@code X-User-Id}      — user UUID</li>
 *   <li>{@code X-User-Roles}   — comma-separated authorities (already prefixed e.g. {@code ROLE_USER})</li>
 *   <li>{@code X-Telegram-Id}  — linked telegram id (long)</li>
 * </ul>
 *
 * <p>JWT validation is done by nginx → auth-service. This service never sees the raw token.
 */
@Slf4j
@Component
public class HeaderAuthenticationFilter extends OncePerRequestFilter {

    public static final String HEADER_USER_ID = "X-User-Id";
    public static final String HEADER_USER_ROLES = "X-User-Roles";
    public static final String HEADER_TELEGRAM_ID = "X-Telegram-Id";
    public static final String HEADER_USER_NAME = "X-User-Name";

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        String userIdHeader = request.getHeader(HEADER_USER_ID);

        if (StringUtils.hasText(userIdHeader)
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                UUID userId = UUID.fromString(userIdHeader);
                List<String> roles = parseRoles(request.getHeader(HEADER_USER_ROLES));
                Long telegramId = parseTelegramId(request.getHeader(HEADER_TELEGRAM_ID));
                String displayName = parseDisplayName(request.getHeader(HEADER_USER_NAME));

                AuthenticatedUser principal =
                        new AuthenticatedUser(userId, telegramId, roles, displayName);
                List<SimpleGrantedAuthority> authorities = roles.stream()
                        .map(SimpleGrantedAuthority::new)
                        .toList();
                var auth = new UsernamePasswordAuthenticationToken(principal, null, authorities);
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (IllegalArgumentException e) {
                log.warn("Invalid X-User-Id header: {}", userIdHeader);
                // Don't fail — treat as anonymous
            }
        }

        chain.doFilter(request, response);
    }

    private List<String> parseRoles(String header) {
        if (!StringUtils.hasText(header)) return Collections.emptyList();
        return Arrays.stream(header.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    private Long parseTelegramId(String header) {
        if (!StringUtils.hasText(header)) return null;
        try {
            return Long.parseLong(header.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** Auth sends the name base64-encoded (headers are ASCII-only). */
    private String parseDisplayName(String header) {
        if (!StringUtils.hasText(header)) return null;
        try {
            String decoded = new String(
                    java.util.Base64.getDecoder().decode(header.trim()),
                    java.nio.charset.StandardCharsets.UTF_8).trim();
            return decoded.isEmpty() ? null : decoded;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
