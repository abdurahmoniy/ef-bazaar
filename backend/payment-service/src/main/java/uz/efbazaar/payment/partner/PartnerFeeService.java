package uz.efbazaar.payment.partner;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;

/**
 * Hamkorlik to'lovini hamyondan yechadi.
 *
 * <p>Foydalanuvchi uchun bu "hamkorlik uchun to'ladim" bo'lib ko'rinadi,
 * ichkarida esa savdolardagi bilan bir xil yo'l: pul hamyonga tushadi,
 * to'lov hamyondan yechiladi. Ikkinchi pul yo'lini qurish bir xil ishni
 * ikki joyda takrorlash bo'lardi — va ular vaqt o'tib bir-biridan
 * ajralib ketardi.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PartnerFeeService {

    private final LedgerService ledger;

    /**
     * Arizaning to'lovini yechadi.
     *
     * <p>Idempotent: kalit ariza id siga bog'langan, ya'ni takroriy chaqiruv
     * ikkinchi marta pul yechmaydi. Tarmoq uzilib qayta urinilganda bu
     * yagona himoya.
     *
     * @throws ResponseStatusException 409 — hamyonda mablag' yetarli emas,
     *         xabarda yetishmayotgan summa bilan
     */
    @Transactional
    public void charge(UUID applicationId, UUID userId, long feeTiyin) {
        if (feeTiyin <= 0) {
            // Narx nolga qo'yilgan — to'lov bosqichi o'tkazib yuboriladi.
            log.info("Ariza {} uchun to'lov talab qilinmaydi (narx 0)", applicationId);
            return;
        }
        requireFunds(userId, feeTiyin);

        ledger.post(TransactionKind.PARTNER_FEE, "partner-fee:" + applicationId, null,
                "partner application " + applicationId,
                List.of(
                        new Posting(LedgerAccount.USER_AVAILABLE, userId, feeTiyin),
                        new Posting(LedgerAccount.PLATFORM_REVENUE, null, -feeTiyin)));

        log.info("Ariza {} uchun {} tiyin yechildi (user={})", applicationId, feeTiyin, userId);
    }

    private void requireFunds(UUID userId, long tiyin) {
        long available = ledger.balanceOf(userId).getAvailableTiyin();
        if (available < tiyin) {
            // Xabar savdolardagi bilan bir xil shaklda: frontend uni
            // `isInsufficientFunds` bilan taniydi va yetishmayotgan summani
            // hamyon sahifasiga o'tkazadi.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Hamyonda mablag' yetarli emas — " + ((tiyin - available) / 100)
                            + " so'm yetishmayapti");
        }
    }
}
