package uz.efbazaar.marketplace.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Validator;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.controller.ChatController;
import uz.efbazaar.marketplace.controller.MessageController;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.dto.*;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ChatService;
import java.util.UUID;

/** Reuses the HTTP response assemblers and service authorization for both transports. */
@Component
@RequiredArgsConstructor
public class ChatSocketCommands {
    private final ChatController chats;
    private final MessageController messages;
    private final ChatService service;
    private final Validator validator;

    public Chat requireChat(UUID chatId, UUID userId) {
        if (chatId == null) throw invalid("chatId is required");
        return service.getById(chatId, userId);
    }

    public Object execute(AuthenticatedUser user, String type, UUID chatId, JsonNode body) {
        if ("inbox".equals(type)) return chats.me(user);
        if ("unread".equals(type)) return chats.unreadTotal(user);
        requireChat(chatId, user.userId());
        return switch (type) {
            case "get" -> chats.get(user, chatId);
            case "account-request" -> chats.currentRequest(user, chatId);
            case "messages" -> messages.list(user, chatId,
                    PageRequest.of(number(body, "page", 0, 0, 10000), number(body, "size", 200, 1, 200)));
            case "send" -> messages.send(user, chatId,
                    valid(new SendMessageRequest(text(body, "content"), optionalId(body, "replyToId"))));
            case "edit" -> messages.edit(user, chatId, requiredId(body, "messageId"),
                    valid(new EditMessageRequest(text(body, "content"))));
            case "delete" -> { messages.delete(user, chatId, requiredId(body, "messageId")); yield null; }
            case "read" -> { chats.markRead(user, chatId, new ChatReadRequest(requiredId(body, "messageId"))); yield null; }
            case "important" -> chats.toggleImportant(user, chatId);
            case "hide" -> { chats.hide(user, chatId); yield null; }
            default -> throw invalid("Unknown command");
        };
    }

    private <T> T valid(T request) {
        if (!validator.validate(request).isEmpty()) throw invalid("Message content must contain 1–4000 characters");
        return request;
    }
    static boolean flag(JsonNode body, String key) {
        if (body == null || !body.path(key).isBoolean()) throw invalid(key + " must be a boolean");
        return body.get(key).booleanValue();
    }
    private static String text(JsonNode body, String key) {
        if (body == null || !body.path(key).isTextual()) throw invalid(key + " is required");
        return body.get(key).textValue();
    }
    private static UUID requiredId(JsonNode body, String key) {
        UUID value = optionalId(body, key);
        if (value == null) throw invalid(key + " is required");
        return value;
    }
    private static UUID optionalId(JsonNode body, String key) {
        if (body == null || !body.hasNonNull(key)) return null;
        try { return UUID.fromString(text(body, key)); }
        catch (IllegalArgumentException e) { throw invalid(key + " must be a UUID"); }
    }
    private static int number(JsonNode body, String key, int fallback, int min, int max) {
        if (body == null || !body.has(key)) return fallback;
        JsonNode value = body.get(key);
        if (!value.isIntegralNumber() || !value.canConvertToInt() || value.intValue() < min || value.intValue() > max)
            throw invalid(key + " is outside the allowed range");
        return value.intValue();
    }
    static MarketplaceException invalid(String message) {
        return new MarketplaceException(HttpStatus.BAD_REQUEST, "invalid_chat_command", message);
    }
}
