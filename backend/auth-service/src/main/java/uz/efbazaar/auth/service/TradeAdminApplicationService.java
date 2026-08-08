package uz.efbazaar.auth.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.TradeAdminApplication;
import uz.efbazaar.auth.domain.TradeAdminApplicationStatus;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.TradeAdminApplicationCreateRequest;
import uz.efbazaar.auth.dto.TradeAdminApplicationDecisionRequest;
import uz.efbazaar.auth.dto.TradeAdminApplicationResponse;
import uz.efbazaar.auth.exception.AuthException;
import uz.efbazaar.auth.repository.TradeAdminApplicationRepository;
import uz.efbazaar.auth.repository.UserRepository;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TradeAdminApplicationService {

    private final TradeAdminApplicationRepository applications;
    private final UserRepository users;
    private final UserService userService;

    @Transactional
    public TradeAdminApplicationResponse submit(
            UUID applicantUserId,
            TradeAdminApplicationCreateRequest request) {
        User applicant = users.findById(applicantUserId).orElseThrow(AuthException::userNotFound);
        if (applicant.getRole() != Role.USER) {
            throw new AuthException(
                    HttpStatus.BAD_REQUEST,
                    "trade_admin_application_not_allowed",
                    "Faqat oddiy foydalanuvchilar inson adminlikka ariza yubora oladi");
        }

        Optional<TradeAdminApplication> pending =
                applications.findFirstByApplicantUserIdAndStatusOrderByCreatedAtDesc(
                        applicantUserId,
                        TradeAdminApplicationStatus.PENDING);
        if (pending.isPresent()) {
            return TradeAdminApplicationResponse.of(pending.get(), applicant);
        }

        TradeAdminApplication saved = applications.save(TradeAdminApplication.builder()
                .applicantUserId(applicantUserId)
                .status(TradeAdminApplicationStatus.PENDING)
                .reason(normalizeRequired(request.reason()))
                .contact(normalizeOptional(request.contact()))
                .build());
        return TradeAdminApplicationResponse.of(saved, applicant);
    }

    @Transactional(readOnly = true)
    public Optional<TradeAdminApplicationResponse> latestForUser(UUID applicantUserId) {
        User applicant = users.findById(applicantUserId).orElseThrow(AuthException::userNotFound);
        return applications.findFirstByApplicantUserIdOrderByCreatedAtDesc(applicantUserId)
                .map(application -> TradeAdminApplicationResponse.of(application, applicant));
    }

    @Transactional(readOnly = true)
    public Page<TradeAdminApplicationResponse> list(
            TradeAdminApplicationStatus status,
            Pageable pageable) {
        Page<TradeAdminApplication> page = status == null
                ? applications.findAll(pageable)
                : applications.findByStatus(status, pageable);
        Map<UUID, User> byId = users.findAllById(page.getContent().stream()
                        .map(TradeAdminApplication::getApplicantUserId)
                        .distinct()
                        .toList())
                .stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
        return page.map(application ->
                TradeAdminApplicationResponse.of(application, byId.get(application.getApplicantUserId())));
    }

    @Transactional
    public TradeAdminApplicationResponse approve(
            UUID reviewerUserId,
            UUID applicationId,
            TradeAdminApplicationDecisionRequest request) {
        TradeAdminApplication application = requirePending(applicationId);
        User applicant = users.findById(application.getApplicantUserId())
                .orElseThrow(AuthException::userNotFound);
        if (applicant.getRole() != Role.USER) {
            throw new AuthException(
                    HttpStatus.CONFLICT,
                    "trade_admin_application_role_changed",
                    "Bu foydalanuvchining roli allaqachon o'zgargan");
        }
        decide(application, reviewerUserId, TradeAdminApplicationStatus.APPROVED, request);
        TradeAdminApplication saved = applications.save(application);
        userService.changeRole(reviewerUserId, application.getApplicantUserId(), Role.TRADE_ADMIN);
        return TradeAdminApplicationResponse.of(saved, applicant);
    }

    @Transactional
    public TradeAdminApplicationResponse reject(
            UUID reviewerUserId,
            UUID applicationId,
            TradeAdminApplicationDecisionRequest request) {
        TradeAdminApplication application = requirePending(applicationId);
        User applicant = users.findById(application.getApplicantUserId())
                .orElseThrow(AuthException::userNotFound);
        decide(application, reviewerUserId, TradeAdminApplicationStatus.REJECTED, request);
        TradeAdminApplication saved = applications.save(application);
        return TradeAdminApplicationResponse.of(saved, applicant);
    }

    private TradeAdminApplication requirePending(UUID id) {
        TradeAdminApplication application = applications.findById(id)
                .orElseThrow(() -> new AuthException(
                        HttpStatus.NOT_FOUND,
                        "trade_admin_application_not_found",
                        "Ariza topilmadi"));
        if (application.getStatus() != TradeAdminApplicationStatus.PENDING) {
            throw new AuthException(
                    HttpStatus.CONFLICT,
                    "trade_admin_application_decided",
                    "Bu ariza allaqachon ko'rib chiqilgan");
        }
        return application;
    }

    private void decide(
            TradeAdminApplication application,
            UUID reviewerUserId,
            TradeAdminApplicationStatus status,
            TradeAdminApplicationDecisionRequest request) {
        application.setStatus(status);
        application.setReviewerUserId(reviewerUserId);
        application.setDecisionNote(normalizeOptional(request.note()));
        application.setReviewedAt(Instant.now());
    }

    private static String normalizeRequired(String value) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) {
            throw new AuthException(
                    HttpStatus.BAD_REQUEST,
                    "validation_failed",
                    "Ariza matni bo'sh bo'lmasligi kerak");
        }
        return normalized;
    }

    private static String normalizeOptional(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }
}
