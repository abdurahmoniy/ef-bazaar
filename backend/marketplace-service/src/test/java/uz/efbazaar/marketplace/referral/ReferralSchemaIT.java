package uz.efbazaar.marketplace.referral;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.referral.ReferralRepositories.PendingReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralSettingsRepository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Referal qoidalari haqiqiy Postgres ustida.
 *
 * <p>NEGA HAQIQIY BAZA. Bu yerdagi uch qoida — o'ziga referal yo'q,
 * bitta odam bitta referal, to'langan qator summasiz bo'lmaydi — kodda
 * emas, CHECK va PRIMARY KEY da yashaydi. Mock'li sinov ularni umuman
 * ishlatmaydi: u faqat kod nima qilishini tekshiradi, baza nimani rad
 * etishini emas.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(ReferralSchemaIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class ReferralSchemaIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired TestEntityManager em;
    @Autowired ReferralRepository referrals;
    @Autowired ReferralSettingsRepository settings;
    @Autowired PendingReferralRepository pending;

    @Test
    @DisplayName("a user cannot refer themselves")
    void selfReferralRejected() {
        UUID me = UUID.randomUUID();
        assertThatThrownBy(() -> referrals.saveAndFlush(new Referral(me, me, null)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    /**
     * NEGA NATIVE INSERT.
     *
     * <p>{@code JpaRepository.save} mavjud kalitli entity'ni {@code merge}
     * qiladi, {@code persist} emas — ya'ni ikkinchi marta saqlash INSERT
     * emas, UPDATE bo'lib chiqadi va birlamchi kalit umuman qatnashmaydi.
     * Repozitoriy orqali sinasak, biz tekshirmoqchi bo'lgan qoidani emas,
     * Hibernate'ning merge xatti-harakatini sinagan bo'lardik.
     *
     * <p>Kalit haqiqatan nimadan himoya qiladi: bir vaqtda kelgan ikki
     * so'rovdan. Ikkalasi ham qatorni topmaydi, ikkalasi ham INSERT
     * qiladi, va bittasi shu yerda yiqiladi — {@code ReferralService.claim}
     * uni ushlab, "da'vo qilinmadi" deb qaytaradi. Oddiy yo'ldagi
     * takrorlanishni esa xizmatning o'zi oldindan tekshiradi.
     */
    @Test
    @DisplayName("the primary key rejects a second referrer inserted concurrently")
    void onePerReferredUser() {
        UUID referred = UUID.randomUUID();
        referrals.saveAndFlush(new Referral(referred, UUID.randomUUID(), null));

        assertThatThrownBy(() -> em.getEntityManager()
                .createNativeQuery("""
                        insert into referrals (referred_user_id, referrer_user_id, created_at)
                        values (?1, ?2, now())
                        """)
                .setParameter(1, referred)
                .setParameter(2, UUID.randomUUID())
                .executeUpdate())
                // Aniq nom bilan: shunchaki "biror xato otdi" degan da'vo
                // SQL'dagi xatodan ham o'tib ketardi va sinov noto'g'ri
                // sababga ko'ra yashil bo'lardi.
                .hasMessageContaining("referrals_pkey");
    }

    @Test
    @DisplayName("a rewarded row must carry the amount that was paid")
    void rewardedAtRequiresAmount() {
        Referral r = referrals.saveAndFlush(
                new Referral(UUID.randomUUID(), UUID.randomUUID(), null));
        r.setRewardedAt(Instant.now());   // summa qo'yilmadi

        assertThatThrownBy(() -> referrals.saveAndFlush(r))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("the reward default is seeded")
    void settingsSeeded() {
        assertThat(settings.findById(ReferralSettings.SINGLETON_ID))
                .get()
                .extracting(ReferralSettings::getRewardSom)
                .isEqualTo(new BigDecimal("5000.00"));
    }

    @Test
    @DisplayName("the last bot link before registering wins")
    void pendingReferralIsUpserted() {
        long telegramId = 4242L;
        pending.saveAndFlush(new PendingReferral(telegramId, "AAAA1111"));
        pending.saveAndFlush(new PendingReferral(telegramId, "BBBB2222"));

        assertThat(pending.findById(telegramId))
                .get()
                .extracting(PendingReferral::getCode)
                .isEqualTo("BBBB2222");
    }

    /**
     * NEGA HAQIQIY BAZA.
     *
     * <p>Bu JPQL agregati interfeys proyeksiyasiga bog'lanadi va
     * taxalluslar bo'yicha moslanadi. Mock'li sinov SQL'ni umuman
     * ishlatmaydi — bunday so'rov mock ustida bemalol "ishlaydi" va
     * faqat haqiqiy drayverda yiqiladi.
     */
    @Test
    @DisplayName("the leaderboard ranks by invited count against a real database")
    void leaderboardRanks() {
        UUID busy = UUID.randomUUID();
        UUID quiet = UUID.randomUUID();
        referrals.saveAndFlush(new Referral(UUID.randomUUID(), busy, null));

        Referral paid = new Referral(UUID.randomUUID(), busy, null);
        paid.setRewardedAt(Instant.now());
        paid.setRewardSom(new BigDecimal("5000.00"));
        referrals.saveAndFlush(paid);

        referrals.saveAndFlush(new Referral(UUID.randomUUID(), quiet, null));

        var rows = referrals.leaderboard(PageRequest.of(0, 10));

        assertThat(rows).extracting(r -> r.getUserId()).containsExactly(busy, quiet);
        assertThat(rows.get(0).getInvitedCount()).isEqualTo(2);
        assertThat(rows.get(0).getRewardedCount()).isEqualTo(1);
        assertThat(rows.get(0).getEarnedSom()).isEqualByComparingTo("5000.00");
        // Hech kimga to'lanmagan bo'lsa nol chiqadi, null emas —
        // coalesce shuning uchun turibdi.
        assertThat(rows.get(1).getEarnedSom()).isEqualByComparingTo("0");
    }

    /**
     * Sinov uchun minimal kontekst.
     *
     * <p>{@code considerNestedRepositories} SHART — referal repozitoriylari
     * {@code ReferralRepositories} ichida ichma-ich e'lon qilingan, Spring
     * Data esa ichki interfeyslarni standart holatda skanerlamaydi.
     * Ilova o'zi ishlaydi, chunki u boshqa skanerlash yo'lidan boradi;
     * shuning uchun bu faqat shu yerda ko'rinadi.
     */
    @org.springframework.boot.autoconfigure.domain.EntityScan(
            basePackageClasses = Referral.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(
            basePackageClasses = Referral.class,
            considerNestedRepositories = true)
    static class Config {}
}
