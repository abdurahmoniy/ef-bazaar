package uz.efbazaar.outbox.internal;

/** Serializer chiqargan baytlar va u qo'shgan headerlar (JSON). */
public record EncodedMessage(byte[] payload, String headersJson) {
}
