package uz.efbazaar.marketplace.config;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import jakarta.servlet.DispatcherType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import uz.efbazaar.marketplace.security.HeaderAuthenticationFilter;
import uz.efbazaar.marketplace.security.InternalApiProperties;
import uz.efbazaar.marketplace.security.InternalSecretFilter;

@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(InternalApiProperties.class)
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
                .authorizeHttpRequests(auth -> auth
                        // The ERROR dispatch, or every unhandled failure comes
                        // back as a 401. Spring re-dispatches an exception to
                        // /error, the chain runs again on that dispatch, and
                        // /error matches nothing below — so the status the
                        // caller needs is replaced by one about authentication.
                        // payment-service turned a "not enough money" 409 into
                        // a 401 exactly this way, and no trade could be accepted.
                        .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.ASYNC).permitAll()
                        // Public — browse listings
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/listings",
                                "/api/v1/listings/*",
                                "/api/v1/listings/user/*").permitAll()
                        // Public — card picker (read-only player card lookup)
                        .requestMatchers(HttpMethod.GET, "/api/v1/cards/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/card-interest/apply").permitAll()
                        // Kanaldagi post havolasining bosilishi. ANONIM ham
                        // yoziladi: ro'yxatdan o'tmagan odam aynan kanal olib
                        // kelgan odam, va uni sanamaslik konversiyaning
                        // boshini yo'qotish demak.
                        .requestMatchers(HttpMethod.POST, "/api/v1/partners/click").permitAll()
                        // Kanal tanlash paneli — e'lon berayotgan sotuvchi ko'radi.
                        .requestMatchers(HttpMethod.GET, "/api/v1/partners/channels").permitAll()
                        // Gamer Card: /me needs the auth principal (declared
                        // first — first match wins), any other id is public
                        // (share page, listing seller card).
                        .requestMatchers("/api/v1/gamer-cards/me").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/gamer-cards/*").permitAll()
                        // Public — qora ro'yxat (rate limit nginx'da)
                        .requestMatchers(HttpMethod.GET, "/api/v1/blacklist", "/api/v1/blacklist/check").permitAll()
                        // Public — attribute definitions (form rendering + filter discovery)
                        .requestMatchers(HttpMethod.GET, "/api/v1/attributes", "/api/v1/attributes/*").permitAll()
                        // Public — health
                        .requestMatchers("/actuator/**", "/api/v1/ping").permitAll()
                        // Public — OpenAPI (api.* subdomain nginx basic auth ostida)
                        .requestMatchers(
                                "/v3/api-docs/**",
                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/swagger-resources/**",
                                "/webjars/**").permitAll()
                        // Admin — attribute + future admin operations
                        .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                        // Internal server-to-server (e.g. Chempionat-X trust bridge).
                        // Auth handled by InternalSecretFilter (X-Internal-Secret)
                        // which runs first; nginx blocks the prefix externally.
                        .requestMatchers("/internal/**").permitAll()
                        // Hamma boshqa endpoint auth talab qiladi
                        .anyRequest().authenticated())
                .addFilterBefore(internalSecretFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(headerAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}
