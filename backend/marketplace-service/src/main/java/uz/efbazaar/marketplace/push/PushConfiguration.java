package uz.efbazaar.marketplace.push;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import java.io.IOException;

@Configuration
@EnableConfigurationProperties(PushProperties.class)
public class PushConfiguration {
    @Bean(name = "pushExecutor")
    public ThreadPoolTaskExecutor pushExecutor() {
        var executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("notification-push-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(10);
        return executor;
    }

    @Bean
    public PushSender pushSender(PushProperties properties) throws IOException {
        if (!properties.isEnabled()) return (token, data) -> PushSender.Result.RETRY_LATER;
        var options = FirebaseOptions.builder()
                .setCredentials(GoogleCredentials.getApplicationDefault())
                .setConnectTimeout(5000).setReadTimeout(10000);
        if (properties.getProjectId() != null && !properties.getProjectId().isBlank()) {
            options.setProjectId(properties.getProjectId());
        }
        var app = FirebaseApp.initializeApp(options.build(), "marketplace-push");
        return new FirebasePushSender(FirebaseMessaging.getInstance(app));
    }
}
