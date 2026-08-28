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
}
