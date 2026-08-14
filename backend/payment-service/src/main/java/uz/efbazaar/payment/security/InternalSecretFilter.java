package uz.efbazaar.payment.security;

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
import uz.efbazaar.payment.config.InternalApiProperties;

import java.io.IOException;

/**
 * Rejects any {@code /internal/**} request whose {@code X-Internal-Secret}
 * header does not match. Copied in shape from auth-service so both services
 * authenticate server-to-server traffic the same way.
 *
 * <p>A blank configured secret refuses everything. These endpoints move money
 * between wallets, so an environment that forgot to set it must be unusable,
 * not open.
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
        if (!request.getRequestURI().startsWith(PATH_PREFIX)) {
            chain.doFilter(request, response);
            return;
        }

        String configured = properties.secret();
        String provided = request.getHeader(HEADER);
        if (configured == null || configured.isBlank() || !configured.equals(provided)) {
            // Never log the header itself, matched or not.
            log.warn("Internal API rejected: path={} header={}",
                    request.getRequestURI(), provided == null ? "<absent>" : "<mismatch>");
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"error\":\"forbidden\"}");
            return;
        }

        chain.doFilter(request, response);
    }
}
