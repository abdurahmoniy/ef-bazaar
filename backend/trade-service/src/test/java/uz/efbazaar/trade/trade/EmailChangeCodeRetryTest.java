package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.service.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class EmailChangeCodeRetryTest {
    private final TradeSideService sides = mock(TradeSideService.class);
    private final MailboxService mailboxes = mock(MailboxService.class);
    private final TradeEventPublisher events = mock(TradeEventPublisher.class);
    private final TradeService service = new TradeService(null, null, null, null, null,
            sides, null, mailboxes, null, null, events, null);
    private final Trade trade = Trade.builder().id(UUID.randomUUID()).kind(TradeKind.SWAP)
            .mode(TradeMode.SMART).state(TradeState.WAITING_EMAIL_CHANGE).build();

    @ParameterizedTest @EnumSource(ParticipantRole.class)
    void retryWatchesOwnMailboxEvenAfterAnEarlierCodeArrives(ParticipantRole role) {
        UUID box = UUID.randomUUID();
        when(sides.of(trade.getId(), role)).thenReturn(Optional.of(TradeSide.builder()
                .mailboxId(box).emailChangeCode("111111").build()));
        when(mailboxes.getRaw(box)).thenReturn(Mailbox.builder().email(role + "@example.test").build());
        service.requestEmailChangeCode(trade, role);
        verify(events).imapPollRequest(trade.getId(), role + "@example.test", TradeEvents.ImapPurpose.WAIT_EMAIL_CHANGE_CODE);
        verify(sides).of(trade.getId(), role);
        verifyNoMoreInteractions(events);
    }

    @Test void unreadyMailboxDoesNotPublish() {
        assertThatThrownBy(() -> service.requestEmailChangeCode(trade, ParticipantRole.SELLER))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(events);
    }

    @Test void humanModeDoesNotPublish() {
        trade.setMode(TradeMode.HUMAN);
        assertThatThrownBy(() -> service.requestEmailChangeCode(trade, ParticipantRole.SELLER))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(events, mailboxes, sides);
    }
}
