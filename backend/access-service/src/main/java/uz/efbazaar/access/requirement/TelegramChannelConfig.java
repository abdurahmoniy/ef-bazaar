package uz.efbazaar.access.requirement;

import java.util.HashMap;
import java.util.Map;

/**
 * {@link RequirementType#TELEGRAM_CHANNEL} ning {@code config} shakli.
 *
 * <p>Tekshiruv {@code chatId} bo'yicha ketadi: kanal egasi username'ni
 * o'zgartirsa ham shart buzilmaydi. Username, nom va rasm faqat ko'rsatish
 * uchun — ular qo'shilgan paytdagi holat.
 */
public record TelegramChannelConfig(long chatId, String username, String title, String photoFileId) {

    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>();
        map.put("chatId", chatId);
        map.put("username", username);
        map.put("title", title);
        map.put("photoFileId", photoFileId);
        return map;
    }

    public static TelegramChannelConfig fromMap(Map<String, Object> map) {
        Object chatId = map.get("chatId");
        return new TelegramChannelConfig(
                chatId instanceof Number n ? n.longValue() : Long.parseLong(String.valueOf(chatId)),
                (String) map.get("username"),
                (String) map.get("title"),
                (String) map.get("photoFileId"));
    }

    public String url() {
        return username == null ? null : "https://t.me/" + username;
    }
}
