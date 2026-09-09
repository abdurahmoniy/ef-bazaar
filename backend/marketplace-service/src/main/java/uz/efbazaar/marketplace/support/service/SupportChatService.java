package uz.efbazaar.marketplace.support.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.support.domain.SupportCategory;
import uz.efbazaar.marketplace.support.domain.SupportChat;
import uz.efbazaar.marketplace.support.domain.SupportChatStatus;
import uz.efbazaar.marketplace.support.domain.SupportMessage;
import uz.efbazaar.marketplace.support.domain.SupportSenderType;
import uz.efbazaar.marketplace.support.dto.*;
import uz.efbazaar.marketplace.support.kafka.SupportEvents;
import uz.efbazaar.marketplace.support.kafka.SupportKafkaPublisher;
import uz.efbazaar.marketplace.support.repository.SupportChatRepository;
import uz.efbazaar.marketplace.support.repository.SupportMessageRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class SupportChatService {

    private final SupportChatRepository chatRepository;
    private final SupportMessageRepository messageRepository;
    private final SupportKafkaPublisher publisher;

    @Transactional
    public SupportChatResponse createChat(AuthenticatedUser user, CreateSupportChatRequest request) {
        if (request == null || !StringUtils.hasText(request.message())) {
            throw new MarketplaceException(HttpStatus.BAD_REQUEST, "empty_message", "Xabar matni bo'sh bo'lishi mumkin emas");
        }

        UUID userId = (user != null) ? user.userId() : null;
        String guestSessionId = (user == null) ? request.guestSessionId() : null;

        SupportCategory category = request.category() != null ? request.category() : SupportCategory.SUPPORT;
        String senderName = resolveSenderName(user, request.senderName());
        String senderContact = resolveSenderContact(user, request.senderContact());

        SupportChat chat = SupportChat.builder()
                .category(category)
                .status(SupportChatStatus.OPEN)
                .userId(userId)
                .guestSessionId(guestSessionId)
                .senderName(senderName)
                .senderContact(senderContact)
                .lastMessageAt(Instant.now())
                .build();

        SupportChat savedChat = chatRepository.save(chat);

        SupportMessage message = SupportMessage.builder()
                .supportChatId(savedChat.getId())
                .senderType(SupportSenderType.USER)
                .senderId(userId)
                .senderName(senderName)
                .content(request.message().trim())
                .createdAt(Instant.now())
                .build();

        SupportMessage savedMessage = messageRepository.save(message);

        publisher.publishMessageCreated(new SupportEvents.SupportMessageCreatedEvent(
                savedChat.getId(),
                savedMessage.getId(),
                savedChat.getCategory().name(),
                userId,
                senderName,
                senderContact,
                savedMessage.getContent(),
                null,
                savedMessage.getCreatedAt()
        ));

        return SupportChatResponse.of(savedChat, List.of(SupportMessageResponse.from(savedMessage)));
    }

    @Transactional
    public SupportMessageResponse sendMessage(UUID chatId, AuthenticatedUser user, SendSupportMessageRequest request) {
        if (request == null || !StringUtils.hasText(request.content())) {
            throw new MarketplaceException(HttpStatus.BAD_REQUEST, "empty_message", "Xabar matni bo'sh bo'lishi mumkin emas");
        }

        SupportChat chat = chatRepository.findById(chatId)
                .orElseThrow(() -> new MarketplaceException(HttpStatus.NOT_FOUND, "support_chat_not_found", "Murojaat topilmadi"));

        verifyAccess(chat, user, request.guestSessionId());

        String senderName = (user != null && StringUtils.hasText(user.displayName()))
                ? user.displayName()
                : chat.getSenderName();
        UUID senderId = (user != null) ? user.userId() : null;

        SupportMessage message = SupportMessage.builder()
                .supportChatId(chat.getId())
                .senderType(SupportSenderType.USER)
                .senderId(senderId)
                .senderName(senderName)
                .content(request.content().trim())
                .createdAt(Instant.now())
                .build();

        SupportMessage savedMessage = messageRepository.save(message);

        chat.setLastMessageAt(savedMessage.getCreatedAt());
        if (chat.getStatus() == SupportChatStatus.REPLIED || chat.getStatus() == SupportChatStatus.CLOSED) {
            chat.setStatus(SupportChatStatus.OPEN);
        }
        chatRepository.save(chat);

        publisher.publishMessageCreated(new SupportEvents.SupportMessageCreatedEvent(
                chat.getId(),
                savedMessage.getId(),
                chat.getCategory().name(),
                senderId,
                senderName,
                chat.getSenderContact(),
                savedMessage.getContent(),
                chat.getTelegramRootMessageId(),
                savedMessage.getCreatedAt()
        ));

        return SupportMessageResponse.from(savedMessage);
    }

    @Transactional(readOnly = true)
    public SupportChatResponse getChat(UUID chatId, AuthenticatedUser user, String guestSessionId) {
        SupportChat chat = chatRepository.findById(chatId)
                .orElseThrow(() -> new MarketplaceException(HttpStatus.NOT_FOUND, "support_chat_not_found", "Murojaat topilmadi"));

        verifyAccess(chat, user, guestSessionId);

        List<SupportMessageResponse> messages = messageRepository
                .findBySupportChatIdOrderByCreatedAtAsc(chatId)
                .stream()
                .map(SupportMessageResponse::from)
                .toList();

        return SupportChatResponse.of(chat, messages);
    }

    @Transactional(readOnly = true)
    public Optional<SupportChatResponse> getActiveChat(AuthenticatedUser user, String guestSessionId) {
        Optional<SupportChat> chatOpt;
        if (user != null) {
            chatOpt = chatRepository.findFirstByUserIdAndStatusNotOrderByLastMessageAtDesc(
                    user.userId(), SupportChatStatus.CLOSED);
        } else if (StringUtils.hasText(guestSessionId)) {
            chatOpt = chatRepository.findFirstByGuestSessionIdAndStatusNotOrderByLastMessageAtDesc(
                    guestSessionId, SupportChatStatus.CLOSED);
        } else {
            return Optional.empty();
        }

        return chatOpt.map(chat -> {
            List<SupportMessageResponse> messages = messageRepository
                    .findBySupportChatIdOrderByCreatedAtAsc(chat.getId())
                    .stream()
                    .map(SupportMessageResponse::from)
                    .toList();
            return SupportChatResponse.of(chat, messages);
        });
    }

    @Transactional
    public SupportChatResponse closeChat(UUID chatId, AuthenticatedUser user, String guestSessionId) {
        SupportChat chat = chatRepository.findById(chatId)
                .orElseThrow(() -> new MarketplaceException(HttpStatus.NOT_FOUND, "support_chat_not_found", "Murojaat topilmadi"));

        verifyAccess(chat, user, guestSessionId);

        chat.setStatus(SupportChatStatus.CLOSED);
        chatRepository.save(chat);

        List<SupportMessageResponse> messages = messageRepository
                .findBySupportChatIdOrderByCreatedAtAsc(chatId)
                .stream()
                .map(SupportMessageResponse::from)
                .toList();

        return SupportChatResponse.of(chat, messages);
    }

    @Transactional
    public void bindTelegramMessage(UUID chatId, UUID messageId, Long telegramMessageId) {
        if (telegramMessageId == null) return;

        if (messageId != null) {
            messageRepository.findById(messageId).ifPresent(msg -> {
                msg.setTelegramMessageId(telegramMessageId);
                messageRepository.save(msg);
            });
        }

        if (chatId != null) {
            chatRepository.findById(chatId).ifPresent(chat -> {
                if (chat.getTelegramRootMessageId() == null) {
                    chat.setTelegramRootMessageId(telegramMessageId);
                    chatRepository.save(chat);
                }
            });
        }
    }

    @Transactional
    public void handleAdminReply(Long replyToTelegramMessageId, Long telegramMessageId,
                                 String adminName, String adminUsername, String text) {
        if (telegramMessageId != null && messageRepository.existsByTelegramMessageId(telegramMessageId)) {
            log.info("Support message with telegramMessageId={} already processed, skipping", telegramMessageId);
            return;
        }

        if (replyToTelegramMessageId == null) {
            log.warn("handleAdminReply called without replyToTelegramMessageId");
            return;
        }

        Optional<SupportChat> chatOpt = chatRepository.findByAnyTelegramMessageId(replyToTelegramMessageId);
        if (chatOpt.isEmpty()) {
            log.warn("No support chat found for replyToTelegramMessageId={}", replyToTelegramMessageId);
            return;
        }

        SupportChat chat = chatOpt.get();
        String displayAdminName = StringUtils.hasText(adminName)
                ? adminName.trim()
                : (StringUtils.hasText(adminUsername) ? "@" + adminUsername.trim() : "Admin");

        String contentText = StringUtils.hasText(text) ? text.trim() : "[Xabar / Media]";

        SupportMessage adminMessage = SupportMessage.builder()
                .supportChatId(chat.getId())
                .senderType(SupportSenderType.ADMIN)
                .senderName(displayAdminName)
                .content(contentText)
                .telegramMessageId(telegramMessageId)
                .createdAt(Instant.now())
                .build();

        messageRepository.save(adminMessage);

        chat.setStatus(SupportChatStatus.REPLIED);
        chat.setLastMessageAt(adminMessage.getCreatedAt());
        chatRepository.save(chat);

        log.info("Saved admin reply to supportChatId={}, telegramMessageId={}",
                chat.getId(), telegramMessageId);
    }

    @Transactional(readOnly = true)
    public Page<AdminSupportChatSummaryResponse> getChatsForAdmin(
            SupportCategory category,
            SupportChatStatus status,
            String search,
            Pageable pageable
    ) {
        Specification<SupportChat> spec = (root, query, cb) -> {
            List<Predicate> predicates = new java.util.ArrayList<>();
            if (category != null) {
                predicates.add(cb.equal(root.get("category"), category));
            }
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (StringUtils.hasText(search)) {
                String pattern = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("senderName")), pattern),
                        cb.like(cb.lower(root.get("senderContact")), pattern)
                ));
            }
            return predicates.isEmpty()
                    ? cb.conjunction()
                    : cb.and(predicates.toArray(new Predicate[0]));
        };

        Page<SupportChat> chats = chatRepository.findAll(spec, pageable);
        return chats.map(chat -> {
            String preview = messageRepository.findFirstBySupportChatIdOrderByCreatedAtDesc(chat.getId())
                    .map(SupportMessage::getContent)
                    .orElse("");
            return AdminSupportChatSummaryResponse.of(chat, preview);
        });
    }

    @Transactional(readOnly = true)
    public SupportChatResponse getChatForAdmin(UUID chatId) {
        SupportChat chat = chatRepository.findById(chatId)
                .orElseThrow(() -> new MarketplaceException(HttpStatus.NOT_FOUND, "support_chat_not_found", "Murojaat topilmadi"));

        List<SupportMessageResponse> messages = messageRepository
                .findBySupportChatIdOrderByCreatedAtAsc(chatId)
                .stream()
                .map(SupportMessageResponse::from)
                .toList();

        return SupportChatResponse.of(chat, messages);
    }

    @Transactional
    public SupportMessageResponse replyAsAdmin(UUID chatId, AuthenticatedUser adminUser, AdminSupportReplyRequest request) {
        if (request == null || !StringUtils.hasText(request.content())) {
            throw new MarketplaceException(HttpStatus.BAD_REQUEST, "empty_message", "Xabar matni bo'sh bo'lishi mumkin emas");
        }

        SupportChat chat = chatRepository.findById(chatId)
                .orElseThrow(() -> new MarketplaceException(HttpStatus.NOT_FOUND, "support_chat_not_found", "Murojaat topilmadi"));

        String adminName = (adminUser != null && StringUtils.hasText(adminUser.displayName()))
                ? adminUser.displayName().trim()
                : "Admin";
        UUID adminId = (adminUser != null) ? adminUser.userId() : null;

        SupportMessage adminMessage = SupportMessage.builder()
                .supportChatId(chat.getId())
                .senderType(SupportSenderType.ADMIN)
                .senderId(adminId)
                .senderName(adminName)
                .content(request.content().trim())
                .createdAt(Instant.now())
                .build();

        SupportMessage savedMessage = messageRepository.save(adminMessage);

        chat.setStatus(SupportChatStatus.REPLIED);
        chat.setLastMessageAt(savedMessage.getCreatedAt());
        chatRepository.save(chat);

        // Guruhdagi topic ham sinxron bo'lishi uchun Telegram topiciga yuboriladi
        if (chat.getTelegramRootMessageId() != null) {
            publisher.publishMessageCreated(new SupportEvents.SupportMessageCreatedEvent(
                    chat.getId(),
                    savedMessage.getId(),
                    chat.getCategory().name(),
                    adminId,
                    adminName + " (Admin panel)",
                    chat.getSenderContact(),
                    savedMessage.getContent(),
                    chat.getTelegramRootMessageId(),
                    savedMessage.getCreatedAt()
            ));
        }

        return SupportMessageResponse.from(savedMessage);
    }

    @Transactional
    public SupportChatResponse closeChatAsAdmin(UUID chatId) {
        SupportChat chat = chatRepository.findById(chatId)
                .orElseThrow(() -> new MarketplaceException(HttpStatus.NOT_FOUND, "support_chat_not_found", "Murojaat topilmadi"));

        chat.setStatus(SupportChatStatus.CLOSED);
        chatRepository.save(chat);

        List<SupportMessageResponse> messages = messageRepository
                .findBySupportChatIdOrderByCreatedAtAsc(chatId)
                .stream()
                .map(SupportMessageResponse::from)
                .toList();

        return SupportChatResponse.of(chat, messages);
    }

    private void verifyAccess(SupportChat chat, AuthenticatedUser user, String guestSessionId) {
        if (chat.getUserId() != null) {
            if (user != null && chat.getUserId().equals(user.userId())) {
                return;
            }
            throw new MarketplaceException(HttpStatus.FORBIDDEN, "not_support_chat_owner", "Murojaatga kirish huquqi yo'q");
        }

        if (StringUtils.hasText(chat.getGuestSessionId())) {
            if (StringUtils.hasText(guestSessionId) && chat.getGuestSessionId().equals(guestSessionId)) {
                return;
            }
            throw new MarketplaceException(HttpStatus.FORBIDDEN, "not_support_chat_owner", "Murojaatga kirish huquqi yo'q");
        }

        // If both userId and guestSessionId were null, allow if user is authenticated or guest
    }

    private String resolveSenderName(AuthenticatedUser user, String requestedName) {
        if (user != null && StringUtils.hasText(user.displayName())) {
            String name = user.displayName().trim();
            return name.length() > 128 ? name.substring(0, 128) : name;
        }
        if (StringUtils.hasText(requestedName)) {
            String name = requestedName.trim();
            return name.length() > 128 ? name.substring(0, 128) : name;
        }
        return (user != null) ? "Foydalanuvchi" : "Mehmon";
    }

    private String resolveSenderContact(AuthenticatedUser user, String requestedContact) {
        if (StringUtils.hasText(requestedContact)) {
            String contact = requestedContact.trim();
            return contact.length() > 128 ? contact.substring(0, 128) : contact;
        }
        if (user != null && user.telegramId() != null) {
            return "tg:" + user.telegramId();
        }
        return null;
    }
}
