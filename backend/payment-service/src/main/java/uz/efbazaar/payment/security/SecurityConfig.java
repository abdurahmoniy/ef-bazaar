package uz.efbazaar.payment.security;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpMethod;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import jakarta.servlet.DispatcherType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final HeaderAuthenticationFilter headerAuthFilter;
    private final InternalSecretFilter internalSecretFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                // No auth headers at all -> 401 (not the default 403) so callers can
                // distinguish "you never authenticated" from "you're not allowed to".
                .exceptionHandling(e -> e.authenticationEntryPoint(
                        new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .authorizeHttpRequests(auth -> auth
                        // The ERROR dispatch, or every failure becomes a 401.
                        // Spring re-dispatches an exception to /error, the
                        // filter chain runs again on that dispatch, and /error
                        // matches nothing above — so a "not enough money" 409
                        // reached trade-service as 401 and no trade could be
                        // accepted at all. The status the caller needs was
                        // being replaced by one about authentication.
                        .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.ASYNC).permitAll()
                        .requestMatchers("/actuator/**").permitAll()
                        .requestMatchers(
                                "/v3/api-docs/**",
                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/swagger-resources/**",
                                "/webjars/**"
                        ).permitAll()
                        // Guarded by InternalSecretFilter, not by a role: the
                        // caller is trade-service, which has no user identity.
                        // permitAll here would be wrong without that filter.
                        //
                        // Matched on the raw path. A bare string becomes an
                        // MvcRequestMatcher, which resolves through the handler
                        // mappings — and in production this rule stopped
                        // applying, so every escrow call came back 401 and no
                        // trade could be accepted. The MockMvc tests never saw
                        // it: they do not go through the servlet chain.
                        .requestMatchers(new AntPathRequestMatcher("/internal/**")).permitAll()
                        // The fee schedule is quoted on the listing form and the
                        // proposal dialog, both reachable before signing in, and
                        // there is nothing private about what the platform
                        // charges. Read-only — the admin path below writes it.
                        .requestMatchers(HttpMethod.GET, "/api/v1/payments/commission").permitAll()
                        .requestMatchers("/api/v1/admin/**").hasAuthority("ROLE_ADMIN")
                        .anyRequest().authenticated())
                // Inside the chain, as marketplace-service registers it. Left to
                // Spring Boot's auto-registration it runs in the outer servlet
                // chain, where its ordering against Spring Security is not the
                // one this config reads as.
                .addFilterBefore(internalSecretFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(headerAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}
