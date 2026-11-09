package uz.efbazaar.bot.channel;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * Kanalga obuna bo'lish va chiqib ketishni ({@code chat_member}) marketplace'ga
 * uzatadi.
 *
 * <p>Nega kerak: login uchun kanalga obuna majburiy, lekin ba'zilar kirgach
 * chiqib ketadi. Buni ko'rmasak, kanal nega o'smayotgani noma'lum bo'lib qoladi.
 *
 * <p>Telegram bu update'ni faqat bot ADMIN bo'lgan kanallardan yuboradi. Bot
 * hamkor kanallarda ham admin bo'lishi mumkin — qaysi kanal hisobga olinishini
 * marketplace hal qiladi (faqat rasmiy kanal), bot hammasini uzatadi.
 */
@Component
@RequiredArgsConstructor
public class ChannelMemberTracker {

    public enum Kind { JOIN, LEAVE }

    /** "A'zo" hisoblanadigan maqomlar. {@code restricted} da {@code is_member} alohida bayroq. */
    private static final Set<String> MEMBER = Set.of("creator", "administrator", "member");

    private final ChannelMemberClient client;

    public void handle(JsonNode chatMember) {
        Kind kind = kind(chatMember);
        if (kind == null) return;
        JsonNode chat = chatMember.path("chat");
        client.report(
                chat.path("id").asLong(),
                chat.path("username").asText(""),
                chatMember.path("new_chat_member").path("user").path("id").asLong(),
                kind,
                chatMember.path("date").asLong());
    }

    /** @return JOIN, LEAVE yoki — rol o'zgarishi, guruh, noma'lum shakl — null. */
    static Kind kind(JsonNode chatMember) {
        if (!"channel".equals(chatMember.path("chat").path("type").asText())) return null;
        boolean was = isMember(chatMember.path("old_chat_member"));
        boolean is = isMember(chatMember.path("new_chat_member"));
        if (!was && is) return Kind.JOIN;
        if (was && !is) return Kind.LEAVE;
        return null;
    }

    private static boolean isMember(JsonNode member) {
        String status = member.path("status").asText("");
        if (MEMBER.contains(status)) return true;
        return "restricted".equals(status) && member.path("is_member").asBoolean(false);
    }
}
