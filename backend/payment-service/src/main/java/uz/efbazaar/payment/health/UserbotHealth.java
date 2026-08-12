package uz.efbazaar.payment.health;

import org.springframework.stereotype.Component;

/** Heartbeat freshness. Task 5 wires the real Kafka-fed implementation. */
@Component
public class UserbotHealth {
    public boolean isHealthy() {
        return true;
    }
}
