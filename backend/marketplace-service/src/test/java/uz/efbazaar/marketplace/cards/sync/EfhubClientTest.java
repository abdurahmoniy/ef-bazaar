package uz.efbazaar.marketplace.cards.sync;

import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;

import java.io.IOException;
import java.nio.channels.ClosedChannelException;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EfhubClientTest {

    /**
     * The production symptom: Spring reports {@code I/O error on GET ...: null}
     * because several transport failures carry no message, so the log named no
     * cause at all and the failure could not be diagnosed.
     */
    @Test
    void describesMessagelessRootCauseByClassName() {
        Throwable failure = new ResourceAccessException(
                "I/O error on GET request for \"https://efhub.com/search/player-index.json\": null",
                new ClosedChannelException());

        String described = EfhubClient.describeChain(failure);

        assertTrue(described.contains("java.nio.channels.ClosedChannelException"),
                "root cause class must be named, was: " + described);
        assertFalse(described.endsWith(": null"),
                "a missing message must not read as \"null\", was: " + described);
    }

    @Test
    void keepsEveryLinkOfTheChain() {
        Throwable failure = new ResourceAccessException("outer",
                new IOException("middle", new ClosedChannelException()));

        String described = EfhubClient.describeChain(failure);

        assertTrue(described.contains("ResourceAccessException"), described);
        assertTrue(described.contains("IOException: middle"), described);
        assertTrue(described.contains("ClosedChannelException"), described);
    }

    @Test
    void terminatesOnACyclicCauseChain() {
        Throwable cyclic = new IllegalStateException("boom") {
            @Override
            public synchronized Throwable getCause() {
                return this;
            }
        };

        String described = EfhubClient.describeChain(cyclic);

        assertTrue(described.contains("boom"), described);
    }

}
