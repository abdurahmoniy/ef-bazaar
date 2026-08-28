package uz.efbazaar.bot.broadcast;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Ommaviy jo'natish sozlamalari.
 *
 * @param messagesPerSecond Telegram turli foydalanuvchilarga sekundiga ~30
 *                          xabarga ruxsat beradi. Undan pastroq turamiz:
 *                          chegaraga urilish jo'natishni tezlashtirmaydi,
 *                          faqat 429 va kutishga olib keladi, muntazam
 *                          takrorlansa esa bot bloklanadi.
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
        if (messagesPerSecond <= 0) messagesPerSecond = 25;
        if (progressEvery <= 0) progressEvery = 50;
    }

    /** Ikki xabar orasidagi minimal tanaffus. */
    public long intervalMillis() {
        return 1000L / messagesPerSecond;
    }
}
