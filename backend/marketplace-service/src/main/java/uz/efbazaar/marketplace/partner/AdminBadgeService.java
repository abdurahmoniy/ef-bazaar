package uz.efbazaar.marketplace.partner;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.partner.PartnerApplication.Status;
import uz.efbazaar.marketplace.partner.PartnerRepositories.AdminSectionViewRepository;
import uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerApplicationRepository;
import uz.efbazaar.marketplace.repository.NotificationRepository;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Admin panelidagi raqamli ishoralar — "ko'rilmagan ish bor" belgisi.
 *
 * <p>Har bo'lim uchun admin OXIRGI KO'RGAN VAQTI saqlanadi va ishora shu
 * vaqtdan keyin o'zgargan elementlarni sanaydi. Har element uchun alohida
 * "ko'rildi" yozuvi saqlansa, jadval elementlar × adminlar bo'lib o'sardi
 * va hech qachon tozalanmasdi.
 *
 * <p>Ishora HAR ADMIN UCHUN alohida: bittasi ko'rgani ikkinchisidan
 * yashirmaydi. Aks holda birinchi kirgan admin qolganlar uchun belgini
 * o'chirib qo'yardi va ish e'tibordan chetda qolardi.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminBadgeService {

    /** Bo'lim kalitlari — frontenddagi nomlar bilan bir xil. */
    public static final String SECTION_PARTNER_APPLICATIONS = "partner-applications";
    public static final String SECTION_WITHDRAWALS = "withdrawals";

    private final PartnerApplicationRepository applications;
    private final NotificationRepository notifications;
    private final AdminSectionViewRepository views;

    @Transactional(readOnly = true)
    public Map<String, Long> countsFor(UUID adminId) {
        Map<String, Instant> seen = new HashMap<>();
        views.findByAdminId(adminId)
                .forEach(v -> seen.put(v.getSection(), v.getLastSeenAt()));

        Map<String, Long> counts = new HashMap<>();
        counts.put(SECTION_PARTNER_APPLICATIONS, applications.countPending(
                Status.AWAITING_REVIEW, seen.get(SECTION_PARTNER_APPLICATIONS)));
        counts.put(SECTION_WITHDRAWALS, countUnreadWithdrawals(adminId,
                seen.get(SECTION_WITHDRAWALS)));
        return counts;
    }

    /**
     * Pul yechish so'rovlari allaqachon har admin uchun bildirishnoma qatori
     * sifatida yoziladi ({@code WithdrawalConsumer}). Ularni qayta sanamaymiz —
     * o'qilmagan qatorlarning o'zi kerakli sanoq.
     */
    private long countUnreadWithdrawals(UUID adminId, Instant since) {
        return notifications.countUnreadWithdrawalsSince(adminId, since);
    }

    /**
     * Admin bo'limni ochdi — ishora o'chadi.
     *
     * <p>Vaqt "hozir" deb yoziladi, oxirgi element vaqti deb emas: ikkalasi
     * orasida kelgan element aks holda ko'rilgan deb hisoblanib, ishorasiz
     * qolardi.
     */
    @Transactional
    public void markSeen(UUID adminId, String section) {
        views.save(new AdminSectionView(adminId, section, Instant.now()));
        log.debug("Admin {} ko'rdi: {}", adminId, section);
    }
}
