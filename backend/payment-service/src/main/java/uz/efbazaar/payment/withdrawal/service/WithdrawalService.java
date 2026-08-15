package uz.efbazaar.payment.withdrawal.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.crypto.EncryptedField;
import uz.efbazaar.payment.crypto.PaymentCrypto;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.domain.WalletAccount;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;
import uz.efbazaar.payment.withdrawal.domain.WithdrawalStatus;
import uz.efbazaar.payment.withdrawal.domain.WithdrawalTicket;
import uz.efbazaar.payment.withdrawal.repository.WithdrawalTicketRepository;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/**
 * Withdrawals, as a queue of hand-paid tickets.
 *
 * <p>Three ledger movements, each keyed by ticket id so a retry writes
 * nothing: reserve on open, and then exactly one of fulfil or cancel on close.
 * The ledger was built for this — {@code WITHDRAW_PENDING} and the three
 * {@code WITHDRAW_*} kinds have been in place since V1 with nothing posting to
 * them.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WithdrawalService {

    /** Below this the admin's time costs more than the payout is worth. */
    public static final long MIN_WITHDRAWAL_TIYIN = 1_000_000L;   // 10 000 so'm

    private final WithdrawalTicketRepository tickets;
    private final LedgerService ledger;
    private final PaymentCrypto crypto;
    private final org.springframework.context.ApplicationEventPublisher events;

    private static String key(String action, UUID ticketId) {
        return "withdraw-" + action + "-" + ticketId;
    }

    /** The card's own id is the crypto context, matching PlatformCardService. */
    private static String panContext(UUID ticketId) {
        return "withdrawal-pan:" + ticketId;
    }

    @Transactional
    public WithdrawalTicket open(UUID userId, long amountTiyin, String pan,
                                 String holderName, String phone, String telegramUsername) {
        String digits = pan == null ? "" : pan.replaceAll("\\D", "");
        if (digits.length() != 16) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Karta raqami 16 xonali bo'lishi kerak");
        }
        if (amountTiyin < MIN_WITHDRAWAL_TIYIN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Eng kam yechish summasi " + MIN_WITHDRAWAL_TIYIN / 100 + " so'm");
        }
        // One at a time. Two open tickets would let the holder ask for more
        // than they have, and neither the admin nor the user could say which
        // payout a transfer belonged to.
        if (tickets.findByUserIdAndStatus(userId, WithdrawalStatus.OPEN).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Sizda ochiq so'rov bor — avval u yakunlansin");
        }

        WalletAccount w = ledger.balanceOf(userId);
        if (w.getAvailableTiyin() < amountTiyin) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Hamyonda mablag' yetarli emas");
        }

        UUID ticketId = UUID.randomUUID();
        EncryptedField enc = crypto.encrypt(panContext(ticketId),
                digits.getBytes(StandardCharsets.UTF_8));

        WithdrawalTicket ticket = tickets.save(WithdrawalTicket.builder()
                .id(ticketId)
                .userId(userId)
                .amountTiyin(amountTiyin)
                .panEncrypted(enc.ciphertext())
                .panIv(enc.iv())
                .panTag(enc.tag())
                .last4(digits.substring(12))
                .holderName(holderName.trim().toUpperCase())
                .phone(phone.trim())
                .telegramUsername(telegramUsername)
                .status(WithdrawalStatus.OPEN)
                .build());

        // Freeze immediately — see the class javadoc for why not on close.
        ledger.post(TransactionKind.WITHDRAW_RESERVE, key("reserve", ticketId), userId,
                "withdrawal " + ticketId,
                List.of(new Posting(LedgerAccount.USER_AVAILABLE, userId, amountTiyin),
                        new Posting(LedgerAccount.WITHDRAW_PENDING, userId, -amountTiyin)));

        // Published inside the transaction, delivered after it commits — the
        // admin topic must never learn about a payout that rolled back.
        events.publishEvent(new uz.efbazaar.payment.notify.InvoiceNoticeEvents
                .WithdrawalOpened(ticketId));

        // last4 only: this line ends up in the container log.
        log.info("Withdrawal ticket {} opened by {} for {} tiyin to card ****{}",
                ticketId, userId, amountTiyin, ticket.getLast4());
        return ticket;
    }

    /** Admin paid out: the frozen money leaves the platform for good. */
    @Transactional
    public WithdrawalTicket markPaid(UUID ticketId, UUID adminId, String note) {
        WithdrawalTicket t = requireOpen(ticketId);
        ledger.post(TransactionKind.WITHDRAW_FULFIL, key("fulfil", ticketId), adminId,
                "withdrawal " + ticketId,
                List.of(new Posting(LedgerAccount.WITHDRAW_PENDING, t.getUserId(), t.getAmountTiyin()),
                        new Posting(LedgerAccount.PLATFORM_CARDS, null, -t.getAmountTiyin())));
        t.close(WithdrawalStatus.PAID, adminId, note);
        return tickets.save(t);
    }

    /** Admin declined: the frozen money goes back where it came from. */
    @Transactional
    public WithdrawalTicket reject(UUID ticketId, UUID adminId, String note) {
        WithdrawalTicket t = requireOpen(ticketId);
        ledger.post(TransactionKind.WITHDRAW_CANCEL, key("cancel", ticketId), adminId,
                "withdrawal " + ticketId,
                List.of(new Posting(LedgerAccount.WITHDRAW_PENDING, t.getUserId(), t.getAmountTiyin()),
                        new Posting(LedgerAccount.USER_AVAILABLE, t.getUserId(), -t.getAmountTiyin())));
        t.close(WithdrawalStatus.REJECTED, adminId, note);
        return tickets.save(t);
    }

    /** The full number, for the admin who is about to send money to it. */
    @Transactional(readOnly = true)
    public String revealPan(UUID ticketId) {
        WithdrawalTicket t = tickets.findById(ticketId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "So'rov topilmadi"));
        return new String(crypto.decrypt(panContext(t.getId()),
                new EncryptedField(t.getPanIv(), t.getPanTag(), t.getPanEncrypted())),
                StandardCharsets.UTF_8);
    }

    @Transactional(readOnly = true)
    public List<WithdrawalTicket> mine(UUID userId) {
        return tickets.findByUserIdOrderByCreatedAtDesc(userId);
    }

    /** Oldest first — the queue an admin works through. */
    @Transactional(readOnly = true)
    public List<WithdrawalTicket> queue() {
        return tickets.findByStatusOrderByCreatedAtAsc(WithdrawalStatus.OPEN);
    }

    private WithdrawalTicket requireOpen(UUID ticketId) {
        WithdrawalTicket t = tickets.findById(ticketId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "So'rov topilmadi"));
        if (t.getStatus() != WithdrawalStatus.OPEN) {
            // Two admins closing the same ticket: the second must not post a
            // second ledger movement, and must not silently look like it won.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "So'rov allaqachon yopilgan");
        }
        return t;
    }
}
