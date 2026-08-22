package uz.efbazaar.trade.plan.exception;

import lombok.Getter;

/**
 * The user has as many escrow mailboxes as their plan allows.
 *
 * <p>Carries the numbers rather than only a sentence, because there are two
 * ways out of this and the screen has to offer both: delete a mailbox whose
 * account has already been moved on, or move up a tier. A bare message would
 * leave the frontend parsing prose to decide what to show.
 */
@Getter
public class MailboxSlotsExhaustedException extends RuntimeException {

    private final String planCode;
    private final long used;
    private final long limit;

    public MailboxSlotsExhaustedException(String planCode, long used, long limit) {
        super("Pochta qutilari uchun bo'sh joy qolmadi (" + used + "/" + limit + ")");
        this.planCode = planCode;
        this.used = used;
        this.limit = limit;
    }
}
