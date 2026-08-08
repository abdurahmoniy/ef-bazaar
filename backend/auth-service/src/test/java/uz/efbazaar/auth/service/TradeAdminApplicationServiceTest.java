package uz.efbazaar.auth.service;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.TradeAdminApplication;
import uz.efbazaar.auth.domain.TradeAdminApplicationStatus;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.TradeAdminApplicationCreateRequest;
import uz.efbazaar.auth.dto.TradeAdminApplicationDecisionRequest;
import uz.efbazaar.auth.repository.TradeAdminApplicationRepository;
import uz.efbazaar.auth.repository.UserRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TradeAdminApplicationServiceTest {

    private final TradeAdminApplicationRepository applications =
            mock(TradeAdminApplicationRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final UserService userService = mock(UserService.class);
    private final TradeAdminApplicationService service =
            new TradeAdminApplicationService(applications, users, userService);

    @Test
    void submitCreatesPendingApplicationForNormalUser() {
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).role(Role.USER).telegramFirstName("Ali").build();
        when(users.findById(userId)).thenReturn(Optional.of(user));
        when(applications.findFirstByApplicantUserIdAndStatusOrderByCreatedAtDesc(
                userId, TradeAdminApplicationStatus.PENDING)).thenReturn(Optional.empty());
        when(applications.save(any(TradeAdminApplication.class))).thenAnswer(inv -> inv.getArgument(0));

        var response = service.submit(
                userId,
                new TradeAdminApplicationCreateRequest("Men kafolatli savdolarda yordam beraman", "@ali"));

        assertThat(response.status()).isEqualTo(TradeAdminApplicationStatus.PENDING);
        assertThat(response.reason()).isEqualTo("Men kafolatli savdolarda yordam beraman");
        assertThat(response.contact()).isEqualTo("@ali");
        verify(applications).save(any(TradeAdminApplication.class));
    }

    @Test
    void submitReusesExistingPendingApplication() {
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).role(Role.USER).telegramFirstName("Ali").build();
        TradeAdminApplication existing = TradeAdminApplication.builder()
                .id(UUID.randomUUID())
                .applicantUserId(userId)
                .status(TradeAdminApplicationStatus.PENDING)
                .reason("Oldingi ariza")
                .build();
        when(users.findById(userId)).thenReturn(Optional.of(user));
        when(applications.findFirstByApplicantUserIdAndStatusOrderByCreatedAtDesc(
                userId, TradeAdminApplicationStatus.PENDING)).thenReturn(Optional.of(existing));

        var response = service.submit(
                userId,
                new TradeAdminApplicationCreateRequest("Yangi matn", "@ali"));

        assertThat(response.id()).isEqualTo(existing.getId());
        assertThat(response.reason()).isEqualTo("Oldingi ariza");
        verify(applications, never()).save(any());
    }

    @Test
    void approveMarksApprovedAndGrantsTradeAdminRole() {
        UUID reviewerId = UUID.randomUUID();
        UUID applicantId = UUID.randomUUID();
        UUID applicationId = UUID.randomUUID();
        TradeAdminApplication application = TradeAdminApplication.builder()
                .id(applicationId)
                .applicantUserId(applicantId)
                .status(TradeAdminApplicationStatus.PENDING)
                .reason("Tajribam bor")
                .build();
        User applicant = User.builder().id(applicantId).role(Role.USER).telegramFirstName("Vali").build();
        when(applications.findById(applicationId)).thenReturn(Optional.of(application));
        when(users.findById(applicantId)).thenReturn(Optional.of(applicant));
        when(applications.save(any(TradeAdminApplication.class))).thenAnswer(inv -> inv.getArgument(0));

        var response = service.approve(
                reviewerId,
                applicationId,
                new TradeAdminApplicationDecisionRequest("Sinov uchun qabul qilindi"));

        assertThat(response.status()).isEqualTo(TradeAdminApplicationStatus.APPROVED);
        assertThat(response.reviewerUserId()).isEqualTo(reviewerId);
        assertThat(response.decisionNote()).isEqualTo("Sinov uchun qabul qilindi");
        verify(userService).changeRole(reviewerId, applicantId, Role.TRADE_ADMIN);
    }

    @Test
    void rejectMarksRejectedWithoutChangingRole() {
        UUID reviewerId = UUID.randomUUID();
        UUID applicantId = UUID.randomUUID();
        UUID applicationId = UUID.randomUUID();
        TradeAdminApplication application = TradeAdminApplication.builder()
                .id(applicationId)
                .applicantUserId(applicantId)
                .status(TradeAdminApplicationStatus.PENDING)
                .reason("Hali tajribam kam")
                .build();
        User applicant = User.builder().id(applicantId).role(Role.USER).telegramFirstName("Vali").build();
        when(applications.findById(applicationId)).thenReturn(Optional.of(application));
        when(users.findById(applicantId)).thenReturn(Optional.of(applicant));
        when(applications.save(any(TradeAdminApplication.class))).thenAnswer(inv -> inv.getArgument(0));

        var response = service.reject(
                reviewerId,
                applicationId,
                new TradeAdminApplicationDecisionRequest("Avval ko'proq savdo tarixi kerak"));

        assertThat(response.status()).isEqualTo(TradeAdminApplicationStatus.REJECTED);
        assertThat(response.decisionNote()).isEqualTo("Avval ko'proq savdo tarixi kerak");
        verify(userService, never()).changeRole(any(), any(), any());
    }

    @Test
    void listIncludesApplicantIdentity() {
        UUID applicantId = UUID.randomUUID();
        TradeAdminApplication application = TradeAdminApplication.builder()
                .id(UUID.randomUUID())
                .applicantUserId(applicantId)
                .status(TradeAdminApplicationStatus.PENDING)
                .reason("Ishlayman")
                .build();
        User applicant = User.builder()
                .id(applicantId)
                .telegramUsername("aziz")
                .telegramFirstName("Aziz")
                .email("aziz@example.com")
                .role(Role.USER)
                .build();
        when(applications.findByStatus(TradeAdminApplicationStatus.PENDING, PageRequest.of(0, 20)))
                .thenReturn(new PageImpl<>(List.of(application), PageRequest.of(0, 20), 1));
        when(users.findAllById(List.of(applicantId))).thenReturn(List.of(applicant));

        var page = service.list(TradeAdminApplicationStatus.PENDING, PageRequest.of(0, 20));

        assertThat(page.getContent()).singleElement().satisfies(response -> {
            assertThat(response.applicantName()).isEqualTo("Aziz");
            assertThat(response.applicantTelegramUsername()).isEqualTo("aziz");
            assertThat(response.applicantEmail()).isEqualTo("aziz@example.com");
        });
    }
}
