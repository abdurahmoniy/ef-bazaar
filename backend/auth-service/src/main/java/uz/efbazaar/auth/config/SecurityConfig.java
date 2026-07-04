package uz.efbazaar.auth.config;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
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
                        // Public — Telegram register/login, Google login, token refresh.
                        // /telegram/link is protected (needs the caller's user id) so it
                        // stays under the default authenticated matcher below.
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/auth/telegram",
                                "/api/v1/auth/telegram-webapp",
                                "/api/v1/auth/google/login",
                                "/api/v1/auth/refresh").permitAll()
                        // Public — verify subrequest hit by nginx auth_request. The handler
                        // returns 401 explicitly when no principal is bound (JWT missing /
                        // invalid), so nginx's `error_page 401 = @marketplace_anon` routes
                        // anonymous marketplace browsing correctly. Kept OUT of the default
                        // authenticated bucket so Spring's own 401 response can't interfere.
                        .requestMatchers(HttpMethod.GET, "/api/v1/auth/verify").permitAll()
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
                        // Protected
                        .anyRequest().authenticated())
                .addFilterBefore(internalSecretFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}
