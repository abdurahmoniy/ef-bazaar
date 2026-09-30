package uz.efbazaar.outbox.internal;

/** outbox_events dan olingan, hali yuborilmagan yozuv. */
public record OutboxRow(long id, String topic, String key, byte[] payload, String headersJson) {
}
