package uz.efbazaar.auth.config;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import jakarta.servlet.DispatcherType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import uz.efbazaar.auth.security.InternalApiProperties;
import uz.efbazaar.auth.security.InternalSecretFilter;
import uz.efbazaar.auth.security.JwtAuthenticationFilter;
import uz.efbazaar.auth.security.RateLimitFilter;
import uz.efbazaar.auth.security.RateLimitProperties;

@Configuration
@EnableConfigurationProperties({RateLimitProperties.class, InternalApiProperties.class})
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtFilter;
    private final RateLimitFilter rateLimitFilter;
    private final InternalSecretFilter internalSecretFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth
                        // The ERROR dispatch, or every unhandled failure comes
                        // back as a 401. Spring re-dispatches an exception to
                        // /error, the chain runs again on that dispatch, and
                        // /error matches nothing below — so the status the
                        // caller needs is replaced by one about authentication.
                        // payment-service turned a "not enough money" 409 into
                        // a 401 exactly this way, and no trade could be accepted.
                        .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.ASYNC).permitAll()
                        // Public — Telegram register/login, Google login, token refresh, logout.
                        // /telegram/link is protected (needs the caller's user id) so it
                        // stays under the default authenticated matcher below.
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/auth/telegram",
                                "/api/v1/auth/telegram-webapp",
                                "/api/v1/auth/google/login",
                                "/api/v1/auth/logout",
                                "/api/v1/auth/refresh").permitAll()
                        // Public — verify subrequest hit by nginx auth_request. The handler
                        // returns 401 explicitly when no principal is bound (JWT missing /
                        // invalid), so nginx's `error_page 401 = @marketplace_anon` routes
                        // anonymous marketplace browsing correctly. Kept OUT of the default
                        // authenticated bucket so Spring's own 401 response can't interfere.
                        .requestMatchers(HttpMethod.GET, "/api/v1/auth/verify").permitAll()
                        // "me" is a single path segment, so it matches the
                        // public avatar pattern below and the endpoint was
                        // being reached with no principal at all — a 500 from
                        // a null dereference where a 401 belonged. Claimed
                        // first, so the wildcard cannot swallow it.
                        .requestMatchers(HttpMethod.GET, "/api/v1/users/me/photo").authenticated()
                        // Public — profile photo proxy (cached publicly for avatars)
                        .requestMatchers(HttpMethod.GET, "/api/v1/users/*/photo").permitAll()
                        // Public — health/metrics (nginx blocks externally)
                        .requestMatchers("/actuator/**", "/api/v1/ping").permitAll()
                        // Public — Swagger UI + OpenAPI (api.* subdomain nginx basic auth ostida)
                        .requestMatchers(
                                "/v3/api-docs/**",
                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/swagger-resources/**",
                                "/webjars/**").permitAll()
                        // Internal server-to-server — authentication handled by
                        // InternalSecretFilter (X-Internal-Secret header), which
                        // runs before Spring Security below. Nginx blocks the
                        // /internal/** prefix from the public network.
                        .requestMatchers("/internal/**").permitAll()
                        // Admin — user moderation
                        .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                        // Protected
                        .anyRequest().authenticated())
                .addFilterBefore(internalSecretFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}
