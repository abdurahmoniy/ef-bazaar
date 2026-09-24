package uz.efbazaar.trade.security;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
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
                        // The ERROR dispatch, or every unhandled failure comes
                        // back as a 401. Spring re-dispatches an exception to
                        // /error, the chain runs again on that dispatch, and
                        // /error matches nothing below — so the status the
                        // caller needs is replaced by one about authentication.
                        // payment-service turned a "not enough money" 409 into
                        // a 401 exactly this way, and no trade could be accepted.
                        .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.ASYNC).permitAll()
                        .requestMatchers("/actuator/**").permitAll()
                        .requestMatchers(
                                "/v3/api-docs/**",
                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/swagger-resources/**",
                                "/webjars/**"
                        ).permitAll()
                        // STOMP handshake — CONNECT frame auth happens in WebSocketConfig (Task 17)
                        .requestMatchers("/ws/trade/**").permitAll()
                        // Sir bilan qo'riqlanadi (InternalSecretFilter), shuning
                        // uchun bu yerda foydalanuvchi autentifikatsiyasi so'ralmaydi:
                        // chaquvchi servis, odam emas.
                        .requestMatchers(new AntPathRequestMatcher("/internal/**")).permitAll()
                        .requestMatchers("/api/v1/admin/**").hasAuthority("ROLE_ADMIN")
                        .anyRequest().authenticated())
                .addFilterBefore(internalSecretFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(headerAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}
