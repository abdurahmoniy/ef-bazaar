package uz.efbazaar.payment.notify;

import java.util.OptionalLong;

/**
 * The one seam between payment-service and Telegram. An interface so tests can
 * substitute a client that fails, which is the behaviour that actually matters
 * here.
 */
public interface BotClient {

    /** @return the Telegram message id, or empty when the notice did not land. */
    OptionalLong postPaymentNotice(String html);

    void deletePaymentNotice(long messageId);

    /** A direct message to one person's Telegram chat. */
    OptionalLong sendDirectMessage(long chatId, String html);
}
