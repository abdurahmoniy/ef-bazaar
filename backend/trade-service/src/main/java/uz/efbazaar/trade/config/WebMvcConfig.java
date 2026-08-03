package uz.efbazaar.trade.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import uz.efbazaar.trade.admin.presence.PresenceTouchInterceptor;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final PresenceTouchInterceptor presenceTouch;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Health and swagger are excluded so an uptime probe cannot make a
        // logged-out admin look online.
        registry.addInterceptor(presenceTouch)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/v1/ping");
    }
}
