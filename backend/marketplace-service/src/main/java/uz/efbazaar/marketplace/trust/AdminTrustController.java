package uz.efbazaar.marketplace.trust;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.dto.PageResponse;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.trust.TrustDtos.AddIdentifiersRequest;
import uz.efbazaar.marketplace.trust.TrustDtos.ComplaintResponse;
import uz.efbazaar.marketplace.trust.TrustDtos.PenaltyResponse;

import java.util.List;
import java.util.UUID;

/** Admin review surface — /api/v1/admin/** is ROLE_ADMIN via SecurityConfig. */
@RestController
@RequestMapping("/api/v1/admin/trust")
@RequiredArgsConstructor
public class AdminTrustController {

    private final TrustService service;

    @GetMapping("/complaints")
    public PageResponse<ComplaintResponse> complaints(
            @RequestParam(required = false) Complaint.Status status,
            @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.from(service.adminComplaints(status, pageable), ComplaintResponse::from);
    }

    @PostMapping("/complaints/{id}/confirm")
    public ComplaintResponse confirm(@PathVariable UUID id,
                                     @AuthenticationPrincipal AuthenticatedUser admin) {
        return ComplaintResponse.from(service.confirm(id, admin.userId()));
    }

    @PostMapping("/complaints/{id}/reject")
    public ComplaintResponse reject(@PathVariable UUID id,
                                    @AuthenticationPrincipal AuthenticatedUser admin) {
        return ComplaintResponse.from(service.reject(id, admin.userId()));
    }

    @PostMapping("/penalties/{id}/revoke")
    public PenaltyResponse revoke(@PathVariable UUID id,
                                  @AuthenticationPrincipal AuthenticatedUser admin) {
        return PenaltyResponse.from(service.revokePenalty(id, admin.userId()));
    }

    @PostMapping("/penalties/{id}/identifiers")
    public List<String> addIdentifiers(@PathVariable UUID id,
                                       @Valid @RequestBody AddIdentifiersRequest request) {
        return service.addIdentifiers(id, request).stream()
                .map(i -> i.getType() + ":" + i.getValue())
                .toList();
    }
}
