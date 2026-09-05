package uz.efbazaar.marketplace.partner.ads;

import uz.efbazaar.marketplace.domain.Listing;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Preview uchun namuna e'lon.
 *
 * <p>Doim bir xil: hamkor sozlamani o'zgartirganda faqat o'zgarish
 * ko'rinishi kerak. E'lon ham almashsa, nima nimadan o'zgarganini
 * ajratib bo'lmasdi.
 *
 * <p>HAMMA maydon to'ldirilgan — hamkor o'chiq blokni yoqib
 * ko'rmoqchi bo'lganda u bo'sh chiqmasligi kerak, aks holda blok
 * ishlamayaptidek tuyulardi.
 */
final class ChannelPostSample {

    private ChannelPostSample() {}

    static Listing listing() {
        Listing l = new Listing();
        l.setId(UUID.fromString("00000000-0000-0000-0000-000000000001"));
        l.setPrice(new BigDecimal("6000000"));
        l.setPriceNegotiable(true);
        l.setDescription("Akkaunt 2 yil o'ynalgan, hamma karta o'zimniki. "
                + "Tez sotaman, narxda kelishamiz.");

        Map<String, Object> a = new LinkedHashMap<>();
        a.put("highest_division_level", 1);
        a.put("team_strength", 3200);
        a.put("players_count", 200);
        a.put("valuable_players", List.of(
                Map.of("name", "K. Heinz Rummenigge"),
                Map.of("name", "Alessandro Del Piero"),
                Map.of("name", "Ronaldinho"),
                Map.of("name", "Zinedine Zidane")));
        a.put("android_coins", 300);
        a.put("ios_coins", 150);
        a.put("has_google_play_link", true);
        a.put("has_game_center_link", true);
        a.put("platform", "Mobile");
        a.put("exchange_mode", "Faqat obmen");
        a.put("device_transfer_limit", 3);
        l.setAttributes(a);
        return l;
    }
}
