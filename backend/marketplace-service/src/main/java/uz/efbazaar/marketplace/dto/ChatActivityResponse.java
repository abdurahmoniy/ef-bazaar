package uz.efbazaar.marketplace.dto;

import java.time.Instant;

public record ChatActivityResponse(boolean online, boolean typing, Instant lastSeenAt, Instant lastReadAt) {}
