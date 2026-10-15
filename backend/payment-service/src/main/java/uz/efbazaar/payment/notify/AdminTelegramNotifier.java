package uz.efbazaar.payment.notify;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.OptionalLong;

/**
 * Renders invoice notices and hands them to {@link BotClient}.
 *
 * <p><b>Nothing here throws.</b> Every method catches everything it can and
 * degrades to "not announced". The callers sit in the invoice creation path and
 * in the credit path; a Telegram outage must cost us a message, never a
 * deposit. Read every catch block in this class as load-bearing.
 *
 * <p>The rendered text carries the masked card only. A Telegram group sits
 * outside our security boundary and its membership is not the card-owner list.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AdminTelegramNotifier {

    private static final DateTimeFormatter CLOCK =
            DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("Asia/Tashkent"));

    private final BotClient bot;

    @Value("${payment.admin-telegram.enabled:true}")
    private boolean enabled;

    /** @return the Telegram message id to store on the invoice, or empty. */
    public OptionalLong invoiceCreated(InvoiceNotice n) {
        if (!enabled) return OptionalLong.empty();
        try {
            return bot.postPaymentNotice(renderPending(n));
        } catch (Exception e) {
            log.warn("Invoice {} was not announced: {}", n.invoiceId(), e.toString());
            return OptionalLong.empty();
        }
    }

    /**
     * Replaces the pending announcement with a completion message. The delete
     * and the post are independent: a failed delete still leaves a receipt in
     * the topic, which is the more useful half.
     */
    public OptionalLong invoicePaid(InvoiceNotice n, Long previousMessageId) {
        if (!enabled) return OptionalLong.empty();
        if (previousMessageId != null) {
            invoiceExpired(previousMessageId);
        }
        try {
            return bot.postPaymentNotice(renderPaid(n));
        } catch (Exception e) {
            log.warn("Paid notice for invoice {} failed: {}", n.invoiceId(), e.toString());
            return OptionalLong.empty();
        }
    }

    /**
     * Announces a payment that matched no live invoice.
     *
     * <p>This is the one event in the rail that needs a human, and it was the
     * only one the topic never mentioned. The card owners watch Telegram, not
     * the admin panel, so an unmatched credit could sit in the queue unseen —
     * and the case that produces one most often is a late payment, whose
     * invoice notice has already been deleted, leaving no trace at all.
     */
    public void unmatchedCredit(UnmatchedNotice n) {
        if (!enabled) return;
        try {
            bot.postPaymentNotice(renderUnmatched(n));
        } catch (Exception e) {
            log.warn("Unmatched credit {} was not announced: {}", n.observationId(), e.toString());
        }
    }

    /**
     * Money left one of the platform's own cards.
     *
     * <p>Sent for every debit on a card we own, expected or not. An admin who
     * just paid a withdrawal out reads it as a receipt; anyone else reads it as
     * the first news that the card is moving without them — and from the card's
     * side those two look identical, so the topic gets both.
     */
    public void cardDebited(DebitNotice n) {
        if (!enabled) return;
        try {
            bot.postPaymentNotice(renderDebit(n));
        } catch (Exception e) {
            log.warn("Card debit {} was not announced: {}", n.observationId(), e.toString());
        }
    }

    /**
     * A withdrawal ticket nobody has paid yet.
     *
     * <p>The money is already frozen by the time this posts, so the topic is
     * the queue: nothing else tells an admin a payout is waiting, and the card
     * owners watch Telegram rather than the admin panel.
     */
    public void withdrawalOpened(WithdrawalNotice n) {
        if (!enabled) return;
        try {
            bot.postPaymentNotice(renderWithdrawal(n));
        } catch (Exception e) {
            log.warn("Withdrawal {} was not announced: {}", n.ticketId(), e.toString());
        }
    }

    /**
     * Tells the wallet owner how their payout ended, in their own chat.
     *
     * <p>Silently does nothing without a chat id: an account with no Telegram
     * linked still gets the in-app notification, and a payout that already
     * happened must not be held up by a nudge that cannot be delivered.
     */
    public void withdrawalClosedToOwner(Long chatId, long amountTiyin,
                                        boolean paid, String note) {
        if (!enabled || chatId == null) return;
        try {
            bot.sendDirectMessage(chatId, renderWithdrawalOutcome(amountTiyin, paid, note));
        } catch (Exception e) {
            log.warn("Could not tell {} about their payout: {}", chatId, e.toString());
        }
    }

    /** UI names live in the frontend; the bot message needs them too, so they are mirrored here. */
    private static final java.util.Map<String, String> PLAN_NAMES =
            java.util.Map.of("PRO", "Boyvachcha", "MAX", "Aristokrat", "STANDARD", "Jaydari");

    public void planReminderToOwner(Long chatId, String planCode, boolean expired) {
        if (!enabled || chatId == null) return;
        String name = PLAN_NAMES.getOrDefault(planCode, planCode);
        String html = expired
                ? "⏳ <b>" + name + "</b> tarifingiz tugadi. Ortiqcha pochta qutilari qulflandi.\n"
                  + "Uzaytirish: https://efbazaar.uz/plans"
                : "⏰ <b>" + name + "</b> tarifingiz 3 kundan keyin tugaydi.\n"
                  + "Uzaytirish: https://efbazaar.uz/plans";
        try {
            bot.sendDirectMessage(chatId, html);
        } catch (Exception e) {
            log.warn("Could not remind {} about plan {}: {}", chatId, planCode, e.toString());
        }
    }

    /** Deletes an announcement with no replacement — an expiry is not news. */
    public void invoiceExpired(Long messageId) {
        if (!enabled || messageId == null) return;
        try {
            bot.deletePaymentNotice(messageId);
        } catch (Exception e) {
            log.warn("Could not delete admin notice {}: {}", messageId, e.toString());
        }
    }

    private String renderPending(InvoiceNotice n) {
        return """
               🧾 <b>Yangi to'ldirish</b>
               💳 %s • %s
               💵 O'tkaziladi: <b>%s so'm</b>
               🎯 Hisobga tushadi: %s so'm
               👤 <code>%s</code>
               🕓 Muddat: %s gacha"""
                .formatted(mask(n.cardLast4()), esc(n.holderName()),
                        uzs(n.transferAmountTiyin()), uzs(n.requestedAmountTiyin()),
                        n.userId(), CLOCK.format(n.expiresAt()));
    }

    private String renderPaid(InvoiceNotice n) {
        Instant at = n.paidAt() == null ? Instant.now() : n.paidAt();
        return """
               ✅ <b>To'lov amalga oshirildi</b>
               💳 %s • %s
               💵 Kelgan summa: <b>%s so'm</b>
               🎯 Hisobga tushdi: %s so'm
               👤 <code>%s</code>
               🕓 %s"""
                .formatted(mask(n.cardLast4()), esc(n.holderName()),
                        uzs(n.transferAmountTiyin()), uzs(n.requestedAmountTiyin()),
                        n.userId(), CLOCK.format(at));
    }

    private String renderWithdrawalOutcome(long amountTiyin, boolean paid, String note) {
        String tail = note == null || note.isBlank() ? "" : "\n\uD83D\uDCAC " + note;
        return paid
                ? ("\u2705 <b>Pul yechildi</b>\n\uD83D\uDCB5 <b>%s so'm</b> kartangizga o'tkazildi." + tail)
                        .formatted(exactUzs(amountTiyin))
                : ("\u274C <b>Pul yechish rad etildi</b>\n\uD83D\uDCB5 <b>%s so'm</b> hamyoningizga qaytarildi." + tail)
                        .formatted(exactUzs(amountTiyin));
    }

    private String renderWithdrawal(WithdrawalNotice n) {
        return """
               \uD83D\uDCE4 <b>Pul yechish so'rovi</b>
               \uD83D\uDCB5 Summa: <b>%s so'm</b>
               \uD83D\uDCB3 Karta: %s
               \uD83D\uDC64 %s
               \uD83D\uDCDE %s%s
               \uD83C\uDD94 <code>%s</code>
               \u27A1\uFE0F Karta raqami admin panelida"""
                .formatted(exactUzs(n.amountTiyin()), mask(n.cardLast4()),
                        n.holderName(), n.phone(),
                        n.telegramUsername() == null ? "" : " \u00B7 @" + n.telegramUsername(),
                        n.userId());
    }

    /**
     * The optional lines are omitted rather than printed empty: "📍" alone or
     * "Qoldiq: —" is noise in a topic an admin scans on a phone.
     */
    private String renderDebit(DebitNotice n) {
        StringBuilder sb = new StringBuilder("""
                💸 <b>Kartadan pul yechildi</b>
                💳 %s
                💵 Summa: <b>%s so'm</b>"""
                .formatted(mask(n.cardLast4()), exactUzs(n.amountTiyin())));

        if (n.commissionTiyin() != null && n.commissionTiyin() > 0) {
            sb.append("\n⚠️ Komissiya: ").append(exactUzs(n.commissionTiyin())).append(" so'm");
        }
        if (n.description() != null && !n.description().isBlank()) {
            sb.append("\n📍 ").append(esc(n.description()));
        }
        sb.append("\n🕓 ").append(CLOCK.format(n.observedAt()));
        if (n.cardBalanceTiyin() != null) {
            sb.append("\n💰 Qoldiq: ").append(exactUzs(n.cardBalanceTiyin())).append(" so'm");
        }
        return sb.toString();
    }

    private String renderUnmatched(UnmatchedNotice n) {
        return """
               ⚠️ <b>Tekshirilmagan tushum</b>
               💳 %s
               💵 Kelgan summa: <b>%s so'm</b>
               🕓 %s
               ❓ Mos so'rov topilmadi — admin panelidan biriktiring"""
                .formatted(mask(n.cardLast4()), exactUzs(n.amountTiyin()),
                        CLOCK.format(n.observedAt()));
    }

    private static String mask(String last4) {
        return "•••• " + last4;
    }

    /**
     * Like {@link #uzs} but keeps a non-zero tiyin remainder.
     *
     * <p>{@code uzs} may drop it because an invoice amount is whole so'm by
     * construction. A payment nobody asked for carries no such guarantee, and
     * this number is the one an admin reads back against a bank statement — so
     * "1 000,50" must not print as "1 000".
     */
    private static String exactUzs(long tiyin) {
        long whole = tiyin / 100;
        long frac = Math.abs(tiyin % 100);
        String grouped = String.format(Locale.ROOT, "%,d", whole).replace(',', ' ');
        return frac == 0 ? grouped : "%s,%02d".formatted(grouped, frac);
    }

    /**
     * Amounts are whole so'm by construction: a request is UZS × 100 and a bump
     * is a multiple of 100 so'm, so the tiyin part is always zero.
     *
     * <p>{@link Locale#ROOT} rather than the default locale: a build or a
     * container set to de_DE would otherwise group with '.' and this method
     * would render "100.100" instead of "100 100".
     */
    private static String uzs(long tiyin) {
        return String.format(Locale.ROOT, "%,d", tiyin / 100).replace(',', ' ');
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
