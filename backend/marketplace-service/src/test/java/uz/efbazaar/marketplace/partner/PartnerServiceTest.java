package uz.efbazaar.marketplace.partner;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.partner.PartnerApplication.Status;
import uz.efbazaar.marketplace.partner.PartnerDtos.ChannelVerifiedRequest;
import uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerApplicationRepository;
import uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerSettingsRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import uz.efbazaar.marketplace.security.AuthSummaryClient.UserSummary;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Kanal tekshiruvi va ariza oqimi.
 *
 * <p>Bu yerdagi xato hamkorlik maqomini noto'g'ri odamga berardi — kanal
 * egasi bo'lmagan administratorga, yoki obunachisi yetmagan kanalga.
 * Maqom berilgandan keyin uni qaytarib olish qo'lda ish.
 */
class PartnerServiceTest {

    private PartnerSettingsRepository settingsRepository;
    private PartnerApplicationRepository applications;
    private AuthSummaryClient users;
    private PartnerEventPublisher events;
    private PartnerFeeClient fees;
    private PartnerService service;

    private PartnerApplication application;
    private final UUID userId = UUID.randomUUID();
    private final long telegramId = 555_000L;

    @BeforeEach
    void setUp() {
        settingsRepository = mock(PartnerSettingsRepository.class);
        applications = mock(PartnerApplicationRepository.class);
        users = mock(AuthSummaryClient.class);
        events = mock(PartnerEventPublisher.class);
        fees = mock(PartnerFeeClient.class);
        service = new PartnerService(settingsRepository, applications, users, events, fees,
                mock(uz.efbazaar.marketplace.partner.ads.PartnerChannelService.class));

        PartnerSettings settings = new PartnerSettings();
        settings.setMinSubscribers(1000);
        settings.setPriceSom(new BigDecimal("500000"));
        when(settingsRepository.findById(PartnerSettings.SINGLETON_ID)).thenReturn(Optional.of(settings));

        application = new PartnerApplication();
        application.setId(UUID.randomUUID());
        application.setUserId(userId);
        application.setStatus(Status.AWAITING_CHANNEL);

        when(users.resolveByTelegramId(telegramId)).thenReturn(Optional.of(
                new UserSummary(userId, "Sardor", "sardor", telegramId, true, Instant.now(), false)));
        when(applications.findFirstByUserIdAndStatusInOrderByCreatedAtDesc(eq(userId), anyCollection()))
                .thenReturn(Optional.of(application));
        when(applications.findFirstByChannelIdAndStatusIn(any(), anyCollection()))
                .thenReturn(Optional.empty());
    }

    private ChannelVerifiedRequest request(int subscribers, boolean owner) {
        return new ChannelVerifiedRequest(telegramId, -100_1L, "Kanal", "kanal", subscribers, owner);
    }

    @Test
    @DisplayName("Egasi va yetarli obunachi — to'lovga o'tadi")
    void acceptsOwnerWithEnoughSubscribers() {
        service.onChannelVerified(request(1500, true));

        assertThat(application.getStatus()).isEqualTo(Status.AWAITING_PAYMENT);
        assertThat(application.getVerifiedAt()).isNotNull();
        assertThat(application.getVerificationError()).isNull();
        assertThat(application.getSubscriberCount()).isEqualTo(1500);
    }

    @Test
    @DisplayName("Administrator, lekin egasi emas — rad etiladi")
    void rejectsNonOwner() {
        // Administrator kanal egasi emas. Buni o'tkazib yuborsak, birovning
        // kanaliga admin qilingan har kim hamkor bo'lib olardi.
        service.onChannelVerified(request(50_000, false));

        assertThat(application.getStatus()).isEqualTo(Status.AWAITING_CHANNEL);
        assertThat(application.getVerifiedAt()).isNull();
        assertThat(application.getVerificationError()).contains("EGASI");
    }

    @Test
    @DisplayName("Obunachi yetmasa rad etiladi va aniq son aytiladi")
    void rejectsTooFewSubscribers() {
        service.onChannelVerified(request(300, true));

        assertThat(application.getStatus()).isEqualTo(Status.AWAITING_CHANNEL);
        // Foydalanuvchi nimani tuzatish kerakligini bilishi kerak, aks holda
        // u "bot ishlamayapti" degan xulosaga keladi.
        assertThat(application.getVerificationError()).contains("1000").contains("300");
    }

