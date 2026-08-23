"""Kafka topic name constants — one-to-one with Java TradeEvents.TOPIC_*."""

TOPIC_EMAIL_PROVISION_REQ = "efbazaar.trade.email-provision-request"
TOPIC_EMAIL_PROVISIONED = "efbazaar.trade.email-provisioned"
TOPIC_FORGOT_PW_REQ = "efbazaar.trade.forgot-password-request"
TOPIC_IMAP_POLL_REQ = "efbazaar.trade.imap-poll-request"
TOPIC_KONAMI_EMAIL = "efbazaar.trade.konami-email-received"
TOPIC_IMAP_2FA = "efbazaar.trade.imap-2fa-code"
TOPIC_MAILBOX_PROVISION_REQ = "efbazaar.trade.mailbox-provision-request"
TOPIC_MAILBOX_PROVISIONED = "efbazaar.trade.mailbox-provisioned"
TOPIC_MAILBOX_ROTATE_REQ = "efbazaar.trade.mailbox-rotate-request"
TOPIC_MAILBOX_ROTATED = "efbazaar.trade.mailbox-rotated"
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
    TOPIC_MAILBOX_ROTATE_REQ,
    TOPIC_MAILBOX_DELETE_REQ,
)
