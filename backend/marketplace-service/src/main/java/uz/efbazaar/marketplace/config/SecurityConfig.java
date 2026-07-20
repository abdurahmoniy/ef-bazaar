package uz.efbazaar.marketplace.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import uz.efbazaar.marketplace.security.HeaderAuthenticationFilter;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final HeaderAuthenticationFilter headerAuthFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth
                        // Public — browse listings
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/listings",
                                "/api/v1/listings/*").permitAll()
                        // Public — card picker (read-only player card lookup)
                        .requestMatchers(HttpMethod.GET, "/api/v1/cards/**").permitAll()
                        // Gamer Card: /me needs the auth principal (declared
                        // first — first match wins), any other id is public
                        // (share page, listing seller card).
                        .requestMatchers("/api/v1/gamer-cards/me").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/gamer-cards/*").permitAll()
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
                        // Hamma boshqa endpoint auth talab qiladi
                        .anyRequest().authenticated())
                .addFilterBefore(headerAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}
