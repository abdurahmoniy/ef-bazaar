package uz.efbazaar.auth.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.repository.UserRepository;

/**
 * Admin hamkorlik arizasini tasdiqlaganda PARTNER rolini beradi.
 *
 * <p>Rol AYNAN SHU YERDA beriladi, marketplace'da emas: rollar auth-service'ga
 * tegishli va boshqa servis uning bazasiga yozmaydi.
 *
 * <p>Idempotent: takroriy hodisa hech narsani o'zgartirmaydi. ADMIN rolini
 * esa bosib o'tmaydi — hamkorlikka ariza bergan admin panelga kirishni
 * yo'qotib qo'ymasligi kerak. Rol bir qiymatli va PARTNER unga ustun emas.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PartnerApprovedConsumer {

    private final UserRepository userRepository;

    @KafkaListener(
            topics = "efbazaar.marketplace.partner-approved",
            groupId = "auth-service-partner-approved",
            properties = {"spring.json.value.default.type=uz.efbazaar.auth.kafka.PartnerApprovedDto"}
    )
    @Transactional
    public void onPartnerApproved(PartnerApprovedDto e) {
        if (e == null || e.userId() == null) {
            log.warn("partner-approved without a user id — dropping");
            return;
        }
        userRepository.findById(e.userId()).ifPresentOrElse(user -> {
            if (user.getRole() == Role.ADMIN) {
                log.info("User {} is ADMIN — leaving the role untouched", e.userId());
                return;
            }
            if (user.getRole() == Role.PARTNER) {
                log.debug("User {} is already PARTNER", e.userId());
                return;
            }
            user.setRole(Role.PARTNER);
            userRepository.save(user);
            log.info("Granted PARTNER to user {} (application {})", e.userId(), e.applicationId());
        }, () -> log.warn("partner-approved for unknown user {}", e.userId()));
    }

    /**
     * Hamkorlik to'xtadi — rol qaytariladi.
     *
     * <p>FAQAT PARTNER dan tushiriladi. Admin ham, trade-admin ham
     * hamkorlikka ariza bergan bo'lishi mumkin va ularning roli hamkorlik
     * tufayli berilmagan — uni olib tashlash odamni panelidan yoki
     * ishidan ayirardi.
     */
    @KafkaListener(
            topics = "efbazaar.marketplace.partner-cancelled",
            groupId = "auth-service-partner-cancelled",
            properties = {"spring.json.value.default.type=uz.efbazaar.auth.kafka.PartnerCancelledDto"}
    )
    @Transactional
    public void onPartnerCancelled(PartnerCancelledDto e) {
        if (e == null || e.userId() == null) {
            log.warn("partner-cancelled without a user id — dropping");
            return;
        }
        userRepository.findById(e.userId()).ifPresentOrElse(user -> {
            if (user.getRole() != Role.PARTNER) {
                log.info("User {} is {} — leaving the role untouched", e.userId(), user.getRole());
                return;
            }
            user.setRole(Role.USER);
            userRepository.save(user);
            log.info("Revoked PARTNER from user {} ({})", e.userId(), e.reason());
        }, () -> log.warn("partner-cancelled for unknown user {}", e.userId()));
    }
}
