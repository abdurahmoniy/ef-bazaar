package uz.efbazaar.marketplace.service;

import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import org.mapstruct.factory.Mappers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.*;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import uz.efbazaar.marketplace.controller.MessageController;
import uz.efbazaar.marketplace.domain.*;
import uz.efbazaar.marketplace.dto.*;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.mapper.ChatMapper;
import uz.efbazaar.marketplace.repository.*;
import uz.efbazaar.marketplace.security.*;
import uz.efbazaar.marketplace.trust.BlacklistGuard;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@DataJpaTest(properties = {"spring.jpa.hibernate.ddl-auto=create-drop", "spring.flyway.enabled=false",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip", "app.cards.datasource.username=skip", "app.cards.datasource.password=skip"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
// Dispose the Spring context while its class-owned database is still running.
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
@Import(ChatService.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ChatMessageRetryIT {
    @Container @ServiceConnection static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    @Autowired ChatService service;
    @Autowired ChatRepository chats;
    @Autowired ListingRepository listings;
    @Autowired ChatMessageRepository messages;
    @Autowired ChatParticipantRepository participants;
    @Autowired JdbcTemplate jdbc;
    @MockBean AuthNameClient names;
    @MockBean NotificationService notifications;
    @MockBean BlacklistGuard blacklist;
    @MockBean ChatAccountRequestService requests;
    @MockBean AuthSummaryClient telegram;
    @MockBean TradeLiveClient tradeLive;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    private MessageController controller;
    private ChatAttachmentService uploads;
    private UUID chatId;
    private UUID sender;
    private UUID partner;

    @BeforeEach void setup() {
        sender = UUID.randomUUID(); partner = UUID.randomUUID();
        var listing = listings.saveAndFlush(Listing.builder().sellerId(partner).description("retry test").price(BigDecimal.TEN).build());
        chatId = chats.saveAndFlush(Chat.builder().listingId(listing.getId()).buyerId(sender).sellerId(partner).build()).getId();
        participants.saveAndFlush(ChatParticipant.builder().chatId(chatId).userId(sender).build());
        participants.saveAndFlush(ChatParticipant.builder().chatId(chatId).userId(partner).build());
        ChatMapper mapper = Mappers.getMapper(ChatMapper.class);
        uploads = mock(ChatAttachmentService.class);
        controller = new MessageController(service, uploads, mapper, new MessageViewAssembler(service, mapper));
    }
    private MessageResponse send(UUID actor, UUID key, String content) throws Exception {
        var body = json.createObjectNode().put("content", content);
        if (key != null) body.put("clientMessageId", key.toString());
        return controller.send(new AuthenticatedUser(actor, null, List.of()), chatId, json.treeToValue(body, SendMessageRequest.class));
    }
    @Test void retryReturnsOriginalAndDoesNotNotifyOrTouchChatAgain() throws Exception {
        UUID key = UUID.randomUUID();
        var first = send(sender, key, "first");
        var lastMessageAt = chats.findById(chatId).orElseThrow().getLastMessageAt();
        var second = send(sender, key, "changed retry body");
        assertThat(second.id()).isEqualTo(first.id());
        assertThat(second.content()).isEqualTo("first");
        assertThat(messages.countByChatId(chatId)).isEqualTo(1);
        assertThat(chats.findById(chatId).orElseThrow().getLastMessageAt()).isEqualTo(lastMessageAt);
        verify(notifications, times(1)).newMessage(any(), eq(sender));
        assertThat(json.valueToTree(second).path("clientMessageId").asText()).isEqualTo(key.toString());
        var history = controller.list(new AuthenticatedUser(sender, null, List.of()), chatId, PageRequest.of(0, 50));
        assertThat(json.valueToTree(history.content().getFirst()).path("clientMessageId").asText()).isEqualTo(key.toString());
    }
    @Test void concurrentRequestsStoreOneMessageAndNotifyOnce() throws Exception {
        UUID key = UUID.randomUUID();
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(6)) {
            List<Future<MessageResponse>> pending = new ArrayList<>();
            for (int i = 0; i < 6; i++) pending.add(executor.submit(() -> { start.await(); return send(sender, key, "same"); }));
            start.countDown();
            Set<UUID> ids = new HashSet<>();
            for (var future : pending) ids.add(future.get(20, TimeUnit.SECONDS).id());
            assertThat(ids).hasSize(1);
        }
        assertThat(messages.countByChatId(chatId)).isEqualTo(1);
        verify(notifications, times(1)).newMessage(any(), eq(sender));
    }
    @Test void deletedMessageCannotBeResurrectedByRetry() throws Exception {
        UUID key = UUID.randomUUID();
        var first = send(sender, key, "deleted");
        service.deleteMessage(chatId, first.id(), sender);
        assertThatThrownBy(() -> send(sender, key, "deleted"))
                .isInstanceOfSatisfying(MarketplaceException.class, e -> assertThat(e.getCode()).isEqualTo("message_not_found"));
        assertThat(messages.countByChatId(chatId)).isZero();
        verify(notifications, times(1)).newMessage(any(), eq(sender));
    }
    @Test void clearedHistoryCannotBeResurfacedByRetry() throws Exception {
        UUID key = UUID.randomUUID(); send(sender, key, "old");
        service.clearHistory(chatId, sender);
        assertThatThrownBy(() -> send(sender, key, "old"))
                .isInstanceOfSatisfying(MarketplaceException.class, e -> assertThat(e.getCode()).isEqualTo("message_not_found"));
        assertThat(participants.findByChatId(chatId)).allSatisfy(p -> assertThat(p.getHiddenAt()).isNotNull());
        assertThat(service.listMessages(chatId, sender, PageRequest.of(0, 50))).isEmpty();
    }
    @Test void strangerCannotRetrieveAnExistingRetry() throws Exception {
        UUID key = UUID.randomUUID(); send(sender, key, "private");
        assertThatThrownBy(() -> send(UUID.randomUUID(), key, "private"))
                .isInstanceOfSatisfying(MarketplaceException.class, e -> assertThat(e.getStatus().value()).isEqualTo(403));
        assertThat(messages.countByChatId(chatId)).isEqualTo(1);
    }
    @Test void keysAreScopedToSenderAndLegacyRequestsStillSendEveryTime() throws Exception {
        UUID key = UUID.randomUUID();
        assertThat(send(sender, key, "mine").id()).isNotEqualTo(send(partner, key, "theirs").id());
        assertThat(send(sender, null, "legacy").id()).isNotEqualTo(send(sender, null, "legacy").id());
        assertThat(messages.countByChatId(chatId)).isEqualTo(4);
    }
    @Test void replyCannotExposeClearedHistory() throws Exception {
        var first = send(sender, null, "old private quote");
        service.clearHistory(chatId, sender);
        var request = new SendMessageRequest("quote", first.id());
        assertThatThrownBy(() -> controller.send(new AuthenticatedUser(sender, null, List.of()), chatId, request))
                .isInstanceOfSatisfying(MarketplaceException.class, e -> assertThat(e.getCode()).isEqualTo("message_not_found"));
    }
    @Test void attachmentRetrySkipsUploadAndKeepsReplyAndClientKey() throws Exception {
        var quote = send(partner, null, "quoted message");
        UUID key = UUID.randomUUID();
        var file = new org.springframework.mock.web.MockMultipartFile("file", "voice.ogg", "audio/ogg", new byte[]{1});
        when(uploads.upload(file, true)).thenReturn(new ChatAttachmentService.Uploaded(AttachmentType.VOICE, "telegram-file", "voice.ogg", "audio/ogg", 1));
        var user = new AuthenticatedUser(sender, null, List.of());
        var first = controller.sendAttachment(user, chatId, file, "caption", true, quote.id(), key);
        var second = controller.sendAttachment(user, chatId, file, "caption", true, quote.id(), key);
        assertThat(second.id()).isEqualTo(first.id());
        assertThat(second.clientMessageId()).isEqualTo(key);
        assertThat(second.replyToId()).isEqualTo(quote.id());
        assertThat(second.replyPreview()).isEqualTo("quoted message");
        assertThat(second.attachmentType()).isEqualTo(AttachmentType.VOICE);
        verify(uploads, times(1)).upload(file, true);
        verify(notifications, times(1)).newMessage(any(), eq(sender));
    }
    @Test void concurrentAttachmentUploadsStillStoreOneMessage() throws Exception {
        UUID key = UUID.randomUUID();
        var file = new org.springframework.mock.web.MockMultipartFile("file", "photo.png", "image/png", new byte[]{1});
        CyclicBarrier uploading = new CyclicBarrier(3);
        when(uploads.upload(file, false)).thenAnswer(inv -> {
            uploading.await(10, TimeUnit.SECONDS);
            return new ChatAttachmentService.Uploaded(AttachmentType.IMAGE, UUID.randomUUID().toString(), "photo.png", "image/png", 1);
        });
        try (var executor = Executors.newFixedThreadPool(3)) {
            List<Future<MessageResponse>> pending = new ArrayList<>();
            for (int i = 0; i < 3; i++) pending.add(executor.submit(() -> controller.sendAttachment(
                    new AuthenticatedUser(sender, null, List.of()), chatId, file, null, false, null, key)));
            Set<UUID> ids = new HashSet<>();
            for (var future : pending) ids.add(future.get(20, TimeUnit.SECONDS).id());
            assertThat(ids).hasSize(1);
        }
        assertThat(messages.countByChatId(chatId)).isEqualTo(1);
        verify(notifications, times(1)).newMessage(any(), eq(sender));
    }
    @Test void attachmentAuthorizationAndClearedReplyAreCheckedBeforeUploading() throws Exception {
        var user = new AuthenticatedUser(sender, null, List.of());
        var file = new org.springframework.mock.web.MockMultipartFile("file", new byte[]{1});
        assertThatThrownBy(() -> controller.sendAttachment(new AuthenticatedUser(UUID.randomUUID(), null, List.of()),
                chatId, file, null, false, null, UUID.randomUUID())).isInstanceOf(MarketplaceException.class);
        var quote = send(sender, null, "old");
        service.clearHistory(chatId, sender);
        assertThatThrownBy(() -> controller.sendAttachment(user, chatId, file, null, false, quote.id(), UUID.randomUUID()))
                .isInstanceOfSatisfying(MarketplaceException.class, e -> assertThat(e.getCode()).isEqualTo("message_not_found"));
        verifyNoInteractions(uploads);
    }
    @Test void sameKeyCanBeUsedInDifferentChats() throws Exception {
        UUID key = UUID.randomUUID();
        var first = send(sender, key, "first chat");
        UUID otherChat = chats.saveAndFlush(Chat.builder().listingId(chats.findById(chatId).orElseThrow().getListingId())
                .buyerId(sender).sellerId(UUID.randomUUID()).build()).getId();
        var second = controller.send(new AuthenticatedUser(sender, null, List.of()), otherChat, new SendMessageRequest("other chat", null, key));
        assertThat(second.id()).isNotEqualTo(first.id());
    }
    @Test void socketAndHttpRetryShareTheSameReceipt() throws Exception {
        UUID key = UUID.randomUUID();
        ChatMapper mapper = Mappers.getMapper(ChatMapper.class);
        try (var validators = jakarta.validation.Validation.buildDefaultValidatorFactory()) {
            var commands = new uz.efbazaar.marketplace.websocket.ChatSocketCommands(
                    new uz.efbazaar.marketplace.controller.ChatController(service, requests, mapper), controller, service, validators.getValidator());
            var first = (MessageResponse) commands.execute(new AuthenticatedUser(sender, null, List.of()), "send", chatId,
                    json.createObjectNode().put("content", "socket").put("clientMessageId", key.toString()));
            var retry = send(sender, key, "socket");
            assertThat(retry.id()).isEqualTo(first.id());
            assertThat(first.clientMessageId()).isEqualTo(key);
            verify(notifications, times(1)).newMessage(any(), eq(sender));
            assertThatThrownBy(() -> commands.execute(new AuthenticatedUser(sender, null, List.of()), "send", chatId,
                    json.createObjectNode().put("content", "invalid").put("clientMessageId", "bad-uuid")))
                    .isInstanceOfSatisfying(MarketplaceException.class, e -> assertThat(e.getStatus().value()).isEqualTo(400));
        }
    }
    @Test void rolledBackSendDoesNotConsumeTheKey() throws Exception {
        UUID key = UUID.randomUUID();
        doThrow(new IllegalStateException("notification unavailable")).when(notifications).newMessage(any(), eq(sender));
        assertThatThrownBy(() -> send(sender, key, "retry later")).isInstanceOf(IllegalStateException.class);
        assertThat(messages.countByChatId(chatId)).isZero();
        doNothing().when(notifications).newMessage(any(), eq(sender));
        var response = send(sender, key, "retry later");
        assertThat(response.clientMessageId()).isEqualTo(key);
        assertThat(messages.countByChatId(chatId)).isEqualTo(1);
    }

}
