package uz.efbazaar.trade.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * {@code /internal/**} ni servislararo sir bilan qo'riqlaydi.
 *
 * <p>Marketplace'dagi bir xil nomli filtr bilan aynan bir xil qoida: sir
 * sozlanmagan bo'lsa ham RAD ETADI. Sozlamaning yo'qligi ruxsat degani
 * emas — aks holda noto'g'ri sozlangan muhitda ichki API ochilib qolardi.
 *
 * <p>Tashqaridan bu yo'l baribir yetib kelmaydi: nginx {@code /api/trade/}
 * ni faqat {@code /api/...} ga aylantiradi. Filtr ikkinchi qavat.
 */
@Slf4j
@Component
public class InternalSecretFilter extends OncePerRequestFilter {

    static final String HEADER = "X-Internal-Secret";
    static final String PATH_PREFIX = "/internal/";

    private final String configured;

    public InternalSecretFilter(@Value("${app.internal.secret:}") String configured) {
        this.configured = configured;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI();
        if (!path.startsWith(PATH_PREFIX)) {
            chain.doFilter(request, response);
            return;
        }

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
