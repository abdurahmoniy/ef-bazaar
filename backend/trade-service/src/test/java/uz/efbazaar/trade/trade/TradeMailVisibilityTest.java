package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import uz.efbazaar.trade.admin.service.TradeAdminStats;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.payment.EscrowClient;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.service.*;
import java.time.Instant;
import java.util.*;
import static org.mockito.Mockito.*;

class TradeMailVisibilityTest {
    private final MailboxService mailboxes = mock(MailboxService.class);
    private final TradeSideService sides = mock(TradeSideService.class);
    private final TradeStateHandler handler = new TradeStateHandler(mock(TradeEventPublisher.class), mailboxes,
            sides, mock(TradeAuditService.class), mock(TradeAdminStats.class), mock(EscrowClient.class), mock(uz.efbazaar.trade.kafka.SellerTradeCompletionPublisher.class));
    private final Instant started = Instant.parse("2026-09-23T10:00:00Z");
    private final Trade trade = Trade.builder().id(UUID.randomUUID()).mailboxId(UUID.randomUUID())
            .sellerId(UUID.randomUUID()).buyerId(UUID.randomUUID()).mode(TradeMode.HUMAN).createdAt(started).build();

    @ParameterizedTest @EnumSource(value = TradeState.class, names = {"SUCCESS", "REJECTED", "ORPHANED"})
    void bothSwapSidesUseThisTradesStart(TradeState state) {
        UUID second = UUID.randomUUID();
        when(sides.of(trade.getId())).thenReturn(List.of(
                TradeSide.builder().id(new TradeSideId(trade.getId(), ParticipantRole.SELLER)).mailboxId(trade.getMailboxId()).build(),
                TradeSide.builder().id(new TradeSideId(trade.getId(), ParticipantRole.BUYER)).mailboxId(second).build()));
        for (UUID box : List.of(trade.getMailboxId(), second)) {
            when(mailboxes.getRaw(box)).thenReturn(Mailbox.builder().id(box).email("box@example.test").build());
        }
        handler.onEnter(trade, state, ActorType.SYSTEM, null, null);
        verify(mailboxes).assignOwner(trade.getMailboxId(), state == TradeState.SUCCESS ? trade.getBuyerId() : trade.getSellerId(), started);
        verify(mailboxes).assignOwner(second, state == TradeState.SUCCESS ? trade.getSellerId() : trade.getBuyerId(), started);
    }

    @Test void legacySaleUsesTradeStartAtHandoff() {
        when(mailboxes.getRaw(trade.getMailboxId())).thenReturn(Mailbox.builder().email("box@example.test").build());
        handler.onEnter(trade, TradeState.SUCCESS, ActorType.SYSTEM, null, null);
        verify(mailboxes).assignOwner(trade.getMailboxId(), trade.getBuyerId(), started);
    }

    @Test void assignedTradeAdminOnlyGetsCurrentTradeMail() {
        UUID admin = UUID.randomUUID();
        trade.setAssignedAdminId(admin);
        handler.onEnter(trade, TradeState.IN_PROGRESS, ActorType.SYSTEM, null, null);
        verify(mailboxes).assignOwner(trade.getMailboxId(), admin, started);
    }
}
