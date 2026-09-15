package uz.efbazaar.access.security;

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
import uz.efbazaar.access.config.AccessProperties;

import java.io.IOException;

/**
 * {@code /internal/**} ga faqat to'g'ri {@code X-Internal-Secret} bilan
 * kiriladi. auth-service va payment-service dagi filtr bilan bir xil.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InternalSecretFilter extends OncePerRequestFilter {

    static final String HEADER = "X-Internal-Secret";
    static final String PATH_PREFIX = "/internal/";

    private final AccessProperties properties;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        if (!request.getRequestURI().startsWith(PATH_PREFIX)) {
            chain.doFilter(request, response);
            return;
        }

        String configured = properties.internal() == null ? null : properties.internal().secret();
        String provided = request.getHeader(HEADER);
        if (configured == null || configured.isBlank() || !configured.equals(provided)) {
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
