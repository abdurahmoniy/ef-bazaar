package uz.efbazaar.marketplace.support.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.support.domain.SupportCategory;
import uz.efbazaar.marketplace.support.domain.SupportChat;
import uz.efbazaar.marketplace.support.domain.SupportChatStatus;
import uz.efbazaar.marketplace.support.domain.SupportMessage;
import uz.efbazaar.marketplace.support.domain.SupportSenderType;
import uz.efbazaar.marketplace.support.dto.CreateSupportChatRequest;
import uz.efbazaar.marketplace.support.dto.SendSupportMessageRequest;
import uz.efbazaar.marketplace.support.dto.SupportChatResponse;
import uz.efbazaar.marketplace.support.dto.SupportMessageResponse;
import uz.efbazaar.marketplace.support.kafka.SupportEvents;
import uz.efbazaar.marketplace.support.kafka.SupportKafkaPublisher;
import uz.efbazaar.marketplace.support.repository.SupportChatRepository;
import uz.efbazaar.marketplace.support.repository.SupportMessageRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SupportChatServiceTest {

    @Mock
    private SupportChatRepository chatRepository;

    @Mock
    private SupportMessageRepository messageRepository;

    @Mock
    private SupportKafkaPublisher publisher;

    @InjectMocks
    private SupportChatService service;

    private AuthenticatedUser testUser;
    private UUID userId;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        testUser = new AuthenticatedUser(userId, 123456789L, List.of("ROLE_USER"), "Alisher Dev");
    }

    @Test
    @DisplayName("Ro'yxatdan o'tgan foydalanuvchi murojaat ochganda userId va ismi bilan saqlanadi")
    void createChat_asAuthenticatedUser() {
        CreateSupportChatRequest request = new CreateSupportChatRequest(
                SupportCategory.PARTNERSHIP,
                "Hamkorlik shartlari haqida ma'lumot bering",
                null,
                null,
                null
        );

        when(chatRepository.save(any(SupportChat.class))).thenAnswer(invocation -> {
            SupportChat c = invocation.getArgument(0);
            c.setId(UUID.randomUUID());
            return c;
        });

        when(messageRepository.save(any(SupportMessage.class))).thenAnswer(invocation -> {
            SupportMessage m = invocation.getArgument(0);
            m.setId(UUID.randomUUID());
            return m;
        });

        SupportChatResponse response = service.createChat(testUser, request);

        assertThat(response).isNotNull();
        assertThat(response.category()).isEqualTo(SupportCategory.PARTNERSHIP);
        assertThat(response.senderName()).isEqualTo("Alisher Dev");
        assertThat(response.messages()).hasSize(1);
        assertThat(response.messages().get(0).content()).isEqualTo("Hamkorlik shartlari haqida ma'lumot bering");

        ArgumentCaptor<SupportEvents.SupportMessageCreatedEvent> eventCaptor =
                ArgumentCaptor.forClass(SupportEvents.SupportMessageCreatedEvent.class);
        verify(publisher).publishMessageCreated(eventCaptor.capture());
        SupportEvents.SupportMessageCreatedEvent event = eventCaptor.getValue();
        assertThat(event.category()).isEqualTo("PARTNERSHIP");
        assertThat(event.userId()).isEqualTo(userId);
    }

    @Test
    @DisplayName("Mehmon foydalanuvchi murojaat ochganda guestSessionId bilan saqlanadi")
    void createChat_asGuest() {
        String guestSession = UUID.randomUUID().toString();
        CreateSupportChatRequest request = new CreateSupportChatRequest(
                SupportCategory.QUESTION,
                "Tangalar qanday ishlaydi?",
                "Jasur",
                "@jasur_tg",
                guestSession
        );

        when(chatRepository.save(any(SupportChat.class))).thenAnswer(invocation -> {
            SupportChat c = invocation.getArgument(0);
            c.setId(UUID.randomUUID());
            return c;
        });

        when(messageRepository.save(any(SupportMessage.class))).thenAnswer(invocation -> {
            SupportMessage m = invocation.getArgument(0);
            m.setId(UUID.randomUUID());
            return m;
        });

        SupportChatResponse response = service.createChat(null, request);

        assertThat(response).isNotNull();
        assertThat(response.category()).isEqualTo(SupportCategory.QUESTION);
        assertThat(response.senderName()).isEqualTo("Jasur");
        assertThat(response.senderContact()).isEqualTo("@jasur_tg");
    }

    @Test
    @DisplayName("Xabar yuborilganda status OPEN bo'ladi va hodisa chiqariladi")
    void sendMessage_success() {
        UUID chatId = UUID.randomUUID();
        SupportChat chat = SupportChat.builder()
                .id(chatId)
                .category(SupportCategory.SUPPORT)
                .status(SupportChatStatus.REPLIED)
                .userId(userId)
                .senderName("Alisher Dev")
                .telegramRootMessageId(999L)
                .lastMessageAt(Instant.now().minusSeconds(60))
                .build();

        when(chatRepository.findById(chatId)).thenReturn(Optional.of(chat));
        when(messageRepository.save(any(SupportMessage.class))).thenAnswer(inv -> {
            SupportMessage m = inv.getArgument(0);
            m.setId(UUID.randomUUID());
            return m;
        });
        when(chatRepository.save(any(SupportChat.class))).thenReturn(chat);

        SendSupportMessageRequest request = new SendSupportMessageRequest("Rahmat, tushundim", null);
        SupportMessageResponse messageResponse = service.sendMessage(chatId, testUser, request);

        assertThat(messageResponse).isNotNull();
        assertThat(messageResponse.content()).isEqualTo("Rahmat, tushundim");
        assertThat(chat.getStatus()).isEqualTo(SupportChatStatus.OPEN);

        verify(publisher).publishMessageCreated(any(SupportEvents.SupportMessageCreatedEvent.class));
    }

    @Test
    @DisplayName("Boshqa birovning chatiga yozish taqiqlanadi")
    void sendMessage_forbiddenForNonOwner() {
        UUID chatId = UUID.randomUUID();
        SupportChat chat = SupportChat.builder()
                .id(chatId)
                .category(SupportCategory.SUPPORT)
                .userId(UUID.randomUUID()) // different user
                .senderName("Boshqa Odam")
                .build();

        when(chatRepository.findById(chatId)).thenReturn(Optional.of(chat));

        SendSupportMessageRequest request = new SendSupportMessageRequest("Salom", null);
        assertThatThrownBy(() -> service.sendMessage(chatId, testUser, request))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("kirish huquqi yo'q");
    }

    @Test
    @DisplayName("Admin reply xabari saqlanadi va chat statusi REPLIED bo'ladi")
    void handleAdminReply_success() {
        UUID chatId = UUID.randomUUID();
        SupportChat chat = SupportChat.builder()
                .id(chatId)
                .category(SupportCategory.PARTNERSHIP)
                .status(SupportChatStatus.OPEN)
                .userId(userId)
                .senderName("Alisher")
                .telegramRootMessageId(777L)
                .lastMessageAt(Instant.now().minusSeconds(120))
                .build();

        when(messageRepository.existsByTelegramMessageId(888L)).thenReturn(false);
        when(chatRepository.findByAnyTelegramMessageId(777L)).thenReturn(Optional.of(chat));

        service.handleAdminReply(777L, 888L, "Support Bot", "admin_username", "Assalomu alaykum, kanal linkini yuboring");

        ArgumentCaptor<SupportMessage> msgCaptor = ArgumentCaptor.forClass(SupportMessage.class);
        verify(messageRepository).save(msgCaptor.capture());
        SupportMessage saved = msgCaptor.getValue();
        assertThat(saved.getSenderType()).isEqualTo(SupportSenderType.ADMIN);
        assertThat(saved.getContent()).isEqualTo("Assalomu alaykum, kanal linkini yuboring");
        assertThat(saved.getTelegramMessageId()).isEqualTo(888L);
        assertThat(chat.getStatus()).isEqualTo(SupportChatStatus.REPLIED);
    }

    @Test
    @DisplayName("Bir xil telegramMessageId qayta kelsa saqlanmaydi (idempotency)")
    void handleAdminReply_duplicateSkipped() {
        when(messageRepository.existsByTelegramMessageId(888L)).thenReturn(true);

        service.handleAdminReply(777L, 888L, "Support Bot", "admin_username", "Takror xabar");

        verify(chatRepository, never()).findByAnyTelegramMessageId(any());
        verify(messageRepository, never()).save(any());
    }

    @Test
    @DisplayName("Admin barcha chatlarni sahifalab va so'nggi xabar preview bilan oladi")
    void getChatsForAdmin_success() {
        UUID chatId = UUID.randomUUID();
        SupportChat chat = SupportChat.builder()
                .id(chatId)
                .category(SupportCategory.SUPPORT)
                .status(SupportChatStatus.OPEN)
                .senderName("Vali")
                .senderContact("+998931112233")
                .lastMessageAt(Instant.now())
                .createdAt(Instant.now())
                .build();

        SupportMessage lastMsg = SupportMessage.builder()
                .supportChatId(chatId)
                .senderType(SupportSenderType.USER)
                .content("Hisobimga pul tushmadi")
                .createdAt(Instant.now())
                .build();

        org.springframework.data.domain.Page<SupportChat> chatPage =
                new org.springframework.data.domain.PageImpl<>(List.of(chat));
        when(chatRepository.findForAdmin(eq(SupportCategory.SUPPORT), eq(SupportChatStatus.OPEN), eq("Vali"), any()))
                .thenReturn(chatPage);
        when(messageRepository.findFirstBySupportChatIdOrderByCreatedAtDesc(chatId))
                .thenReturn(Optional.of(lastMsg));

        org.springframework.data.domain.Page<uz.efbazaar.marketplace.support.dto.AdminSupportChatSummaryResponse> result =
                service.getChatsForAdmin(SupportCategory.SUPPORT, SupportChatStatus.OPEN, "Vali", org.springframework.data.domain.PageRequest.of(0, 10));

        assertThat(result.getContent()).hasSize(1);
        assertThat(result.getContent().getFirst().senderName()).isEqualTo("Vali");
        assertThat(result.getContent().getFirst().lastMessagePreview()).isEqualTo("Hisobimga pul tushmadi");
    }

    @Test
    @DisplayName("Admin chatga javob yozganda status REPLIED ga o'tadi va Kafka orqali Telegram topiciga chiqariladi")
    void replyAsAdmin_success() {
        UUID chatId = UUID.randomUUID();
        SupportChat chat = SupportChat.builder()
                .id(chatId)
                .category(SupportCategory.SUPPORT)
                .status(SupportChatStatus.OPEN)
                .telegramRootMessageId(999L)
                .senderName("Vali")
                .lastMessageAt(Instant.now().minusSeconds(300))
                .build();

        when(chatRepository.findById(chatId)).thenReturn(Optional.of(chat));
        when(messageRepository.save(any(SupportMessage.class))).thenAnswer(invocation -> {
            SupportMessage m = invocation.getArgument(0);
            m.setId(UUID.randomUUID());
            return m;
        });

        AuthenticatedUser adminUser = new AuthenticatedUser(UUID.randomUUID(), 9999L, List.of("ROLE_ADMIN"), "Bosh Admin");
        uz.efbazaar.marketplace.support.dto.AdminSupportReplyRequest req =
                new uz.efbazaar.marketplace.support.dto.AdminSupportReplyRequest("To'lovingiz tekshirildi, hisobingizga o'tkazildi");

        SupportMessageResponse res = service.replyAsAdmin(chatId, adminUser, req);

        assertThat(res.senderType()).isEqualTo(SupportSenderType.ADMIN);
        assertThat(res.senderName()).isEqualTo("Bosh Admin");
        assertThat(chat.getStatus()).isEqualTo(SupportChatStatus.REPLIED);

        verify(publisher).publishMessageCreated(any(SupportEvents.SupportMessageCreatedEvent.class));
    }

    @Test
    @DisplayName("Admin chatni yopganda status CLOSED ga o'zgaradi")
    void closeChatAsAdmin_success() {
        UUID chatId = UUID.randomUUID();
        SupportChat chat = SupportChat.builder()
                .id(chatId)
                .category(SupportCategory.QUESTION)
                .status(SupportChatStatus.OPEN)
                .senderName("Ali")
                .build();

        when(chatRepository.findById(chatId)).thenReturn(Optional.of(chat));
        when(messageRepository.findBySupportChatIdOrderByCreatedAtAsc(chatId)).thenReturn(List.of());

        SupportChatResponse res = service.closeChatAsAdmin(chatId);

        assertThat(res.status()).isEqualTo(SupportChatStatus.CLOSED);
        verify(chatRepository).save(chat);
    }
}
