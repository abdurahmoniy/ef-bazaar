package uz.efbazaar.marketplace.websocket;

import lombok.RequiredArgsConstructor;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.kafka.*;
import uz.efbazaar.marketplace.repository.ChatMessageRepository;
import java.util.UUID;

/** Observe shared service boundaries so HTTP, WebSocket, and Kafka writes all notify participants. */
@Aspect
@Component
@RequiredArgsConstructor
public class ChatMutationNotifications {
    private final ChatSocketSignals signals;
    private final ChatMessageRepository messages;

    @AfterReturning("execution(* uz.efbazaar.marketplace.service.ChatService.sendMessage(..)) || " +
            "execution(* uz.efbazaar.marketplace.service.ChatService.sendAttachment(..)) || " +
            "execution(* uz.efbazaar.marketplace.service.ChatService.editMessage(..)) || " +
            "execution(* uz.efbazaar.marketplace.service.ChatService.deleteMessage(..)) || " +
            "execution(* uz.efbazaar.marketplace.service.ChatService.markRead(..)) || " +
            "execution(* uz.efbazaar.marketplace.service.ChatService.toggleImportant(..)) || " +
            "execution(* uz.efbazaar.marketplace.service.ChatService.clearHistory(..))")
    public void chatMutation(JoinPoint invocation) { signals.changed((UUID) invocation.getArgs()[0]); }

    @AfterReturning(pointcut = "execution(* uz.efbazaar.marketplace.service.ChatService.start(..))", returning = "chat")
    public void chatStarted(Chat chat) { signals.changed(chat.getId()); }

    @AfterReturning("execution(* uz.efbazaar.marketplace.service.ChatAccountRequestService.open(..)) || " +
            "execution(* uz.efbazaar.marketplace.service.ChatAccountRequestService.cancel(..))")
    public void accountRequest(JoinPoint invocation) { signals.changed((UUID) invocation.getArgs()[1]); }

    @AfterReturning("execution(* uz.efbazaar.marketplace.kafka.TradeProposalConsumer.onCreated(..)) && args(event)")
    public void proposalCreated(TradeProposalCreatedDto event) { signals.changed(event.marketplaceChatId()); }

    @AfterReturning("execution(* uz.efbazaar.marketplace.kafka.TradeProposalConsumer.onResolved(..)) && args(event)")
    public void proposalResolved(TradeProposalResolvedDto event) {
        messages.findFirstByProposalId(event.proposalId()).ifPresent(message -> signals.changed(message.getChatId()));
    }

    @AfterReturning("execution(* uz.efbazaar.marketplace.kafka.TradeActionConsumer.onTradeAction(..)) && args(event)")
    public void tradeAction(TradeActionDto event) { if (event != null) signals.changed(event.chatId()); }
}
