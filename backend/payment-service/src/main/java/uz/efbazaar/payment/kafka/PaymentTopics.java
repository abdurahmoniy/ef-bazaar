package uz.efbazaar.payment.kafka;

/** Topic names. Kept in one place so a producer and a consumer cannot drift. */
public final class PaymentTopics {

    public static final String CARD_CREDIT_OBSERVED = "efbazaar.payment.card-credit-observed";
    public static final String USERBOT_HEARTBEAT    = "efbazaar.payment.userbot-heartbeat";
    public static final String DEPOSIT_CREDITED     = "efbazaar.payment.deposit-credited";

    private PaymentTopics() {}
}
