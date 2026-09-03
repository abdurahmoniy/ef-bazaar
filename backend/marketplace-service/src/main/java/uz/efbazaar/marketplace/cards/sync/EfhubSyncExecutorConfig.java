package uz.efbazaar.marketplace.cards.sync;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * A worker of its own for manually triggered syncs.
 *
 * <p>A run holds its thread for minutes (one player page every 5s), so it must
 * not share Boot's {@code applicationTaskExecutor} with request-scoped async
 * work. One thread, because {@link EfhubSyncService} serialises runs anyway.
 */
@Configuration
public class EfhubSyncExecutorConfig {

    @Bean("efhubSyncExecutor")
    public Executor efhubSyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setQueueCapacity(1);
        executor.setThreadNamePrefix("efhub-sync-");
        executor.setWaitForTasksToCompleteOnShutdown(false);
        executor.initialize();
        return executor;
    }
}
