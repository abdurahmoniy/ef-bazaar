package uz.efbazaar.outbox.internal;

import java.time.Instant;

/** "Shu entity o'zgardi" belgisi. markedAt — relay faqat o'zi ko'rgan belgini o'chirishi uchun. */
public record SnapshotMark(String source, String entityId, Instant markedAt) {
}
