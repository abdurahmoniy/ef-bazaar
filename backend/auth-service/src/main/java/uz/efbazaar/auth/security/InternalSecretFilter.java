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

/**
 * Rejects any request under {@code /internal/**} whose {@code X-Internal-Secret}
 * header does not match the configured value. Runs before the JWT filter so
 * unauthenticated internal calls never trigger JWT parsing.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InternalSecretFilter extends OncePerRequestFilter {

    static final String HEADER = "X-Internal-Secret";
    static final String PATH_PREFIX = "/internal/";

    private final InternalApiProperties properties;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI();
        if (!path.startsWith(PATH_PREFIX)) {
            chain.doFilter(request, response);
            return;
        }

        String configured = properties.secret();
        String provided = request.getHeader(HEADER);
        if (configured == null || configured.isBlank() || !configured.equals(provided)) {
            log.warn("Internal API rejected: path={} providedHeader={}",
                    path, provided == null ? "<absent>" : "<mismatch>");
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"error\":\"forbidden\"}");
            return;
        }

        chain.doFilter(request, response);
    }
}
