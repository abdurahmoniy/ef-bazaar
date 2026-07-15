"""Kafka topic name constants — one-to-one with Java TradeEvents.TOPIC_*."""

TOPIC_EMAIL_PROVISION_REQ = "efbazaar.trade.email-provision-request"
TOPIC_EMAIL_PROVISIONED = "efbazaar.trade.email-provisioned"
TOPIC_FORGOT_PW_REQ = "efbazaar.trade.forgot-password-request"
TOPIC_IMAP_POLL_REQ = "efbazaar.trade.imap-poll-request"
TOPIC_KONAMI_EMAIL = "efbazaar.trade.konami-email-received"
TOPIC_IMAP_2FA = "efbazaar.trade.imap-2fa-code"
TOPIC_MAILBOX_ROTATE_REQ = "efbazaar.trade.mailbox-rotate-request"
TOPIC_MAILBOX_ROTATED = "efbazaar.trade.mailbox-rotated"

# NEW in Plan C — backpressure UX
TOPIC_WORKER_QUEUED = "efbazaar.trade.worker-queued"
TOPIC_WORKER_STARTED = "efbazaar.trade.worker-started"

REQUEST_TOPICS = (
    TOPIC_EMAIL_PROVISION_REQ,
    TOPIC_FORGOT_PW_REQ,
    TOPIC_IMAP_POLL_REQ,
    TOPIC_MAILBOX_ROTATE_REQ,
)
