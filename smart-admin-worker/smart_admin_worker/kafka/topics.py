"""Kafka topic name constants — one-to-one with Java TradeEvents.TOPIC_*."""

TOPIC_EMAIL_PROVISION_REQ = "efbazaar.trade.email-provision-request"
TOPIC_EMAIL_PROVISIONED = "efbazaar.trade.email-provisioned"
# Urinishlar tugadi va quti ochilmadi. Usiz savdo INITIATED da abadiy
# qotib qolardi: u holatda TIMEOUT ham, rad etish ham yo'q.
TOPIC_EMAIL_PROVISION_FAILED = "efbazaar.trade.email-provision-failed"
TOPIC_FORGOT_PW_REQ = "efbazaar.trade.forgot-password-request"
TOPIC_IMAP_POLL_REQ = "efbazaar.trade.imap-poll-request"
TOPIC_IMAP_POLL_STOP_REQ = "efbazaar.trade.imap-poll-stop-request"
TOPIC_KONAMI_EMAIL = "efbazaar.trade.konami-email-received"
TOPIC_IMAP_2FA = "efbazaar.trade.imap-2fa-code"
TOPIC_MAILBOX_PROVISION_REQ = "efbazaar.trade.mailbox-provision-request"
TOPIC_MAILBOX_PROVISIONED = "efbazaar.trade.mailbox-provisioned"
TOPIC_MAILBOX_ROTATE_REQ = "efbazaar.trade.mailbox-rotate-request"
TOPIC_MAILBOX_ROTATED = "efbazaar.trade.mailbox-rotated"
TOPIC_MAILBOX_DELETE_RESULT = "efbazaar.trade.mailbox-delete-result"
TOPIC_MAILBOX_INVENTORY_REQ = "efbazaar.trade.mailbox-inventory-request"
TOPIC_MAILBOX_INVENTORY_OBSERVED = "efbazaar.trade.mailbox-inventory-observed"
TOPIC_MAILBOX_DELETE_REQ = "efbazaar.trade.mailbox-delete-request"

# NEW in Plan C — backpressure UX
TOPIC_WORKER_QUEUED = "efbazaar.trade.worker-queued"
TOPIC_WORKER_STARTED = "efbazaar.trade.worker-started"

# Konami email-change verification code — scraped from the escrow mailbox
# during WAITING_EMAIL_CHANGE so the seller can enter it back on Konami's
# "Update Email Address" flow (the code is delivered to the NEW address,
# which is the escrow mailbox they can't read).
TOPIC_KONAMI_EMAIL_CHANGE_CODE = "efbazaar.trade.konami-email-change-code-received"

REQUEST_TOPICS = (
    TOPIC_EMAIL_PROVISION_REQ,
    TOPIC_MAILBOX_PROVISION_REQ,
    TOPIC_FORGOT_PW_REQ,
    TOPIC_IMAP_POLL_REQ,
    TOPIC_IMAP_POLL_STOP_REQ,
    TOPIC_MAILBOX_ROTATE_REQ,
    TOPIC_MAILBOX_DELETE_REQ,
    TOPIC_MAILBOX_INVENTORY_REQ,
)
