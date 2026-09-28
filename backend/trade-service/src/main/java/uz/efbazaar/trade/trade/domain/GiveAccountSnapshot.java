package uz.efbazaar.trade.trade.domain;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Obmenda xaridor beradigan akkountning savdo ochilgan paytdagi ko'rinishi.
 *
 * <p>Nusxa, havola emas: savdo davomida xaridor akkountni tahrirlasa ham
 * ikkala taraf kelishilgan narsani ko'radi. Sotuvchi esa xaridorning shaxsiy
 * akkountlarini boshqa yo'l bilan o'qiy olmaydi.
 */
public record GiveAccountSnapshot(UUID id, String title, String coverMessageId,
                                  String summary, Integer teamStrength) {

    public Map<String, Object> toMap() {
        Map<String, Object> m = new HashMap<>();
        m.put("title", title);
        m.put("coverMessageId", coverMessageId);
        m.put("summary", summary);
        m.put("teamStrength", teamStrength);
        return m;
    }

    public static GiveAccountSnapshot fromMap(UUID id, Map<String, Object> m) {
        if (id == null) return null;
        if (m == null) return new GiveAccountSnapshot(id, null, null, "", null);
        Object ts = m.get("teamStrength");
        return new GiveAccountSnapshot(id,
                (String) m.get("title"),
                (String) m.get("coverMessageId"),
                m.get("summary") == null ? "" : m.get("summary").toString(),
                ts instanceof Number n ? n.intValue() : null);
    }
}
