package uz.efbazaar.payment.kafka;

/** Topic names. Kept in one place so a producer and a consumer cannot drift. */
public final class PaymentTopics {

    public static final String CARD_CREDIT_OBSERVED = "efbazaar.payment.card-credit-observed";
    /**
     * Money leaving a platform card. A separate topic from the credit one, and
     * separate all the way down to its own table: the credit table doubles as
     * the admin's reconciliation queue, where a row can be attributed to a user
     * and CREATE money. A debit must never reach that queue.
     */
    public static final String CARD_DEBIT_OBSERVED  = "efbazaar.payment.card-debit-observed";
    public static final String USERBOT_HEARTBEAT    = "efbazaar.payment.userbot-heartbeat";
    public static final String DEPOSIT_CREDITED     = "efbazaar.payment.deposit-credited";
    public static final String WITHDRAWAL_REQUESTED = "efbazaar.payment.withdrawal-requested";
    public static final String WITHDRAWAL_CLOSED    = "efbazaar.payment.withdrawal-closed";
    public static final String SUBSCRIPTION_CHANGED = "efbazaar.payment.subscription-changed";
    /**
     * What a plan grants, republished whole whenever it changes and once on
     * startup. The startup send is the resync: a reader that has lost its copy,
     * or has never had one, gets it back without anybody running anything.
     */
    public static final String PLAN_ENTITLEMENTS    = "efbazaar.payment.plan-entitlements";

    /**
     * Where a record this service cannot process is parked. Spring Kafka's own
     * convention, kept here so the consumer, the recoverer and any operator
     * runbook name the same topic.
     */
    public static final String DLT_SUFFIX           = ".DLT";

    private PaymentTopics() {}
}
