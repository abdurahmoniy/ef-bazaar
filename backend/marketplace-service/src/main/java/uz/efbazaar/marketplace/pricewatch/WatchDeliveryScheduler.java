package uz.efbazaar.marketplace.pricewatch;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.Instant;

@Slf4j @Component
public class WatchDeliveryScheduler {
    private final WatchDeliveryWorkflow workflow;
    public WatchDeliveryScheduler(WatchDeliveryWorkflow workflow){this.workflow=workflow;}
    @Scheduled(fixedDelayString="${app.watch.poll-ms:5000}",initialDelayString="${app.watch.initial-delay-ms:15000}")
    public void deliver(){try{workflow.process(Instant.now());}catch(Exception e){log.error("Durable watch sweep failed; pending work remains retryable",e);}}
}
