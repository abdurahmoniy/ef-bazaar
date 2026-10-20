package uz.efbazaar.marketplace.partner.ads;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.PartnerSettings;
import uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerSettingsRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Reklama bozorining qoidalari haqiqiy Postgres ustida.
 *
 * <p>NEGA HAQIQIY BAZA. Bu yerdagi qoidalar — bitta e'lon bitta
 * kanalga bir marta, holatlar ro'yxati, foiz shifti, narx chegaralari —
 * kodda emas, CHECK va UNIQUE da yashaydi. Mock'li sinov ularni umuman
 * ishlatmaydi.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
// Dispose the Spring context while its class-owned database is still running.
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
@Import(PartnerAdSchemaIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class PartnerAdSchemaIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired TestEntityManager em;
    @Autowired PartnerChannelRepository channels;
    @Autowired ListingChannelPostRepository posts;
    @Autowired PartnerSettingsRepository settingsRepository;
    @Autowired PartnerAdRepositories.PartnerClickRepository clicks;
    @Autowired PartnerAdRepositories.ListingPartnerAttributionRepository attributions;

    @Test
    @DisplayName("bir e'lonni bir kanalga qayta yuborish mumkin")
    void aListingMayBeRepostedToTheSameChannel() {
        // Faol kanalda e'lonlar tez aylanadi va bir kunda pastga tushib
        // ketadi. Yagona chora — qaytadan chiqarish, va bu har safar
        // alohida to'lanadigan alohida xizmat. Ilgari buni
        // uk_listing_channel_posts qulflab turardi.
        PartnerChannel channel = savedChannel("Efootball Uz", 50_239, new BigDecimal("10000.00"));
        UUID listing = UUID.randomUUID();
        posts.saveAndFlush(post(UUID.randomUUID(), listing, channel, "POSTED"));

        // Native INSERT: save() mavjud kalitni merge qiladi va cheklov
        // umuman qatnashmaydi — repozitoriy orqali sinasak, biz
        // tekshirmoqchi bo'lgan qoidani emas, Hibernate xatti-harakatini
        // sinagan bo'lardik.
        int inserted = em.getEntityManager()
                .createNativeQuery("""
                        insert into listing_channel_posts
                            (id, order_id, listing_id, partner_channel_id, price_som, state, created_at)
                        values (?1, ?2, ?3, ?4, 10000.00, 'HELD', now())
                        """)
                .setParameter(1, UUID.randomUUID())
                .setParameter(2, UUID.randomUUID())
                .setParameter(3, listing)
                .setParameter(4, channel.getId())
                .executeUpdate();

        assertThat(inserted).isEqualTo(1);
    }

    @Test
    @DisplayName("a state the code does not know is rejected")
    void unknownStateRejected() {
        PartnerChannel channel = savedChannel("Test", 1000, new BigDecimal("5000.00"));
        ListingChannelPost bad = post(UUID.randomUUID(), UUID.randomUUID(), channel, "PENDING");

        assertThatThrownBy(() -> posts.saveAndFlush(bad))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("a percentage above 100% is rejected")
    void percentCeiling() {
        PartnerChannel channel = channel("Test", 1000, new BigDecimal("5000.00"));
        channel.setTradePercentBp(10_001);

        assertThatThrownBy(() -> channels.saveAndFlush(channel))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("the global payout defaults are seeded on the existing settings row")
    void settingsDefaultsSeeded() {
        PartnerSettings settings = settingsRepository.findById(PartnerSettings.SINGLETON_ID).orElseThrow();

        assertThat(settings.getDefaultPayoutMode()).isEqualTo("PERCENT");
        assertThat(settings.getDefaultTradePercentBp()).isEqualTo(1000);
        assertThat(settings.getDefaultFixedMonthlySom()).isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("a payout percentage above 100% is rejected on the global settings too")
    void globalPercentCeiling() {
        PartnerSettings settings = settingsRepository.findById(PartnerSettings.SINGLETON_ID).orElseThrow();
        settings.setDefaultTradePercentBp(10_001);

        assertThatThrownBy(() -> settingsRepository.saveAndFlush(settings))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("prefix search is case-insensitive and skips inactive channels")
    void prefixSearchAgainstPostgres() {
        savedChannel("Premium Efootball", 4_219, new BigDecimal("5000"));
        savedChannel("Prefer Efootball", 2_334, new BigDecimal("5000"));
        savedChannel("Boshqa kanal", 9_999, new BigDecimal("5000"));

        PartnerChannel closed = savedChannel("Premium yopiq", 8_000, new BigDecimal("5000"));
        closed.setActive(false);
        channels.saveAndFlush(closed);

        var found = channels.findByActiveTrueAndTitleStartsWithIgnoreCaseOrderBySubscriberCountDesc("PRE");

        assertThat(found).extracting(PartnerChannel::getTitle)
                .containsExactly("Premium Efootball", "Prefer Efootball");
    }

    @Test
    @DisplayName("the last click wins, against a real database")
    void attributionIsUpserted() {
        PartnerChannel first = savedChannel("Birinchi", 100, new BigDecimal("5000"));
        PartnerChannel second = savedChannel("Ikkinchi", 200, new BigDecimal("5000"));
        UUID listing = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();

        attributions.saveAndFlush(new ListingPartnerAttribution(listing, buyer, first.getId()));

        ListingPartnerAttribution again = attributions
                .findById(new ListingPartnerAttribution.Key(listing, buyer)).orElseThrow();
        again.setPartnerChannelId(second.getId());
        attributions.saveAndFlush(again);

        // Bitta juftlik — bitta qator, va u oxirgi kanalni ko'rsatadi.
        assertThat(attributions.count()).isEqualTo(1);
        assertThat(attributions.findById(new ListingPartnerAttribution.Key(listing, buyer))
                .orElseThrow().getPartnerChannelId()).isEqualTo(second.getId());
    }

    @Test
    @DisplayName("a click kind the code does not know is rejected")
    void unknownClickKindRejected() {
        PartnerChannel channel = savedChannel("Test", 100, new BigDecimal("5000"));
        PartnerClick bad = new PartnerClick(channel.getId(), PartnerClick.Kind.LISTING, null, null);
        bad.setKind("SOMETHING");

        assertThatThrownBy(() -> clicks.saveAndFlush(bad))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("bekor qilingan hamkorlik yonida yangisi ochila oladi")
    void aClosedPartnershipDoesNotBlockARejoin() {
        // Bekor qilishda qator O'CHIRILMAYDI — chiqib bo'lgan postlar va
        // ular keltirgan savdolar unga bog'langan. Ilgari cheklov butun
        // jadval bo'yicha edi va qayta tasdiqlash shu yerda yiqilardi:
        // duplicate key ... partner_channels_telegram_channel_id_key.
        long telegramChannel = ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE);

        PartnerChannel closed = channel("Eski hamkorlik", 5_000, BigDecimal.ZERO);
        closed.setTelegramChannelId(telegramChannel);
        closed.setActive(false);
        channels.saveAndFlush(closed);

        PartnerChannel reopened = channel("Qayta hamkorlik", 5_000, BigDecimal.ZERO);
        reopened.setTelegramChannelId(telegramChannel);

        assertThat(channels.saveAndFlush(reopened).getId()).isNotNull();
    }

    @Test
    @DisplayName("bitta kanalda ikkita TIRIK hamkorlik bo'la olmaydi")
    void oneLivePartnershipPerChannel() {
        // Cheklov yumshatildi, lekin yo'qolmadi: ikkita faol qator
        // bo'lsa e'lon qaysi hamkorga pul keltirishi noaniq bo'lardi va
        // bozorda kanal ikki marta ko'rinardi.
        long telegramChannel = ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE);

        PartnerChannel first = channel("Birinchi", 5_000, BigDecimal.ZERO);
        first.setTelegramChannelId(telegramChannel);
        channels.saveAndFlush(first);

        PartnerChannel second = channel("Ikkinchi", 5_000, BigDecimal.ZERO);
        second.setTelegramChannelId(telegramChannel);

        assertThatThrownBy(() -> channels.saveAndFlush(second))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private PartnerChannel channel(String title, int subscribers, BigDecimal price) {
        PartnerChannel c = new PartnerChannel();
        c.setId(UUID.randomUUID());
        c.setPartnerUserId(UUID.randomUUID());
        c.setApplicationId(UUID.randomUUID());
        c.setTelegramChannelId(ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE));
        c.setTitle(title);
        c.setSubscriberCount(subscribers);
        c.setSubscriberSyncedAt(Instant.now());
        c.setLinkCode(UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        c.setPostPriceSom(price);
        return c;
    }

    private PartnerChannel savedChannel(String title, int subscribers, BigDecimal price) {
        return channels.saveAndFlush(channel(title, subscribers, price));
    }

    private ListingChannelPost post(UUID orderId, UUID listingId, PartnerChannel channel, String state) {
        ListingChannelPost p = new ListingChannelPost();
        p.setId(UUID.randomUUID());
        p.setOrderId(orderId);
        p.setListingId(listingId);
        p.setPartnerChannelId(channel.getId());
        p.setPriceSom(channel.getPostPriceSom());
        p.setState(state);
        return p;
    }

    /**
     * Sinov uchun minimal kontekst.
     *
     * <p>{@code considerNestedRepositories} SHART — repozitoriylar
     * {@code PartnerAdRepositories} ichida ichma-ich e'lon qilingan va
     * Spring Data ularni standart holatda skanerlamaydi.
     */
    // BITTA sinf yetarli: u `partner` paketini VA uning quyi
    // paketlarini qamraydi. Ikkalasini sanasak `ads` ikki marta
    // skanerlanadi va bir xil repozitoriy ikki marta ro'yxatga
    // olinmoqchi bo'lib kontekst yiqiladi.
    @org.springframework.boot.autoconfigure.domain.EntityScan(
            basePackageClasses = PartnerChannel.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(
            basePackageClasses = PartnerChannel.class,
            considerNestedRepositories = true)
    static class Config {}
}