    @Test
    @DisplayName("Chegaradagi qiymat o'tadi")
    void acceptsExactlyTheThreshold() {
        service.onChannelVerified(request(1000, true));
        assertThat(application.getStatus()).isEqualTo(Status.AWAITING_PAYMENT);
    }

    @Test
    @DisplayName("Kanal boshqa arizada band bo'lsa rad etiladi")
    void rejectsChannelAlreadyClaimed() {
        PartnerApplication other = new PartnerApplication();
        other.setId(UUID.randomUUID());
        when(applications.findFirstByChannelIdAndStatusIn(any(), anyCollection()))
                .thenReturn(Optional.of(other));

        service.onChannelVerified(request(5000, true));

        // Bitta kanal bir necha hisobga bog'lanib, har biri hamkor
        // bo'lib olishining oldini oladi.
        assertThat(application.getStatus()).isEqualTo(Status.AWAITING_CHANNEL);
        assertThat(application.getVerificationError()).contains("allaqachon");
    }

    @Test
    @DisplayName("Platformada topilmagan telegram id e'tiborsiz qoldiriladi")
    void ignoresUnknownTelegramUser() {
        when(users.resolveByTelegramId(telegramId)).thenReturn(Optional.empty());

        service.onChannelVerified(request(5000, true));

        assertThat(application.getStatus()).isEqualTo(Status.AWAITING_CHANNEL);
        assertThat(application.getChannelId()).isNull();
    }

    @Test
    @DisplayName("To'lov arizani ko'rikka o'tkazadi va adminlarga xabar ketadi")
    void paymentMovesToReview() {
        application.setStatus(Status.AWAITING_PAYMENT);
        when(applications.findById(application.getId())).thenReturn(Optional.of(application));
        UUID invoiceId = UUID.randomUUID();

        service.markPaid(application.getId(), invoiceId);

        assertThat(application.getStatus()).isEqualTo(Status.AWAITING_REVIEW);
        assertThat(application.getInvoiceId()).isEqualTo(invoiceId);
        verify(events).applicationAwaitingReview(application);
    }

    @Test
    @DisplayName("Takroriy to'lov hodisasi tasdiqlangan arizani orqaga surmaydi")
    void paymentIsIdempotent() {
        application.setStatus(Status.APPROVED);
        when(applications.findById(application.getId())).thenReturn(Optional.of(application));

        service.markPaid(application.getId(), UUID.randomUUID());

        // To'lov hodisalari qayta yetkazilishi mumkin. Tasdiqlangan arizani
        // ko'rikka qaytarish adminni ikki marta ishlatardi.
        assertThat(application.getStatus()).isEqualTo(Status.APPROVED);
        verify(events, never()).applicationAwaitingReview(any());
    }

