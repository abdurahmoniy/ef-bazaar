package uz.efbazaar.outbox;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("outbox")
public class OutboxProperties {

    /** false bo'lsa hech bir outbox bean'i yaratilmaydi. */
    private boolean enabled = true;
    private final Relay relay = new Relay();
    private final Cleanup cleanup = new Cleanup();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Relay getRelay() { return relay; }
    public Cleanup getCleanup() { return cleanup; }

    public static class Relay {
        /** Zaxira polling; odatda relay commit'da uyg'onadi. */
        private Duration pollInterval = Duration.ofMillis(500);
        private int batchSize = 100;
        /** Bitta yozuvning Kafka tasdig'ini kutish chegarasi — qulf shundan uzoq ushlanmaydi. */
        private Duration sendTimeout = Duration.ofSeconds(10);

        public Duration getPollInterval() { return pollInterval; }
        public void setPollInterval(Duration pollInterval) { this.pollInterval = pollInterval; }
        public int getBatchSize() { return batchSize; }
        public void setBatchSize(int batchSize) { this.batchSize = batchSize; }
        public Duration getSendTimeout() { return sendTimeout; }
        public void setSendTimeout(Duration sendTimeout) { this.sendTimeout = sendTimeout; }
    }

    public static class Cleanup {
        private Duration retention = Duration.ofDays(7);
        private String cron = "0 15 3 * * *";

        public Duration getRetention() { return retention; }
        public void setRetention(Duration retention) { this.retention = retention; }
        public String getCron() { return cron; }
        public void setCron(String cron) { this.cron = cron; }
    }
}
