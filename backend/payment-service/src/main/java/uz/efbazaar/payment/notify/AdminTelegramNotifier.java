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

    private static String mask(String last4) {
        return "•••• " + last4;
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
