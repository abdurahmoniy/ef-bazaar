package uz.efbazaar.trade.mailbox.link;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

/** Ends link-session steps whose time ran out, so the worker stops watching the box. */
@Slf4j
@Component
@RequiredArgsConstructor
public class LinkSessionSweeper {

    private final LinkSessionService sessions;

    @Scheduled(fixedDelayString = "${trade.mailbox.link-sweep-ms:30000}")
    public void sweep() {
        int n = sessions.expireDue(Instant.now());
        if (n > 0) log.info("Expired {} link session step(s)", n);
    }
}
