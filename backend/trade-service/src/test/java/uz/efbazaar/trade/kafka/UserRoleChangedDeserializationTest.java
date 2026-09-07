package uz.efbazaar.trade.kafka;

import org.apache.kafka.common.header.Headers;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.serializer.JsonDeserializer;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * auth-service publishes this topic with Spring's {@code JsonSerializer}, which
 * stamps its OWN class name into a {@code __TypeId__} header. trade-service does
 * not have that class and never will — the DTO is deliberately mirrored locally
 * so the two services stay independently deployable.
 *
 * <p>A {@code JsonDeserializer} trusts that header over
 * {@code value.default.type}, so every record on this topic died with
 * {@code ClassNotFoundException} inside {@code poll()}. That is not a failure the
 * listener error handler can catch: the offset was never committed, so the
 * container re-polled the same record for ever. On 2026-09-07 it produced
 * 669,000 log lines a minute, pinned trade-service at 1.5 cores and the log
 * shipper at another 1.6, and would have filled the disk within the day.
 *
 * <p>The test reads the listener's real annotation rather than a copy of it, so
 * it fails if the property is dropped from the consumer later.
 */
class UserRoleChangedDeserializationTest {

    private static final String TOPIC = "efbazaar.auth.user-role-changed";
    /** What auth-service's JsonSerializer actually stamps on the record. */
    private static final String FOREIGN_TYPE = "uz.efbazaar.auth.event.AuthEvents$UserRoleChanged";

    /** The listener's own configuration, so the test cannot drift from it. */
    private static Map<String, Object> listenerProperties() throws Exception {
        KafkaListener listener = UserRoleChangedConsumer.class
                .getMethod("onRoleChanged", UserRoleChangedDto.class)
                .getAnnotation(KafkaListener.class);
        Map<String, Object> props = new HashMap<>();
        Arrays.stream(listener.properties())
                .map(entry -> entry.split("=", 2))
                .forEach(kv -> props.put(kv[0], kv[1]));
        // Set globally in application.yml rather than on the listener.
        props.put(JsonDeserializer.TRUSTED_PACKAGES, "uz.efbazaar.*");
        return props;
    }

    @Test
    @DisplayName("a record carrying auth-service's type header deserialises into the local DTO")
    void deserialisesDespiteTheForeignTypeHeader() throws Exception {
        Headers headers = new RecordHeaders();
        headers.add("__TypeId__", FOREIGN_TYPE.getBytes(StandardCharsets.UTF_8));
        byte[] payload = ("""
                {"userId":"3f8c1a20-0000-4000-8000-000000000001",
                 "oldRole":"ROLE_USER","newRole":"TRADE_ADMIN",
                 "occurredAt":"2026-09-07T10:00:00Z"}
                """).getBytes(StandardCharsets.UTF_8);

        Object value;
        try (JsonDeserializer<Object> deserializer = new JsonDeserializer<>()) {
            deserializer.configure(listenerProperties(), false);
            value = deserializer.deserialize(TOPIC, headers, payload);
        }

        assertThat(value).isInstanceOf(UserRoleChangedDto.class);
        UserRoleChangedDto dto = (UserRoleChangedDto) value;
        assertThat(dto.grantsTradeAdmin()).isTrue();
        assertThat(dto.userId()).hasToString("3f8c1a20-0000-4000-8000-000000000001");
    }
}
