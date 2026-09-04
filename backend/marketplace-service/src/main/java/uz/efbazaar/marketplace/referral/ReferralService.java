package uz.efbazaar.marketplace.referral;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.Pageable;
import uz.efbazaar.marketplace.referral.ReferralDtos.InvitedUser;
import uz.efbazaar.marketplace.referral.ReferralDtos.MyReferralsResponse;
import uz.efbazaar.marketplace.referral.ReferralDtos.ReferrerRow;
import uz.efbazaar.marketplace.referral.ReferralRepositories.PendingReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository.ReferrerProjection;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralSettingsRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import uz.efbazaar.marketplace.security.AuthSummaryClient.UserSummary;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Referal da'vosi.
 *
 * <p>DA'VO FAQAT YANGI AKKOUNT UCHUN. Aks holda uch yil oldin ro'yxatdan
 * o'tgan odam bugun havolani bosib, kimningdir referaliga aylanib
 * qolardi — uni hech kim olib kelmagan bo'lsa ham.
 *
 * <p>Akkount yoshini brauzerdan kelgan "bu ro'yxatdan o'tish edi"
 * bayrog'i emas, auth-service aytadi. Bayroqni yolg'on qo'yishga sababi
 * bor yagona tomon aynan klient.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReferralService {

    /**
     * Ro'yxatdan o'tgandan keyin da'vo qilish uchun berilgan vaqt.
     *
     * <p>Bir soat — brauzer so'rovi kechikishi yoki foydalanuvchi
     * sahifani qayta yuklashi uchun yetarlicha keng, eski akkountni
     * ichkariga kiritish uchun juda tor.
     */
    private static final Duration CLAIM_WINDOW = Duration.ofHours(1);

    private final ReferralRepository referrals;
    private final ReferralCodeService codes;
    private final ReferralSettingsRepository settingsRepository;
    private final AuthSummaryClient users;
    private final ReferralRewardClient rewards;
    private final PendingReferralRepository pending;

    /**
     * @return qator yozilgan bo'lsa true. Rad etish xato emas — sukut.
     *
     * <p>ATAYLAB {@code @Transactional} EMAS, ikki sabab bilan.
     *
     * <p>Birinchisi: kalit qo'lda beriladi, shuning uchun Hibernate
     * INSERT'ni flush'gacha kechiktiradi. O'rab turuvchi tranzaksiya
     * bo'lsa u commit paytida otardi — quyidagi catch'dan keyin — va
     * bir vaqtda kelgan ikki da'vodan yutqazgani 500 olardi.
     *
     * <p>Ikkinchisi: {@link #isFreshAccount} auth-service'ga HTTP so'rov
     * qiladi. Tranzaksiya ichida bo'lsa, DB ulanishi o'sha so'rov
     * davomida band turadi — havzada bor-yo'g'i sakkizta ulanish bor.
     */
    public boolean claim(UUID claimantId, String code) {
        Optional<ReferralCodeService.ResolvedCode> resolved = codes.resolve(code);
        if (resolved.isEmpty()) return false;

        ReferralCodeService.ResolvedCode referrer = resolved.get();
        if (referrer.referrerUserId().equals(claimantId)) return false;
        if (referrals.findById(claimantId).isPresent()) return false;
        if (!isFreshAccount(claimantId)) return false;

        try {
            // Kanal kodi bo'lsa kanal ham yoziladi: voronka kanalning
            // o'z ko'rsatkichini shaxsiy havoladan ajratishi kerak.
            referrals.save(new Referral(claimantId, referrer.referrerUserId(),
                    referrer.partnerChannelId()));
        } catch (DataIntegrityViolationException e) {
            // Ikki so'rov bir vaqtda kelgan: birinchisi yozdi, ikkinchisi
            // birlamchi kalitga urildi. Natija to'g'ri, aytadigan xato yo'q.
            log.debug("Referal da'vosi allaqachon yozilgan: {}", claimantId);
            return false;
        }
        log.info("Referal yozildi: {} -> {}", referrer.referrerUserId(), claimantId);
        return true;
    }

    /**
     * Akkount da'vo oynasi ichida yaratilganmi.
     *
     * <p>auth-service javob bermasa YANGI DEB HISOBLANMAYDI. "Ha, yangi"
     * desak, auth o'chgan paytda har qanday eski foydalanuvchi referalga
     * aylanib qolardi. Bu holatda referalni yo'qotamiz — noto'g'ri
     * biriktirishdan ko'ra arzonroq.
     *
     * <p>{@code AuthSummaryClient} XATO OTMAYDI: u ichida hamma narsani
     * yutadi va bo'sh natija qaytaradi, {@code app.auth.internal-secret}
     * umuman sozlanmagan bo'lsa esa so'rov ham yubormaydi. Ya'ni
     * "foydalanuvchi topilmadi", "auth o'chgan" va "sir sozlanmagan"
     * bu yerda bir xil ko'rinadi. Oxirgisi — butun veb yo'lini jimgina
     * o'ldiradigan noto'g'ri sozlama, shuning uchun uni jurnalda
     * ko'rsatamiz: aks holda "nega hech kim referal bo'lmayapti" degan
     * savolga hech qanday iz qolmaydi.
     */
    private boolean isFreshAccount(UUID userId) {
        Optional<UserSummary> summary = users.resolve(userId);
        if (summary.isEmpty()) {
            log.warn("Referal da'vosi rad etildi: {} uchun auth-service ma'lumot bermadi "
                    + "(foydalanuvchi yo'q, auth javob bermadi, yoki internal-secret sozlanmagan)",
                    userId);
            return false;
        }
        Instant createdAt = summary.get().createdAt();
        return createdAt != null && createdAt.isAfter(Instant.now().minus(CLAIM_WINDOW));
    }

    /**
     * Savdo muvaffaqiyatli yopildi — ikkala tarafni ham tekshiradi.
     *
     * <p>Ikkalasi ham birinchi savdosida bo'lsa, ikkala taklif qiluvchi
     * ham oladi. Ikki odam platformaga olib kelingan va ikkalasi ham
     * so'ralgan ishni bajargan.
     *
     * <p>Bir tarafning to'lovi yiqilsa ikkinchisi baribir ko'riladi:
     * ular bir-biriga bog'liq emas, va biri tufayli ikkinchisini
     * yo'qotish sababsiz zarar.
     */
    public void rewardFor(UUID tradeId, UUID buyerId, UUID sellerId) {
        BigDecimal amount = settings().getRewardSom();
        // Nol mukofotda hech narsa qilmaymiz — MUHRLAMAYMIZ ham. Admin
        // summani vaqtincha nolga tushirib, keyin qaytarsa, o'sha
        // oradagi savdolar "to'langan" deb muhrlanib qolardi va ularga
        // hech qachon to'lab bo'lmasdi: "birinchi savdo" muhri bir
        // martalik.
        if (amount == null || amount.signum() <= 0) return;

        rewardParty(tradeId, buyerId, amount);
        // Bir odam ikkala tarafda bo'lishi g'alati, lekin mumkin. Ikki
        // marta to'lash — yo'q: mukofot bir odamni olib kelgani uchun.
        if (!sellerId.equals(buyerId)) {
            rewardParty(tradeId, sellerId, amount);
        }
    }

    private void rewardParty(UUID tradeId, UUID userId, BigDecimal amount) {
        Optional<Referral> found = referrals.findById(userId);
        if (found.isEmpty()) return;

        Referral referral = found.get();
        // rewardedAt "faqat birinchi savdo" qorovuli: birinchi savdo uni
        // muhrlaydi, keyingilari muhrlangan holda topadi.
        if (referral.getRewardedAt() != null) return;

        try {
            rewards.reward(userId, referral.getReferrerUserId(), amount);
        } catch (RuntimeException e) {
            // Muhr QO'YILMAYDI — hodisa qayta yetkazilganda yana urinamiz.
            // payment tarafdagi idempotentlik kaliti bir xil, shuning
            // uchun muvaffaqiyatli urinishdan keyin kelgan takror
            // ikkinchi marta to'lamaydi.
            log.error("Referal mukofoti to'lanmadi (savdo={}, user={})", tradeId, userId, e);
            return;
        }
        referral.setRewardedAt(Instant.now());
        // Summa qatorga muhrlanadi: sozlama ertaga o'zgarsa tarix qayta
        // yozilmasin va adminka to'langanini ko'rsatsin, bugun
        // sozlanganini emas.
        referral.setRewardSom(amount);
        referrals.save(referral);
    }

    /**
     * Botga kelgan kod. Oxirgisi g'olib — boshqa yo'llardagi qoida
     * bilan bir xil.
     */
    @Transactional
    public void remember(long telegramId, String code) {
        pending.save(new PendingReferral(telegramId, code));
    }

    /**
     * Ro'yxatdan o'tish hodisasi kutilayotgan kodni referalga aylantiradi.
     *
     * <p>BU YERDA AKKOUNT YOSHI TEKSHIRILMAYDI. Veb yo'li
     * {@code createdAt} ga qaraydi, chunki uning boshqa signali yo'q; bu
     * yo'lda esa hodisaning o'zi signal — u bir marta, ta'rifi bo'yicha
     * yangi akkount uchun otadi.
     */
    @Transactional
    public void claimOnRegistration(UUID userId, Long telegramId) {
        if (telegramId == null) return;

        Optional<PendingReferral> waiting = pending.findById(telegramId);
        if (waiting.isEmpty()) return;

        Optional<ReferralCodeService.ResolvedCode> referrer = codes.resolve(waiting.get().getCode());
        boolean usable = referrer.isPresent()
                && !referrer.get().referrerUserId().equals(userId)
                && referrals.findById(userId).isEmpty();

        if (usable) {
            // Bu yerda catch YO'Q, va ataylab. Kalit qo'lda berilgani
            // uchun INSERT commit paytida otadi — catch baribir
            // ishlamasdi, ustiga tranzaksiya rollback-only bo'lib
            // qolgani uchun quyidagi o'chirish ham bekor qilinardi.
            //
            // Poyga o'zi tuzaladi: tranzaksiya orqaga qaytadi, Kafka
            // yozuvni qayta yetkazadi, va ikkinchi urinishda yuqoridagi
            // findById g'olibning qatorini topib `usable` ni false
            // qiladi — qator yozilmaydi, kutilayotgani o'chiriladi,
            // commit o'tadi.
            referrals.save(new Referral(userId, referrer.get().referrerUserId(),
                    referrer.get().partnerChannelId()));
            log.info("Referal botdan yozildi: {} -> {}", referrer.get().referrerUserId(), userId);
        }
        // Qator o'chiriladi: ishlatilmagan bo'lsa ham u endi hech qachon
        // ishlamaydi — bu telegram_id bir marta ro'yxatdan o'tadi — va
        // qolib ketsa jadval o'sib boraveradi.
        pending.deleteById(telegramId);
    }

    /**
     * Foydalanuvchining o'z taklif sahifasi.
     *
     * <p>Tranzaksiyasiz: {@link ReferralCodeService#codeFor} kodni
     * birinchi murojaatda yaratadi va poygani o'zi hal qiladi — buning
     * uchun uning yozuvi o'z tranzaksiyasida tugashi kerak.
     */
    public MyReferralsResponse myReferrals(UUID userId) {
        String code = codes.codeFor(userId);
        List<Referral> rows = referrals.findByReferrerUserIdOrderByCreatedAtDesc(userId);

        return new MyReferralsResponse(
                code,
                rows.size(),
                rows.stream().filter(r -> r.getRewardedAt() != null).count(),
                totalEarned(rows),
                settings().getRewardSom(),
                withNames(rows));
    }

    /** Adminka reytingi: kim eng ko'p odam olib kelayapti. */
    @Transactional(readOnly = true)
    public List<ReferrerRow> leaderboard(Pageable pageable) {
        var rows = referrals.leaderboard(pageable);
        if (rows.isEmpty()) return List.of();

        Map<UUID, UserSummary> names =
                users.resolveAll(rows.stream().map(ReferrerProjection::getUserId).toList());

        return rows.stream().map(r -> {
            UserSummary u = names.get(r.getUserId());
            return new ReferrerRow(
                    r.getUserId(),
                    u == null ? null : u.displayName(),
                    u == null ? null : u.telegramUsername(),
                    r.getInvitedCount(),
                    r.getRewardedCount(),
                    r.getEarnedSom());
        }).toList();
    }

    /** Bitta taklif qiluvchi kimlarni olib kelgan. */
    @Transactional(readOnly = true)
    public List<InvitedUser> invitedBy(UUID referrerId) {
        return withNames(referrals.findByReferrerUserIdOrderByCreatedAtDesc(referrerId));
    }

    @Transactional
    public ReferralSettings updateSettings(BigDecimal rewardSom, UUID adminId) {
        ReferralSettings s = settings();
        s.setRewardSom(rewardSom);
        s.setUpdatedAt(Instant.now());
        s.setUpdatedBy(adminId);
        return settingsRepository.save(s);
    }

    /**
     * Ismlarni BITTA chaqiruv bilan qo'shadi.
     *
     * <p>Har qator uchun alohida so'rov qilish shu yerda juda oson
     * tug'iladi va uzoq ro'yxatda sezilarli sekinlashuvga aylanadi.
     *
     * <p>Ism topilmasa qator TASHLANMAYDI — sanoq ismga emas, qatorga
     * bog'liq, va o'chirilgan foydalanuvchi ham kimningdir referali
     * bo'lib qolaveradi.
     */
    private List<InvitedUser> withNames(List<Referral> rows) {
        if (rows.isEmpty()) return List.of();

        Map<UUID, UserSummary> names =
                users.resolveAll(rows.stream().map(Referral::getReferredUserId).toList());

        return rows.stream().map(r -> {
            UserSummary u = names.get(r.getReferredUserId());
            return new InvitedUser(
                    r.getReferredUserId(),
                    u == null ? null : u.displayName(),
                    r.getCreatedAt(),
                    r.getRewardedAt(),
                    r.getRewardSom());
        }).toList();
    }

    private static BigDecimal totalEarned(List<Referral> rows) {
        return rows.stream()
                .map(Referral::getRewardSom)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public ReferralSettings settings() {
        return settingsRepository.findById(ReferralSettings.SINGLETON_ID)
                .orElseThrow(() -> new IllegalStateException("referral_settings qatori yo'q"));
    }
}
