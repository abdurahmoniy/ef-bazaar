package uz.efbazaar.bot.broadcast;

/** marketplace-service'ga qaytariladigan holat. */
public record BroadcastProgress(
        Status status,
        int totalRecipients,
        int sentCount,
        int failedCount,
        int blockedCount,
        String errorMessage
) {
    public enum Status { QUEUED, SENDING, SENT, FAILED }
}
