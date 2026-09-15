package uz.efbazaar.access.security;

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
import java.util.List;
import java.util.UUID;

/**
 * nginx {@code auth_request} dan keyin qo'yilgan {@code X-User-Id} va
 * {@code X-User-Roles} headerlarini o'qiydi. Token bu yerda tekshirilmaydi —
 * uni auth-service tekshiradi.
 */
@Slf4j
@Component
public class HeaderAuthenticationFilter extends OncePerRequestFilter {

    static final String HEADER_USER_ID = "X-User-Id";
    static final String HEADER_USER_ROLES = "X-User-Roles";

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        String userIdHeader = request.getHeader(HEADER_USER_ID);
        if (StringUtils.hasText(userIdHeader)
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                UUID userId = UUID.fromString(userIdHeader.trim());
                List<String> roles = parseRoles(request.getHeader(HEADER_USER_ROLES));
                var principal = new AuthenticatedUser(userId, roles);
                var authorities = roles.stream().map(SimpleGrantedAuthority::new).toList();
                SecurityContextHolder.getContext().setAuthentication(
                        new UsernamePasswordAuthenticationToken(principal, null, authorities));
            } catch (IllegalArgumentException e) {
                log.warn("Invalid X-User-Id header: {}", userIdHeader);
            }
        }
        chain.doFilter(request, response);
    }

    private static List<String> parseRoles(String header) {
        if (!StringUtils.hasText(header)) return List.of();
        return Arrays.stream(header.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }
}
