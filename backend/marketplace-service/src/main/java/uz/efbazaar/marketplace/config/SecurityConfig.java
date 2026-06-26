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
                        // Public — health
                        .requestMatchers("/actuator/**", "/api/v1/ping").permitAll()
                        // Hamma boshqa endpoint auth talab qiladi
                        .anyRequest().authenticated())
                .addFilterBefore(headerAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}
