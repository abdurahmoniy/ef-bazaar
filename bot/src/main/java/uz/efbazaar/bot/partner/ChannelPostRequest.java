package uz.efbazaar.bot.partner;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.UUID;

/**
 * {@code efbazaar.marketplace.channel-post-requested} — sotuvchi to'lagan
 * e'lonni hamkor kanaliga joylash buyrug'i.
 *
 * <p>{@code mediaMessageId} nomiga qaramay Telegram {@code file_id} saqlaydi:
 * listing'ning {@code mediaMessageIds} ro'yxati ham aynan shu — bot media
 * yuklaganda qaytargan {@code file_id} lar. {@code sendPhoto} ga beriladigan
 * qiymat ham shu bo'lishi shart, message_id emas.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ChannelPostRequest(
        UUID postId,
        UUID listingId,
        Long telegramChannelId,
        String caption,
        String mediaMessageId,
        String buttonUrl) {}