    @Test
    @DisplayName("Ko'rikka tayyor bo'lmagan arizani tasdiqlab bo'lmaydi")
    void cannotApproveBeforePayment() {
        application.setStatus(Status.AWAITING_PAYMENT);
        when(applications.findById(application.getId())).thenReturn(Optional.of(application));

        assertThatThrownBy(() -> service.approve(application.getId(), UUID.randomUUID(), null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    @DisplayName("Ochiq ariza bo'lsa yangisi yaratilmaydi")
    void applyReusesTheOpenApplication() {
        // "Ariza topshirish" ikki marta bosilganda ikkita ariza va ikkita
        // invoice paydo bo'lsa, foydalanuvchi ikki marta to'lardi.
        PartnerApplication result = service.apply(userId);

        assertThat(result).isSameAs(application);
        verify(applications, never()).save(any());
    }

    @Test
    @DisplayName("Tasdiqlash hodisa chiqaradi — rol shu orqali beriladi")
    void approvePublishesEvent() {
        application.setStatus(Status.AWAITING_REVIEW);
        when(applications.findById(application.getId())).thenReturn(Optional.of(application));

        service.approve(application.getId(), UUID.randomUUID(), "ok");

        assertThat(application.getStatus()).isEqualTo(Status.APPROVED);
        // Rolni auth-service beradi; hodisa chiqmasa foydalanuvchi
        // tasdiqlangan bo'lib ko'rinar, lekin hamkor bo'lmasdi.
        verify(events).applicationApproved(application);
    }

    @Test
    @DisplayName("Ochiq ariza yo'q bo'lsa kanal tekshiruvi e'tiborsiz")
    void ignoresChannelWithoutOpenApplication() {
        when(applications.findFirstByUserIdAndStatusInOrderByCreatedAtDesc(eq(userId), anyCollection()))
                .thenReturn(Optional.empty());

        service.onChannelVerified(request(5000, true));

        assertThat(application.getChannelId()).isNull();
    }

    @Test
    @DisplayName("Sozlamalar saqlanadi")
    void updatesSettings() {
        UUID adminId = UUID.randomUUID();
        PartnerSettings updated = service.updateSettings(
                new PartnerDtos.UpdatePartnerSettingsRequest(2500, new BigDecimal("750000")), adminId);

        assertThat(updated.getMinSubscribers()).isEqualTo(2500);
        assertThat(updated.getPriceSom()).isEqualByComparingTo("750000");
        assertThat(updated.getUpdatedBy()).isEqualTo(adminId);
    }

    @Test
    @DisplayName("Ariza yo'q bo'lsa foydalanuvchi uchun bo'sh qaytadi")
    void noApplicationYet() {
        when(applications.findFirstByUserIdOrderByCreatedAtDesc(userId)).thenReturn(Optional.empty());
        assertThat(service.myApplication(userId)).isEmpty();
    }

    @Test
    @DisplayName("Rad etish ham hodisa chiqaradi")
    void rejectPublishesEvent() {
        application.setStatus(Status.AWAITING_REVIEW);
        when(applications.findById(application.getId())).thenReturn(Optional.of(application));

        service.reject(application.getId(), UUID.randomUUID(), "kanal mos emas");

        assertThat(application.getStatus()).isEqualTo(Status.REJECTED);
        assertThat(application.getReviewNote()).isEqualTo("kanal mos emas");
        verify(events).applicationRejected(application);
    }

    @Test
    @DisplayName("Ariza yaratilganda AWAITING_CHANNEL bo'ladi")
    void newApplicationStartsAwaitingChannel() {
        when(applications.findFirstByUserIdAndStatusInOrderByCreatedAtDesc(eq(userId), anyCollection()))
                .thenReturn(Optional.empty());
        when(applications.save(any())).thenAnswer(i -> {
            PartnerApplication saved = i.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });

        PartnerApplication created = service.apply(userId);

        assertThat(created.getStatus()).isEqualTo(Status.AWAITING_CHANNEL);
        assertThat(created.getUserId()).isEqualTo(userId);
    }

    @Test
    @DisplayName("To'lov hamyondan yechiladi va ariza ko'rikka o'tadi")
    void payChargesTheWalletThenAdvances() {
        application.setStatus(Status.AWAITING_PAYMENT);
        when(applications.findFirstByUserIdAndStatusInOrderByCreatedAtDesc(
                eq(userId), eq(List.of(Status.AWAITING_PAYMENT)))).thenReturn(Optional.of(application));

        service.pay(userId);

        verify(fees).charge(eq(application.getId()), eq(userId), eq(new BigDecimal("500000")));
        assertThat(application.getStatus()).isEqualTo(Status.AWAITING_REVIEW);
        assertThat(application.getPaidAt()).isNotNull();
        verify(events).applicationAwaitingReview(application);
    }

    @Test
    @DisplayName("Yechish yiqilsa ariza to'langan bo'lib qolmaydi")
    void failedChargeLeavesTheApplicationUnpaid() {
        application.setStatus(Status.AWAITING_PAYMENT);
        when(applications.findFirstByUserIdAndStatusInOrderByCreatedAtDesc(
                eq(userId), eq(List.of(Status.AWAITING_PAYMENT)))).thenReturn(Optional.of(application));
        org.mockito.Mockito.doThrow(new ResponseStatusException(
                        org.springframework.http.HttpStatus.CONFLICT, "Hamyonda mablag' yetarli emas"))
                .when(fees).charge(any(), any(), any());

        assertThatThrownBy(() -> service.pay(userId)).isInstanceOf(ResponseStatusException.class);

        // Holat to'lovdan KEYIN o'zgaradi. Teskarisi bo'lganda pul
        // yechilmagan ariza ko'rikka tushib, admin uni tasdiqlab yuborardi.
        assertThat(application.getStatus()).isEqualTo(Status.AWAITING_PAYMENT);
        assertThat(application.getPaidAt()).isNull();
        verify(events, never()).applicationAwaitingReview(any());
    }

    @Test
    @DisplayName("Kanal tekshiruvidan o'tmagan ariza to'lay olmaydi")
    void cannotPayBeforeChannelVerification() {
        when(applications.findFirstByUserIdAndStatusInOrderByCreatedAtDesc(
                eq(userId), eq(List.of(Status.AWAITING_PAYMENT)))).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.pay(userId))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("kanalni");
    }

    // ----- bekor qilish -----

    @Test
    @DisplayName("Foydalanuvchi ochiq arizasini bekor qiladi")
    void userCancelsAnOpenApplication() {
        when(applications.findFirstByUserIdAndStatusInOrderByCreatedAtDesc(eq(userId), anyCollection()))
                .thenReturn(Optional.of(application));

        service.cancelByUser(userId);

        assertThat(application.getStatus()).isEqualTo(Status.CANCELLED);
        assertThat(application.getCancelledBy()).isEqualTo(userId);
        assertThat(application.getCancelledAt()).isNotNull();
    }

    @Test
    @DisplayName("Tasdiqlanmagan arizani bekor qilganda rol hodisasi chiqmaydi")
    void cancellingAnUnapprovedApplicationDoesNotTouchTheRole() {
        when(applications.findFirstByUserIdAndStatusInOrderByCreatedAtDesc(eq(userId), anyCollection()))
                .thenReturn(Optional.of(application));

        service.cancelByUser(userId);

        // Rol berilmagan — uni olib tashlash hodisasi auth'ni keraksiz
        // ishlatardi va logda tushunarsiz yozuv qoldirardi.
        verify(events, never()).applicationCancelled(any());
    }

    @Test
    @DisplayName("Faol hamkorlik bekor qilinsa rol olib tashlanadi")
    void cancellingAnApprovedPartnershipRevokesTheRole() {
        application.setStatus(Status.APPROVED);
        when(applications.findFirstByUserIdAndStatusInOrderByCreatedAtDesc(eq(userId), anyCollection()))
                .thenReturn(Optional.of(application));

        service.cancelByUser(userId);

        assertThat(application.getStatus()).isEqualTo(Status.CANCELLED);
        // Hodisasiz odam PARTNER bo'lib qolardi: maqom paneli ochiq,
        // hamkorlik esa yo'q.
        verify(events).applicationCancelled(application);
    }

    @Test
    @DisplayName("Bekor qilinadigan ariza bo'lmasa xato beriladi")
    void cancelWithoutAnApplication() {
        when(applications.findFirstByUserIdAndStatusInOrderByCreatedAtDesc(eq(userId), anyCollection()))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.cancelByUser(userId))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    @DisplayName("Admin sabab bilan to'xtatadi")
    void adminCancelsWithAReason() {
        application.setStatus(Status.APPROVED);
        when(applications.findById(application.getId())).thenReturn(Optional.of(application));
        UUID adminId = UUID.randomUUID();

        service.cancelByAdmin(application.getId(), adminId, "Kanal qoidabuzarlik");

        assertThat(application.getStatus()).isEqualTo(Status.CANCELLED);
        assertThat(application.getCancelReason()).isEqualTo("Kanal qoidabuzarlik");
        assertThat(application.getCancelledBy()).isEqualTo(adminId);
        verify(events).applicationCancelled(application);
    }

    @Test
    @DisplayName("Allaqachon bekor qilingan arizani qayta bekor qilib bo'lmaydi")
    void cannotCancelTwice() {
        application.setStatus(Status.CANCELLED);
        when(applications.findById(application.getId())).thenReturn(Optional.of(application));

        assertThatThrownBy(() ->
                service.cancelByAdmin(application.getId(), UUID.randomUUID(), null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    @DisplayName("Bot kanaldan chiqarilsa hamkorlik avtomatik to'xtaydi")
    void botRemovalCancelsThePartnership() {
        application.setStatus(Status.APPROVED);
        application.setChannelId(-100L);
        when(applications.findFirstByChannelIdAndStatusInOrderByCreatedAtDesc(eq(-100L), anyCollection()))
                .thenReturn(Optional.of(application));

        service.onChannelRemoved(-100L);

        // Bot ketgach obunachi sonini ham, egalikni ham tekshirib bo'lmaydi.
        // Maqomni saqlab qolish "hamkor, lekin tekshirib bo'lmaydi" degan
        // ko'rinmas holatni yaratardi.
        assertThat(application.getStatus()).isEqualTo(Status.CANCELLED);
        assertThat(application.getCancelReason()).contains("chiqarib tashlandi");
        assertThat(application.getCancelledBy()).isNull();
        verify(events).applicationCancelled(application);
    }

    @Test
    @DisplayName("Begona kanaldan bot chiqarilsa hech narsa bo'lmaydi")
    void botRemovalFromAnUnrelatedChannelIsIgnored() {
        when(applications.findFirstByChannelIdAndStatusInOrderByCreatedAtDesc(any(), anyCollection()))
                .thenReturn(Optional.empty());

        service.onChannelRemoved(-999L);

        verify(events, never()).applicationCancelled(any());
    }

    @Test
    @DisplayName("Bekor qilingandan keyin yangi ariza ochish mumkin")
    void reopeningAfterCancellation() {
        // Qisman indeks CANCELLED ni sanamaydi, ya'ni foydalanuvchi bo'sh
        // deb hisoblanadi. Muzlab qolishning yechimi aynan shu.
        when(applications.findFirstByUserIdAndStatusInOrderByCreatedAtDesc(eq(userId), anyCollection()))
                .thenReturn(Optional.empty());
        when(applications.save(any())).thenAnswer(i -> {
            PartnerApplication saved = i.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });

        PartnerApplication reopened = service.apply(userId);

        assertThat(reopened.getStatus()).isEqualTo(Status.AWAITING_CHANNEL);
    }

    @Test
    @DisplayName("Statuslarning isOpen mantiqi")
    void openStatuses() {
        assertThat(Status.AWAITING_CHANNEL.isOpen()).isTrue();
        assertThat(Status.AWAITING_PAYMENT.isOpen()).isTrue();
        assertThat(Status.AWAITING_REVIEW.isOpen()).isTrue();
        assertThat(Status.APPROVED.isOpen()).isFalse();
        assertThat(Status.REJECTED.isOpen()).isFalse();
    }

    @Test
    @DisplayName("Noma'lum ariza uchun to'lov hodisasi yiqilmaydi")
    void paymentForUnknownApplicationIsIgnored() {
        UUID unknown = UUID.randomUUID();
        when(applications.findById(unknown)).thenReturn(Optional.empty());

        service.markPaid(unknown, UUID.randomUUID());

        verify(events, never()).applicationAwaitingReview(any());
    }

    @Test
    @DisplayName("Ro'yxat holat bo'yicha filtrlanadi")
    void listFiltersByStatus() {
        service.list(Status.AWAITING_REVIEW, org.springframework.data.domain.Pageable.unpaged());
        verify(applications).findByStatusOrderByCreatedAtDesc(
                eq(Status.AWAITING_REVIEW), any());
        verify(applications, never()).findAllByOrderByCreatedAtDesc(any());
    }

    @Test
    @DisplayName("Holatsiz so'rovda hammasi qaytadi")
    void listWithoutStatus() {
        service.list(null, org.springframework.data.domain.Pageable.unpaged());
        verify(applications).findAllByOrderByCreatedAtDesc(any());
    }

    @Test
    @DisplayName("Tekshiruv qayta o'tganda eski xato tozalanadi")
    void clearsPreviousError() {
        application.setVerificationError("eski xato");
        service.onChannelVerified(request(2000, true));
        assertThat(application.getVerificationError()).isNull();
    }

    @Test
    @DisplayName("Kanal ma'lumotlari o'tmagan tekshiruvda ham yoziladi")
    void storesChannelEvenOnFailure() {
        service.onChannelVerified(request(10, true));
        // Foydalanuvchi qaysi kanal tekshirilganini ko'rishi kerak — aks
        // holda u boshqa kanalni qo'shib qo'ygan bo'lsa buni bilmasdi.
        assertThat(application.getChannelTitle()).isEqualTo("Kanal");
        assertThat(application.getSubscriberCount()).isEqualTo(10);
    }

    @Test
    @DisplayName("Sozlamalar qatori yo'q bo'lsa aniq xato beradi")
    void missingSettingsRowFailsLoudly() {
        when(settingsRepository.findById(PartnerSettings.SINGLETON_ID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.settings())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("V39");
    }

    @Test
    @DisplayName("Foydalanuvchining oxirgi arizasi qaytadi")
    void returnsLatestApplication() {
        when(applications.findFirstByUserIdOrderByCreatedAtDesc(userId))
                .thenReturn(Optional.of(application));
        assertThat(service.myApplication(userId)).contains(application);
    }

    @Test
    @DisplayName("Tasdiqlangandan keyin ariza yopiq hisoblanadi")
    void approvedIsClosed() {
        assertThat(List.of(Status.APPROVED, Status.REJECTED))
                .allSatisfy(s -> assertThat(s.isOpen()).isFalse());
    }
}
