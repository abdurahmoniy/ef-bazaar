package uz.efbazaar.marketplace.cards.sync;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

@Component
public class EfhubClient {

    private static final Logger log = LoggerFactory.getLogger(EfhubClient.class);

    private final RestClient http;
    private final ObjectMapper mapper;
    private final EfhubSyncProperties props;

    public EfhubClient(EfhubSyncProperties props, ObjectMapper mapper) {
        this.props = props;
        this.mapper = mapper;
        this.http = RestClient.builder()
                .defaultHeader("User-Agent", props.userAgent())
                .defaultHeader("Accept", "text/html,application/json")
                .build();
    }

    public List<IndexEntry> fetchIndex() {
        byte[] body = getBytes(URI.create(props.indexUrl()));
        try {
            return List.of(mapper.readValue(body, IndexEntry[].class));
        } catch (Exception e) {
            throw new EfhubFetchException("failed to parse player index", e);
        }
    }

    public String fetchPlayerPage(long efhubId) {
        URI uri = URI.create(props.baseUrl() + "/players/" + efhubId);
        return new String(getBytes(uri), StandardCharsets.UTF_8);
    }

    private byte[] getBytes(URI uri) {
        int attempts = Math.max(1, props.retries());
        RuntimeException last = null;
        for (int a = 1; a <= attempts; a++) {
            try {
                byte[] body = http.get()
                        .uri(uri)
                        .retrieve()
                        .body(byte[].class);
                if (body == null) {
                    throw new EfhubFetchException("empty body for " + uri);
                }
                return body;
            } catch (RuntimeException e) {
                last = e;
                log.warn("efhub fetch attempt {}/{} failed: {} ({})", a, attempts, uri, describeChain(e));
                if (a < attempts) {
                    sleep(Duration.ofSeconds(3L * a));
                }
            }
        }
        throw new EfhubFetchException("efhub fetch failed after " + attempts + " attempts: " + uri
                + " (" + describeChain(last) + ")", last);
    }

    /**
     * Every link of the cause chain, class name included.
     *
     * <p>Spring folds a transport failure into {@code ResourceAccessException}
     * whose message ends with the cause's own message — and the failures worth
     * telling apart here ({@code ClosedChannelException}, {@code EOFException},
     * an SSL reset) carry no message at all, so {@code toString()} alone logs
     * a bare {@code ": null"} and names nothing we can act on.
     */
    static String describeChain(Throwable t) {
        StringBuilder sb = new StringBuilder();
        Throwable c = t;
        for (int depth = 0; c != null && depth < 10; depth++) {
            if (!sb.isEmpty()) {
                sb.append(" <- ");
            }
            sb.append(c.getClass().getName()).append(": ")
                    .append(c.getMessage() == null ? "(no message)" : c.getMessage());
            c = c.getCause() == c ? null : c.getCause();
        }
        return sb.toString();
    }

    private static void sleep(Duration d) {
        try {
            Thread.sleep(d.toMillis());
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record IndexEntry(
            @JsonProperty("i") long id,
            @JsonProperty("e") String englishName,
            @JsonProperty("o") Integer maxOvr
    ) {}

    public static final class EfhubFetchException extends RuntimeException {
        public EfhubFetchException(String message) { super(message); }
        public EfhubFetchException(String message, Throwable cause) { super(message, cause); }
    }
}
