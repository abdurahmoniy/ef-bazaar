package uz.efbazaar.bot.broadcast;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Ommaviy jo'natish sozlamalari.
 *
 * @param messagesPerSecond Telegram turli foydalanuvchilarga sekundiga ~30
 *                          xabarga ruxsat beradi. Undan sezilarli pastroq
 *                          turamiz, chunki chegara BUTUN BOT uchun umumiy:
 *                          chat bildirishnomalari, ro'yxatdan o'tish xabarlari
 *                          va Telegramga ketadigan loglar ham shu 30 dan
 *                          yeydi, lekin bu jilovga kirmaydi. Qoldirilgan
 *                          zaxira o'sha trafik uchun.
 * @param progressEvery     Har shuncha xabardan keyin marketplace'ga holat
 *                          yuboriladi. Har xabarda yuborish jo'natishdan
 *                          ko'ra ko'proq trafik yaratardi.
 */
@ConfigurationProperties(prefix = "app.broadcast")
public record BroadcastProperties(
        int messagesPerSecond,
        int progressEvery
) {
    public BroadcastProperties {
        if (messagesPerSecond <= 0) messagesPerSecond = 20;
        if (progressEvery <= 0) progressEvery = 50;
    }

    /** Ikki xabar orasidagi minimal tanaffus. */
    public long intervalMillis() {
        return 1000L / messagesPerSecond;
    }
}
