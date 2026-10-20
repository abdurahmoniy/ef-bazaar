package uz.efbazaar.trade.plan;
import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.plan.service.*;
import uz.efbazaar.trade.plan.domain.UserPlanView;
import uz.efbazaar.trade.plan.repository.UserPlanViewRepository;
import uz.efbazaar.trade.mailbox.domain.*;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class MailboxAccessBoundaryTest {
 private final UUID user=UUID.randomUUID();
 private final Instant expiry=Instant.parse("2026-10-01T00:00:00Z");
 private final MailboxRepository boxes=mock(MailboxRepository.class);
 private final EntitlementService entitlements=mock(EntitlementService.class);
 private final UserPlanViewRepository plans=mock(UserPlanViewRepository.class);
 private MailboxAccessService service(Instant now) {
  when(entitlements.mailboxReadLimit(user,MailboxSlotService.KEY)).thenReturn(OptionalLong.of(3));
  when(plans.findById(user)).thenReturn(Optional.of(UserPlanView.builder().userId(user).planCode("STANDARD")
    .lastPaidExpiresAt(expiry).build()));
  return new MailboxAccessService(boxes,mock(TradeRepository.class),entitlements,plans,Clock.fixed(now,ZoneOffset.UTC));
 }
 @Test void thirtyDayBoundaryIsExclusiveAndUsesActualPaidExpiry() {
  var owned=new ArrayList<Mailbox>();for(int i=0;i<10;i++)owned.add(Mailbox.builder().id(UUID.randomUUID()).ownerUserId(user).build());
  when(boxes.findAccessOrderOwnedBy(user)).thenReturn(owned);
  var grace=service(expiry.plus(Duration.ofDays(30)).minusNanos(1));
  assertThat(grace.lockedIds(user)).isEmpty();
  assertThat(grace.metadata(user,owned.getLast().getId()).accessState()).isEqualTo(MailboxAccessService.AccessState.GRACE);
  var recovery=service(expiry.plus(Duration.ofDays(30)));
  assertThat(recovery.lockedIds(user)).hasSize(7);
  assertThat(recovery.metadata(user,owned.getLast().getId()).accessState()).isEqualTo(MailboxAccessService.AccessState.RECOVERY);
  assertThat(recovery.metadata(user,owned.getFirst().getId()).selectedForFree()).isTrue();
 }
 @Test void giftNeverOccupiesASelectedFreeSlot() {
  var gift=Mailbox.builder().id(UUID.randomUUID()).ownerUserId(user).source(MailboxSource.ADMIN).build();
  when(boxes.findAccessOrderOwnedBy(user)).thenReturn(List.of(gift));
  var access=service(expiry.plus(Duration.ofDays(31)));
  assertThat(access.metadata(user,gift.getId()).selectedForFree()).isFalse();
  assertThat(access.metadata(user,gift.getId()).accessState()).isEqualTo(MailboxAccessService.AccessState.ACTIVE);
 }
}
