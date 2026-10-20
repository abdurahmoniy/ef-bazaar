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
 * Unified mailbox resource quota, including retained resources and live reservations.
 *
 * <p>Every trade creates a real mailbox on the mail server, so this is the
 * cost the tiers are actually about. A slot is taken by a mailbox the user owns
 * or retains responsibility for, or a live trade reserves for them. UI detach
 * never releases a real resource. Failed trades release unowned reservations.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MailboxSlotService {

    /** The capability this asks about. Plans are never named here. */
    public static final String KEY = "mailbox.total_slots";

    private final MailboxRepository mailboxes;
    private final EntitlementService entitlements;
    private final MailboxAccessService access;
    private final CustomSlotService customSlots;

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
        OptionalLong customLimit = customSlots.limitFor(userId);
        long exempt = mailboxes.countExemptHeldBy(userId, TERMINAL);
        Long total = limit.isPresent() ? limit.getAsLong() : null;
        var modes = access.metadataFor(userId);
        var sample = modes.values().stream().findFirst().orElseGet(() -> access.metadata(userId, new UUID(0,0)));
        var state = modes.values().stream().anyMatch(a -> a.accessState() == MailboxAccessService.AccessState.RECOVERY)
                ? MailboxAccessService.AccessState.RECOVERY
                : modes.values().stream().anyMatch(a -> a.accessState() == MailboxAccessService.AccessState.GRACE)
                    ? MailboxAccessService.AccessState.GRACE : MailboxAccessService.AccessState.ACTIVE;
        return new SlotStatus(used, total,
                limit.isPresent() && used >= limit.getAsLong(),
                entitlements.planFor(userId), access.lockedIds(userId).size(), used, total,
                customSlots.used(userId), customLimit.isPresent() ? customLimit.getAsLong() : null,
                exempt, used + exempt, state, sample == null ? null : sample.paidExpiresAt(),
                sample == null ? null : sample.graceEndsAt(), modes.values().stream().filter(MailboxAccessService.Access::selectedForFree).count());
    }

    public record SlotStatus(long used, Long limit, boolean full, String plan, long lockedCount,
                             long totalUsed, Long totalLimit, long customUsed, Long customLimit,
                             long exemptUsed, long resourceUsed, MailboxAccessService.AccessState accessState,
                             java.time.Instant paidExpiresAt, java.time.Instant graceEndsAt, long selectedForFreeCount) {}

    /** The ceiling, or empty when this user has none. */
    @Transactional(readOnly = true)
    public OptionalLong limitFor(UUID userId) {
        return entitlements.limit(userId, KEY);
    }

    /**
     * Refuses when there is no room for another mailbox.
     *
     * <p>Both parties need capacity: sales reserve one address for the source
     * and recipient; swaps reserve one outgoing address each. Callers hold
     * MailboxQuotaLock until the reservation transaction commits.
     */
    @Transactional(readOnly = true)
    public void assertCanAllocate(UUID userId) {
        OptionalLong limit = entitlements.allocationLimit(userId, KEY);
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
