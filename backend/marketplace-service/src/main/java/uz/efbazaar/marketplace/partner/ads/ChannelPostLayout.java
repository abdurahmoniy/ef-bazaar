package uz.efbazaar.marketplace.partner.ads;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Hamkor kanalidagi post ko'rinishi: qaysi bloklar, qaysi tartibda.
 *
 * <p>Har kanalning o'z auditoriyasi bor: kimdir tavsifni eng yuqorida
 * ko'rsatadi, kimdir raqamlardan boshlaydi. Shuning uchun tartib ham,
 * yoqilganlik ham hamkorda.
 *
 * <p>SARLAVHA va efBazaar HAVOLASI bu ro'yxatda yo'q. Havola majburiy:
 * rasmiy kanalga forward qilingan nusxa inline tugmani yo'qotadi va
 * e'longa yagona yo'l o'sha matndagi havola bo'lib qoladi — uni
 * o'chirsa forward qilingan post o'lik bo'lardi.
 */
public record ChannelPostLayout(List<Block> blocks) {

    /**
     * Blok — postdagi bitta qator yoki abzas.
     *
     * <p>Kalitlar SAQLANADI, ya'ni nomini o'zgartirish eski
     * sozlamalarni buzadi. Yangi blok qo'shilsa u oxiriga, o'chiq
     * holda tushadi — mavjud hamkorlarning posti o'zgarmasligi kerak.
     */
    public enum Block {
        HEADER,
        PRICE,
        STRENGTH,
        PLAYERS,
        COINS,
        DESCRIPTION,
        LINKS,
        PLATFORM,
        EXCHANGE,
        DEVICE_LIMIT
    }

    /**
     * Sozlanmagan kanalning ko'rinishi.
     *
     * <p>Bugungi postning aynan o'zi: narx, kuch, kartalar, coinlar va
     * tavsif. Qolganlari o'chiq — ular ko'p e'londa bo'sh yoki
     * takroriy va postni uzaytirib, rasm ostidagi chegaradan yeydi.
     */
    public static final List<Block> DEFAULT_ORDER = List.of(
            Block.HEADER, Block.PRICE, Block.STRENGTH, Block.PLAYERS,
            Block.COINS, Block.DESCRIPTION,
            Block.LINKS, Block.PLATFORM, Block.EXCHANGE, Block.DEVICE_LIMIT);

    private static final Set<Block> DEFAULT_ENABLED = Set.of(
            Block.HEADER, Block.PRICE, Block.STRENGTH, Block.PLAYERS,
            Block.COINS, Block.DESCRIPTION);

    public static ChannelPostLayout defaults() {
        return new ChannelPostLayout(DEFAULT_ORDER.stream()
                .filter(DEFAULT_ENABLED::contains)
                .toList());
    }

    /**
     * Saqlangan tartibni o'qiydi.
     *
     * <p>NOMA'LUM kalit e'tiborsiz qoldiriladi: blok o'chirilgan yoki
     * nomi o'zgargan bo'lsa, butun sozlama yiqilib post bo'sh
     * chiqmasligi kerak. Bo'sh ro'yxat esa default'ga qaytaradi —
     * hech narsasiz post e'lon haqida hech narsa aytmaydi.
     */
    public static ChannelPostLayout parse(List<String> keys) {
        if (keys == null || keys.isEmpty()) return defaults();
        Set<Block> seen = new LinkedHashSet<>();
        for (String key : keys) {
            if (key == null) continue;
            try {
                seen.add(Block.valueOf(key.trim().toUpperCase()));
            } catch (IllegalArgumentException ignored) {
                // Noma'lum blok — o'tkazib yuboriladi.
            }
        }
        return seen.isEmpty() ? defaults() : new ChannelPostLayout(List.copyOf(seen));
    }

    public List<String> keys() {
        return blocks.stream().map(Enum::name).toList();
    }

    public boolean has(Block block) {
        return blocks.contains(block);
    }

    /** Tanlanmaganlari ham kerak: sozlash ekrani hammasini ko'rsatadi. */
    public List<Block> disabled() {
        List<Block> out = new ArrayList<>(DEFAULT_ORDER);
        out.removeAll(blocks);
        return out;
    }
}
