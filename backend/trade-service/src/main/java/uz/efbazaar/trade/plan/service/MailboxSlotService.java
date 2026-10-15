package uz.efbazaar.trade.plan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException;
import uz.efbazaar.trade.trade.domain.TradeState;

import java.util.Arrays;
import java.util.List;
import java.util.OptionalLong;
import java.util.UUID;

/**
 * How many escrow mailboxes a user may hold at once.
 *
 * <p>Every trade creates a real mailbox on the mail server, so this is the
 * cost the tiers are actually about. A slot is taken by a mailbox the user owns
 * or one a live trade has reserved for their side, and it comes back when
 * either the mailbox is deleted or the trade ends without them keeping it.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MailboxSlotService {

    /** The capability this asks about. Plans are never named here. */
    public static final String KEY = "mailbox.slots";

    private final MailboxRepository mailboxes;
    private final EntitlementService entitlements;
    private final MailboxAccessService access;

    /**
     * How many mailboxes an unlimited plan may hold before we look into it.
     *
     * <p>Not a limit — nobody is refused on it. It is the line past which a
     * single account quietly creating mailboxes stops looking like use and
     * starts looking like a runaway loop or abuse, and somebody should know.
     */
    @Value("${trade.mailbox.unlimited-alert-threshold:100}")
    private long unlimitedAlertThreshold;

    private static final List<String> TERMINAL = Arrays.stream(TradeState.values())
            .filter(TradeState::isTerminal)
            .map(Enum::name)
            .toList();

    @Transactional(readOnly = true)
    public long used(UUID userId) {
        return mailboxes.countHeldBy(userId, TERMINAL);
    }

    /**
     * Slot holati — profildagi ogohlantirish shu yerdan o'qiydi.
     *
     * <p>{@code limit} null bo'lsa cheksiz reja. {@code full} ni shu
     * yerda hisoblaymiz: ikki joyda ikki xil taqqoslash yozilsa, birida
     * {@code >=} ikkinchisida {@code >} bo'lib qolar va ogohlantirish
     * savdoni to'sadigan holatdan bir qadam kechikardi.
     */
    @Transactional(readOnly = true)
    public SlotStatus statusFor(UUID userId) {
        OptionalLong limit = entitlements.limit(userId, KEY);
        long used = used(userId);
        return new SlotStatus(used,
                limit.isPresent() ? limit.getAsLong() : null,
                limit.isPresent() && used >= limit.getAsLong(),
                entitlements.planFor(userId),
                access.lockedIds(userId).size());
    }

    public record SlotStatus(long used, Long limit, boolean full, String plan, long lockedCount) {}

    /** The ceiling, or empty when this user has none. */
    @Transactional(readOnly = true)
    public OptionalLong limitFor(UUID userId) {
        return entitlements.limit(userId, KEY);
    }

    /**
     * Refuses when there is no room for another mailbox.
     *
     * <p>Called once per party rather than once per trade: a swap creates a
     * mailbox for each of them, and charging both to whoever opened it would
     * let one user spend another's allowance.
     */
    @Transactional(readOnly = true)
    public void assertCanAllocate(UUID userId) {
        OptionalLong limit = entitlements.limit(userId, KEY);
        long used = used(userId);
        if (limit.isEmpty()) {
            if (used >= unlimitedAlertThreshold) {
                log.warn("User {} holds {} escrow mailboxes on an unlimited plan — "
                        + "past the {} we consider worth a look", userId, used, unlimitedAlertThreshold);
            }
            return;
        }
        if (used >= limit.getAsLong()) {
            throw new MailboxSlotsExhaustedException(
                    entitlements.planFor(userId), used, limit.getAsLong());
        }
    }
}
