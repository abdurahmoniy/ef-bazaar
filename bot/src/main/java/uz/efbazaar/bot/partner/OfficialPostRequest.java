package uz.efbazaar.bot.partner;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.UUID;

/**
 * E'lonni efBazaar rasmiy kanaliga chiqarish.
 *
 * <p>{@code sourceMessageId} to'ldirilgan bo'lsa FORWARD, aks holda
 * to'g'ridan-to'g'ri joylash.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record OfficialPostRequest(
        UUID listingId,
        String officialChannel,
        String caption,
        String mediaFileId,
        String buttonUrl,
        Long sourceChannelId,
        String sourceMessageId) {

    public boolean isForward() {
        return sourceChannelId != null && sourceMessageId != null && !sourceMessageId.isBlank();
    }
}
